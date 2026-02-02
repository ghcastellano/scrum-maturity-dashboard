#!/bin/bash

echo "🚀 Building Scrum Maturity Dashboard for Production..."
echo ""

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if API URL is provided
if [ -z "$1" ]; then
    echo "❌ Error: Backend API URL is required"
    echo ""
    echo "Usage: ./build-prod.sh <BACKEND_API_URL>"
    echo "Example: ./build-prod.sh https://your-api.onrender.com"
    exit 1
fi

API_URL=$1

echo "${BLUE}Step 1/3: Installing dependencies...${NC}"
cd server && npm install
cd ../client && npm install
cd ..

echo ""
echo "${BLUE}Step 2/3: Updating API URL...${NC}"
# Update API URL in the frontend
sed -i.bak "s|const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';|const API_BASE_URL = '$API_URL/api';|" client/src/services/api.js
echo "API URL set to: $API_URL/api"

echo ""
echo "${BLUE}Step 3/3: Building frontend...${NC}"
cd client && npm run build

echo ""
echo "${GREEN}✅ Build completed successfully!${NC}"
echo ""
echo "📦 Files ready in: client/dist/"
echo ""
echo "Next steps:"
echo "1. Deploy backend to Render (server/ folder)"
echo "2. Deploy frontend to Vercel (client/dist/ folder)"
echo ""
echo "Or run: npx vercel --prod (from client/ folder)"
