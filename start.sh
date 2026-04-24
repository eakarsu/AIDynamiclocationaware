#!/bin/bash

# ============================================
# Dynamic Location-Aware Advertising Platform
# Start Script with Auto-Reload
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${PURPLE}"
echo "╔══════════════════════════════════════════════╗"
echo "║   Dynamic Location-Aware Ads Platform        ║"
echo "║   Starting up...                              ║"
echo "╚══════════════════════════════════════════════╝"
echo -e "${NC}"

# Load env
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
    echo -e "${GREEN}✓ Environment variables loaded${NC}"
else
    echo -e "${RED}✗ .env file not found! Please create one.${NC}"
    exit 1
fi

API_PORT=${API_PORT:-4001}

# ============================================
# Clean up used ports
# ============================================
echo -e "${YELLOW}Cleaning up ports...${NC}"

cleanup_port() {
    local port=$1
    local pids=$(lsof -ti:$port 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo -e "${YELLOW}  Killing process(es) on port $port (PID: $pids)${NC}"
        echo "$pids" | xargs kill -9 2>/dev/null || true
        sleep 1
    fi
    echo -e "${GREEN}  ✓ Port $port is free${NC}"
}

cleanup_port $API_PORT

# ============================================
# Check PostgreSQL
# ============================================
echo -e "${CYAN}Checking PostgreSQL...${NC}"
if ! pg_isready -q 2>/dev/null; then
    echo -e "${YELLOW}  Starting PostgreSQL...${NC}"
    brew services start postgresql@14 2>/dev/null || brew services start postgresql 2>/dev/null || true
    sleep 2
fi

if pg_isready -q 2>/dev/null; then
    echo -e "${GREEN}  ✓ PostgreSQL is running${NC}"
else
    echo -e "${RED}  ✗ PostgreSQL is not running. Please start it manually.${NC}"
    exit 1
fi

# ============================================
# Install dependencies
# ============================================
echo -e "${CYAN}Checking dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}  Installing npm packages...${NC}"
    npm install --silent
fi
echo -e "${GREEN}  ✓ Dependencies installed${NC}"

# ============================================
# Seed Database
# ============================================
echo -e "${CYAN}Seeding database...${NC}"
node server/seed.js
echo -e "${GREEN}  ✓ Database seeded${NC}"

# ============================================
# Start servers with auto-reload
# ============================================
echo ""
echo -e "${PURPLE}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Starting servers with auto-reload...${NC}"
echo -e "${PURPLE}════════════════════════════════════════════════${NC}"
echo ""

# Single server serves both API and frontend
echo -e "${BLUE}  Application:      http://localhost:${API_PORT}${NC}"
echo -e "${BLUE}  API Endpoints:    http://localhost:${API_PORT}/api${NC}"
echo ""
echo -e "${YELLOW}  Auto-reload is active - changes will restart the server${NC}"
echo -e "${YELLOW}  Press Ctrl+C to stop${NC}"
echo ""

# Use npx nodemon to watch for changes and reload
npx nodemon \
    --watch server/ \
    --watch public/ \
    --ext js,html,css,json,sql \
    --delay 1 \
    server/index.js
