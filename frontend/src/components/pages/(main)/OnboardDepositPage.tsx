"use client";

import * as Tabs from "@radix-ui/react-tabs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LuArrowRight, LuExternalLink } from "react-icons/lu";
import { isAddress, parseEther, parseUnits } from "viem";
import {
  useAccount,
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

function SttDepositForm({ onDone }: { onDone: () => void }) {
  const [amount, setAmount] = useState("0.5");
  const { writeContract, data: hash, isPending, error } = useWriteContract();
  const { isLoading: isMining, isSuccess: isMined } =
    useWaitForTransactionReceipt({
      hash,
    });

  useEffect(() => {
    if (isMined) onDone();
  }, [isMined, onDone]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    writeContract({
      address: CONTRACTS.memogentCore,
      abi: memogentCoreAbi,
      functionName: "depositSTT",
      value: parseEther(amount),
    });
  };

  const busy = isPending || isMining;

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      <CardTitle>Deposit STT</CardTitle>
      <CardDescription>
        Native Somnia testnet token. Sent with the call as msg.value.
      </CardDescription>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="stt-amount">Amount (STT)</Label>
        <Input
          id="stt-amount"
          type="number"
          step="0.01"
          min={0}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      {error && (
        <p className="font-apple text-[12px] text-[#B91C1C]">{error.message}</p>
      )}
      <Button type="submit" disabled={busy} size="lg">
        {isPending && "Confirm in wallet…"}
        {isMining && "Sealing on chain…"}
        {!busy && (
          <>
            Deposit & continue <LuArrowRight className="size-4" />
          </>
        )}
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
          step="0.0001"
          min={0}
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
