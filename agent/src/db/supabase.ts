import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import type { Database } from './types.js';

export const supabase: SupabaseClient<Database> = createClient<Database>(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'public' },
  }
);
