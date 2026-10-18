/**
 * Resolves instance count with priority:
 * 1. CLI flag: -i <count> or --instances <count>
 * 2. Environment variable: PM2_INSTANCES=<count>
 * 3. Default fallback: 'max' (all cores in production)
 */
function resolveInstances() {
  // Check CLI arguments for -i or --instances
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

  // Check environment variable
  if (process.env.PM2_INSTANCES) {
    const envVal = Number(process.env.PM2_INSTANCES);
    return isNaN(envVal) ? process.env.PM2_INSTANCES : envVal;
  }

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
      max_memory_restart: process.env.PM2_MAX_MEMORY || "1G",
      // Zero-downtime rolling restart / reload support (server.ts sends 'ready')
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000,
      env: {
        NODE_ENV: "production",
      },
      env_production: {
        NODE_ENV: "production",
      },
    },
  ],
};
