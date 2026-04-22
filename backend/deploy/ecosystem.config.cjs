const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load .env from backend root
// Works whether running from Mantram/backend OR deployments-staging/TIMESTAMP/backend
const envPath = path.resolve(__dirname, '../.env');
const envVars = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};

// Dynamic values — set by CI workflow via .env injection
// Production:  PM2_APP_NAME=mantram-server  NODE_ENV=production
// Staging:     PM2_APP_NAME=mantram-staging  NODE_ENV=staging
const appName   = envVars.PM2_APP_NAME || 'mantram-server';
const nodeEnv   = envVars.NODE_ENV     || 'production';

// Log dir: use PM2_LOG_DIR from .env, fallback to sibling logs/ folder
const logDir = envVars.PM2_LOG_DIR
  ? path.resolve(envVars.PM2_LOG_DIR)
  : path.resolve(__dirname, '../logs');

// Ensure log directory exists
fs.mkdirSync(logDir, { recursive: true });

module.exports = {
  apps: [
    {
      name: appName,
      script: path.resolve(__dirname, '../index.js'),
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '2G',
      env: {
        NODE_OPTIONS: '--max-old-space-size=2048',
        NODE_ENV: nodeEnv,
        ...envVars,
      },
      error_file: path.join(logDir, 'error.log'),
      out_file:   path.join(logDir, 'out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      kill_timeout: 30000,
      wait_ready: false,
      listen_timeout: 30000,
    },
    {
      name: `${appName}-autofix`,
      script: path.resolve(__dirname, '../services/logWatcher.js'),
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: nodeEnv,
        ...envVars,
      },
      error_file: path.join(logDir, 'autofix-error.log'),
      out_file:   path.join(logDir, 'autofix-out.log'),
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      kill_timeout: 10000,
    },
  ],
};
