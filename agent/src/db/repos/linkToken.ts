import { randomBytes } from 'node:crypto';
import { supabase } from '../supabase.js';
import type { LinkToken } from '../types.js';

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export async function create(
  walletAddress: string,
  nonce: string,
  ttlMs: number = DEFAULT_TTL_MS,
  inviterWallet?: string
): Promise<string> {
  const token = `link_${randomBytes(16).toString('hex')}`;
  const expiresAt = Date.now() + ttlMs;
  const { error } = await supabase.from('link_token').insert({
    token,
    wallet_address: walletAddress,
    nonce,
    expires_at: expiresAt,
    inviter_wallet: inviterWallet ?? null,
  });
  if (error) throw error;
  return token;
}

export async function consume(token: string): Promise<LinkToken | null> {
  const { data, error } = await supabase
    .from('link_token')
    .select('*')
    .eq('token', token)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  if (data.expires_at < Date.now()) {
    await supabase.from('link_token').delete().eq('token', token);
    return null;
  }

  const { error: delError } = await supabase.from('link_token').delete().eq('token', token);
  if (delError) throw delError;

  return data;
}

export async function deleteExpired(): Promise<number> {
  const { count, error } = await supabase
    .from('link_token')
    .delete({ count: 'exact' })
    .lt('expires_at', Date.now());
  if (error) throw error;
  return count ?? 0;
}
