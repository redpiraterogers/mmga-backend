// server-nft.js - MMGA Backend with NFT Rewards System
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// ========== CONFIGURATION ==========
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const HELIUS_RPC = process.env.HELIUS_RPC || 'https://mainnet.helius-rpc.com/?api-key=YOUR-KEY';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mmga';

// Early adopter tiers (MONK redemption rates)
const REDEMPTION_TIERS = [
  { maxUsers: 100, rate: 200, name: 'Founder' },      // 2x bonus
  { maxUsers: 500, rate: 150, name: 'Early Bird' },   // 1.5x bonus
  { maxUsers: 1000, rate: 120, name: 'Pioneer' },     // 1.2x bonus
  { maxUsers: Infinity, rate: 100, name: 'Member' }   // Standard
];

// NFT milestones (meditation minutes required)
const NFT_MILESTONES = [
  // Beginner Journey (0-10 hours)
  { minutes: 30, name: 'First Steps', level: 1, emoji: '👣' },
  { minutes: 60, name: 'Awakening', level: 2, emoji: '🌅' },
  { minutes: 120, name: 'Committed Seeker', level: 3, emoji: '🔍' },
  { minutes: 300, name: 'Disciplined Mind', level: 4, emoji: '🧘' },
  { minutes: 600, name: 'Inner Peace', level: 5, emoji: '☮️' },
  
  // Novice Path (10-50 hours)
  { minutes: 900, name: 'Bronze Monk', level: 6, emoji: '🥉' },
  { minutes: 1200, name: 'Focused Warrior', level: 7, emoji: '⚔️' },
  { minutes: 1800, name: 'Calm Waters', level: 8, emoji: '🌊' },
  { minutes: 2400, name: 'Silver Monk', level: 9, emoji: '🥈' },
  { minutes: 3000, name: 'Mindful Master', level: 10, emoji: '🎯' },
  
  // Intermediate Path (50-100 hours)
  { minutes: 4000, name: 'Gold Monk', level: 11, emoji: '🥇' },
  { minutes: 5000, name: 'Zen Warrior', level: 12, emoji: '🗡️' },
  { minutes: 6000, name: 'Transcendent Soul', level: 13, emoji: '✨' },
  
  // Advanced Path (100-200 hours)
  { minutes: 7500, name: 'Platinum Monk', level: 14, emoji: '💎' },
  { minutes: 9000, name: 'Sacred Guardian', level: 15, emoji: '🛡️' },
  { minutes: 10000, name: 'Diamond Mind', level: 16, emoji: '💠' },
  { minutes: 12000, name: 'Eternal Flame', level: 17, emoji: '🔥' },
  
  // Master Path (200-500 hours)
  { minutes: 15000, name: 'Sage of Stillness', level: 18, emoji: '🌟' },
  { minutes: 18000, name: 'Cosmic Consciousness', level: 19, emoji: '🌌' },
  { minutes: 21000, name: 'Infinite Awareness', level: 20, emoji: '♾️' },
  { minutes: 24000, name: 'Divine Presence', level: 21, emoji: '👁️' },
  
  // Legendary Path (500-1000 hours)
  { minutes: 30000, name: 'Enlightened Master', level: 22, emoji: '🌞' },
  { minutes: 36000, name: 'Ascended Being', level: 23, emoji: '🦋' },
  { minutes: 42000, name: 'Universal Mind', level: 24, emoji: '🪐' },
  { minutes: 48000, name: 'Pure Consciousness', level: 25, emoji: '💫' },
  
  // Mythical Path (1000+ hours)
  { minutes: 54000, name: 'Timeless One', level: 26, emoji: '⏳' },
  { minutes: 60000, name: 'Beyond Form', level: 27, emoji: '🌀' },
  { minutes: 75000, name: 'Infinite Being', level: 28, emoji: '🔮' },
  { minutes: 90000, name: 'The Eternal', level: 29, emoji: '👑' },
  { minutes: 120000, name: 'One With All', level: 30, emoji: '☯️' }
];

// Solana connection
const connection = new Connection(HELIUS_RPC, 'confirmed');

// ========== MIDDLEWARE ==========
app.use(cors());
app.use(express.json());

// ========== DATABASE CONNECTION ==========
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✓ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ========== USER MODEL ==========
const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  walletAddress: {
    type: String,
    sparse: true
  },
  userNumber: {
    type: Number,
    unique: true
  },
  tier: {
    name: String,
    rate: Number
  },
  totalMinutes: {
    type: Number,
    default: 0
  },
  totalSessions: {
    type: Number,
    default: 0
  },
  currentStreak: {
    type: Number,
    default: 0
  },
  longestStreak: {
    type: Number,
    default: 0
  },
  lastSessionDate: Date,
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);

// ========== SESSION MODEL ==========
const SessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  minutes: Number,
  spineCorrect: Boolean,
  eyesClosed: Boolean,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Session = mongoose.model('Session', SessionSchema);

