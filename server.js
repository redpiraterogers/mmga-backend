// MMGA Minting Backend with Balance Storage
// Allows users to accumulate MONK and mint in batches

import express from 'express';
import cors from 'cors';
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  TransactionInstruction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import {
  TOKEN_2022_PROGRAM_ID,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  getAccount,
} from '@solana/spl-token';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// Configuration
const PORT = process.env.PORT || 3001;
const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const MONK_TOKEN = '4ec5P6tYDUCQbv6VcqLPqXtD8h5FEnU5VEHSUht5Hzhv';
const SQUAD_ADDRESS = '7yyyxcNzjjQ5mc6tCFgFkU4nh4F7w2pwrMnaKcQmYkN3';

// Balance storage file
const BALANCE_FILE = path.join(__dirname, 'monk-balances.json');

// Initialize connection
const connection = new Connection(SOLANA_RPC, 'confirmed');

// Load deployer keypair
let DEPLOYER_KEYPAIR;

function loadKeypair() {
  // Try environment variable first (for Render deployment)
  if (process.env.DEPLOYER_KEYPAIR) {
    try {
      const keypairData = JSON.parse(process.env.DEPLOYER_KEYPAIR);
      console.log('✅ Loading keypair from DEPLOYER_KEYPAIR environment variable');
      return Keypair.fromSecretKey(Uint8Array.from(keypairData));
    } catch (error) {
      console.error('Failed to parse DEPLOYER_KEYPAIR from environment:', error.message);
      process.exit(1);
    }
  }
  
  // Fall back to file path (for local development)
  const keypairPath = process.env.DEPLOYER_KEYPAIR_PATH || 
    `${process.env.HOME}/.config/solana/deployer.json`;
  
  try {
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    console.log(`✅ Loading keypair from file: ${keypairPath}`);
    return Keypair.fromSecretKey(Uint8Array.from(keypairData));
  } catch (error) {
    console.error('Failed to load deployer keypair:', error.message);
    console.error('Set DEPLOYER_KEYPAIR or DEPLOYER_KEYPAIR_PATH environment variable');
    process.exit(1);
  }
}

// Load balances from file
function loadBalances() {
  try {
    if (fs.existsSync(BALANCE_FILE)) {
      const data = fs.readFileSync(BALANCE_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading balances:', error.message);
  }
  return {};
}

// Save balances to file
function saveBalances(balances) {
  try {
    fs.writeFileSync(BALANCE_FILE, JSON.stringify(balances, null, 2));
  } catch (error) {
    console.error('Error saving balances:', error.message);
  }
}

// In-memory balance cache (synced with file)
let balances = loadBalances();

// Verify session data
function verifySession(sessionData) {
  const { sessionId, duration, timestamp, biometricValid, userWallet } = sessionData;
  
  // Basic validation
  if (!sessionId || !duration || !timestamp || !userWallet) {
    throw new Error('Missing required session data');
  }
  
  if (!biometricValid) {
    throw new Error('Biometric validation failed');
  }
  
  // Verify duration (at least 60 seconds = 1 MONK)
  if (duration < 60) {
    throw new Error('Session too short (minimum 60 seconds)');
  }
  
  // Verify timestamp is recent (within last hour)
  const sessionTime = new Date(timestamp);
  const now = new Date();
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  
  if (sessionTime < hourAgo || sessionTime > now) {
    throw new Error('Invalid session timestamp');
  }
  
  // Calculate earned MONK (1 per 60 seconds)
  const earnedMonk = Math.floor(duration / 60);
  
  return earnedMonk;
}

// ENDPOINTS

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    token: MONK_TOKEN,
    squad: SQUAD_ADDRESS,
    deployer: DEPLOYER_KEYPAIR.publicKey.toString(),
    totalWallets: Object.keys(balances).length,
    totalUnminted: Object.values(balances).reduce((sum, b) => sum + b, 0)
  });
});

