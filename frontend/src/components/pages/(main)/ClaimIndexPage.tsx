"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LuArrowRight, LuLockKeyholeOpen, LuSearch } from "react-icons/lu";
import { isAddress } from "viem";
import { useAccount } from "wagmi";
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
import { shortAddress } from "@/lib/format";
import { PageHeader } from "./_shell/PageHeader";

type Nomination = {
  owner: string;
  executed: boolean;
};

export function ClaimIndexPage() {
  const router = useRouter();
  const { address } = useAccount();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [nominations, setNominations] = useState<Nomination[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) {
      setNominations(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/claim/nominations?address=${address}`)
      .then((r) => (r.ok ? r.json() : { nominations: [] }))
      .then((body: { nominations?: Nomination[] }) => {
        if (cancelled) return;
        setNominations(body.nominations ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setNominations([]);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!isAddress(input)) {
      setError("Enter a valid owner address.");
      return;
    }
    router.push(`/claim/${input}`);
  };

  return (
    <>
      <PageHeader
        trail={["Beneficiary claim"]}
        title="Open a capsule."
        subtitle="Paste the owner's wallet address (from their WillExecuted DM) to view and decrypt their Time Capsule."
      />

      <section className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6">
        {address && nominations && nominations.length > 0 && (
          <Card className="border-[#0871E7]/20 bg-[#EAF3FC]/50">
            <CardContent>
              <Badge tone="info" className="self-start">
                You&apos;re a named beneficiary
              </Badge>
              <CardTitle>Wills that name you</CardTitle>
              <CardDescription>
                Detected from the tracked-will index. Pick one to open the claim
                page directly.
              </CardDescription>
              <div className="mt-2 flex flex-col gap-2">
                {nominations.map((nom) => (
                  <Button
                    key={nom.owner}
                    asChild
                    variant={nom.executed ? "primary" : "secondary"}
                    size="md"
                    className="justify-between"
                  >
                    <a href={`/claim/${nom.owner}`}>
                      <span className="flex items-center gap-2">
                        <LuLockKeyholeOpen className="size-4" />
                        {shortAddress(nom.owner)}
                        <span className="font-apple text-[11px] uppercase tracking-[0.16em] text-current/70">
                          {nom.executed ? "Released" : "Sealed"}
                        </span>
                      </span>
                      <LuArrowRight className="size-4" />
                    </a>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent>
            <CardTitle>Open by owner address</CardTitle>
            <CardDescription>
              Paste the address you received in the WillExecuted DM. The claim
              page handles decryption — the AES key gate is on-chain, the
              plaintext never touches our server.
            </CardDescription>
            <form onSubmit={submit} className="mt-2 flex flex-col gap-3">
              <Label htmlFor="claim-owner">Owner address</Label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                  id="claim-owner"
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
                  Open
                </Button>
              </div>
              {error && (
                <p className="font-apple text-[12px] text-[#B91C1C]">{error}</p>
              )}
            </form>
          </CardContent>
        </Card>

        {address && !loading && nominations && nominations.length === 0 && (
          <Card className="bg-[#FAFAF6]">
            <CardContent>
              <CardTitle>No nominations found yet</CardTitle>
              <CardDescription>
                We don&apos;t see your connected wallet
                <code className="mx-1 rounded bg-black/[0.05] px-1 py-0.5 text-[12px]">
                  {shortAddress(address)}
                </code>
                listed as beneficiary on any tracked will. If you were just
                invited, the index updates within a minute — refresh shortly.
              </CardDescription>
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}
