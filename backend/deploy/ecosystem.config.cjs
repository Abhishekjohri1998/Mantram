module.exports = {
  apps: [
    {
      name: 'mantram-server',
      script: '/home/ec2-user/Mantram/backend/index.js',
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '1800M',
      env: {
        NODE_OPTIONS: '--max-old-space-size=1536',
        NODE_ENV: 'production',
      },
      error_file: '/home/ec2-user/Mantram/backend/logs/error.log',
      out_file: '/home/ec2-user/Mantram/backend/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      kill_timeout: 10000,
      wait_ready: true,
      listen_timeout: 15000,
    },
  ],
};
