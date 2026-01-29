// server.js
import express from "express";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const SIGNING_SECRET = process.env.SIGNING_SECRET;

const app = express();
app.use(express.json());

app.post("/webhook/verify", (req, res) => {
  const { challenge } = req.body;

  if (!challenge) {
    return res.status(400).json({ error: "Missing challenge" });
  }

  const hmacObj = crypto.createHmac("sha256", SIGNING_SECRET);
  hmacObj.update(challenge);
  const answer = hmacObj.digest("hex");

  console.log("✅ Answer:", answer);
  res.json({ answer });
});

app.post("/webhook/invoices", (req, res) => {
  console.log("📄 Invoice webhook received:");
  console.log("Headers:", req.headers);
  console.log("Body:", JSON.stringify(req.body, null, 2));

  // Verify signature if present
  const signature = req.headers["x-kledo-signature"];
  if (signature && SIGNING_SECRET) {
    const hmacObj = crypto.createHmac("sha256", SIGNING_SECRET);
    hmacObj.update(JSON.stringify(req.body));
    const expectedSignature = hmacObj.digest("hex");

    if (signature !== expectedSignature) {
      console.log("❌ Invalid signature");
      return res.status(401).json({ error: "Invalid signature" });
    }
    console.log("✅ Signature verified");
  }

  res.status(200).json({ success: true, message: "Invoice webhook received" });
});

app.post("/webhook/expenses", (req, res) => {
  console.log("💰 Expense webhook received:");
  console.log("Headers:", req.headers);
  console.log("Body:", JSON.stringify(req.body, null, 2));

  // Verify signature if present
  const signature = req.headers["x-kledo-signature"];
  if (signature && SIGNING_SECRET) {
    const hmacObj = crypto.createHmac("sha256", SIGNING_SECRET);
    hmacObj.update(JSON.stringify(req.body));
    const expectedSignature = hmacObj.digest("hex");

    if (signature !== expectedSignature) {
      console.log("❌ Invalid signature");
      return res.status(401).json({ error: "Invalid signature" });
    }
    console.log("✅ Signature verified");
  }

  res.status(200).json({ success: true, message: "Expense webhook received" });
});

app.listen(8000, () => console.log("Server running on port 8000"));
