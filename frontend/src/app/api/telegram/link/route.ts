import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { SiweMessage } from "siwe";

type Body = {
  walletAddress: string;
  signature: string;
  message: string;
};

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

  try {
    const siwe = new SiweMessage(message);
    const verified = await siwe.verify({ signature });
    if (!verified.success) {
      return NextResponse.json(
        { error: "Invalid signature." },
        { status: 401 },
      );
    }
    if (verified.data.address.toLowerCase() !== walletAddress.toLowerCase()) {
      return NextResponse.json({ error: "Address mismatch." }, { status: 401 });
    }
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "SIWE verification failed.";
    return NextResponse.json({ error: errorMessage }, { status: 401 });
  }

  const token = `link_${randomBytes(16).toString("hex")}`;
  return NextResponse.json({ token });
}
