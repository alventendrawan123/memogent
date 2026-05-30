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
    return NextResponse.json(
      { error: "Server not configured." },
      { status: 503 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from("tracked_will")
    .select("owner_address, active")
    .eq("beneficiary", address);

  if (error) {
    return NextResponse.json(
      { error: "Could not query nominations." },
      { status: 500 },
    );
  }

  const nominations = (data ?? []).map(
    (row: { owner_address: string; active: boolean }) => ({
      owner: row.owner_address,
      executed: !row.active,
    }),
  );

  return NextResponse.json({ nominations });
}
