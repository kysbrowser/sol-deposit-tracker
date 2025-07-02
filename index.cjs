const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } = require("@solana/web3.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const TARGET_WALLET = new PublicKey("88fGSwh5B28H8P7PPpdpjATomanjSi6koniZjEnRaaza");
const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");

const deposits = [];

app.get("/", (req, res) => {
  res.send("Sol Deposit Tracker backend is live.");
});

io.on("connection", (socket) => {
  console.log("🟢 WebSocket connected");
  socket.emit("history", deposits);
});

// Track real-time deposits
connection.onLogs(TARGET_WALLET, async (logInfo) => {
  console.log("🚨 LOG DETECTED:", logInfo.signature);

  try {
    const tx = await connection.getTransaction(logInfo.signature, { commitment: "confirmed" });
    if (!tx || !tx.meta || !tx.meta.preBalances || !tx.meta.postBalances) return;

    const pre = tx.meta.preBalances[0] / LAMPORTS_PER_SOL;
    const post = tx.meta.postBalances[0] / LAMPORTS_PER_SOL;
    const amount = (post - pre).toFixed(4);

    // Filter out non-deposit logs
    if (amount <= 0) return;

    const deposit = {
      wallet: TARGET_WALLET.toBase58(),
      amount,
      signature: logInfo.signature,
      timestamp: Date.now()
    };

    console.log("📥 New deposit:", deposit);

    deposits.unshift(deposit);
    if (deposits.length > 25) deposits.pop();

    io.emit("newDeposit", deposit);
  } catch (err) {
    console.error("❌ Failed to process transaction:", err);
  }
}, "confirmed");

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