// ========== NFT MODEL ==========
const NFTSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  mintAddress: String,
  milestone: {
    name: String,
    level: Number,
    minutesRequired: Number
  },
  stats: {
    totalMinutes: Number,
    totalSessions: Number,
    longestStreak: Number
  },
  tier: {
    name: String,
    rate: Number,
    userNumber: Number
  },
  signature: String,
  metadata: Object,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const NFT = mongoose.model('NFT', NFTSchema);

// ========== AUTH MIDDLEWARE ==========
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.userEmail = decoded.email;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// ========== HELPER: Calculate User Tier ==========
async function calculateUserTier(userNumber) {
  for (const tier of REDEMPTION_TIERS) {
    if (userNumber <= tier.maxUsers) {
      return { name: tier.name, rate: tier.rate };
    }
  }
  return { name: 'Member', rate: 100 };
}

// ========== HELPER: Get Next Milestone ==========
function getNextMilestone(totalMinutes) {
  for (const milestone of NFT_MILESTONES) {
    if (totalMinutes < milestone.minutes) {
      return milestone;
    }
  }
  return null; // All milestones completed
}

// ========== HEALTH CHECK ==========
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    system: 'MMGA NFT Rewards'
  });
});

// ========== AUTH ENDPOINTS ==========

// Register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Calculate user number and tier
    const userCount = await User.countDocuments();
    const userNumber = userCount + 1;
    const tier = await calculateUserTier(userNumber);
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = new User({
      email,
      password: hashedPassword,
      userNumber,
      tier
    });
    
    await user.save();
    
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    console.log(`✓ New user #${userNumber} registered: ${email} (Tier: ${tier.name})`);
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        userNumber: user.userNumber,
        tier: user.tier,
        totalMinutes: user.totalMinutes,
        totalSessions: user.totalSessions
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }
    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: '30d' }
    );
    
    console.log(`✓ User logged in: ${email}`);
    
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        userNumber: user.userNumber,
        tier: user.tier,
        walletAddress: user.walletAddress,
        totalMinutes: user.totalMinutes,
        totalSessions: user.totalSessions,
        currentStreak: user.currentStreak,
        longestStreak: user.longestStreak
      }
    });
    
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    
    // Calculate next milestone
    const nextMilestone = getNextMilestone(user.totalMinutes);
    
    res.json({ 
      user,
      nextMilestone,
      progress: nextMilestone ? ((user.totalMinutes / nextMilestone.minutes) * 100).toFixed(1) : 100
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Link wallet
app.post('/api/auth/link-wallet', authenticateToken, async (req, res) => {
  try {
    const { walletAddress } = req.body;
    
    if (!walletAddress) {
      return res.status(400).json({ error: 'Wallet address required' });
    }
    
    const user = await User.findById(req.userId);
    user.walletAddress = walletAddress;
    await user.save();
    
    console.log(`✓ Wallet linked: ${walletAddress} to ${user.email}`);
    
    res.json({ success: true, walletAddress });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== SESSION ENDPOINTS ==========

// Add meditation session
app.post('/api/session/add', authenticateToken, async (req, res) => {
  try {
    const { minutes, spineCorrect, eyesClosed } = req.body;
    
    if (!minutes || minutes <= 0) {
      return res.status(400).json({ error: 'Valid minutes required' });
    }
    
    const user = await User.findById(req.userId);
    
    // Create session record
    const session = new Session({
      userId: user._id,
      minutes,
      spineCorrect: spineCorrect !== false,
      eyesClosed: eyesClosed !== false
    });
    await session.save();
    
    // Update user stats
    user.totalMinutes += minutes;
    user.totalSessions += 1;
    
    // Update streak
    const today = new Date().setHours(0, 0, 0, 0);
    const lastSession = user.lastSessionDate ? new Date(user.lastSessionDate).setHours(0, 0, 0, 0) : null;
    
    if (!lastSession) {
      user.currentStreak = 1;
    } else {
      const daysSince = Math.floor((today - lastSession) / (1000 * 60 * 60 * 24));
      if (daysSince === 0) {
        // Same day, don't change streak
      } else if (daysSince === 1) {
        user.currentStreak += 1;
      } else {
        user.currentStreak = 1;
      }
    }
    
    user.longestStreak = Math.max(user.longestStreak, user.currentStreak);
    user.lastSessionDate = new Date();
    
    await user.save();
    
    // Check if milestone reached
    const nextMilestone = getNextMilestone(user.totalMinutes);
    const previousMilestone = getNextMilestone(user.totalMinutes - minutes);
    
    let milestoneReached = null;
    if (previousMilestone && nextMilestone && previousMilestone.level !== nextMilestone.level) {
      milestoneReached = previousMilestone;
    } else if (!nextMilestone && previousMilestone) {
      milestoneReached = NFT_MILESTONES[NFT_MILESTONES.length - 1];
    }
    
    res.json({
      success: true,
      session: {
        minutes,
        totalMinutes: user.totalMinutes,
        totalSessions: user.totalSessions,
        currentStreak: user.currentStreak
      },
      milestoneReached,
      nextMilestone
    });
    
  } catch (error) {
    console.error('Session add error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user stats
app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.userId);
    const sessions = await Session.find({ userId: user._id }).sort({ createdAt: -1 }).limit(10);
    const nfts = await NFT.find({ userId: user._id }).sort({ createdAt: -1 });
    const nextMilestone = getNextMilestone(user.totalMinutes);
    
    res.json({
      user: {
        email: user.email,
        userNumber: user.userNumber,
        tier: user.tier,
        totalMinutes: user.totalMinutes,
        totalSessions: user.totalSessions,
        currentStreak: user.currentStreak,
        longestStreak: user.longestStreak
      },
      recentSessions: sessions,
      nfts,
      nextMilestone,
      progress: nextMilestone ? ((user.totalMinutes / nextMilestone.minutes) * 100).toFixed(1) : 100
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== NFT ENDPOINTS ==========

// Generate NFT metadata
app.post('/api/nft/prepare', authenticateToken, async (req, res) => {
  try {
    const { milestone } = req.body;
    
    const user = await User.findById(req.userId);
    
    if (!user.walletAddress) {
      return res.status(400).json({ error: 'Please link your Solana wallet first' });
    }
    
    // Find milestone
    const milestoneData = NFT_MILESTONES.find(m => m.name === milestone);
    if (!milestoneData) {
      return res.status(400).json({ error: 'Invalid milestone' });
    }
    
    if (user.totalMinutes < milestoneData.minutes) {
      return res.status(400).json({ error: 'Milestone not reached yet' });
    }
    
    // Check if already minted
    const existing = await NFT.findOne({ userId: user._id, 'milestone.name': milestone });
    if (existing) {
      return res.status(400).json({ error: 'NFT already minted for this milestone' });
    }
    
    // Generate metadata
    const metadata = {
      name: `${milestoneData.name} #${user.userNumber}`,
      symbol: 'MMGA',
      description: `MMGA Meditation Journey Certificate\n\nUser #${user.userNumber} - ${user.tier.name} Tier\nTotal Meditation: ${user.totalMinutes} minutes\nSessions: ${user.totalSessions}\nLongest Streak: ${user.longestStreak} days\n\nFuture Redemption: ${user.tier.rate} $MONK per NFT`,
      image: `https://mmga.yoga/nft/${user.userNumber}/${milestoneData.level}.png`, // You'll need to generate this
      attributes: [
        { trait_type: 'Level', value: milestoneData.name },
        { trait_type: 'User Number', value: user.userNumber },
        { trait_type: 'Tier', value: user.tier.name },
        { trait_type: 'Redemption Rate', value: user.tier.rate },
        { trait_type: 'Total Minutes', value: user.totalMinutes },
        { trait_type: 'Total Sessions', value: user.totalSessions },
        { trait_type: 'Longest Streak', value: user.longestStreak },
        { trait_type: 'Minted Date', value: new Date().toISOString().split('T')[0] }
      ],
      properties: {
        category: 'image',
        files: [
          {
            uri: `https://mmga.yoga/nft/${user.userNumber}/${milestoneData.level}.png`,
            type: 'image/png'
          }
        ]
      }
    };
    
    res.json({
      success: true,
      metadata,
      milestone: milestoneData
    });
    
  } catch (error) {
    console.error('NFT prepare error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Record minted NFT
app.post('/api/nft/record', authenticateToken, async (req, res) => {
  try {
    const { mintAddress, milestone, signature } = req.body;
    
    const user = await User.findById(req.userId);
    const milestoneData = NFT_MILESTONES.find(m => m.name === milestone);
    
    const nft = new NFT({
      userId: user._id,
      mintAddress,
      milestone: {
        name: milestoneData.name,
        level: milestoneData.level,
        minutesRequired: milestoneData.minutes
      },
      stats: {
        totalMinutes: user.totalMinutes,
        totalSessions: user.totalSessions,
        longestStreak: user.longestStreak
      },
      tier: {
        name: user.tier.name,
        rate: user.tier.rate,
        userNumber: user.userNumber
      },
      signature
    });
    
    await nft.save();
    
    console.log(`✓ NFT recorded: ${milestoneData.name} for user #${user.userNumber}`);
    
    res.json({ success: true, nft });
    
  } catch (error) {
    console.error('NFT record error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get user's NFTs
app.get('/api/nft/list', authenticateToken, async (req, res) => {
  try {
    const nfts = await NFT.find({ userId: req.userId }).sort({ createdAt: -1 });
    
    const totalRedemptionValue = nfts.reduce((sum, nft) => sum + nft.tier.rate, 0);
    
    res.json({
      nfts,
      count: nfts.length,
      totalRedemptionValue
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== START SERVER ==========
app.listen(PORT, () => {
  console.log(`🚀 MMGA NFT Rewards Backend running on port ${PORT}`);
  console.log(`MongoDB: ${MONGODB_URI}`);
  console.log(`Solana RPC: ${HELIUS_RPC}`);
});