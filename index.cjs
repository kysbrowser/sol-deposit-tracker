const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Connection, PublicKey, clusterApiUrl, LAMPORTS_PER_SOL } = require("@solana/web3.js");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;
const TARGET_WALLET = new PublicKey("88fGSwh5B28H8P7PPpdpjATomanjSi6koniZjEnRaaza");
const connection = new Connection(clusterApiUrl("mainnet-beta"), "confirmed");

let lastSignature = null;
const deposits = [];

app.get("/", (_, res) => {
  res.send("✅ Sol Deposit Tracker backend is live.");
});

io.on("connection", (socket) => {
  console.log("🟢 WebSocket connected");
  socket.emit("history", deposits);
});

const pollTransactions = async () => {
  try {
    const signatures = await connection.getSignaturesForAddress(TARGET_WALLET, { limit: 10 });

    for (const sig of signatures) {
      if (sig.signature === lastSignature) break;

      const tx = await connection.getTransaction(sig.signature, { commitment: "confirmed" });
      if (!tx || !tx.meta) continue;

      const index = tx.transaction.message.accountKeys.findIndex(key => key.toBase58() === TARGET_WALLET.toBase58());
      if (index === -1) continue;

      const pre = tx.meta.preBalances[index] / LAMPORTS_PER_SOL;
      const post = tx.meta.postBalances[index] / LAMPORTS_PER_SOL;
      const amount = parseFloat((post - pre).toFixed(4));

      if (amount > 0.0001) {
        const deposit = {
          wallet: TARGET_WALLET.toBase58(),
          amount,
          signature: sig.signature,
          timestamp: Date.now()
        };

        deposits.unshift(deposit);
        if (deposits.length > 25) deposits.pop();

        io.emit("newDeposit", deposit);
        console.log("📥 New deposit:", deposit);
      }
    }

    if (signatures.length > 0) lastSignature = signatures[0].signature;
  } catch (err) {
    console.error("Polling error:", err);
  }
};

setInterval(pollTransactions, 5_000); // poll every 5 seconds

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
