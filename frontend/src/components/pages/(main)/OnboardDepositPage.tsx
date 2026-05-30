"use client";

import * as Tabs from "@radix-ui/react-tabs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LuArrowRight, LuExternalLink } from "react-icons/lu";
import { formatEther, isAddress, parseEther, parseUnits } from "viem";
import {
  useAccount,
  useBalance,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { erc20Abi } from "@/abi/erc20";
import { erc721Abi } from "@/abi/erc721";
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
import { CONTRACTS, TEST_TOKENS } from "@/lib/contracts";
import { friendlyTxError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { OnboardShell } from "./_shell/OnboardShell";

type DepositTab = "stt" | "erc20" | "nft";

const TAB_LABELS: Record<DepositTab, string> = {
  stt: "STT",
  erc20: "ERC-20",
  nft: "NFT",
};

export function OnboardDepositPage() {
  const router = useRouter();
  const [tab, setTab] = useState<DepositTab>("stt");

  return (
    <OnboardShell
      stepKey="deposit"
      title="Fund the vault"
      subtitle="Deposits live inside MemogentCore until inheritance fires or you withdraw. You can top up later — start with whatever feels right."
    >
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent>
            <Tabs.Root
              value={tab}
              onValueChange={(v) => setTab(v as DepositTab)}
            >
              <Tabs.List className="mb-6 inline-flex items-center gap-1 rounded-full border border-black/10 bg-[#F3F4ED] p-1 font-apple text-[12px] uppercase tracking-[0.14em]">
                {(Object.keys(TAB_LABELS) as DepositTab[]).map((key) => (
                  <Tabs.Trigger
                    key={key}
                    value={key}
                    className={cn(
                      "rounded-full px-4 py-1.5 transition",
                      key === tab
                        ? "bg-white text-[#1a1a1a] shadow-[0_1px_0_rgba(0,0,0,0.04)]"
                        : "text-[#1a1a1a]/55 hover:text-[#1a1a1a]",
                    )}
                  >
                    {TAB_LABELS[key]}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>

              <Tabs.Content value="stt">
                <SttDepositForm
                  onDone={() => router.push("/onboard/telegram")}
                />
              </Tabs.Content>
              <Tabs.Content value="erc20">
                <Erc20DepositForm
                  onDone={() => router.push("/onboard/telegram")}
                />
              </Tabs.Content>
              <Tabs.Content value="nft">
                <NftDepositForm
                  onDone={() => router.push("/onboard/telegram")}
                />
              </Tabs.Content>
            </Tabs.Root>
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-between">
          <span className="font-apple text-[12px] uppercase tracking-[0.16em] text-[#1a1a1a]/40">
            Step 2 of 4
          </span>
          <Link
            href="/onboard/telegram"
            className="font-apple text-[13px] text-[#1a1a1a]/60 underline-offset-4 hover:underline"
          >
            Skip — deposit later
          </Link>
        </div>
      </div>
    </OnboardShell>
  );
}

const GAS_RESERVE = parseEther("0.001");

function parseAmountWei(value: string): bigint | null {
  if (!value.trim()) return null;
  try {
    return parseEther(value as `${number}`);
  } catch {
    return null;
  }
}

function formatBalance(wei: bigint): string {
  const value = Number(formatEther(wei));
  if (!Number.isFinite(value)) return formatEther(wei);
  return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

function SttDepositForm({ onDone }: { onDone: () => void }) {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState("0.5");
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isMining, isSuccess: isMined } =
    useWaitForTransactionReceipt({
      hash,
    });

  const { data: balance, isLoading: isBalanceLoading } = useBalance({
    address,
    query: { enabled: Boolean(address) },
  });

  useEffect(() => {
    if (isMined) onDone();
  }, [isMined, onDone]);

  const balanceValue = balance?.value ?? 0n;
  const amountWei = parseAmountWei(amount);
  const isPositive = amountWei !== null && amountWei > 0n;
  const exceedsBalance = amountWei !== null && amountWei > balanceValue;
  const leavesNoGas =
    isPositive && !exceedsBalance && balanceValue - amountWei < GAS_RESERVE;

  const validationError = !amount.trim()
    ? null
    : amountWei === null
      ? "Enter a valid amount."
      : amountWei <= 0n
        ? "Amount must be greater than zero."
        : exceedsBalance
          ? `Insufficient balance — you have ${formatBalance(balanceValue)} STT.`
          : null;

  const canSubmit = isPositive && !exceedsBalance && isConnected;

  const setMax = () => {
    const max = balanceValue > GAS_RESERVE ? balanceValue - GAS_RESERVE : 0n;
    setAmount(formatEther(max));
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || amountWei === null) return;
    writeContract({
      address: CONTRACTS.memogentCore,
      abi: memogentCoreAbi,
      functionName: "depositSTT",
      value: amountWei,
    });
  };

  const busy = isPending || isMining;
  const txError = friendlyTxError(error);

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <CardTitle>Deposit STT</CardTitle>
      <CardDescription>
        Native Somnia testnet token. Sent with the call as msg.value.
      </CardDescription>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="stt-amount">Amount (STT)</Label>
          {isConnected && (
            <span className="font-apple text-[12px] text-[#1a1a1a]/50">
              Balance:{" "}
              {isBalanceLoading ? (
                "…"
              ) : (
                <button
                  type="button"
                  onClick={setMax}
                  className="cursor-pointer font-medium text-[#0871E7] underline-offset-2 hover:underline"
                >
                  {formatBalance(balanceValue)} STT
                </button>
              )}
            </span>
          )}
        </div>
        <Input
          id="stt-amount"
          type="number"
          step="any"
          min={0}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={Boolean(validationError)}
          className={
            validationError
              ? "border-[#B91C1C]/60 focus:border-[#B91C1C] focus:ring-[#B91C1C]/20"
              : undefined
          }
        />
        {validationError ? (
          <p className="font-apple text-[12px] text-[#B91C1C]">
            {validationError}
          </p>
        ) : leavesNoGas ? (
          <p className="font-apple text-[12px] text-[#1a1a1a]/50">
            Heads up — this leaves little STT for gas.
          </p>
        ) : null}
      </div>
      {txError && (
        <p className="break-words rounded-lg bg-[#FCE4EC]/60 px-3 py-2 font-apple text-[12px] text-[#B91C1C]">
          {txError}
        </p>
      )}
      <Button type="submit" disabled={busy || !canSubmit} size="lg">
        {isPending && "Confirm in wallet…"}
        {isMining && "Sealing on chain…"}
        {!busy && "Deposit & continue"}
      </Button>
    </form>
  );
}

function Erc20DepositForm({ onDone }: { onDone: () => void }) {
  const { address } = useAccount();
  const [token, setToken] = useState<string>(TEST_TOKENS.erc20Mock);
  const [amount, setAmount] = useState("10");
  const [step, setStep] = useState<"approve" | "deposit" | "done">("approve");

  const { data: decimals } = useReadContract({
    address: isAddress(token) ? (token as `0x${string}`) : undefined,
    abi: erc20Abi,
    functionName: "decimals",
    query: { enabled: isAddress(token) },
  });

  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: isApproving,
  } = useWriteContract();
  const { isLoading: isApproveMining, isSuccess: isApproved } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const {
    writeContract: writeDeposit,
    data: depositHash,
    isPending: isDepositing,
  } = useWriteContract();
  const { isLoading: isDepositMining, isSuccess: isDeposited } =
    useWaitForTransactionReceipt({ hash: depositHash });

  useEffect(() => {
    if (isApproved && step === "approve") setStep("deposit");
  }, [isApproved, step]);

  useEffect(() => {
    if (isDeposited && step === "deposit") {
      setStep("done");
      onDone();
    }
  }, [isDeposited, step, onDone]);

  const handleApprove = () => {
    if (!isAddress(token) || decimals === undefined) return;
    writeApprove({
      address: token as `0x${string}`,
      abi: erc20Abi,
      functionName: "approve",
      args: [CONTRACTS.memogentCore, parseUnits(amount, decimals as number)],
    });
  };

  const handleDeposit = () => {
    if (!isAddress(token) || decimals === undefined || !address) return;
    writeDeposit({
      address: CONTRACTS.memogentCore,
      abi: memogentCoreAbi,
      functionName: "depositToken",
      args: [token as `0x${string}`, parseUnits(amount, decimals as number)],
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <CardTitle>Deposit ERC-20</CardTitle>
      <CardDescription>
        Two-step: approve the vault to spend, then deposit. Test token MTT
        pre-filled.
      </CardDescription>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="erc20-token">Token address</Label>
        <Input
          id="erc20-token"
          placeholder="0x…"
          value={token}
          onChange={(e) => setToken(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="erc20-amount">Amount</Label>
        <Input
          id="erc20-amount"
          type="number"
          step="any"
          min={0}
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant={step === "approve" ? "primary" : "secondary"}
          disabled={step !== "approve" || isApproving || isApproveMining}
          onClick={handleApprove}
        >
          {isApproving || isApproveMining
            ? "Approving…"
            : step === "approve"
              ? "1. Approve"
              : "1. Approved"}
        </Button>
        <Button
          variant={step === "deposit" ? "primary" : "secondary"}
          disabled={step !== "deposit" || isDepositing || isDepositMining}
          onClick={handleDeposit}
        >
          {isDepositing || isDepositMining ? (
            "Depositing…"
          ) : (
            <>
              2. Deposit <LuArrowRight className="size-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function NftDepositForm({ onDone }: { onDone: () => void }) {
  const [nft, setNft] = useState<string>(TEST_TOKENS.erc721Mock);
  const [tokenId, setTokenId] = useState("0");
  const [step, setStep] = useState<"approve" | "deposit" | "done">("approve");

  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: isApproving,
  } = useWriteContract();
  const { isLoading: isApproveMining, isSuccess: isApproved } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const {
    writeContract: writeDeposit,
    data: depositHash,
    isPending: isDepositing,
  } = useWriteContract();
  const { isLoading: isDepositMining, isSuccess: isDeposited } =
    useWaitForTransactionReceipt({ hash: depositHash });

  useEffect(() => {
    if (isApproved && step === "approve") setStep("deposit");
  }, [isApproved, step]);

  useEffect(() => {
    if (isDeposited && step === "deposit") {
      setStep("done");
      onDone();
    }
  }, [isDeposited, step, onDone]);

  const handleApprove = () => {
    if (!isAddress(nft)) return;
    writeApprove({
      address: nft as `0x${string}`,
      abi: erc721Abi,
      functionName: "approve",
      args: [CONTRACTS.memogentCore, BigInt(tokenId)],
    });
  };

  const handleDeposit = () => {
    if (!isAddress(nft)) return;
    writeDeposit({
      address: CONTRACTS.memogentCore,
      abi: memogentCoreAbi,
      functionName: "depositNFT",
      args: [nft as `0x${string}`, BigInt(tokenId)],
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <CardTitle>Deposit NFT</CardTitle>
      <CardDescription>
        Approve a single tokenId, then send it into the vault. Use
        setApprovalForAll directly if depositing several.
      </CardDescription>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nft-contract">NFT contract</Label>
        <Input
          id="nft-contract"
          placeholder="0x…"
          value={nft}
          onChange={(e) => setNft(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nft-id">Token ID</Label>
        <Input
          id="nft-id"
          type="number"
          min={0}
          value={tokenId}
          onChange={(e) => setTokenId(e.target.value)}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button
          variant={step === "approve" ? "primary" : "secondary"}
          disabled={step !== "approve" || isApproving || isApproveMining}
          onClick={handleApprove}
        >
          {isApproving || isApproveMining ? "Approving…" : "1. Approve"}
        </Button>
        <Button
          variant={step === "deposit" ? "primary" : "secondary"}
          disabled={step !== "deposit" || isDepositing || isDepositMining}
          onClick={handleDeposit}
        >
          {isDepositing || isDepositMining ? (
            "Depositing…"
          ) : (
            <>
              2. Deposit <LuExternalLink className="size-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
