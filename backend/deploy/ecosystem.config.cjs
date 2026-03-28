const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load .env from backend root — works whether running from Mantram/backend or deployments/TIMESTAMP/backend
const envPath = path.resolve(__dirname, '../.env');
const envVars = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};

module.exports = {
  apps: [
    {
      name: 'mantram-server',
      script: path.resolve(__dirname, '../index.js'),
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '2G',
      env: {
        NODE_OPTIONS: '--max-old-space-size=2048',
        NODE_ENV: 'production',
        ...envVars,
      },
      error_file: '/home/ec2-user/Mantram/backend/logs/error.log',
      out_file: '/home/ec2-user/Mantram/backend/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      kill_timeout: 30000,
      wait_ready: false,
      listen_timeout: 30000,
    },
  ],
};
