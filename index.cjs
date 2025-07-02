const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const {
  Connection,
  PublicKey,
  clusterApiUrl,
  LAMPORTS_PER_SOL
} = require("@solana/web3.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;
const WALLET = new PublicKey("88fGSwh5B28H8P7PPpdpjATomanjSi6koniZjEnRaaza");
const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");

let deposits = [];

app.get("/", (_, res) => res.send("✅ Live tracker running."));

io.on("connection", (socket) => {
  console.log("🔌 WebSocket connected");
  socket.emit("history", deposits);
});

// 🕵️ Poll recent transactions every 5 seconds
setInterval(async () => {
  try {
    const sigs = await connection.getSignaturesForAddress(WALLET, { limit: 10 });
    const newDeposits = [];

    for (let sig of sigs) {
      const tx = await connection.getTransaction(sig.signature, {
        commitment: "confirmed"
      });

      if (!tx || !tx.meta) continue;

      const pre = tx.meta.preBalances[0];
      const post = tx.meta.postBalances[0];
      const diff = post - pre;

      if (diff > 0) {
        const deposit = {
          wallet: WALLET.toBase58(),
          amount: (diff / LAMPORTS_PER_SOL).toFixed(4),
          signature: sig.signature,
          timestamp: Date.now()
        };

        const alreadyListed = deposits.some(d => d.signature === deposit.signature);
        if (!alreadyListed) {
          newDeposits.push(deposit);
          deposits.unshift(deposit);
          if (deposits.length > 25) deposits.pop();
        }
      }
    }

    if (newDeposits.length > 0) {
      console.log("📦 New deposits:", newDeposits);
      io.emit("newDeposit", newDeposits);
    }
  } catch (err) {
    console.error("❌ Polling error:", err);
  }
}, 5000);

server.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
