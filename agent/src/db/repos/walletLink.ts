import { supabase } from '../supabase.js';
import type { WalletLink } from '../types.js';

export async function getByWallet(walletAddress: string): Promise<WalletLink | null> {
  const { data, error } = await supabase
    .from('wallet_link')
    .select('*')
    .eq('wallet_address', walletAddress)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getByChatId(chatId: number): Promise<WalletLink | null> {
  const { data, error } = await supabase
    .from('wallet_link')
    .select('*')
    .eq('chat_id', chatId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsert(link: WalletLink): Promise<void> {
  const { error } = await supabase.from('wallet_link').upsert(link);
  if (error) throw error;
}

export async function updateLastSeen(chatId: number, timestamp: number): Promise<void> {
  const { error } = await supabase
    .from('wallet_link')
    .update({ last_seen_at: timestamp })
    .eq('chat_id', chatId);
  if (error) throw error;
}

export async function unlink(walletAddress: string): Promise<void> {
  const { error } = await supabase
    .from('wallet_link')
    .delete()
    .eq('wallet_address', walletAddress);
  if (error) throw error;
}
