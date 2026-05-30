"use client";

import Link from "next/link";
import { useState } from "react";
import { LuExternalLink, LuMessageCircle } from "react-icons/lu";
import { createSiweMessage } from "viem/siwe";
import { useAccount, useSignMessage } from "wagmi";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui";
import { TELEGRAM_BOT_URL } from "@/lib/contracts";
import { OnboardShell } from "./_shell/OnboardShell";

type LinkState =
  | { status: "idle" }
  | { status: "signing" }
  | { status: "linking" }
  | { status: "ready"; token: string }
  | { status: "error"; message: string };

export function OnboardTelegramPage() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [state, setState] = useState<LinkState>({ status: "idle" });

  const startLink = async () => {
    if (!address) return;
    try {
      setState({ status: "signing" });
      const nonce = crypto.randomUUID().replace(/-/g, "");
      const message = createSiweMessage({
        address,
        chainId: 50312,
        domain: window.location.host,
        nonce,
        uri: window.location.origin,
        version: "1",
        statement: "Link Telegram for Memogent life-proof signals.",
        issuedAt: new Date(),
      });
      const signature = await signMessageAsync({ message });

      setState({ status: "linking" });
      const res = await fetch("/api/telegram/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: address, signature, message }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Link request failed (${res.status})`);
      }
      const { token } = (await res.json()) as { token: string };
      setState({ status: "ready", token });
      window.open(`${TELEGRAM_BOT_URL}?start=${token}`, "_blank", "noopener");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to sign.";
      setState({ status: "error", message });
    }
  };

  return (
    <OnboardShell
      stepKey="telegram"
      title="Link Telegram"
      subtitle="Pair your wallet with our bot so the AI can ping you and so /claimcapsule works for your beneficiary. SIWE keeps it trustless."
    >
      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardContent>
            <CardTitle>Sign and open the bot</CardTitle>
            <CardDescription>
              You&apos;ll sign one EIP-4361 message — no transaction, no gas.
              The bot opens with a one-time link token.
            </CardDescription>

            <ol className="mt-2 flex flex-col gap-3 font-apple text-[14px] text-[#1a1a1a]/75">
              <li>1. Press the button below.</li>
              <li>2. Approve the SIWE signature in your wallet.</li>
              <li>3. The Memogent bot opens in a new tab with the link key.</li>
              <li>4. Press the bot&apos;s Start button — done.</li>
            </ol>

            {state.status === "error" && (
              <p className="rounded-lg bg-[#FCE4EC]/60 px-3 py-2 font-apple text-[12px] text-[#B91C1C]">
                {state.message}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button
                onClick={startLink}
                disabled={
                  !address ||
                  state.status === "signing" ||
                  state.status === "linking"
                }
                size="lg"
              >
                <LuMessageCircle className="size-4" />
                {state.status === "signing" && "Sign in wallet…"}
                {state.status === "linking" && "Linking…"}
                {state.status === "ready" && "Open bot again"}
                {(state.status === "idle" || state.status === "error") &&
                  "Sign & link Telegram"}
              </Button>

              {state.status === "ready" && (
                <Link
                  href={`${TELEGRAM_BOT_URL}?start=${state.token}`}
                  target="_blank"
                  className="inline-flex items-center gap-1 font-apple text-[13px] text-[#0871E7] hover:underline"
                >
                  Open bot tab <LuExternalLink className="size-3.5" />
                </Link>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-[#FAFAF6]">
          <CardContent>
            <CardTitle>Why this matters</CardTitle>
            <ul className="mt-2 flex flex-col gap-3 font-apple text-[14px] text-[#1a1a1a]/70">
              <li>
                • Telegram is the gentle nudge layer. WATCH / GRACE
                classifications ping you there first.
              </li>
              <li>
                • Your heir gets a friendly DM after WillExecuted with{" "}
                <code className="rounded bg-black/[0.05] px-1 py-0.5 text-[12px]">
                  /claimcapsule
                </code>{" "}
                — no terminal needed.
              </li>
              <li>
                • Memogent never sees your chats. Only a wallet ↔ chat pairing
                lives in our index.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="mx-auto mt-8 flex max-w-3xl items-center justify-between px-2">
        <span className="font-apple text-[12px] uppercase tracking-[0.16em] text-[#1a1a1a]/40">
          Step 3 of 4
        </span>
        <Button asChild size="lg">
          <Link href="/onboard/capsule">Continue to Time Capsule</Link>
        </Button>
      </div>
    </OnboardShell>
  );
}
