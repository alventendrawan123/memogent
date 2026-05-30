"use client";

import { PageHeader } from "./_shell/PageHeader";
import { InviteBeneficiaryForm } from "./InviteBeneficiaryForm";

export function InviteBeneficiaryPage() {
  return (
    <>
      <PageHeader
        trail={["Invite", "Beneficiary"]}
        title="Invite your beneficiary."
        subtitle="Generate a one-time Telegram invite link tied to your beneficiary's wallet. Send it off-chain (WhatsApp / SMS / DM) — when they click, the bot binds their chat so they receive WillExecuted notifs and can /claimcapsule."
      />

      <section className="mx-auto w-full max-w-2xl px-6">
        <InviteBeneficiaryForm />
      </section>
    </>
  );
}
