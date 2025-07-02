import express from "express";
import { Server } from "socket.io";
import { createServer } from "http";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Enable CORS for WebSocket connections
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

io.on("connection", (socket) => {
  console.log("📡 WebSocket client connected");

  socket.on("disconnect", () => {
    console.log("❌ WebSocket client disconnected");
  });
});

const connection = new Connection(process.env.RPC, {
  commitment: "confirmed",
  timeout: 30000
});
const targetWallet = new PublicKey(process.env.TARGET_WALLET);
const processedHashes = new Set();

async function checkNew() {
  const sigs = await connection.getSignaturesForAddress(targetWallet, { limit: 5 });
  for (const entry of sigs) {
    const sig = entry.signature;
    if (processedHashes.has(sig)) continue;
    processedHashes.add(sig);

    const tx = await connection.getTransaction(sig, {
      maxSupportedTransactionVersion: 0
    });

    if (!tx?.meta || typeof tx.blockTime !== "number") continue;

    const idx = tx.transaction.message.staticAccountKeys.findIndex(key => key.equals(targetWallet));
    if (idx === -1) continue;

    const pre = tx.meta.preBalances[idx];
    const post = tx.meta.postBalances[idx];
    const received = (post - pre) / LAMPORTS_PER_SOL;
    if (received < 0.01) continue;

    const senderIdx = tx.transaction.message.staticAccountKeys.findIndex((_, i) =>
      i !== idx && tx.meta.preBalances[i] - tx.meta.postBalances[i] > 0
    );
    if (senderIdx === -1) continue;

    const sender = tx.transaction.message.staticAccountKeys[senderIdx].toString();
    const data = {
      wallet: sender,
      amount: received.toFixed(4),
      timestamp: tx.blockTime
    };

    console.log(`📥 ${sender} sent ${data.amount} SOL`);
    io.emit("newDeposit", data);
  }
}

setInterval(checkNew, 2000);

app.get("/", (_, res) => res.send("🚀 Tracker live with CORS & WebSocket"));
httpServer.listen(process.env.PORT || 3000, () => {
  console.log("✅ Listening on port", process.env.PORT || 3000);
});
