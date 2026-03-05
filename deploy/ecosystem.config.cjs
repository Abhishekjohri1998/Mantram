/**
 * PM2 Ecosystem Config — Mantram AI
 * Copy this to /var/www/mantram/shared/ecosystem.config.cjs on EC2
 */
module.exports = {
    apps: [{
        name: 'mantram-server',
        script: 'index.js',
        cwd: '/home/ec2-user/Mantram/backend',

        // Cluster mode for zero-downtime reloads
        instances: 2,
        exec_mode: 'cluster',

        // Environment
        env: {
            NODE_ENV: 'production',
            PORT: 3001,
        },

        // Auto-restart on crash
        autorestart: true,
        max_memory_restart: '500M',
        exp_backoff_restart_delay: 100,
        max_restarts: 10,
        restart_delay: 1000,

        // Graceful shutdown
        kill_timeout: 5000,
        listen_timeout: 10000,
        wait_ready: false,

        // Logging
        error_file: 'logs/error.log',
        out_file: 'logs/out.log',
        merge_logs: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }]
};
