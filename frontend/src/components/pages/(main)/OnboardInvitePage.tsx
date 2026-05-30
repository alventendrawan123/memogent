"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LuArrowRight } from "react-icons/lu";
import { Button } from "@/components/ui";
import { OnboardShell } from "./_shell/OnboardShell";
import { InviteBeneficiaryForm } from "./InviteBeneficiaryForm";

export function OnboardInvitePage() {
  const router = useRouter();
  const [inviteReady, setInviteReady] = useState(false);

  return (
    <OnboardShell
      stepKey="invite"
      title="Invite your beneficiary"
      subtitle="Generate a one-time Telegram invite link tied to your beneficiary's wallet. Share it off-chain (WhatsApp / SMS / DM) — they don't need to install anything before clicking. Optional, you can do it later from the dashboard."
    >
      <div className="mx-auto w-full max-w-2xl">
        <InviteBeneficiaryForm onReady={() => setInviteReady(true)} />

        <div className="mt-8 flex items-center justify-between px-2">
          <span className="font-apple text-[12px] uppercase tracking-[0.16em] text-[#1a1a1a]/40">
            Step 3 of 5
          </span>
          {inviteReady ? (
            <Button
              asChild
              size="lg"
              onClick={() => router.push("/onboard/telegram")}
            >
              <Link href="/onboard/telegram">
                Continue to Telegram <LuArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <Link
              href="/onboard/telegram"
              className="inline-flex items-center gap-1.5 font-apple text-[13px] text-[#1a1a1a]/55 underline-offset-4 transition hover:text-[#1a1a1a] hover:underline"
            >
              Skip — invite later from dashboard
              <LuArrowRight className="size-3.5" />
            </Link>
          )}
        </div>
      </div>
    </OnboardShell>
  );
}
