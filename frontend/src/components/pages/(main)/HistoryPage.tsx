"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LuExternalLink, LuLoaderCircle } from "react-icons/lu";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { parseAbiItem } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui";
import { CONTRACTS, SHANNON_EXPLORER } from "@/lib/contracts";
import { friendlyTxError } from "@/lib/errors";
import { relativeTime } from "@/lib/format";
import { PageHeader } from "./_shell/PageHeader";

const LOG_CHUNK_SIZE = 1000n;
const LOG_LOOKBACK_BLOCKS = 50_000n;

const RISK_DECISION_EVENT = parseAbiItem(
  "event RiskDecision(address indexed user, string classification, uint256 timestamp)",
);

type Decision = {
  classification: string;
  timestamp: bigint;
  txHash: string;
  score: number;
};

const SCORE: Record<string, number> = {
  SAFE: 0,
  WATCH: 1,
  GRACE: 2,
  EXECUTE: 3,
};

export function HistoryPage() {
  const { address } = useAccount();
  const client = usePublicClient();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!address || !client) return;
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        const latest = await client.getBlockNumber();
        const start =
          latest > LOG_LOOKBACK_BLOCKS ? latest - LOG_LOOKBACK_BLOCKS : 0n;
        const ranges: Array<[bigint, bigint]> = [];
        for (let from = start; from <= latest; from += LOG_CHUNK_SIZE) {
          const to =
            from + LOG_CHUNK_SIZE - 1n > latest
              ? latest
              : from + LOG_CHUNK_SIZE - 1n;
          ranges.push([from, to]);
        }
        const chunks = await Promise.all(
          ranges.map(([fromBlock, toBlock]) =>
            client.getLogs({
              address: CONTRACTS.memogentAgent,
              event: RISK_DECISION_EVENT,
              args: { user: address },
              fromBlock,
              toBlock,
            }),
          ),
        );
        if (cancelled) return;
        const parsed: Decision[] = chunks.flat().map((log) => ({
          classification: String(log.args.classification ?? ""),
          timestamp: BigInt(log.args.timestamp ?? 0n),
          txHash: log.transactionHash ?? "",
          score: SCORE[String(log.args.classification ?? "")] ?? 0,
        }));
        parsed.sort((a, b) => Number(a.timestamp - b.timestamp));
        setDecisions(parsed);
      } catch (err) {
        if (!cancelled)
          setError(friendlyTxError(err) ?? "Could not load logs.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [address, client]);

  const chartData = decisions.map((d) => ({
    time: new Date(Number(d.timestamp) * 1000).toLocaleDateString(),
    score: d.score,
    classification: d.classification,
  }));

  return (
    <>
      <PageHeader
        trail={["AI activity", "Decision history"]}
        title="What the AI saw."
        subtitle="Every classification the agent has written on-chain for this wallet. Click a point to open the receipt."
      />

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6">
        <Card>
          <CardContent>
            <CardTitle>Classification timeline</CardTitle>
            <CardDescription>
              0 = SAFE · 1 = WATCH · 2 = GRACE · 3 = EXECUTE
            </CardDescription>
            <div className="h-64 w-full">
              {loading ? (
                <div className="flex h-full items-center justify-center gap-2 font-apple text-[13px] text-[#1a1a1a]/50">
                  <LuLoaderCircle className="size-4 animate-spin" />
                  Scanning Somnia for recent assessments…
                </div>
              ) : decisions.length === 0 ? (
                <div className="flex h-full items-center justify-center font-apple text-[13px] text-[#1a1a1a]/50">
                  No assessments yet. The agent writes here every cycle.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 11, fill: "#1a1a1a99" }}
                    />
                    <YAxis
                      domain={[0, 3]}
                      ticks={[0, 1, 2, 3]}
                      tick={{ fontSize: 11, fill: "#1a1a1a99" }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "white",
                        border: "1px solid rgba(0,0,0,0.08)",
                        borderRadius: 12,
                        fontFamily: "Inter",
                        fontSize: 12,
                      }}
                    />
                    <Line
                      type="stepAfter"
                      dataKey="score"
                      stroke="#0871E7"
                      strokeWidth={2}
                      dot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {error && (
          <Card className="border-[#B91C1C]/20 bg-[#FCE4EC]/40">
            <CardContent>
              <CardTitle>Could not load history</CardTitle>
              <p className="break-words font-apple text-[13px] text-[#B91C1C]">
                {error}
              </p>
            </CardContent>
          </Card>
        )}

        <ul className="flex flex-col gap-3">
          {decisions
            .slice()
            .reverse()
            .map((d) => (
              <li key={`${d.txHash}-${d.timestamp.toString()}`}>
                <Card className="bg-white">
                  <CardContent>
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex flex-col gap-1">
                        <Badge
                          tone={toneFor(d.classification)}
                          className="self-start"
                        >
                          {d.classification}
                        </Badge>
                        <span className="font-apple text-[13px] text-[#1a1a1a]/65">
                          {relativeTime(d.timestamp)}
                        </span>
                      </div>
                      <Link
                        href={`${SHANNON_EXPLORER}/tx/${d.txHash}`}
                        target="_blank"
                        className="inline-flex items-center gap-1 font-apple text-[13px] text-[#0871E7] hover:underline"
                      >
                        Receipt <LuExternalLink className="size-3.5" />
                      </Link>
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
        </ul>
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
