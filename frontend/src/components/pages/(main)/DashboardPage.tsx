"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo } from "react";
import {
  LuArrowRight,
  LuCircleCheck,
  LuClock,
  LuPackage,
  LuShieldCheck,
} from "react-icons/lu";
import { formatEther } from "viem";
import {
  useAccount,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWatchContractEvent,
  useWriteContract,
} from "wagmi";
import { memogentAgentAbi } from "@/abi/MemogentAgent";
import { memogentCoreAbi } from "@/abi/MemogentCore";
import { timeCapsuleAbi } from "@/abi/TimeCapsule";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  Separator,
} from "@/components/ui";
import { CONTRACTS } from "@/lib/contracts";
import { relativeTime, shortAddress } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AiActivityPanel } from "./_dashboard/AiActivityPanel";
import { PageHeader } from "./_shell/PageHeader";

const STATUS_TONE = {
  Active: "active",
  Warning: "warning",
  Inactive: "inactive",
} as const;

type StatusKey = keyof typeof STATUS_TONE;

export function DashboardPage() {
  const queryClient = useQueryClient();
  const { address } = useAccount();

  const reads = useReadContracts({
    contracts: address
      ? [
          {
            address: CONTRACTS.memogentCore,
            abi: memogentCoreAbi,
            functionName: "getWillInfo",
            args: [address],
          },
          {
            address: CONTRACTS.memogentCore,
            abi: memogentCoreAbi,
            functionName: "getStatus",
            args: [address],
          },
          {
            address: CONTRACTS.memogentCore,
            abi: memogentCoreAbi,
            functionName: "vaultSTT",
            args: [address],
          },
          {
            address: CONTRACTS.memogentAgent,
            abi: memogentAgentAbi,
            functionName: "latestAssessment",
            args: [address],
          },
          {
            address: CONTRACTS.timeCapsule,
            abi: timeCapsuleAbi,
            functionName: "hasCapsule",
            args: [address],
          },
          {
            address: CONTRACTS.memogentAgent,
            abi: memogentAgentAbi,
            functionName: "empathyMessages",
            args: [address],
          },
        ]
      : [],
    query: { enabled: Boolean(address), refetchInterval: 10_000 },
  });

  useWatchContractEvent({
    address: CONTRACTS.memogentAgent,
    abi: memogentAgentAbi,
    eventName: "RiskDecision",
    args: address ? { user: address } : undefined,
    onLogs: () => queryClient.invalidateQueries(),
  });

  useWatchContractEvent({
    address: CONTRACTS.memogentAgent,
    abi: memogentAgentAbi,
    eventName: "EmpathyMessageGenerated",
    args: address ? { user: address } : undefined,
    onLogs: () => queryClient.invalidateQueries(),
  });

  const { writeContract, data: checkInHash, isPending } = useWriteContract();
  const { isLoading: isMining } = useWaitForTransactionReceipt({
    hash: checkInHash,
  });

  const data = reads.data;
  const willInfo = data?.[0]?.result as
    | readonly [string, bigint, bigint, bigint, boolean, boolean]
    | undefined;
  const statusValue = (data?.[1]?.result as string | undefined) ?? "";
  const vaultSttRaw = (data?.[2]?.result as bigint | undefined) ?? 0n;
  const latestAssessment = data?.[3]?.result as
    | readonly [string, bigint, bigint]
    | undefined;
  const hasCapsule = (data?.[4]?.result as boolean | undefined) ?? false;
  const empathy = (data?.[5]?.result as string | undefined) ?? "";

  const beneficiary =
    willInfo?.[0] ?? "0x0000000000000000000000000000000000000000";
  const lastCheckIn = willInfo?.[1];
  const deadlineSec = willInfo?.[3];
  const executed = willInfo?.[4] ?? false;
  const active = willInfo?.[5] ?? false;
  const hasWill =
    active ||
    (willInfo !== undefined &&
      beneficiary !== "0x0000000000000000000000000000000000000000");

  const classification = (latestAssessment?.[0] ?? "") as
    | "SAFE"
    | "WATCH"
    | "GRACE"
    | "EXECUTE"
    | "";
  const assessedAt = latestAssessment?.[1];

  const statusTone = STATUS_TONE[statusValue as StatusKey] ?? "neutral";
  const deadlineLabel = useMemo(() => {
    if (!deadlineSec) return "—";
    return relativeTime(deadlineSec);
  }, [deadlineSec]);

  const handleCheckIn = () => {
    if (!address) return;
    writeContract({
      address: CONTRACTS.memogentCore,
      abi: memogentCoreAbi,
      functionName: "checkIn",
    });
  };

  return (
    <>
      <PageHeader
        trail={["Dashboard"]}
        title={hasWill ? "Welcome back." : "Your guardian sleeps."}
        subtitle={
          hasWill
            ? "The check-in button below resets the silence window. Memogent watches whether you press it."
            : "No will registered yet. Set one up to wake the AI guardian — it takes about a minute."
        }
        aside={
          hasWill ? (
            <Badge tone={statusTone}>{statusValue || "Pending"}</Badge>
          ) : null
        }
      />

      <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6">
        {executed && (
          <Card className="border-[#B91C1C]/20 bg-[#FCE4EC]/40">
            <CardContent>
              <CardTitle>Inheritance has fired.</CardTitle>
              <CardDescription>
                MemogentCore marked this will executed. The vault has flowed to{" "}
                <code className="rounded bg-black/[0.05] px-1 py-0.5">
                  {shortAddress(beneficiary)}
                </code>
                .
              </CardDescription>
            </CardContent>
          </Card>
        )}

        {hasWill ? (
          <Card>
            <CardContent>
              <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-col gap-2">
                  <CardTitle>I&apos;m still here.</CardTitle>
                  <CardDescription>
                    Press to reset the silence window. Next deadline:{" "}
                    <strong className="text-[#1a1a1a]/85">
                      {deadlineLabel}
                    </strong>
                    . Last check-in: {relativeTime(lastCheckIn)}.
                  </CardDescription>
                </div>
                <Button
                  size="lg"
                  onClick={handleCheckIn}
                  disabled={isPending || isMining || executed}
                >
                  <LuCircleCheck className="size-5" />
                  {isPending && "Confirm in wallet…"}
                  {isMining && "Sealing on chain…"}
                  {!(isPending || isMining) && "Check in"}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="bg-white">
            <CardContent>
              <CardTitle>Create your first will</CardTitle>
              <CardDescription>
                A single transaction names your beneficiary and sets the silence
                window. You can update both later.
              </CardDescription>
              <Button asChild size="lg" className="self-start">
                <Link href="/onboard/create">
                  Begin onboarding <LuArrowRight className="size-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {hasWill && (
          <AiActivityPanel
            classification={classification}
            assessedAt={assessedAt}
          />
        )}

        <div className="grid gap-6 md:grid-cols-2">
          <Card className={cn(!hasWill && "opacity-60")}>
            <CardContent>
              <div className="flex items-center gap-2">
                <LuPackage className="size-4 text-[#1a1a1a]/60" />
                <CardTitle className="text-[20px]">Vault snapshot</CardTitle>
              </div>
              <CardDescription>
                Held by MemogentCore until inheritance fires or you withdraw.
              </CardDescription>
              <Separator className="my-3" />
              <div className="flex items-center justify-between font-apple text-[14px] text-[#1a1a1a]/80">
                <span>STT balance</span>
                <strong className="text-[#1a1a1a]">
                  {hasWill ? formatEther(vaultSttRaw) : "—"} STT
                </strong>
              </div>
              <div className="flex items-center justify-between font-apple text-[14px] text-[#1a1a1a]/80">
                <span>Beneficiary</span>
                <code className="text-[12px]">
                  {hasWill ? shortAddress(beneficiary) : "—"}
                </code>
              </div>
              <Button
                asChild
                variant="secondary"
                size="sm"
                className="mt-2 self-start"
              >
                <Link href="/onboard/deposit">Top up</Link>
              </Button>
            </CardContent>
          </Card>

          <Card className={cn(!hasWill && "opacity-60")}>
            <CardContent>
              <div className="flex items-center gap-2">
                <LuShieldCheck className="size-4 text-[#1a1a1a]/60" />
                <CardTitle className="text-[20px]">Time Capsule</CardTitle>
              </div>
              <CardDescription>
                Your encrypted final message — unlocks for your heir after
                execution.
              </CardDescription>
              <Separator className="my-3" />
              <div className="flex items-center justify-between font-apple text-[14px] text-[#1a1a1a]/80">
                <span>Status</span>
                {hasCapsule ? (
                  <Badge tone="active">Attached</Badge>
                ) : (
                  <Badge tone="neutral">Not yet</Badge>
                )}
              </div>
              <Button
                asChild
                variant="secondary"
                size="sm"
                className="mt-2 self-start"
              >
                <Link href="/onboard/capsule">
                  {hasCapsule ? "Replace capsule" : "Attach capsule"}
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {hasWill && empathy && (
          <Card className="border-[#0871E7]/20 bg-[#F6FAFE]">
            <CardContent>
              <Badge tone="info" className="self-start">
                <LuClock className="size-3" /> Empathy preview
              </Badge>
              <CardTitle>The message your heir will see</CardTitle>
              <p className="font-instrument text-[22px] italic leading-relaxed text-[#1a1a1a]/85">
                “{empathy}”
              </p>
              <CardDescription>
                Generated by Memogent AI via Somnia LLM consensus.
              </CardDescription>
            </CardContent>
          </Card>
        )}

        <div className="flex items-center justify-end">
          <Button asChild variant="ghost" size="sm">
            <Link href="/history">
              See full AI decision history <LuArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
