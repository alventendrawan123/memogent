import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createPublicClient, http } from "viem";
import { parseSiweMessage } from "viem/siwe";
import { somniaTestnet } from "@/lib/chains";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TOKEN_TTL_MS = 10 * 60 * 1000;

type Body = {
  walletAddress: string;
  signature: string;
  message: string;
};

const publicClient = createPublicClient({
  chain: somniaTestnet,
  transport: http(),
});

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { walletAddress, signature, message } = body;
  if (!walletAddress || !signature || !message) {
    return NextResponse.json(
      { error: "walletAddress, signature, and message are required." },
      { status: 400 },
    );
  }

  let parsed: ReturnType<typeof parseSiweMessage>;
  try {
    parsed = parseSiweMessage(message);
  } catch {
    return NextResponse.json(
      { error: "Could not parse SIWE message." },
      { status: 401 },
    );
  }

  if (parsed.address?.toLowerCase() !== walletAddress.toLowerCase()) {
    return NextResponse.json(
      { error: "Address in message does not match wallet." },
      { status: 401 },
    );
  }

  try {
    const valid = await publicClient.verifySiweMessage({
      message,
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      return NextResponse.json(
        { error: "Invalid signature." },
        { status: 401 },
      );
    }
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "SIWE verification failed.";
    return NextResponse.json({ error: errorMessage }, { status: 401 });
  }

  if (!supabaseAdmin) {
    return NextResponse.json(
      {
        error:
          "Telegram linking is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the server.",
      },
      { status: 503 },
    );
  }

  const token = `link_${randomBytes(16).toString("hex")}`;
  const { error } = await supabaseAdmin.from("link_token").insert({
    token,
    wallet_address: parsed.address,
    nonce: parsed.nonce,
    expires_at: Date.now() + TOKEN_TTL_MS,
    inviter_wallet: null,
  });
  if (error) {
    return NextResponse.json(
      { error: "Could not issue link token. Try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ token });
}
