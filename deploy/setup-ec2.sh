#!/bin/bash
# ══════════════════════════════════════════════════════════════
# Mantram AI — EC2 Server Setup Script (Ubuntu 22/24 LTS)
# Run once on a fresh EC2 instance:
#   chmod +x setup-ec2.sh && ./setup-ec2.sh
# ══════════════════════════════════════════════════════════════

set -e

echo "═══════════════════════════════════════════"
echo "🚀 Mantram AI — EC2 Server Setup"
echo "═══════════════════════════════════════════"
echo ""

# ── 1. System Update ──
echo "📦 Updating system packages..."
sudo apt update && sudo apt upgrade -y

# ── 2. Install Node.js 22 LTS ──
echo "📦 Installing Node.js 22..."
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
echo "   Node: $(node -v)"
echo "   npm:  $(npm -v)"

# ── 3. Install PM2 ──
echo "📦 Installing PM2..."
sudo npm install -g pm2
echo "   PM2:  $(pm2 -v)"

# ── 4. Install Nginx ──
echo "📦 Installing Nginx..."
sudo apt install -y nginx
sudo systemctl enable nginx

# ── 5. Install Certbot (SSL) ──
echo "📦 Installing Certbot for SSL..."
sudo apt install -y certbot python3-certbot-nginx

# ── 6. Create directory structure ──
echo "📁 Creating app directory structure..."
sudo mkdir -p /var/www/mantram/{releases,shared/logs}
sudo chown -R ubuntu:ubuntu /var/www/mantram

# ── 7. Generate SSH deploy key for GitHub ──
echo "🔑 Generating deploy key for GitHub..."
if [ ! -f ~/.ssh/deploy_key ]; then
  ssh-keygen -t ed25519 -C "mantram-ec2-deploy" -f ~/.ssh/deploy_key -N ""
  
  # Configure SSH to use deploy key for GitHub
  cat >> ~/.ssh/config << 'EOF'
Host github.com
  IdentityFile ~/.ssh/deploy_key
  StrictHostKeyChecking no
EOF
  chmod 600 ~/.ssh/config
  
  echo ""
  echo "═══════════════════════════════════════════"
  echo "🔑 DEPLOY KEY (add this to GitHub):"
  echo "═══════════════════════════════════════════"
  echo ""
  cat ~/.ssh/deploy_key.pub
  echo ""
  echo "Go to: https://github.com/Abhishekjohri1998/Mantram/settings/keys"
  echo "Click 'Add deploy key' → Paste the key above → Check 'Allow read access'"
  echo "═══════════════════════════════════════════"
else
  echo "   Deploy key already exists"
fi

# ── 8. Configure Nginx ──
echo "🌐 Configuring Nginx..."
sudo tee /etc/nginx/sites-available/mantram > /dev/null << 'NGINX_CONF'
limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

server {
    listen 80;
    server_name mantram.ai www.mantram.ai _;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml text/javascript image/svg+xml;

    location / {
        root /var/www/mantram/current/dist;
        try_files $uri $uri/ /index.html;
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2|woff|ttf)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    location /api/ {
        limit_req zone=api burst=50 nodelay;
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
        proxy_send_timeout 120s;
        client_max_body_size 50m;
    }

    location ~ /\. { deny all; }
    location ~ \.env$ { deny all; }
}
NGINX_CONF

sudo ln -sf /etc/nginx/sites-available/mantram /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
echo "   Nginx configured ✅"

# ── 9. Setup PM2 ecosystem config ──
echo "⚙️  Setting up PM2 config..."
cat > /var/www/mantram/shared/ecosystem.config.cjs << 'PM2_CONF'
module.exports = {
  apps: [{
    name: 'mantram-server',
    script: 'server/index.js',
    cwd: '/var/www/mantram/current',
    instances: 2,
    exec_mode: 'cluster',
    env: { NODE_ENV: 'production', PORT: 3001 },
    autorestart: true,
    max_memory_restart: '500M',
    exp_backoff_restart_delay: 100,
    max_restarts: 10,
    kill_timeout: 5000,
    error_file: '/var/www/mantram/shared/logs/error.log',
    out_file: '/var/www/mantram/shared/logs/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
PM2_CONF
echo "   PM2 config created ✅"

# ── 10. Setup PM2 startup ──
echo "🔄 Configuring PM2 startup on boot..."
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u ubuntu --hp /home/ubuntu
echo "   PM2 startup configured ✅"

# ── 11. Allow ubuntu to reload nginx without password ──
echo "🔐 Configuring passwordless nginx reload..."
echo "ubuntu ALL=(ALL) NOPASSWD: /usr/sbin/nginx, /bin/systemctl reload nginx, /bin/systemctl restart nginx" | sudo tee /etc/sudoers.d/mantram-deploy > /dev/null
echo "   Sudoers configured ✅"

echo ""
echo "═══════════════════════════════════════════"
echo "✅ EC2 SETUP COMPLETE"
echo "═══════════════════════════════════════════"
echo ""
echo "📋 Next steps:"
echo "  1. Add the deploy key (printed above) to GitHub"
echo "  2. Create /var/www/mantram/shared/.env with production values"
echo "     nano /var/www/mantram/shared/.env"
echo "  3. Add these GitHub Secrets (repo → Settings → Secrets → Actions):"
echo "     • EC2_HOST  = $(curl -sf http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo '<your-ec2-ip>')"
echo "     • EC2_USER  = ubuntu"
echo "     • EC2_SSH_KEY = <contents of your .pem file>"
echo "  4. Push to main branch to trigger first deployment!"
echo ""
echo "📋 Optional: Setup SSL"
echo "  sudo certbot --nginx -d mantram.ai -d www.mantram.ai"
echo ""
