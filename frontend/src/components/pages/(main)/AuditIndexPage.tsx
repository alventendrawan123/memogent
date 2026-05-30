"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LuArrowRight, LuSearch } from "react-icons/lu";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  Input,
  Label,
} from "@/components/ui";
import { shortAddress } from "@/lib/format";
import { PageHeader } from "./_shell/PageHeader";

export function AuditIndexPage() {
  const router = useRouter();
  const { address } = useAccount();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAddress(input)) {
      setError("Enter a valid Ethereum address.");
      return;
    }
    router.push(`/audit/${input}`);
  };

  return (
    <>
      <PageHeader
        trail={["Public audit"]}
        title="Audit any guardian."
        subtitle="Read-only view of any Memogent wallet's AI decisions, will status, and capsule pointer. Paste an address to inspect."
      />

      <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6">
        <Card>
          <CardContent>
            <CardTitle>Look up a wallet</CardTitle>
            <CardDescription>
              Nothing is private here — the on-chain record is the same a
              beneficiary would see at claim time.
            </CardDescription>
            <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
              <Label htmlFor="audit-address">Wallet address</Label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  id="audit-address"
                  placeholder="0x…"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    setError(null);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                />
                <Button type="submit" size="lg">
                  <LuSearch className="size-4" />
                  Inspect
                </Button>
              </div>
              {error && (
                <p className="font-apple text-[12px] text-[#B91C1C]">{error}</p>
              )}
            </form>
          </CardContent>
        </Card>

        {address && (
          <Card className="bg-[#FAFAF6]">
            <CardContent>
              <CardTitle>Audit your own wallet</CardTitle>
              <CardDescription>
                See the public record for your connected wallet —
                <code className="ml-1 rounded bg-black/[0.05] px-1 py-0.5 text-[12px]">
                  {shortAddress(address)}
                </code>
                .
              </CardDescription>
              <Button
                asChild
                variant="secondary"
                size="md"
                className="self-start"
              >
                <a href={`/audit/${address}`}>
                  View my activity <LuArrowRight className="size-4" />
                </a>
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}
