# $MONK Token Minting Backend

Complete backend system for minting $MONK tokens with session verification and user-pays-gas architecture.

---

## 🏗️ Architecture

**User Flow:**
1. User completes meditation session (biometric detection validates)
2. Frontend sends session data to backend
3. Backend verifies session validity
4. Backend creates Solana transaction
5. Backend partially signs with deployer authority
6. Transaction sent to frontend
7. User signs with Phantom wallet (pays gas ~$0.002)
8. Transaction submitted to blockchain
9. User receives 1 MONK token

**Gas Payment:**
- User pays Solana network fees directly to validators
- MMGA pays $0 per mint
- Sustainable forever

---

## 📦 Installation

### Prerequisites

- Node.js 18+ 
- Solana CLI tools
- Deployer keypair (one of the Squad signers)
- Access to Solana RPC endpoint

### Setup

```bash
# 1. Install dependencies
cd monk-minting-backend
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your settings

# 3. Verify deployer keypair
ls ~/.config/solana/deployer.json

# 4. Test connection
npm start
```

---

## 🔧 Configuration

### Environment Variables

Create `.env` file:

```bash
# Solana network
SOLANA_RPC=https://api.mainnet-beta.solana.com

# Server
PORT=3001

# Deployer keypair (one of the Squad signers)
DEPLOYER_KEYPAIR_PATH=/Users/yourname/.config/solana/deployer.json
```

### Security Notes

⚠️ **CRITICAL:** 
- Never commit `deployer.json` to git
- Never expose private keys in logs
- Add `.env` and `*.json` to `.gitignore`
- Use environment variables in production

---

## 🚀 Deployment

### Option A: Local Development

```bash
npm run dev
# Server runs on http://localhost:3001
```

### Option B: Production (DigitalOcean/AWS/Heroku)

1. **Set environment variables** in hosting dashboard
2. **Upload deployer keypair** securely
3. **Start server:** `npm start`
4. **Enable HTTPS** (required for Phantom wallet)

### Option C: Serverless (Vercel/Netlify)

Note: Deployer keypair needs to be stored securely as environment variable.

```bash
# Vercel
vercel deploy

# Set environment variable
vercel env add DEPLOYER_KEYPAIR_PATH
```

---

## 📡 API Endpoints

### Health Check

```bash
GET /health

Response:
{
  "status": "ok",
  "token": "4ec5P6tYDUCQbv6VcqLPqXtD8h5FEnU5VEHSUht5Hzhv",
  "deployer": "FCg4KoWtwbRfRQPt6t7dFSxzV2GbL4VABSsTRQoA66LX"
}
```

### Request Mint Transaction

```bash
POST /api/mint
Content-Type: application/json

Body:
{
  "sessionId": "uuid-v4-string",
  "duration": 600,  // seconds
  "timestamp": "2026-05-02T01:30:00Z",
  "biometricValid": true,
  "userWallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
}

Response (success):
{
  "success": true,
  "transaction": "base64-encoded-transaction",
  "blockhash": "...",
  "lastValidBlockHeight": 12345678,
  "message": "Minting token (~0.002 SOL)"
}

Response (error):
{
  "error": "Session too short (minimum 5 minutes)"
}
```

### Verify Transaction

```bash
POST /api/verify
Content-Type: application/json

Body:
{
  "signature": "5xK7...",
  "userWallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
}

Response:
{
  "success": true,
  "balance": "3",
  "decimals": 0,
  "message": "Token minted successfully!"
}
```

---

## 🎨 Frontend Integration

### Install Dependencies

```bash
npm install @solana/web3.js @solana/wallet-adapter-react \
  @solana/wallet-adapter-react-ui @solana/wallet-adapter-wallets
```

### Use MintButton Component

```jsx
import MintButton from './components/MintButton';

function App() {
  const [sessionData, setSessionData] = useState(null);

  // After meditation session completes
  const handleSessionComplete = (data) => {
    setSessionData({
      sessionId: data.id,
      duration: data.durationSeconds,
      biometricValid: data.biometricPassed
    });
  };

  return (
    <div>
      {sessionData && <MintButton sessionData={sessionData} />}
    </div>
  );
}
```

---

## 🔒 Security Considerations

### Session Verification

Current implementation has basic checks:
- ✅ Minimum duration (5 minutes)
- ✅ Recent timestamp (within 10 minutes)
- ✅ Biometric validation flag

**TODO for production:**
- [ ] Database tracking of claimed sessions
- [ ] Rate limiting (max 1 mint per hour per wallet)
- [ ] IP-based fraud detection
- [ ] CAPTCHA for suspicious activity
- [ ] Webhook validation from biometric service

### Multi-Sig Authority

- Mint authority controlled by 3-of-5 Squad
- Single deployer cannot mint alone
- All mints require consensus
- Transparent on-chain verification

---

## 🧪 Testing

### Test Session Verification

```bash
curl -X POST http://localhost:3001/api/mint \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-123",
    "duration": 600,
    "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
    "biometricValid": true,
    "userWallet": "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU"
  }'
```

### Test Health Endpoint

```bash
curl http://localhost:3001/health
```

---

## 📊 Monitoring

### Logs to Monitor

- Transaction success rate
- Session validation failures
- RPC errors
- Gas costs per transaction
- User wallet errors

### Recommended Tools

- **Logging:** Winston or Pino
- **Monitoring:** Datadog, New Relic
- **Alerts:** PagerDuty for failures
- **Analytics:** PostHog for user tracking

---

## 🐛 Troubleshooting

### "owner does not match" Error

This means the deployer keypair doesn't match the mint authority. Verify:

```bash
# Check current mint authority
spl-token display 4ec5P6tYDUCQbv6VcqLPqXtD8h5FEnU5VEHSUht5Hzhv

# Should show Squad address as mint authority
```

### "Failed to load deployer keypair"

Check:
- File exists at path specified in `DEPLOYER_KEYPAIR_PATH`
- File is valid JSON array of 64 numbers
- File has correct permissions

### Phantom Not Connecting

- Ensure frontend is HTTPS (required)
- Check user has Phantom installed
- Verify Phantom is unlocked
- Check browser console for errors

---

## 🚀 Production Checklist

Before going live:

- [ ] Environment variables configured
- [ ] Deployer keypair secured
- [ ] HTTPS enabled
- [ ] Rate limiting implemented
- [ ] Database for session tracking
- [ ] Error monitoring setup
- [ ] Backup RPC endpoints configured
- [ ] Load testing completed
- [ ] Security audit passed

---

## 📝 License

MIT

---

## 🤝 Support

Questions? Issues?
- GitHub: [Your Repo]
- Discord: [Your Server]
- Email: hello@mmga.yoga
