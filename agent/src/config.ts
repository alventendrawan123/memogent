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
  },
  servicePrivateKey: optional('SERVICE_PRIVATE_KEY', ''),
  telegram: {
    botToken: optional('TELEGRAM_BOT_TOKEN', ''),
  },
  supabase: {
    url: required('SUPABASE_URL'),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  },
  lighthouse: {
    apiKey: optional('LIGHTHOUSE_API_KEY', ''),
  },
  logLevel: optional('LOG_LEVEL', 'info') as 'trace' | 'debug' | 'info' | 'warn' | 'error',
  activityDebounceMs: parseInt(optional('ACTIVITY_DEBOUNCE_MS', '60000'), 10),
} as const;

export type Config = typeof config;
