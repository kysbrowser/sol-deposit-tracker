const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Connection, PublicKey } = require("@solana/web3.js");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const HELIUS_RPC = "https://mainnet.helius-rpc.com/?api-key=7a89b50e-0e67-4594-a6c3-81b2dfd3e303";
const TARGET_WALLET = new PublicKey("88fGSwh5B28H8P7PPpdpjATomanjSi6koniZjEnRaaza");

const connection = new Connection(HELIUS_RPC, "confirmed");

let depositHistory = [];

const watchTransactions = async () => {
  console.log("✅ Watching transactions for:", TARGET_WALLET.toBase58());

  connection.onLogs(TARGET_WALLET, async (logInfo) => {
    const signature = logInfo.signature;
    console.log("🚨 LOG DETECTED:", signature);

    try {
      const tx = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });

      if (!tx || !tx.meta || !tx.meta.postBalances || !tx.transaction) {
        console.log("⚠️ Incomplete transaction data");
        return;
      }

      const from = tx.transaction.message.accountKeys[0].toBase58();
      const to = tx.transaction.message.accountKeys[1].toBase58();
      const pre = tx.meta.preBalances[0];
      const post = tx.meta.postBalances[0];
      const amount = (pre - post) / 1e9;

      console.log("🔍 TX parsed:", { from, to, amount });

      if (to === TARGET_WALLET.toBase58() && amount > 0) {
        const deposit = {
          wallet: from,
          amount: amount.toFixed(4),
          timestamp: Math.floor(Date.now() / 1000)
        };

        depositHistory.unshift(deposit);
        depositHistory = depositHistory.slice(0, 20);
        io.emit("newDeposit", deposit);
        console.log("📥 New deposit:", deposit);
      } else {
        console.log("⛔ Not a valid incoming SOL deposit");
      }
    } catch (e) {
      console.log("❌ Error getting transaction:", e.message);
    }
  }, "confirmed");
};

io.on("connection", (socket) => {
  console.log("🟢 Client connected via WebSocket");
  socket.emit("history", depositHistory);
});

server.listen(3000, () => {
  console.log("🚀 Server listening on port 3000");
  watchTransactions();
});