// Get user's unminted balance
app.get('/api/balance/:wallet', (req, res) => {
  try {
    const wallet = req.params.wallet;
    const balance = balances[wallet] || 0;
    
    res.json({
      wallet,
      unmintedBalance: balance
    });
  } catch (error) {
    console.error('Balance check error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add earned MONK to balance (called after verified meditation session)
app.post('/api/earn', async (req, res) => {
  try {
    const sessionData = req.body;
    
    // Verify session and calculate earned MONK
    const earnedMonk = verifySession(sessionData);
    const wallet = sessionData.userWallet;
    
    // Add to balance
    balances[wallet] = (balances[wallet] || 0) + earnedMonk;
    saveBalances(balances);
    
    console.log(`✅ ${wallet} earned ${earnedMonk} MONK (balance: ${balances[wallet]})`);
    
    res.json({
      success: true,
      earned: earnedMonk,
      newBalance: balances[wallet],
      message: `Earned ${earnedMonk} MONK! Total unminted: ${balances[wallet]}`
    });
  } catch (error) {
    console.error('Earn error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Mint tokens (deducts from balance)
app.post('/api/mint', async (req, res) => {
  try {
    const { userWallet, amount = 1 } = req.body;
    
    if (!userWallet) {
      throw new Error('User wallet address required');
    }
    
    // Check balance
    const currentBalance = balances[userWallet] || 0;
    if (currentBalance < amount) {
      throw new Error(`Insufficient balance. You have ${currentBalance} MONK, tried to mint ${amount}`);
    }
    
    // Validate amount
    if (amount < 1 || amount > 100) {
      throw new Error('Amount must be between 1 and 100');
    }
    
    const userPublicKey = new PublicKey(userWallet);
    const mintPublicKey = new PublicKey(MONK_TOKEN);
    
    // Get associated token account
    const userTokenAccount = getAssociatedTokenAddressSync(
      mintPublicKey,
      userPublicKey,
      false,
      TOKEN_2022_PROGRAM_ID
    );
    
    // Create transaction
    const transaction = new Transaction();
    
    // Check if token account exists, if not create it
    try {
      await getAccount(
        connection,
        userTokenAccount,
        'confirmed',
        TOKEN_2022_PROGRAM_ID
      );
    } catch (error) {
      // Account doesn't exist, add instruction to create it
      transaction.add(
        createAssociatedTokenAccountInstruction(
          userPublicKey, // payer
          userTokenAccount,
          userPublicKey,
          mintPublicKey,
          TOKEN_2022_PROGRAM_ID
        )
      );
    }
    
    // Add mint instruction
    transaction.add(
      createMintToInstruction(
        mintPublicKey,
        userTokenAccount,
        DEPLOYER_KEYPAIR.publicKey, // mint authority
        amount, // amount (no decimals)
        [],
        TOKEN_2022_PROGRAM_ID
      )
    );
    
    // Get recent blockhash
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = userPublicKey;
    
    // Partially sign with deployer
    transaction.partialSign(DEPLOYER_KEYPAIR);
    
    // Deduct from balance AFTER successful transaction creation
    balances[userWallet] -= amount;
    saveBalances(balances);
    
    console.log(`✅ Prepared mint for ${userWallet}: ${amount} MONK (remaining balance: ${balances[userWallet]})`);
    
    // Serialize and send back
    const serialized = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false
    });
    
    res.json({
      transaction: serialized.toString('base64'),
      blockhash,
      lastValidBlockHeight,
      amount,
      remainingBalance: balances[userWallet]
    });
  } catch (error) {
    console.error('Mint error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Verify transaction success (optional endpoint for tracking)
app.post('/api/verify', async (req, res) => {
  try {
    const { signature, wallet } = req.body;
    
    if (!signature) {
      throw new Error('Transaction signature required');
    }
    
    const txInfo = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    
    if (!txInfo) {
      throw new Error('Transaction not found');
    }
    
    res.json({
      success: true,
      signature,
      slot: txInfo.slot,
      wallet,
      balance: balances[wallet] || 0
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(400).json({ error: error.message });
  }
});

// Initialize
DEPLOYER_KEYPAIR = loadKeypair();

console.log('🚀 MMGA Minting Backend Starting...');
console.log('📍 RPC:', SOLANA_RPC);
console.log('🪙 Token:', MONK_TOKEN);
console.log('👥 Squad:', SQUAD_ADDRESS);
console.log('🔑 Deployer:', DEPLOYER_KEYPAIR.publicKey.toString());
console.log('💾 Balance file:', BALANCE_FILE);

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log('📡 Endpoints:');
  console.log('   GET  /health - Health check');
  console.log('   GET  /api/balance/:wallet - Get unminted balance');
  console.log('   POST /api/earn - Add earned MONK to balance');
  console.log('   POST /api/mint - Mint tokens (deducts from balance)');
  console.log('   POST /api/verify - Verify transaction');
});
