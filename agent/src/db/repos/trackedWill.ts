import { supabase } from '../supabase.js';
import type { TrackedWill } from '../types.js';

export async function upsert(will: TrackedWill): Promise<void> {
  const { error } = await supabase.from('tracked_will').upsert(will);
  if (error) throw error;
}

export async function markExecuted(ownerAddress: string): Promise<void> {
  const { error } = await supabase
    .from('tracked_will')
    .update({ active: false })
    .eq('owner_address', ownerAddress);
  if (error) throw error;
}

export async function recordAssessment(
  ownerAddress: string,
  classification: string | null,
  timestampMs: number
): Promise<void> {
  const { error } = await supabase
    .from('tracked_will')
    .update({
      last_assessed_at_ms: timestampMs,
      last_classification: classification,
    })
    .eq('owner_address', ownerAddress);
  if (error) throw error;
}

export async function listActive(): Promise<TrackedWill[]> {
  const { data, error } = await supabase
    .from('tracked_will')
    .select('*')
    .eq('active', true);
  if (error) throw error;
  return data ?? [];
}

export async function getByOwner(ownerAddress: string): Promise<TrackedWill | null> {
  const { data, error } = await supabase
    .from('tracked_will')
    .select('*')
    .eq('owner_address', ownerAddress)
    .maybeSingle();
  if (error) throw error;
  return data;
}
