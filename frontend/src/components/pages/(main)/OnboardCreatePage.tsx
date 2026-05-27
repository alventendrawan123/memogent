"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { LuArrowRight } from "react-icons/lu";
import { isAddress } from "viem";
import {
  useAccount,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { z } from "zod";
import { memogentCoreAbi } from "@/abi/MemogentCore";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardTitle,
  Input,
  Label,
} from "@/components/ui";
import { CONTRACTS, SOMNIA_FAUCET } from "@/lib/contracts";
import { daysToSeconds } from "@/lib/format";
import { OnboardShell } from "./_shell/OnboardShell";

const schema = z.object({
  beneficiary: z
    .string()
    .refine((value) => isAddress(value), "Enter a valid Ethereum address"),
  inactivePeriodDays: z.coerce.number().int().min(1).max(365),
});

type FormValues = z.infer<typeof schema>;

export function OnboardCreatePage() {
  const router = useRouter();
  const { address } = useAccount();
  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
  } = useWriteContract();
  const { isLoading: isMining, isSuccess: isMined } =
    useWaitForTransactionReceipt({
      hash,
    });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { beneficiary: "", inactivePeriodDays: 30 },
  });

  useEffect(() => {
    if (isMined) router.push("/onboard/deposit");
  }, [isMined, router]);

  const onSubmit = (values: FormValues) => {
    if (!address) return;
    writeContract({
      address: CONTRACTS.memogentCore,
      abi: memogentCoreAbi,
      functionName: "registerWill",
      args: [
        values.beneficiary as `0x${string}`,
        daysToSeconds(values.inactivePeriodDays),
      ],
    });
  };

  const busy = isPending || isMining;
  const errorMessage = writeError?.message;

  return (
    <OnboardShell
      stepKey="create"
      title="Create your will"
      subtitle="Name a single beneficiary and set the silence window. Both can change later — this is just the starting frame."
    >
      <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
        <Card>
          <CardContent>
            <CardTitle>Will details</CardTitle>
            <CardDescription>
              Stored on Somnia via MemogentCore.registerWill — a single sealed
              record, no off-chain database.
            </CardDescription>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="mt-2 flex flex-col gap-5"
            >
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="beneficiary">Beneficiary address</Label>
                <Input
                  id="beneficiary"
                  placeholder="0x…"
                  autoComplete="off"
                  spellCheck={false}
                  {...form.register("beneficiary")}
                />
                {form.formState.errors.beneficiary && (
                  <p className="font-apple text-[12px] text-[#B91C1C]">
                    {form.formState.errors.beneficiary.message}
                  </p>
                )}
                <p className="font-apple text-[12px] text-[#1a1a1a]/50">
                  The wallet that will inherit your vault and unlock the Time
                  Capsule. Cannot be your own address.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="days">Silence window (days)</Label>
                <Input
                  id="days"
                  type="number"
                  min={1}
                  max={365}
                  {...form.register("inactivePeriodDays")}
                />
                <p className="font-apple text-[12px] text-[#1a1a1a]/50">
                  Inheritance fires if you don&apos;t check in within this
                  window. Most users pick 14–60 days.
                </p>
              </div>

              {errorMessage && (
                <p className="rounded-lg bg-[#FCE4EC]/60 px-3 py-2 font-apple text-[12px] text-[#B91C1C]">
                  {errorMessage}
                </p>
              )}

              <div className="flex items-center justify-between pt-2">
                <span className="font-apple text-[12px] uppercase tracking-[0.16em] text-[#1a1a1a]/40">
                  Step 1 of 4
                </span>
                <Button type="submit" disabled={busy} size="lg">
                  {isPending && "Confirm in wallet…"}
                  {isMining && "Sealing on chain…"}
                  {!busy && (
                    <>
                      Continue <LuArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card className="bg-[#FAFAF6]">
          <CardContent>
            <CardTitle>Before you continue</CardTitle>
            <ul className="mt-2 flex flex-col gap-3 font-apple text-[14px] text-[#1a1a1a]/70">
              <li>
                • You need a small amount of STT for gas. Grab from{" "}
                <Link
                  href={SOMNIA_FAUCET}
                  target="_blank"
                  className="text-[#0871E7] underline decoration-[#0871E7]/30 hover:decoration-[#0871E7]"
                >
                  testnet faucet
                </Link>
                .
              </li>
              <li>• The beneficiary doesn&apos;t need to do anything yet.</li>
              <li>
                • You can withdraw, deactivate, or change the beneficiary any
                time before execution.
              </li>
              <li>
                • A successful check-in resets the window — silence is the only
                trigger.
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </OnboardShell>
  );
}
