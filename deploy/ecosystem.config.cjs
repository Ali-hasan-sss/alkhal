/**
 * PM2 process file for Al-Khal.
 * Usage (from repo root on server):
 *   set -a && source /var/www/alkhal/.env && set +a
 *   pm2 start deploy/ecosystem.config.cjs
 *   pm2 save
 *
 * Or start with env file helper:
 *   pm2 start deploy/ecosystem.config.cjs --update-env
 */
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');

function loadEnvFile(file) {
  if (!fs.existsSync(file)) {
    return {};
  }
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const i = trimmed.indexOf('=');
    if (i === -1) continue;
    const key = trimmed.slice(0, i).trim();
    let value = trimmed.slice(i + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const fileEnv = loadEnvFile(envPath);

module.exports = {
  apps: [
    {
      name: 'alkhal-api',
      cwd: path.join(root, 'apps/api'),
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        ...fileEnv,
        NODE_ENV: 'production',
        API_PORT: fileEnv.API_PORT || '4005',
      },
      max_memory_restart: '512M',
      time: true,
      error_file: '/var/log/pm2/alkhal-api-error.log',
      out_file: '/var/log/pm2/alkhal-api-out.log',
      merge_logs: true,
    },
    {
      name: 'alkhal-web',
      cwd: path.join(root, 'apps/web'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -H 127.0.0.1 -p 4006',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 4006,
        HOSTNAME: '127.0.0.1',
      },
      max_memory_restart: '512M',
      time: true,
      error_file: '/var/log/pm2/alkhal-web-error.log',
      out_file: '/var/log/pm2/alkhal-web-out.log',
      merge_logs: true,
    },
  ],
};
