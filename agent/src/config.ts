import { config as loadEnv } from 'dotenv';

loadEnv();

function required(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '' || value === '0x') {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '' || value === '0x') {
    return fallback;
  }
  return value;
}

const network = optional('MEMOGENT_NETWORK', 'testnet') as 'testnet' | 'mainnet';
if (network !== 'testnet' && network !== 'mainnet') {
  throw new Error(`Invalid MEMOGENT_NETWORK: ${network} (expected testnet | mainnet)`);
}

export const config = {
  network,
  rpc: optional(
    'SOMNIA_RPC',
    network === 'testnet'
      ? 'https://api.infra.testnet.somnia.network/'
      : 'https://api.infra.mainnet.somnia.network/'
  ),
  chainId: network === 'testnet' ? 50312 : 5031,
  contracts: {
    core: optional('MEMOGENT_CORE_ADDRESS', ''),
    agent: optional('MEMOGENT_AGENT_ADDRESS', ''),
    capsule: optional('TIME_CAPSULE_ADDRESS', ''),
  },
  servicePrivateKey: optional('SERVICE_PRIVATE_KEY', ''),
  telegram: {
    botToken: optional('TELEGRAM_BOT_TOKEN', ''),
  },
  supabase: {
    url: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  },
  pinata: {
    jwt: optional('PINATA_JWT', ''),
  },
  logLevel: optional('LOG_LEVEL', 'info') as 'trace' | 'debug' | 'info' | 'warn' | 'error',
  activityDebounceMs: parseInt(optional('ACTIVITY_DEBOUNCE_MS', '60000'), 10),
  // AutoAssess dispatcher tuning. Production defaults (5-min tick + 1-hour
  // cooldown per will) keep LLM call cost low. For demo/rehearsal where the
  // silence window is short (e.g. 20 minutes) override via env on Railway so
  // escalation SAFE -> WATCH -> GRACE -> EXECUTE fits inside the window.
  dispatcher: {
    tickIntervalMs: parseInt(
      optional('AUTO_ASSESS_TICK_INTERVAL_MS', String(5 * 60 * 1000)),
      10,
    ),
    cooldownMs: parseInt(
      optional('AUTO_ASSESS_COOLDOWN_MS', String(60 * 60 * 1000)),
      10,
    ),
  },
} as const;

export type Config = typeof config;
