import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = url && anon ? createClient(url, anon) : null;

export async function isTelegramLinked(
  walletAddress: string,
): Promise<boolean> {
  if (!supabase) return false;
  const { data } = await supabase
    .from("wallet_link")
    .select("chat_id")
    .eq("wallet_address", walletAddress)
    .maybeSingle();
  return data !== null;
}
