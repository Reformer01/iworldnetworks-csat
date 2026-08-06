module.exports = {
  apps: [
    {
      name: 'csat',
      cwd: '/home/csat.iwn.ng',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
  ],
};
