/**
 * PM2 Ecosystem Config — Mantram AI Auto-Fix Agent
 * 
 * Runs as a SINGLETON (fork mode, 1 instance) alongside the main server cluster.
 * Tails PM2 logs and auto-creates GitHub PRs for detected bugs.
 * 
 * Start:  pm2 start backend/deploy/ecosystem.autofix.cjs --update-env
 * Stop:   pm2 delete mantram-autofix
 * Logs:   pm2 logs mantram-autofix
 */
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

        // Logging — separate from main server logs to avoid feedback loops
        error_file: '/var/www/mantram/shared/logs/autofix-error.log',
        out_file: '/var/www/mantram/shared/logs/autofix-out.log',
        merge_logs: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }]
};
