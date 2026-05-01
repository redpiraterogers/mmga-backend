// MMGA $MONK Token Minting Backend
// Handles session verification and partial transaction signing

const express = require('express');
const cors = require('cors');
const { 
  Connection, 
  PublicKey, 
  Transaction,
  Keypair,
  clusterApiUrl
} = require('@solana/web3.js');
const {
  createMintToCheckedInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  TOKEN_2022_PROGRAM_ID
} = require('@solana/spl-token');
const bs58 = require('bs58');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// ========================================
// CONFIGURATION
// ========================================

const SOLANA_RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const PORT = process.env.PORT || 3001;

// Token configuration
const MONK_TOKEN = new PublicKey('4ec5P6tYDUCQbv6VcqLPqXtD8h5FEnU5VEHSUht5Hzhv');
const SQUAD_AUTHORITY = new PublicKey('7yyyxcNzjjQ5mc6tCFgFkU4nh4F7w2pwrMnaKcQmYkN3');

// Load deployer keypair (one of the Squad signers)
// IMPORTANT: Keep this secret! Never commit to git
const DEPLOYER_KEYPAIR = loadKeypair();

function loadKeypair() {
  const keypairPath = process.env.DEPLOYER_KEYPAIR_PATH || 
    `${process.env.HOME}/.config/solana/deployer.json`;
  
  try {
    const keypairData = JSON.parse(fs.readFileSync(keypairPath, 'utf-8'));
    return Keypair.fromSecretKey(Uint8Array.from(keypairData));
  } catch (error) {
    console.error('Failed to load deployer keypair:', error.message);
    console.error('Set DEPLOYER_KEYPAIR_PATH environment variable');
    process.exit(1);
  }
}

const connection = new Connection(SOLANA_RPC, 'confirmed');

console.log(`🚀 MMGA Minting Backend Starting...`);
console.log(`📍 RPC: ${SOLANA_RPC}`);
console.log(`🪙 Token: ${MONK_TOKEN.toString()}`);
console.log(`👥 Squad: ${SQUAD_AUTHORITY.toString()}`);
console.log(`🔑 Deployer: ${DEPLOYER_KEYPAIR.publicKey.toString()}`);

// ========================================
// SESSION VERIFICATION
// ========================================

/**
 * Verify meditation session is valid
 * In production, this should:
 * - Check biometric detection results
 * - Verify session duration
 * - Check user hasn't already minted for this session
 * - Validate timestamp is recent
 */
function verifySession(sessionData) {
  const { 
    sessionId, 
    duration, 
    timestamp, 
    biometricValid,
    userWallet 
  } = sessionData;

  // Basic validation
  if (!sessionId || !duration || !timestamp || !userWallet) {
    return { valid: false, error: 'Missing required fields' };
  }

  // Check biometric validation passed
  if (!biometricValid) {
    return { valid: false, error: 'Biometric validation failed' };
  }

  // Check minimum duration (e.g., 5 minutes = 300 seconds)
  if (duration < 300) {
    return { valid: false, error: 'Session too short (minimum 5 minutes)' };
  }

  // Check timestamp is recent (within last 10 minutes)
  const now = Date.now();
  const sessionTime = new Date(timestamp).getTime();
  const ageMinutes = (now - sessionTime) / 1000 / 60;
  
  if (ageMinutes > 10) {
    return { valid: false, error: 'Session expired (must claim within 10 minutes)' };
  }

  // TODO: Check database that this sessionId hasn't been claimed already
  // TODO: Check rate limiting (e.g., max 1 mint per hour per wallet)

  return { valid: true };
}

// ========================================
// TRANSACTION BUILDING
// ========================================

/**
 * Create a partially-signed transaction for minting 1 MONK token
 * User will complete signing and pay gas fees
 */
