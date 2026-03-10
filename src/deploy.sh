#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

set -e

echo -e "${YELLOW}=== Starting Deployment to EC2 ===${NC}"

# 1. Pull latest code
echo -e "${YELLOW}[1/6] Pulling latest code...${NC}"
git pull origin main || true

# 2. Install dependencies
echo -e "${YELLOW}[2/6] Installing dependencies...${NC}"
npm ci --only=production

# 3. Start Docker services
echo -e "${YELLOW}[3/6] Starting Docker services...${NC}"
docker-compose up -d

# Wait for services to be ready
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 15

# 4. Stop old PM2 processes
echo -e "${YELLOW}[4/6] Stopping old PM2 processes...${NC}"
pm2 delete ecosystem.config.js || true

# 5. Start new PM2 processes
echo -e "${YELLOW}[5/6] Starting PM2 processes...${NC}"
pm2 start ecosystem.config.js --env production
pm2 save

# 6. Restart Nginx
echo -e "${YELLOW}[6/6] Restarting Nginx...${NC}"
sudo systemctl restart nginx

# Show status
echo -e "${GREEN}=== Deployment Completed! ===${NC}"
echo -e "${GREEN}PM2 Status:${NC}"
pm2 status
echo -e "${GREEN}Docker Status:${NC}"
docker-compose ps
echo -e "${GREEN}Nginx Status:${NC}"
sudo systemctl status nginx --no-pager
