#!/bin/bash

# Setup EC2 instance for ecommerce deployment
# Run this script once on a fresh EC2 instance

set -e

echo "=== Setting up EC2 Instance ==="

# Update system
echo "[1/10] Updating system..."
sudo yum update -y

# Install Node.js 18
echo "[2/10] Installing Node.js 18..."
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Install Docker
echo "[3/10] Installing Docker..."
sudo amazon-linux-extras install docker -y
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -a -G docker ec2-user

# Install Docker Compose
echo "[4/10] Installing Docker Compose..."
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Install PM2 globally
echo "[5/10] Installing PM2..."
sudo npm install -g pm2

# Install Nginx
echo "[6/10] Installing Nginx..."
sudo amazon-linux-extras install nginx1 -y
sudo systemctl start nginx
sudo systemctl enable nginx

# Create app directory
echo "[7/10] Creating app directory..."
mkdir -p /home/ec2-user/ecommerce
cd /home/ec2-user/ecommerce

# Setup PM2 startup
echo "[8/10] Setting up PM2 startup..."
pm2 startup
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ec2-user --hp /home/ec2-user
pm2 save

# Create logs directory
echo "[9/10] Creating logs directory..."
mkdir -p /home/ec2-user/ecommerce/logs

# Setup firewall
echo "[10/10] Setting up firewall..."
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --permanent --add-service=https
sudo firewall-cmd --reload

echo "=== EC2 Setup Complete ==="
echo "Next steps:"
echo "1. Clone your repository: git clone <repo-url> /home/ec2-user/ecommerce"
echo "2. Copy .env.production to .env"
echo "3. Run: chmod +x deploy.sh && ./deploy.sh"
