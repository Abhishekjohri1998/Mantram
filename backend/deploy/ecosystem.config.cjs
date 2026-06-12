/**
 * PM2 Ecosystem Config — Mantram AI
 * Copy this to /var/www/mantram/shared/ecosystem.config.cjs on EC2
 */
module.exports = {
    apps: [{
        name: 'mantram-server',
        script: 'index.js',
        cwd: '/home/ec2-user/Mantram/backend',

        // Single instance — saves memory on small EC2 and avoids
        // duplicate scheduler execution edge-cases in cluster mode
        instances: 1,
        exec_mode: 'fork',

        // Environment
        env: {
            NODE_ENV: 'production',
            PORT: 3001,
        },

        // Auto-restart on crash
        autorestart: true,
        max_memory_restart: '1G',   // 500M was too aggressive for AI/video workloads
        exp_backoff_restart_delay: 100,
        max_restarts: 10,
        restart_delay: 1000,

        // Graceful shutdown & ready signal
        // wait_ready: true → PM2 waits for process.send('ready') before routing traffic
        // This ensures MongoDB is connected before the worker receives requests
        wait_ready: true,
        listen_timeout: 30000,   // 30s max to wait for ready signal (DB connect can take 5-10s on cold start)
        kill_timeout: 35000,     // 35s for graceful shutdown — matches the 30s drain loop in index.js

        // Disable PM2 APM (PMX) — suppresses pidusage TypeError noise in logs
        // pidusage crashes when monitoring PIDs that exit during cluster restarts
        pmx: false,

        // Logging
        error_file: './logs/error.log',
        out_file: './logs/out.log',
        merge_logs: true,
        log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }]
};
