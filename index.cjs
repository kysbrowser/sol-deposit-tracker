
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { Connection, clusterApiUrl, PublicKey } = require("@solana/web3.js");
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
const TARGET_WALLET = "88fGSwh5B28H8P7PPpdpjATomanjSi6koniZjEnRaaza";
const connection = new Connection(HELIUS_RPC);

let depositHistory = [];

const watchTransactions = async () => {
  console.log("✅ Watching transactions...");
  connection.onLogs(new PublicKey(TARGET_WALLET), async (logInfo) => {
    const signature = logInfo.signature;
    try {
      const tx = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0
      });
      if (!tx || !tx.meta || !tx.meta.postBalances) return;

      const from = tx.transaction.message.accountKeys[0].toBase58();
      const to = tx.transaction.message.accountKeys[1].toBase58();
      const pre = tx.meta.preBalances[0];
      const post = tx.meta.postBalances[0];
      const amount = (pre - post) / 1e9;

      if (to === TARGET_WALLET && amount > 0) {
        const deposit = {
          wallet: from,
          amount: amount.toFixed(4),
          timestamp: Math.floor(Date.now() / 1000)
        };

        depositHistory.unshift(deposit);
        depositHistory = depositHistory.slice(0, 20);
        io.emit("newDeposit", deposit);
        console.log("📥", from, "sent", amount, "SOL");
      }
    } catch (e) {
      console.log("Error:", e.message);
    }
  }, "confirmed");
};

io.on("connection", (socket) => {
  console.log("🟢 Client connected");
  socket.emit("history", depositHistory);
});

server.listen(3000, () => {
  console.log("Server listening on port 3000");
  watchTransactions();
});
