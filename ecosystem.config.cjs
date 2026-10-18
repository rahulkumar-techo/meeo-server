const os = require("node:os");

/**
 * Resolves instance count with priority:
 * 1. CLI flag: -i <count> or --instances <count>
 * 2. Explicit environment variable: PM2_INSTANCES=<count>
 * 3. Cloud container concurrency: WEB_CONCURRENCY (e.g. Render/Heroku plan limits)
 * 4. Memory-safe auto-scaling:
 *    - Containers with <= 1GB RAM: 1 instance (prevents 512MB OOM crash)
 *    - Containers with <= 2GB RAM: max 2 instances
 *    - Servers with ample RAM (>2GB): 'max' (all cores, e.g. 8 cores)
 */
function resolveInstances() {
  // 1. Check CLI arguments for -i or --instances
  const args = process.argv;
  for (let idx = 0; idx < args.length; idx++) {
    const arg = args[idx];
    if (arg === "-i" || arg === "--instances") {
      const next = args[idx + 1];
      if (next && !isNaN(Number(next))) {
        return Number(next);
      }
      if (next) {
        return next;
      }
    }
    if (arg.startsWith("-i=")) {
      const val = arg.split("=")[1];
      return !isNaN(Number(val)) ? Number(val) : val;
    }
  }

  // 2. Check explicit PM2_INSTANCES environment variable
  if (process.env.PM2_INSTANCES) {
    const envVal = Number(process.env.PM2_INSTANCES);
    return isNaN(envVal) ? process.env.PM2_INSTANCES : envVal;
  }

  // 3. Check cloud platform concurrency (Render/Heroku injects WEB_CONCURRENCY based on container RAM)
  if (process.env.WEB_CONCURRENCY) {
    const conc = Number(process.env.WEB_CONCURRENCY);
    if (!isNaN(conc) && conc > 0) {
      return conc;
    }
  }

  // 4. Memory-safe calculation to prevent OOM (Out Of Memory) kills on constrained containers
  const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
  const totalCores = os.cpus().length;

  // On 512MB - 1GB container instances, run 1 instance to stay well below memory limits
  if (totalMemMb <= 1024) {
    return 1;
  }

  // On 2GB instances, run up to 2 instances
  if (totalMemMb <= 2048) {
    return Math.min(2, totalCores);
  }

  // On standard/production hosts with >2GB RAM, use all available cores (e.g. 8 cores)
  return "max";
}

module.exports = {
  apps: [
    {
      name: "meeo-server",
      script: "dist/server.js",
      instances: resolveInstances(),
      exec_mode: "cluster",
      autorestart: true,
      watch: false,
      max_memory_restart: process.env.PM2_MAX_MEMORY || "400M",
      // Boot workers in parallel for rapid container startup and instant port binding
      listen_timeout: 10000,
      kill_timeout: 5000,
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 5000,
        HOST: process.env.HOST || "0.0.0.0",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 5000,
        HOST: process.env.HOST || "0.0.0.0",
      },
    },
  ],
};
