"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  LuCircleCheck,
  LuCopy,
  LuExternalLink,
  LuMessageCircle,
  LuShare2,
} from "react-icons/lu";
import { type Address, isAddress } from "viem";
import { createSiweMessage } from "viem/siwe";
import { useAccount, useReadContract, useSignMessage } from "wagmi";
import { memogentCoreAbi } from "@/abi/MemogentCore";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  Input,
  Label,
} from "@/components/ui";
import { CONTRACTS, TELEGRAM_BOT_URL } from "@/lib/contracts";
import { shortAddress } from "@/lib/format";
import { PageHeader } from "./_shell/PageHeader";

type InviteState =
  | { status: "idle" }
  | { status: "signing" }
  | { status: "sending" }
  | { status: "ready"; token: string; url: string }
  | { status: "error"; message: string };

const ZERO = "0x0000000000000000000000000000000000000000" as const;

export function InviteBeneficiaryPage() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [beneficiary, setBeneficiary] = useState("");
  const [state, setState] = useState<InviteState>({ status: "idle" });
  const [copied, setCopied] = useState(false);

  const { data: willInfo } = useReadContract({
    address: CONTRACTS.memogentCore,
    abi: memogentCoreAbi,
    functionName: "getWillInfo",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  // Auto-fill from existing will's beneficiary if user has one
  const willBeneficiary = willInfo?.[0];
  useEffect(() => {
    if (
      willBeneficiary &&
      willBeneficiary !== ZERO &&
      !beneficiary.trim() &&
      state.status === "idle"
    ) {
      setBeneficiary(willBeneficiary);
    }
  }, [willBeneficiary, beneficiary, state.status]);

  const validationError = beneficiary.trim()
    ? !isAddress(beneficiary)
      ? "Enter a valid Ethereum address."
      : address && beneficiary.toLowerCase() === address.toLowerCase()
        ? "Beneficiary cannot be your own address."
        : null
    : null;

  const generate = async () => {
    if (!address || !isAddress(beneficiary) || validationError) return;
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
        statement: `Invite ${beneficiary} as beneficiary on Memogent.`,
        issuedAt: new Date(),
      });
      const signature = await signMessageAsync({ message });

      setState({ status: "sending" });
      const res = await fetch("/api/telegram/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerAddress: address,
          beneficiaryAddress: beneficiary,
          signature,
          message,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Invite request failed (${res.status})`);
      }
      const { token } = (await res.json()) as { token: string };
      const url = `${TELEGRAM_BOT_URL}?start=${token}`;
      setState({ status: "ready", token, url });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not generate invite.";
      setState({ status: "error", message });
    }
  };

  const copyUrl = async () => {
    if (state.status !== "ready") return;
    try {
      await navigator.clipboard.writeText(state.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore — UI still shows the URL
    }
  };

  const waShareUrl =
    state.status === "ready"
      ? `https://wa.me/?text=${encodeURIComponent(
          `Hai, gua jadiin lo beneficiary di Memogent. Klik link ini biar lo dapat notif kalau ada update:\n\n${state.url}`,
        )}`
      : "";

  const busy = state.status === "signing" || state.status === "sending";

  return (
    <>
      <PageHeader
        trail={["Invite", "Beneficiary"]}
        title="Invite your beneficiary."
        subtitle="Generate a one-time Telegram invite link tied to your beneficiary's wallet. Send it off-chain (WhatsApp / SMS / DM) — when they click, the bot binds their chat so they receive WillExecuted notifs and can /claimcapsule."
      />

      <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6">
        <Card>
          <CardContent>
            <CardTitle>Beneficiary address</CardTitle>
            <CardDescription>
              The wallet you named in your will. The invite token is bound to
              this address — when the recipient clicks it, the bot pairs{" "}
              <em>their</em> chat with <em>their</em> wallet (not yours).
            </CardDescription>
            <div className="flex flex-col gap-2">
              <Label htmlFor="invite-beneficiary">Address</Label>
              <Input
                id="invite-beneficiary"
                placeholder="0x…"
                value={beneficiary}
                onChange={(e) => {
                  setBeneficiary(e.target.value);
                  if (state.status !== "idle") setState({ status: "idle" });
                }}
                autoComplete="off"
                spellCheck={false}
                disabled={busy}
              />
              {validationError && (
                <p className="font-apple text-[12px] text-[#B91C1C]">
                  {validationError}
                </p>
              )}
              {willBeneficiary &&
                willBeneficiary !== ZERO &&
                willBeneficiary.toLowerCase() === beneficiary.toLowerCase() && (
                  <p className="font-apple text-[12px] text-[#1a1a1a]/55">
                    Matches your registered will&apos;s beneficiary (
                    {shortAddress(willBeneficiary as Address)}).
                  </p>
                )}
            </div>

            {state.status === "error" && (
              <p className="rounded-lg bg-[#FCE4EC]/60 px-3 py-2 font-apple text-[12px] text-[#B91C1C]">
                {state.message}
              </p>
            )}

            <Button
              onClick={generate}
              disabled={
                !address ||
                !isAddress(beneficiary) ||
                Boolean(validationError) ||
                busy
              }
              size="lg"
              className="self-start"
            >
              <LuMessageCircle className="size-4" />
              {state.status === "signing" && "Sign in wallet…"}
              {state.status === "sending" && "Generating invite…"}
              {(state.status === "idle" ||
                state.status === "ready" ||
                state.status === "error") &&
                "Generate invite link"}
            </Button>
          </CardContent>
        </Card>

        {state.status === "ready" && (
          <Card className="border-[#0871E7]/20 bg-white">
            <CardContent>
              <Badge tone="info" className="self-start">
                <LuCircleCheck className="size-3" />
                Invite ready
              </Badge>
              <CardTitle>Share this link off-chain</CardTitle>
              <CardDescription>
                Send via WhatsApp, SMS, email — anywhere your beneficiary trusts
                you. Link expires in 24 hours and is single-use.
              </CardDescription>
              <code className="break-all rounded-xl border border-black/10 bg-[#F3F4ED] px-3 py-2 font-apple text-[12px] text-[#1a1a1a]/80">
                {state.url}
              </code>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Button onClick={copyUrl} variant="secondary" size="md">
                  <LuCopy className="size-4" />
                  {copied ? "Copied!" : "Copy link"}
                </Button>
                <Button asChild variant="secondary" size="md">
                  <Link href={waShareUrl} target="_blank">
                    <LuShare2 className="size-4" />
                    Share via WhatsApp
                  </Link>
                </Button>
                <Link
                  href={state.url}
                  target="_blank"
                  className="inline-flex items-center gap-1 font-apple text-[13px] text-[#0871E7] hover:underline"
                >
                  Preview in Telegram <LuExternalLink className="size-3.5" />
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-[#FAFAF6]">
          <CardContent>
            <CardTitle>Why off-chain delivery?</CardTitle>
            <ul className="mt-2 flex flex-col gap-3 font-apple text-[14px] text-[#1a1a1a]/70">
              <li>
                • Telegram bots can&apos;t DM strangers — your beneficiary must
                start the chat first. Clicking the invite link does exactly
                that.
              </li>
              <li>
                • The token is one-time and bound to the beneficiary&apos;s
                wallet — even if the link leaks, only their chat can bind to
                that wallet (others see &quot;already linked&quot;).
              </li>
              <li>
                • Once bound, the bot DMs them WillExecuted notifs +
                AI-generated farewell + a{" "}
                <code className="rounded bg-black/[0.05] px-1 py-0.5 text-[12px]">
                  /claimcapsule
                </code>{" "}
                command they can run inside Telegram.
              </li>
            </ul>
          </CardContent>
        </Card>
      </section>
    </>
  );
}
