module.exports = {
  apps: [
    {
      name: "article-extractor",
      cwd: "/home/ubuntu/article-extractor",
      script: "backend/server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        PORT: 4001,
        PROXY_URL: "http://127.0.0.1:7890"
      },
      error_file: "/home/ubuntu/.pm2/logs/article-extractor-error.log",
      out_file: "/home/ubuntu/.pm2/logs/article-extractor-out.log",
      pid_file: "/home/ubuntu/.pm2/pids/article-extractor.pid",
      merge_logs: true,
      time: true,
      autorestart: true,
      max_memory_restart: "512M",
      node_args: "--max-old-space-size=512"
    }
  ]
};
