// index.cjs

import express from 'express';
import { Server } from 'socket.io';
import http from 'http';
import cors from 'cors';
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

// Initialize Solana connection
const connection = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');

// Store deposits to keep them on refresh
let deposits = [];

const MAX_DEPOSITS = 50; // keep last 50

// Socket.io connection
io.on('connection', (socket) => {
  console.log('🔌 Client connected');

  // Send current deposits on connect
  socket.emit('hydrate', deposits);

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected');
  });
});

// Listen to confirmed transactions
connection.onLogs('all', async (logs, ctx) => {
  try {
    const sig = logs.signature;

    const tx = await connection.getTransaction(sig, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || !tx.meta || !tx.meta.postBalances || !tx.transaction) return;

    const pre = tx.meta.preBalances[0];
    const post = tx.meta.postBalances[0];
    const diff = post - pre;

    // Filter for SOL deposits above 0.001 SOL
    if (diff > 1000000) {
      const wallet = tx.transaction.message.accountKeys[0].toBase58();
      const amount = diff / 1e9;

      const deposit = {
        wallet,
        amount,
        timestamp: Date.now(),
      };

      deposits.unshift(deposit);
      deposits = deposits.slice(0, MAX_DEPOSITS);

      io.emit('newDeposit', deposit);
      console.log(`💸 ${wallet} deposited ${amount} SOL`);
    }
  } catch (err) {
    console.error('⚠️ Error parsing logs:', err);
  }
});

// Default route
app.get('/', (req, res) => {
  res.send('Sol Deposit Tracker backend running.');
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server listening on port ${PORT}`);
});
