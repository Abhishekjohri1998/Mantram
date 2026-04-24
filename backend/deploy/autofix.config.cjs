/**
 * PM2 Ecosystem Config — Mantram AI Auto-Fix Agent
 * 
 * Runs as a SINGLETON (fork mode, 1 instance) alongside the main server cluster.
 * Tails PM2 logs and auto-creates GitHub PRs for detected bugs.
 * 
 * Start:  pm2 start backend/deploy/autofix.config.cjs --update-env
 * Stop:   pm2 delete mantram-autofix
 * Logs:   pm2 logs mantram-autofix
 */
const os = require('os');
const path = require('path');

const logsDir = path.join(os.homedir(), 'Mantram', 'backend', 'logs');

module.exports = {
    apps: [{
        name: 'mantram-autofix',
        script: 'backend/services/logWatcher.js',

        // MUST be singleton — one watcher per server
        instances: 1,
        exec_mode: 'fork',

        // Environment
        env: {
            NODE_ENV: 'production',
            AUTOFIX_ENABLED: 'true',
        },

        // Auto-restart on crash, but with backoff
        autorestart: true,
        max_memory_restart: '200M',
        exp_backoff_restart_delay: 5000,
        max_restarts: 20,
        restart_delay: 10000,

        // Graceful shutdown
        kill_timeout: 5000,

        // Disable PM2 APM (PMX) — suppresses pidusage TypeError noise in logs
        pmx: false,

        // Logging — use the same logs dir as main server (~/Mantram/backend/logs/)
        error_file: path.join(logsDir, 'autofix-error.log'),
        out_file: path.join(logsDir, 'autofix-out.log'),
        merge_logs: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }]
};
