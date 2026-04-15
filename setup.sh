#!/bin/bash

# ── Mandi Management System — AWS EC2 Setup Script ────────────
# Run this ONCE on a fresh Ubuntu 22.04 EC2 instance:
#   chmod +x setup.sh && sudo bash setup.sh

set -e

echo "======================================================"
echo "  Mandi Management System — Server Setup"
echo "======================================================"

# ── 1. Update system ──────────────────────────────────────────
echo "[1/8] Updating system packages..."
apt-get update -y && apt-get upgrade -y

# ── 2. Install Node.js 20 ─────────────────────────────────────
echo "[2/8] Installing Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
echo "Node.js version: $(node --version)"
echo "npm version: $(npm --version)"

# ── 3. Install PM2 ───────────────────────────────────────────
echo "[3/8] Installing PM2..."
npm install -g pm2

# ── 4. Install Nginx ──────────────────────────────────────────
echo "[4/8] Installing Nginx..."
apt-get install -y nginx

# ── 5. Install Certbot (SSL) ──────────────────────────────────
echo "[5/8] Installing Certbot..."
apt-get install -y certbot python3-certbot-nginx

# ── 6. Install AWS CLI ────────────────────────────────────────
echo "[6/8] Installing AWS CLI..."
apt-get install -y awscli

# ── 7. Create log directory ───────────────────────────────────
echo "[7/8] Creating log directory..."
mkdir -p /home/ubuntu/logs
chown ubuntu:ubuntu /home/ubuntu/logs

# ── 8. Setup firewall ─────────────────────────────────────────
echo "[8/8] Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "======================================================"
echo "  Setup complete! Next steps:"
echo ""
echo "  1. Upload your code:"
echo "     scp -i your-key.pem -r ./MANDI ubuntu@YOUR_IP:/home/ubuntu/"
echo ""
echo "  2. Install app dependencies:"
echo "     cd /home/ubuntu/MANDI && npm install --production"
echo ""
echo "  3. Set your .env file:"
echo "     nano /home/ubuntu/MANDI/.env"
echo "     (change SESSION_SECRET to a long random string)"
echo ""
echo "  4. Copy Nginx config:"
echo "     cp /home/ubuntu/MANDI/nginx.conf /etc/nginx/sites-available/mandi"
echo "     ln -s /etc/nginx/sites-available/mandi /etc/nginx/sites-enabled/"
echo "     rm /etc/nginx/sites-enabled/default"
echo "     nginx -t && systemctl reload nginx"
echo ""
echo "  5. Start the app:"
echo "     cd /home/ubuntu/MANDI"
echo "     pm2 start ecosystem.config.js --env production"
echo "     pm2 save && pm2 startup"
echo ""
echo "  6. Set up SSL (after pointing domain to this IP):"
echo "     certbot --nginx -d yourdomain.com"
echo ""
echo "  7. Set up daily backups:"
echo "     chmod +x /home/ubuntu/MANDI/backup.sh"
echo "     crontab -e"
echo "     Add: 0 2 * * * /bin/bash /home/ubuntu/MANDI/backup.sh"
echo "======================================================"
