import { supabase } from '../supabase.js';

export async function markBlocked(chatId: number): Promise<void> {
  const { error } = await supabase
    .from('blocked_chat')
    .upsert({ chat_id: chatId, blocked_at: Date.now() });
  if (error) throw error;
}

export async function isBlocked(chatId: number): Promise<boolean> {
  const { data, error } = await supabase
    .from('blocked_chat')
    .select('chat_id')
    .eq('chat_id', chatId)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function markUnblocked(chatId: number): Promise<void> {
  const { error } = await supabase.from('blocked_chat').delete().eq('chat_id', chatId);
  if (error) throw error;
}