async function createMintTransaction(userWalletAddress) {
  const userPubkey = new PublicKey(userWalletAddress);

  // Get user's token account address
  const userTokenAccount = await getAssociatedTokenAddress(
    MONK_TOKEN,
    userPubkey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  // Check if account exists
  const accountInfo = await connection.getAccountInfo(userTokenAccount);
  const needsAccountCreation = accountInfo === null;

  // Create transaction
  const transaction = new Transaction();
  
  // Add create account instruction if needed
  if (needsAccountCreation) {
    const createAccountIx = createAssociatedTokenAccountInstruction(
      userPubkey, // payer (user pays)
      userTokenAccount,
      userPubkey, // owner
      MONK_TOKEN,
      TOKEN_2022_PROGRAM_ID
    );
    transaction.add(createAccountIx);
  }

  // Add mint instruction
  const mintIx = createMintToCheckedInstruction(
    MONK_TOKEN,
    userTokenAccount,
    SQUAD_AUTHORITY, // mint authority (Squad controls this)
    1, // amount (1 token)
    0, // decimals
    [], // no additional signers needed here
    TOKEN_2022_PROGRAM_ID
  );
  transaction.add(mintIx);

  // Get recent blockhash
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = userPubkey; // User pays gas

  // Partially sign with deployer keypair
  // This proves backend authorization
  transaction.partialSign(DEPLOYER_KEYPAIR);

  return {
    transaction: transaction.serialize({
      requireAllSignatures: false, // User hasn't signed yet
      verifySignatures: false
    }),
    blockhash,
    lastValidBlockHeight,
    needsAccountCreation
  };
}

// ========================================
// API ENDPOINTS
// ========================================

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    token: MONK_TOKEN.toString(),
    deployer: DEPLOYER_KEYPAIR.publicKey.toString()
  });
});

/**
 * Request mint transaction
 * 
 * POST /api/mint
 * Body: {
 *   sessionId: string,
 *   duration: number (seconds),
 *   timestamp: string (ISO),
 *   biometricValid: boolean,
 *   userWallet: string (Solana address)
 * }
 */
app.post('/api/mint', async (req, res) => {
  try {
    const sessionData = req.body;

    // Verify session
    const verification = verifySession(sessionData);
    if (!verification.valid) {
      return res.status(400).json({
        error: verification.error
      });
    }

    // Create mint transaction
    const txData = await createMintTransaction(sessionData.userWallet);

    // Return serialized transaction
    res.json({
      success: true,
      transaction: txData.transaction.toString('base64'),
      blockhash: txData.blockhash,
      lastValidBlockHeight: txData.lastValidBlockHeight,
      message: txData.needsAccountCreation 
        ? 'First mint - creating token account (~0.36 SOL)'
        : 'Minting token (~0.002 SOL)'
    });

  } catch (error) {
    console.error('Mint error:', error);
    res.status(500).json({
      error: 'Failed to create mint transaction',
      details: error.message
    });
  }
});

/**
 * Verify transaction was successful
 * 
 * POST /api/verify
 * Body: {
 *   signature: string,
 *   userWallet: string
 * }
 */
app.post('/api/verify', async (req, res) => {
  try {
    const { signature, userWallet } = req.body;

    // Check transaction status
    const txInfo = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });

    if (!txInfo) {
      return res.status(404).json({
        error: 'Transaction not found'
      });
    }

    if (txInfo.meta?.err) {
      return res.status(400).json({
        error: 'Transaction failed',
        details: txInfo.meta.err
      });
    }

    // Get user's token balance
    const userPubkey = new PublicKey(userWallet);
    const userTokenAccount = await getAssociatedTokenAddress(
      MONK_TOKEN,
      userPubkey,
      false,
      TOKEN_2022_PROGRAM_ID
    );

    const tokenBalance = await connection.getTokenAccountBalance(userTokenAccount);

    res.json({
      success: true,
      balance: tokenBalance.value.amount,
      decimals: tokenBalance.value.decimals,
      message: 'Token minted successfully!'
    });

  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({
      error: 'Failed to verify transaction',
      details: error.message
    });
  }
});

// ========================================
// START SERVER
// ========================================

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
  console.log(`📡 Endpoints:`);
  console.log(`   GET  /health - Health check`);
  console.log(`   POST /api/mint - Request mint transaction`);
  console.log(`   POST /api/verify - Verify transaction`);
});
