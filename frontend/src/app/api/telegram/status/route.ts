import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const address = searchParams.get("address");

  if (!address || !isAddress(address)) {
    return NextResponse.json(
      { error: "Valid `address` query param is required." },
      { status: 400 },
    );
  }

  if (!supabaseAdmin) {
    return NextResponse.json({ linked: false }, { status: 200 });
  }

  const { data } = await supabaseAdmin
    .from("wallet_link")
    .select("chat_id")
    .eq("wallet_address", address)
    .maybeSingle();

  return NextResponse.json({ linked: data !== null });
}
