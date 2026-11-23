// server.js
import express from "express";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createStore } from "./lib/store.js";

dotenv.config();

const CHANNEL_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;
const MAX_STORED_BODY_CHARS = 200_000;
const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "public");

const store = createStore();
const app = express();

// Webhook butuh raw body. Signature dari BE dihitung dari byte body asli,
// dan JSON.stringify ulang bisa beda urutan key, spasi, atau escape unicode.
const rawBody = express.raw({ type: () => true, limit: "5mb" });

const hmacHex = (secret, value) =>
  crypto.createHmac("sha256", secret).update(value).digest("hex");

function parseBody(req) {
  const text = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : "";

  try {
    return { text, json: text ? JSON.parse(text) : null };
  } catch {
    return { text, json: null };
  }
}

function checkSignature(req, secret, body) {
  const received = req.headers["x-kledo-signature"];

  if (!received) {
    return { status: "missing" };
  }

  if (!secret) {
    return { status: "no-secret", received };
  }

  const expected = hmacHex(secret, body.text);

  if (received === expected) {
    return { status: "valid", method: "raw-body", received, expected };
  }

  // Cara lama server ini: hitung ulang dari JSON hasil parse.
  // Tetap dicek supaya perilaku lama tidak hilang kalau BE sign hasil stringify.
  if (body.json !== null) {
    const expectedFromJson = hmacHex(secret, JSON.stringify(body.json));

    if (received === expectedFromJson) {
      return { status: "valid", method: "json-stringify", received, expected: expectedFromJson };
    }
  }

  return { status: "invalid", received, expected };
}

function buildVerifyResponse(secret, body) {
  const challenge = body.json?.challenge;

  if (!challenge) {
    return { status: 400, body: { error: "Missing challenge" } };
  }

  if (!secret) {
    return { status: 400, body: { error: "Signing secret belum diset untuk channel ini" } };
  }

  return { status: 200, body: { answer: hmacHex(secret, challenge) } };
}

function buildEventResponse(topic, signature) {
  if (signature.status === "invalid") {
    return { status: 401, body: { error: "Invalid signature" } };
  }

  return { status: 200, body: { success: true, message: `${topic} webhook received` } };
}

async function handleWebhook(req, res, { channelId, topic, secret }) {
  const body = parseBody(req);
  const isVerify = topic === "verify";
  const signature = isVerify ? null : checkSignature(req, secret, body);
  const response = isVerify ? buildVerifyResponse(secret, body) : buildEventResponse(topic, signature);

  console.log(`📨 [${channelId}] ${topic} → ${response.status}`, signature?.status ?? "");

  const event = {
    id: `${Date.now()}-${crypto.randomBytes(3).toString("hex")}`,
    receivedAt: new Date().toISOString(),
    topic,
    method: req.method,
    path: req.originalUrl,
    headers: req.headers,
    body: body.json,
    bodyText: body.text.slice(0, MAX_STORED_BODY_CHARS),
    signature,
    response,
  };

  // Simpan log sebelum kirim response. Vercel bisa membekukan function setelah response terkirim.
  // Gagal simpan log tidak boleh menggagalkan response ke BE.
  try {
    await store.addEvent(channelId, event);
  } catch (error) {
    console.error("❌ Gagal simpan event:", error);
  }

  res.status(response.status).json(response.body);
}

function requireChannelId(req, res, next) {
  if (!CHANNEL_ID_PATTERN.test(req.params.channelId)) {
    return res.status(400).json({ error: "channelId tidak valid" });
  }

  next();
}

app.use(express.static(PUBLIC_DIR));

app.get("/api/info", (req, res) => {
  res.json({ store: store.kind });
});

app.put("/api/channels/:channelId/secret", requireChannelId, express.json(), async (req, res) => {
  const secret = typeof req.body?.secret === "string" ? req.body.secret.trim() : "";

  if (!secret) {
    return res.status(400).json({ error: "Secret wajib diisi" });
  }

  await store.setSecret(req.params.channelId, secret);
  res.json({ success: true });
});

app.get("/api/channels/:channelId/events", requireChannelId, async (req, res) => {
  res.json({ events: await store.listEvents(req.params.channelId) });
});

app.delete("/api/channels/:channelId/events", requireChannelId, async (req, res) => {
  await store.clearEvents(req.params.channelId);
  res.json({ success: true });
});

// Endpoint webhook per channel. Secret diambil dari store, diset QA lewat UI.
app.post("/c/:channelId/webhook/:topic", requireChannelId, rawBody, async (req, res) => {
  const { channelId, topic } = req.params;
  const secret = await store.getSecret(channelId);

  await handleWebhook(req, res, { channelId, topic, secret });
});

// Vercel memanggil app yang di-export. Server lokal tetap listen seperti biasa.
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT) || 8000;

  app.listen(port, () => console.log(`Server running on port ${port} (store: ${store.kind})`));
}

export default app;
