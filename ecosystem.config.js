module.exports = {
  apps: [
    {
      name: 'csat',
      script: 'server.js',
      cwd: '/home/csat.iwn.ng/csat',
      
      // Environment-specific configurations
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      
      env_staging: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        // Use all available CPU cores in cluster mode
        instances: 'max',
        exec_mode: 'cluster',
      },

      // Instance configuration
      instances: 1,
      exec_mode: 'fork',

      // Watch and restart on file changes (development only)
      watch: false,
      ignore_watch: ['node_modules', '.next', 'logs', '.git', '*.log'],

      // Restart policy
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,

      // Memory limit (restart if exceeded)
      max_memory_restart: '1G',

      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: '/home/csat.iwn.ng/csat/logs/error.log',
      out_file: '/home/csat.iwn.ng/csat/logs/out.log',
      combine_logs: true,
      log_type: 'json',

      // Environment variables (injected at runtime)
      env: {
        // Firebase config will be loaded from .env file
      },

      // Graceful shutdown
      kill_timeout: 5000,
      listen_timeout: 8000,

      // Source map support for stack traces
      source_map_support: true,

      // Node.js arguments
      node_args: '--max-old-space-size=1024',

      // Post-deploy hook (optional)
      // post_deploy: 'npm run build',

      // Force restart on specific files
      // env_updated: ['.env', '.env.production'],

      // User to run as (if running as root with PM2 startup)
      // user: 'www-data',
    },
  ],

  // Deployment configuration (for pm2 deploy)
  deploy: {
    production: {
      user: 'ubuntu',
      host: ['csat.iwn.ng'],
      ref: 'origin/main',
      repo: 'git@github.com:your-org/csat-platform.git',
      path: '/home/csat.iwn.ng/csat',
      'pre-deploy-local': '',
      'post-deploy': 'npm ci --production && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
    },
    staging: {
      user: 'ubuntu',
      host: ['staging.csat.iwn.ng'],
      ref: 'origin/main',
      repo: 'git@github.com:your-org/csat-platform.git',
      path: '/home/csat-staging/csat',
      'pre-deploy-local': '',
      'post-deploy': 'npm ci --production && npm run build && pm2 reload ecosystem.config.js --env staging',
      'pre-setup': '',
    },
  },
};