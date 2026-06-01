"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  LuBrain,
  LuChevronDown,
  LuChevronUp,
  LuExternalLink,
  LuRefreshCw,
} from "react-icons/lu";
import type { Address } from "viem";
import { useAccount } from "wagmi";
import { Badge, Card, CardContent, CardTitle } from "@/components/ui";
import {
  type AgentLogInfo,
  getLatestAssessmentLog,
  RISK_SYSTEM_PROMPT,
} from "@/lib/agentActivity";
import { CONTRACTS } from "@/lib/contracts";
import { explorerAddress, explorerTx, relativeTime } from "@/lib/format";
import { NokiaWidget } from "../_shell/NokiaWidget";

type Classification = "SAFE" | "WATCH" | "GRACE" | "EXECUTE" | "";

export function AiActivityPanel({
  classification,
  assessedAt,
}: {
  classification: Classification;
  assessedAt: bigint | undefined;
}) {
  const { address } = useAccount();
  const [assessmentLog, setAssessmentLog] = useState<AgentLogInfo | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);

  const tone = toneFor(classification);
  const label = classification || "AWAITING";
  const lastSeen = relativeTime(assessedAt);

  const assessedAtKey = assessedAt?.toString() ?? "0";
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    // assessedAtKey in deps so a fresh on-chain assessment refetches the tx log
    void assessedAtKey;
    getLatestAssessmentLog(address as Address)
      .then((log) => {
        if (!cancelled) setAssessmentLog(log);
      })
      .catch(() => {
        if (!cancelled) setAssessmentLog(null);
      });
    return () => {
      cancelled = true;
    };
  }, [address, assessedAtKey]);

  return (
    <Card className="bg-white">
      <CardContent>
        <div className="flex items-start justify-between gap-6">
          <div className="flex flex-1 flex-col gap-3">
            <Badge tone="accent" className="self-start">
              <LuRefreshCw className="size-3" /> AI activity
            </Badge>
            <CardTitle>
              Your guardian says <span className="text-[#0871E7]">{label}</span>
            </CardTitle>
            <p className="font-apple text-[14px] text-[#1a1a1a]/65">
              Assessed {lastSeen}. The off-chain dispatcher periodically asks
              the on-chain{" "}
              <Link
                href={explorerAddress(CONTRACTS.memogentAgent)}
                target="_blank"
                className="text-[#0871E7] hover:underline"
              >
                MemogentAgent
              </Link>{" "}
              contract, which runs a Somnia Agent Platform LLM and writes the
              verdict back on-chain.
            </p>
            <Badge tone={tone} className="self-start">
              {label || "—"}
            </Badge>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {assessmentLog && (
                <Link
                  href={explorerTx(assessmentLog.txHash)}
                  target="_blank"
                  className="inline-flex items-center gap-1 font-apple text-[13px] text-[#0871E7] hover:underline"
                >
                  View latest AI verdict tx
                  <LuExternalLink className="size-3.5" />
                </Link>
              )}
              <button
                type="button"
                onClick={() => setPromptOpen((v) => !v)}
                className="inline-flex items-center gap-1 font-apple text-[13px] text-[#1a1a1a]/65 underline-offset-2 hover:text-[#0871E7] hover:underline"
              >
                <LuBrain className="size-3.5" />
                {promptOpen ? "Hide" : "See"} the on-chain system prompt
                {promptOpen ? (
                  <LuChevronUp className="size-3.5" />
                ) : (
                  <LuChevronDown className="size-3.5" />
                )}
              </button>
            </div>

            {promptOpen && (
              <div className="flex flex-col gap-2 rounded-xl border border-black/10 bg-[#FAFAF6] p-4">
                <span className="font-apple text-[11px] uppercase tracking-[0.16em] text-[#1a1a1a]/40">
                  MemogentAgent.SYSTEM_PROMPT — on-chain constant
                </span>
                <p className="font-apple text-[12px] leading-relaxed text-[#1a1a1a]/75">
                  &ldquo;{RISK_SYSTEM_PROMPT}&rdquo;
                </p>
                <span className="font-apple text-[11px] text-[#1a1a1a]/45">
                  Hard-coded in the deployed contract — anyone can verify the
                  exact prompt the LLM was instructed to follow.
                </span>
              </div>
            )}
          </div>

          <div className="hidden md:block">
            <NokiaWidget
              messages={[
                "Are you still here?",
                "Yes, I'm alive.",
                "Check-in received.",
              ]}
              caption="AI bot speaks here"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function toneFor(classification: Classification) {
  if (classification === "SAFE") return "active" as const;
  if (classification === "WATCH") return "info" as const;
  if (classification === "GRACE") return "warning" as const;
  if (classification === "EXECUTE") return "inactive" as const;
  return "neutral" as const;
}
