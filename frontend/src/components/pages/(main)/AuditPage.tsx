"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LuExternalLink } from "react-icons/lu";
import { type Address, isAddress, parseAbiItem } from "viem";
import { usePublicClient, useReadContracts } from "wagmi";
import { memogentAgentAbi } from "@/abi/MemogentAgent";
import { memogentCoreAbi } from "@/abi/MemogentCore";
import { timeCapsuleAbi } from "@/abi/TimeCapsule";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  Separator,
} from "@/components/ui";
import { CONTRACTS, SHANNON_EXPLORER } from "@/lib/contracts";
import { relativeTime, shortAddress } from "@/lib/format";
import { PageHeader } from "./_shell/PageHeader";

const RISK_DECISION_EVENT = parseAbiItem(
  "event RiskDecision(address indexed user, string classification, uint256 timestamp)",
);

type AuditEntry = {
  classification: string;
  timestamp: bigint;
  txHash: string;
};

export function AuditPage({ user }: { user: string }) {
  const isValid = isAddress(user);
  const target = isValid ? (user as Address) : undefined;
  const client = usePublicClient();
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  const reads = useReadContracts({
    contracts: target
      ? [
          {
            address: CONTRACTS.memogentCore,
            abi: memogentCoreAbi,
            functionName: "getWillInfo",
            args: [target],
          },
          {
            address: CONTRACTS.memogentCore,
            abi: memogentCoreAbi,
            functionName: "getStatus",
            args: [target],
          },
          {
            address: CONTRACTS.memogentAgent,
            abi: memogentAgentAbi,
            functionName: "empathyMessages",
            args: [target],
          },
          {
            address: CONTRACTS.timeCapsule,
            abi: timeCapsuleAbi,
            functionName: "hasCapsule",
            args: [target],
          },
        ]
      : [],
    query: { enabled: Boolean(target) },
  });

  useEffect(() => {
    if (!target || !client) return;
    let cancelled = false;
    const load = async () => {
      const logs = await client.getLogs({
        address: CONTRACTS.memogentAgent,
        event: RISK_DECISION_EVENT,
        args: { user: target },
        fromBlock: "earliest",
        toBlock: "latest",
      });
      if (cancelled) return;
      const parsed: AuditEntry[] = logs.map((log) => ({
        classification: String(log.args.classification ?? ""),
        timestamp: BigInt(log.args.timestamp ?? 0n),
        txHash: log.transactionHash ?? "",
      }));
      parsed.sort((a, b) => Number(b.timestamp - a.timestamp));
      setEntries(parsed);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [target, client]);

  const willInfo = reads.data?.[0]?.result as
    | readonly [string, bigint, bigint, bigint, boolean, boolean]
    | undefined;
  const status = (reads.data?.[1]?.result as string | undefined) ?? "";
  const empathy = (reads.data?.[2]?.result as string | undefined) ?? "";
  const hasCapsule = (reads.data?.[3]?.result as boolean | undefined) ?? false;

  return (
    <>
      <PageHeader
        trail={["Public audit", isValid ? shortAddress(user) : "Invalid"]}
        title="Public guardian record."
        subtitle="A read-only view of any Memogent wallet. Useful for beneficiaries verifying the AI's behaviour before claim time."
      />

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6">
        {!isValid && (
          <Card className="border-[#B91C1C]/20 bg-[#FCE4EC]/40">
            <CardContent>
              <CardTitle>Invalid address</CardTitle>
              <CardDescription>
                Use a route like{" "}
                <code className="rounded bg-black/[0.05] px-1 py-0.5">
                  /audit/0xabc…
                </code>
                .
              </CardDescription>
            </CardContent>
          </Card>
        )}

        {isValid && (
          <Card>
            <CardContent>
              <div className="flex items-center justify-between gap-3">
                <CardTitle>{shortAddress(user)}</CardTitle>
                <Badge tone={status ? "info" : "neutral"}>
                  {status || "—"}
                </Badge>
              </div>
              <Separator className="my-3" />
              <dl className="grid grid-cols-1 gap-3 font-apple text-[14px] text-[#1a1a1a]/75 md:grid-cols-2">
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.16em] text-[#1a1a1a]/45">
                    Beneficiary
                  </dt>
                  <dd>
                    <code className="text-[12px]">
                      {willInfo ? shortAddress(willInfo[0]) : "—"}
                    </code>
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.16em] text-[#1a1a1a]/45">
                    Last check-in
                  </dt>
                  <dd>{relativeTime(willInfo?.[1])}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.16em] text-[#1a1a1a]/45">
                    Deadline
                  </dt>
                  <dd>{relativeTime(willInfo?.[3])}</dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-[0.16em] text-[#1a1a1a]/45">
                    Capsule
                  </dt>
                  <dd>{hasCapsule ? "Attached" : "—"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        )}

        {empathy && (
          <Card className="border-[#0871E7]/20 bg-[#F6FAFE]">
            <CardContent>
              <CardTitle>Final empathy message</CardTitle>
              <p className="font-instrument text-[22px] italic leading-relaxed text-[#1a1a1a]/85">
                “{empathy}”
              </p>
            </CardContent>
          </Card>
        )}

        {isValid && (
          <Card>
            <CardContent>
              <CardTitle>AI decision history</CardTitle>
              <CardDescription>
                Latest first. Each entry is a `RiskDecision` event on
                MemogentAgent V3.
              </CardDescription>
              <ul className="flex flex-col gap-2">
                {entries.length === 0 && (
                  <li className="font-apple text-[13px] text-[#1a1a1a]/55">
                    No assessments yet.
                  </li>
                )}
                {entries.map((entry) => (
                  <li
                    key={`${entry.txHash}-${entry.timestamp.toString()}`}
                    className="flex items-center justify-between rounded-xl border border-black/10 bg-white px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <Badge tone={toneFor(entry.classification)}>
                        {entry.classification}
                      </Badge>
                      <span className="font-apple text-[13px] text-[#1a1a1a]/70">
                        {relativeTime(entry.timestamp)}
                      </span>
                    </div>
                    <Link
                      href={`${SHANNON_EXPLORER}/tx/${entry.txHash}`}
                      target="_blank"
                      className="inline-flex items-center gap-1 font-apple text-[13px] text-[#0871E7] hover:underline"
                    >
                      Receipt <LuExternalLink className="size-3.5" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </section>
    </>
  );
}

function toneFor(classification: string) {
  if (classification === "SAFE") return "active" as const;
  if (classification === "WATCH") return "info" as const;
  if (classification === "GRACE") return "warning" as const;
  if (classification === "EXECUTE") return "inactive" as const;
  return "neutral" as const;
}
