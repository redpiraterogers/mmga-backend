#!/bin/bash
# Quick Start Script for MMGA Minting Backend

set -e

echo "🚀 MMGA Minting Backend - Quick Start"
echo "======================================"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+"
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Check for .env file
if [ ! -f .env ]; then
    echo ""
    echo "⚠️  No .env file found. Creating from template..."
    cp .env.example .env
    echo "📝 Please edit .env with your configuration"
    echo ""
    exit 1
fi

# Check for deployer keypair
KEYPAIR_PATH=$(grep DEPLOYER_KEYPAIR_PATH .env | cut -d '=' -f2)

if [ -z "$KEYPAIR_PATH" ]; then
    KEYPAIR_PATH="$HOME/.config/solana/deployer.json"
fi

if [ ! -f "$KEYPAIR_PATH" ]; then
    echo ""
    echo "❌ Deployer keypair not found at: $KEYPAIR_PATH"
    echo ""
    echo "Please ensure your deployer keypair exists at this location."
    echo "You can update DEPLOYER_KEYPAIR_PATH in .env"
    echo ""
    exit 1
fi

echo "✅ Deployer keypair found"

# Start server
echo ""
echo "🚀 Starting server..."
echo ""

npm start
