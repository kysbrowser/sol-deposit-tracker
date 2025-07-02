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
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const PORT = process.env.PORT || 3000;
const TARGET_WALLET = new PublicKey("88fGSwh5B28H8P7PPpdpjATomanjSi6koniZjEnRaaza");
const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");

let lastBalance = 0;
const deposits = [];

app.get("/", (req, res) => {
  res.send("Sol Deposit Tracker backend is live.");
});

io.on("connection", (socket) => {
  console.log("🟢 WebSocket connected");
  socket.emit("history", deposits);
});

// Poll wallet balance every 5 seconds
(async () => {
  try {
    const acc = await connection.getAccountInfo(TARGET_WALLET);
    lastBalance = acc?.lamports || 0;
  } catch (e) {
    console.error("❌ Init balance fetch failed", e);
  }

  setInterval(async () => {
    try {
      const acc = await connection.getAccountInfo(TARGET_WALLET);
      const current = acc?.lamports || 0;

      if (current > lastBalance) {
        const diff = (current - lastBalance) / LAMPORTS_PER_SOL;

        const deposit = {
          wallet: TARGET_WALLET.toBase58(),
          amount: diff.toFixed(4),
          signature: "N/A",
          timestamp: Date.now()
        };

        deposits.unshift(deposit);
        if (deposits.length > 25) deposits.pop();

        io.emit("newDeposit", deposit);
        console.log("📥 New deposit:", deposit);
      }

      lastBalance = current;
    } catch (e) {
      console.error("❌ Polling error:", e);
    }
  }, 5000);
})();

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
