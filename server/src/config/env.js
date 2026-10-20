import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Load server/.env into process.env using Node's built-in loader (no dotenv needed).
// Variables already set in the real environment win, which is what hosting platforms expect.
const envFile = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. Copy server/.env.example to server/.env.`);
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';

export const env = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT ?? 5000),
  mongodbUri: required('MONGODB_URI'),
  clientOrigin: required('CLIENT_ORIGIN'),
});
