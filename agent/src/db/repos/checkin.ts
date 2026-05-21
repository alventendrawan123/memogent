import { supabase } from '../supabase.js';
import type { Checkin } from '../types.js';

export async function recordSent(walletAddress: string): Promise<number> {
  const { data, error } = await supabase
    .from('checkin')
    .insert({
      wallet_address: walletAddress,
      sent_at: Date.now(),
      responded_at: null,
      response: null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return data.id;
}

export async function recordResponse(id: number, response: 'alive' | 'busy'): Promise<void> {
  const { error } = await supabase
    .from('checkin')
    .update({ responded_at: Date.now(), response })
    .eq('id', id);
  if (error) throw error;
}

export async function getRecent(walletAddress: string, limit: number = 10): Promise<Checkin[]> {
  const { data, error } = await supabase
    .from('checkin')
    .select('*')
    .eq('wallet_address', walletAddress)
    .order('sent_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function getLastResponded(walletAddress: string): Promise<Checkin | null> {
  const { data, error } = await supabase
    .from('checkin')
    .select('*')
    .eq('wallet_address', walletAddress)
    .not('responded_at', 'is', null)
    .order('responded_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
