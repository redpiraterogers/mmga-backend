// React Component: Mint $MONK Token
// Integrates with Phantom wallet and minting backend

import React, { useState, useEffect } from 'react';
import { 
  Connection, 
  PublicKey, 
  Transaction,
  VersionedTransaction
} from '@solana/web3.js';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';

export default function MintButton({ sessionData }) {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  // Check if Phantom is installed
  useEffect(() => {
    if (window.solana?.isPhantom) {
      console.log('✅ Phantom wallet detected');
    }
  }, []);

  /**
   * Connect to Phantom wallet
   */
  const connectWallet = async () => {
    try {
      if (!window.solana?.isPhantom) {
        setError('Please install Phantom wallet');
        window.open('https://phantom.app/', '_blank');
        return;
      }

      const response = await window.solana.connect();
      setWallet(response.publicKey.toString());
      setError('');
      console.log('Connected:', response.publicKey.toString());
    } catch (err) {
      console.error('Connection failed:', err);
      setError('Failed to connect wallet');
    }
  };

  /**
   * Request mint transaction from backend
   */
  const requestMintTransaction = async () => {
    const response = await fetch(`${BACKEND_URL}/api/mint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...sessionData,
        userWallet: wallet,
        biometricValid: true, // From your biometric detection
        timestamp: new Date().toISOString()
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to create transaction');
    }

    return await response.json();
  };

  /**
   * Sign and send transaction
   */
  const signAndSendTransaction = async (txData) => {
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    
    // Deserialize transaction
    const txBuffer = Buffer.from(txData.transaction, 'base64');
    const transaction = Transaction.from(txBuffer);

    // Sign with user's wallet (pays gas)
    const signed = await window.solana.signTransaction(transaction);

    // Send to blockchain
    const signature = await connection.sendRawTransaction(signed.serialize());

    // Wait for confirmation
    await connection.confirmTransaction({
      signature,
      blockhash: txData.blockhash,
      lastValidBlockHeight: txData.lastValidBlockHeight
    });

    return signature;
  };

  /**
   * Main mint flow
   */
  const mintToken = async () => {
    try {
      setLoading(true);
      setError('');
      
      // Step 1: Request transaction from backend
      setStatus('Preparing transaction...');
      const txData = await requestMintTransaction();

      // Step 2: Sign with Phantom
      setStatus('Please approve in Phantom...');
      const signature = await signAndSendTransaction(txData);

      // Step 3: Verify success
      setStatus('Confirming transaction...');
      const verifyResponse = await fetch(`${BACKEND_URL}/api/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature,
          userWallet: wallet
        })
      });

      const result = await verifyResponse.json();

      if (result.success) {
        setStatus(`✅ Success! You now have ${result.balance} MONK token(s)`);
        
        // Show transaction on Solscan
        console.log(`View on Solscan: https://solscan.io/tx/${signature}`);
      }

    } catch (err) {
      console.error('Mint error:', err);
      setError(err.message || 'Minting failed');
    } finally {
      setLoading(false);
    }
  };

  // ========================================
  // RENDER
  // ========================================

  if (!wallet) {
    return (
      <div className="mint-section">
        <h3>Ready to Mint Your $MONK Token?</h3>
        <p>Connect your Phantom wallet to claim your earned token.</p>
        <button 
          onClick={connectWallet}
          className="btn btn-yellow"
        >
          Connect Phantom Wallet
        </button>
        {error && <div className="error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="mint-section">
      <div className="wallet-info">
        <span>🪙 Connected:</span>
        <code>{wallet.slice(0, 4)}...{wallet.slice(-4)}</code>
      </div>

      <div className="session-summary">
        <h4>Session Complete!</h4>
        <p>Duration: {Math.floor(sessionData.duration / 60)} minutes</p>
        <p>Session ID: {sessionData.sessionId}</p>
      </div>

      <button 
        onClick={mintToken}
        disabled={loading}
        className="btn btn-red"
      >
        {loading ? status : 'Mint 1 MONK Token'}
      </button>

      {loading && (
        <div className="status-message">
          {status}
        </div>
      )}

      {error && (
        <div className="error-message">
          ❌ {error}
        </div>
      )}

      <div className="gas-notice">
        <small>
          Network fee: ~$0.002 (paid to Solana validators, not MMGA)
        </small>
      </div>

      <style jsx>{`
        .mint-section {
          padding: 32px;
          background: rgba(248,246,240,0.02);
          border: 1px solid var(--border2);
          border-radius: 12px;
          text-align: center;
        }

        .wallet-info {
          font-size: 14px;
          color: var(--muted);
          margin-bottom: 24px;
        }

        .wallet-info code {
          font-family: var(--mono);
          color: var(--gold);
          margin-left: 8px;
        }

        .session-summary {
          margin: 24px 0;
          padding: 16px;
          background: rgba(127,182,158,0.1);
          border: 1px solid rgba(127,182,158,0.2);
          border-radius: 8px;
        }

        .session-summary h4 {
          color: var(--sage);
          margin-bottom: 12px;
        }

        .session-summary p {
          font-size: 13px;
          color: var(--muted);
          margin: 4px 0;
        }

        .status-message {
          margin-top: 16px;
          padding: 12px;
          background: rgba(232,192,104,0.1);
          border: 1px solid rgba(232,192,104,0.2);
          border-radius: 6px;
          color: var(--gold);
          font-size: 14px;
        }

        .error-message {
          margin-top: 16px;
          padding: 12px;
          background: rgba(244,162,97,0.1);
          border: 1px solid rgba(244,162,97,0.2);
          border-radius: 6px;
          color: var(--amber);
          font-size: 14px;
        }

        .gas-notice {
          margin-top: 16px;
          color: var(--dim);
          font-size: 12px;
        }

        .error {
          margin-top: 12px;
          color: var(--amber);
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}
