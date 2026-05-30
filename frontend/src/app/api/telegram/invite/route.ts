import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createPublicClient, http, isAddress } from "viem";
import { parseSiweMessage } from "viem/siwe";
import { somniaTestnet } from "@/lib/chains";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

type Body = {
  ownerAddress: string;
  beneficiaryAddress: string;
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

  const { ownerAddress, beneficiaryAddress, signature, message } = body;
  if (!ownerAddress || !beneficiaryAddress || !signature || !message) {
    return NextResponse.json(
      {
        error:
          "ownerAddress, beneficiaryAddress, signature, and message are required.",
      },
      { status: 400 },
    );
  }
  if (!isAddress(ownerAddress) || !isAddress(beneficiaryAddress)) {
    return NextResponse.json(
      { error: "Both addresses must be valid Ethereum addresses." },
      { status: 400 },
    );
  }
  if (ownerAddress.toLowerCase() === beneficiaryAddress.toLowerCase()) {
    return NextResponse.json(
      { error: "Owner and beneficiary cannot be the same address." },
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

  if (parsed.address?.toLowerCase() !== ownerAddress.toLowerCase()) {
    return NextResponse.json(
      { error: "Address in message does not match the inviting owner." },
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
    wallet_address: beneficiaryAddress,
    nonce: parsed.nonce,
    expires_at: Date.now() + TOKEN_TTL_MS,
    inviter_wallet: ownerAddress,
  });
  if (error) {
    return NextResponse.json(
      { error: "Could not issue invite token. Try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ token });
}
