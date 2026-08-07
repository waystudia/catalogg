import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(process.cwd(), '.env.e2e');
if (existsSync(envFile) && typeof process.loadEnvFile === 'function') process.loadEnvFile(envFile);

const readArg = (name, fallback = '') => {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || fallback;
};
const required = (name, fallback = '') => {
  const value = (process.env[name] || fallback).trim();
  if (!value) throw new Error(`Не задана обязательная переменная ${name}. Скопируйте .env.e2e.example в .env.e2e.`);
  return value;
};
const booleanEnv = (name) => /^(1|true|yes)$/i.test(process.env[name] || '');

export const buildConfig = () => {
  const delivery = readArg('delivery', 'platform');
  if (!['platform', 'restaurant', 'fallback'].includes(delivery)) {
    throw new Error(`Неизвестный delivery mode: ${delivery}`);
  }
  const mode = readArg('mode', 'manual');
  if (!['manual', 'auto'].includes(mode)) throw new Error(`Неизвестный mode: ${mode}`);
  const baseUrl = (process.env.E2E_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
  const supabaseUrl = required('E2E_SUPABASE_URL', process.env.VITE_SUPABASE_URL);
  const supabaseKey = required(
    'E2E_SUPABASE_PUBLISHABLE_KEY',
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  );

  return {
    mode,
    delivery,
    baseUrl,
    supabaseUrl,
    supabaseKey,
    recordVideo: booleanEnv('E2E_RECORD_VIDEO'),
    keepOpen: mode === 'manual' || booleanEnv('E2E_KEEP_OPEN'),
    artifactDir: resolve(process.cwd(), 'artifacts/e2e'),
    credentials: {
      client: {
        email: required('E2E_CLIENT_EMAIL', 'e2e.client@wayyaam.ru'),
        password: required('E2E_CLIENT_PASSWORD')
      },
      restaurant: {
        email: required('E2E_RESTAURANT_EMAIL', 'e2e.restaurant@wayyaam.ru'),
        password: required('E2E_RESTAURANT_PASSWORD')
      },
      driver: {
        email: required('E2E_DRIVER_EMAIL', 'e2e.driver@wayyaam.ru'),
        password: required('E2E_DRIVER_PASSWORD')
      }
    }
  };
};

export const appUrl = (config, route) => `${config.baseUrl}/#${route.startsWith('/') ? route : `/${route}`}`;
