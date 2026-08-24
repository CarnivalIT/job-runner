module.exports = {
  apps: [
    {
      name: 'carnival-job-runner',
      script: './dist/index.js',
      instances: 1, // Single instance to prevent duplicate cron executions
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      time: true,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
