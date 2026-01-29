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

app.listen(8000, () => console.log("Server running on port 8000"));
