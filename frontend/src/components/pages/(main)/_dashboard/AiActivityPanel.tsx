"use client";

import Link from "next/link";
import { LuExternalLink, LuRefreshCw } from "react-icons/lu";
import { Badge, Card, CardContent, CardTitle } from "@/components/ui";
import { CONTRACTS } from "@/lib/contracts";
import { explorerAddress, relativeTime } from "@/lib/format";
import { NokiaWidget } from "../_shell/NokiaWidget";

type Classification = "SAFE" | "WATCH" | "GRACE" | "EXECUTE" | "";

export function AiActivityPanel({
  classification,
  assessedAt,
}: {
  classification: Classification;
  assessedAt: bigint | undefined;
}) {
  const tone = toneFor(classification);
  const label = classification || "AWAITING";
  const lastSeen = relativeTime(assessedAt);

  return (
    <Card className="bg-white">
      <CardContent>
        <div className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-3">
            <Badge tone="accent" className="self-start">
              <LuRefreshCw className="size-3" /> AI activity
            </Badge>
            <CardTitle>
              Your guardian says <span className="text-[#0871E7]">{label}</span>
            </CardTitle>
            <p className="font-apple text-[14px] text-[#1a1a1a]/65">
              Assessed {lastSeen}. The off-chain agent runs Somnia LLM consensus
              and writes the verdict on-chain — read the receipt for the exact
              signal context it saw.
            </p>
            <Badge tone={tone} className="self-start">
              {label || "—"}
            </Badge>
            <Link
              href={explorerAddress(CONTRACTS.memogentAgent)}
              target="_blank"
              className="inline-flex items-center gap-1 font-apple text-[13px] text-[#0871E7] hover:underline"
            >
              View AI receipts on Shannon Explorer{" "}
              <LuExternalLink className="size-3.5" />
            </Link>
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
