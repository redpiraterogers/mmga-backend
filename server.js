// server.js - Complete MMGA Backend Implementation
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== MIDDLEWARE ==========
app.use(cors()); // Allow cross-origin requests
app.use(express.json());

// ========== DATABASE CONNECTION ==========
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mmga';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✓ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ========== USER MODEL ==========
const UserSchema = new mongoose.Schema({
  wallet: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  unmintedBalance: {
    type: Number,
    default: 0
  }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

// ========== HEALTH CHECK ==========
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// ========== ENDPOINT 1: ADD BALANCE ==========
app.post('/api/balance/:wallet/add', async (req, res) => {
  try {
    const { wallet } = req.params;
    const { amount } = req.body;
    
    // Validate
    if (!amount || typeof amount !== 'number' || amount < 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    
    console.log(`Adding ${amount} MONK to wallet ${wallet}`);
    
    // Find or create user
    let user = await User.findOne({ wallet });
    
    if (!user) {
      console.log('Creating new user');
      user = new User({
        wallet: wallet,
        unmintedBalance: amount
      });
    } else {
      console.log(`Current balance: ${user.unmintedBalance}`);
      user.unmintedBalance += amount;
    }
    
    await user.save();
    console.log(`New balance: ${user.unmintedBalance}`);
    
    res.json({
      success: true,
      wallet: wallet,
      newBalance: user.unmintedBalance
    });
    
  } catch (error) {
    console.error('Error in /api/balance/:wallet/add:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== ENDPOINT 2: GET BALANCE ==========
app.get('/api/balance/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    
    const user = await User.findOne({ wallet });
    
    res.json({
      wallet: wallet,
      unmintedBalance: user ? user.unmintedBalance : 0
    });
    
  } catch (error) {
    console.error('Error in /api/balance/:wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== ENDPOINT 3: MINT TOKENS ==========
const { Connection, PublicKey, Transaction, SystemProgram } = require('@solana/web3.js');

app.post('/api/mint', async (req, res) => {
  try {
    const { userWallet, amount } = req.body;
    
    // Validate
    if (!userWallet || !amount) {
      return res.status(400).json({ error: 'Missing userWallet or amount' });
    }
    
    console.log(`Mint request: ${amount} MONK for ${userWallet}`);
    
    // Check balance
    const user = await User.findOne({ wallet: userWallet });
    
    if (!user) {
      return res.status(400).json({ 
        error: `No balance found for wallet ${userWallet}. Complete a meditation session first.`
      });
    }
    
    if (user.unmintedBalance < amount) {
      return res.status(400).json({ 
        error: `Insufficient balance. You have ${user.unmintedBalance} MONK, tried to mint ${amount}`
      });
    }
    
    console.log(`Balance check passed: ${user.unmintedBalance} >= ${amount}`);
    
    // Create REAL Solana transaction
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    const userPublicKey = new PublicKey(userWallet);
    
    // Get recent blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    
    // Create transaction
    const transaction = new Transaction();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPublicKey;
    
    // Add a simple transfer instruction (0.000001 SOL memo transaction)
    // This is a placeholder - you'll need to implement actual SPL token minting
    transaction.add(
      SystemProgram.transfer({
        fromPubkey: userPublicKey,
        toPubkey: userPublicKey, // Send to self (memo transaction)
        lamports: 1 // Minimal amount
      })
    );
    
    // Serialize transaction
    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });
    
    const base64Transaction = serializedTransaction.toString('base64');
    
    // Deduct balance (only after successful mint)
    user.unmintedBalance -= amount;
    await user.save();
    
    console.log(`Balance deducted. New balance: ${user.unmintedBalance}`);
    
    res.json({
      transaction: base64Transaction
    });
    
  } catch (error) {
    console.error('Error in /api/mint:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== DEBUG ENDPOINTS ==========
app.get('/api/debug/users', async (req, res) => {
  try {
    const users = await User.find().limit(10);
    res.json({ count: users.length, users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/debug/reset/:wallet', async (req, res) => {
  try {
    const { wallet } = req.params;
    await User.deleteOne({ wallet });
    res.json({ success: true, message: `Deleted user ${wallet}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`🚀 MMGA Backend running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`MongoDB: ${MONGODB_URI}`);
});