"use client";

import * as Tabs from "@radix-ui/react-tabs";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LuArrowRight, LuChevronDown, LuExternalLink } from "react-icons/lu";
import {
  erc20Abi,
  formatEther,
  formatUnits,
  isAddress,
  parseEther,
  parseUnits,
} from "viem";
import {
  useAccount,
  useBalance,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
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
import { CONTRACTS, MOCK_TOKENS, TEST_TOKENS } from "@/lib/contracts";
import { friendlyTxError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { OnboardShell } from "./_shell/OnboardShell";

type DepositTab = "stt" | "erc20" | "nft";

const TAB_LABELS: Record<DepositTab, string> = {
  stt: "Somnia Token",
  erc20: "Other Token",
  nft: "NFT",
};

const ERC20_TOKENS = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    logo: "/Assets/Images/Logo-Token/btc-logo.svg",
    address: MOCK_TOKENS.btc.address,
    decimals: MOCK_TOKENS.btc.decimals,
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    logo: "/Assets/Images/Logo-Token/usdc-logo.svg",
    address: MOCK_TOKENS.usdc.address,
    decimals: MOCK_TOKENS.usdc.decimals,
  },
  {
    symbol: "USDT",
    name: "Tether",
    logo: "/Assets/Images/Logo-Token/usdt-logo.svg",
    address: MOCK_TOKENS.usdt.address,
    decimals: MOCK_TOKENS.usdt.decimals,
  },
] as const;

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
  const [amount, setAmount] = useState("0");
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

  const validationError =
    !amount.trim() || amountWei === 0n
      ? null
      : amountWei === null
        ? "Enter a valid amount."
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
        <div className="relative">
          <Input
            id="stt-amount"
            type="number"
            step="any"
            min={0}
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={Boolean(validationError)}
            className={cn(
              "pr-20",
              validationError &&
                "border-[#B91C1C]/60 focus:border-[#B91C1C] focus:ring-[#B91C1C]/20",
            )}
          />
          <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center gap-1.5">
            <Image
              src="/Assets/Images/Logo-Token/somnia-logo.png"
              alt=""
              width={18}
              height={18}
              className="size-[18px] rounded-full"
            />
            <span className="font-apple text-[13px] font-medium text-[#1a1a1a]/70">
              STT
            </span>
          </span>
        </div>
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

type Erc20Token = (typeof ERC20_TOKENS)[number];

function TokenSelect({
  value,
  onChange,
}: {
  value: Erc20Token;
  onChange: (token: Erc20Token) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-11 w-full cursor-pointer items-center justify-between rounded-xl border border-black/10 bg-white px-3 font-apple text-[14px] text-[#1a1a1a] transition hover:border-black/20"
      >
        <span className="flex items-center gap-2.5">
          <Image
            src={value.logo}
            alt=""
            width={22}
            height={22}
            className="size-[22px] rounded-full"
          />
          <span className="font-medium">{value.symbol}</span>
          <span className="text-[#1a1a1a]/45">{value.name}</span>
        </span>
        <LuChevronDown
          className={cn(
            "size-4 text-[#1a1a1a]/50 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-10 cursor-default"
          />
          <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-black/10 bg-white shadow-lg shadow-black/5">
            {ERC20_TOKENS.map((token) => (
              <button
                key={token.symbol}
                type="button"
                onClick={() => {
                  onChange(token);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left font-apple text-[14px] transition hover:bg-black/[0.03]",
                  token.symbol === value.symbol && "bg-[#0871E7]/[0.06]",
                )}
              >
                <Image
                  src={token.logo}
                  alt=""
                  width={22}
                  height={22}
                  className="size-[22px] rounded-full"
                />
                <span className="font-medium text-[#1a1a1a]">
                  {token.symbol}
                </span>
                <span className="text-[#1a1a1a]/45">{token.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Erc20DepositForm({ onDone }: { onDone: () => void }) {
  const { address, isConnected } = useAccount();
  const [token, setToken] = useState<Erc20Token>(ERC20_TOKENS[0]);
  const [amount, setAmount] = useState("0");
  const [step, setStep] = useState<"approve" | "deposit" | "done">("approve");

  const { data: balance } = useReadContract({
    address: token.address as `0x${string}`,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const {
    writeContract: writeApprove,
    data: approveHash,
    isPending: isApproving,
    error: approveError,
  } = useWriteContract();
  const { isLoading: isApproveMining, isSuccess: isApproved } =
    useWaitForTransactionReceipt({ hash: approveHash });

  const {
    writeContract: writeDeposit,
    data: depositHash,
    isPending: isDepositing,
    error: depositError,
  } = useWriteContract();
  const { isLoading: isDepositMining, isSuccess: isDeposited } =
    useWaitForTransactionReceipt({ hash: depositHash });

  const handleTokenChange = (next: Erc20Token) => {
    setToken(next);
    setStep("approve");
  };

  useEffect(() => {
    if (isApproved && step === "approve") setStep("deposit");
  }, [isApproved, step]);

  useEffect(() => {
    if (isDeposited && step === "deposit") {
      setStep("done");
      onDone();
    }
  }, [isDeposited, step, onDone]);

  const balanceValue = (balance as bigint | undefined) ?? 0n;
  const parseAmountUnits = (value: string): bigint | null => {
    if (!value.trim()) return null;
    try {
      return parseUnits(value as `${number}`, token.decimals);
    } catch {
      return null;
    }
  };
  const amountUnits = parseAmountUnits(amount);
  const isPositive = amountUnits !== null && amountUnits > 0n;
  const exceedsBalance = amountUnits !== null && amountUnits > balanceValue;
  const formattedBalance = formatUnits(balanceValue, token.decimals);
  const validationError =
    !amount.trim() || amountUnits === 0n
      ? null
      : amountUnits === null
        ? "Enter a valid amount."
        : exceedsBalance
          ? `Insufficient balance — you have ${formattedBalance} ${token.symbol}.`
          : null;

  const canSubmit = isPositive && !exceedsBalance && isConnected;

  const setMax = () => setAmount(formattedBalance);

  const handleApprove = () => {
    if (!canSubmit || amountUnits === null) return;
    writeApprove({
      address: token.address as `0x${string}`,
      abi: erc20Abi,
      functionName: "approve",
      args: [CONTRACTS.memogentCore as `0x${string}`, amountUnits],
    });
  };

  const handleDeposit = () => {
    if (!canSubmit || amountUnits === null) return;
    writeDeposit({
      address: CONTRACTS.memogentCore as `0x${string}`,
      abi: memogentCoreAbi,
      functionName: "depositToken",
      args: [token.address as `0x${string}`, amountUnits],
    });
  };

  const busyApprove = isApproving || isApproveMining;
  const busyDeposit = isDepositing || isDepositMining;
  const txError =
    friendlyTxError(approveError) ?? friendlyTxError(depositError);

  return (
    <div className="flex flex-col gap-5">
      <CardTitle>Deposit other tokens</CardTitle>
      <CardDescription>
        Pick a token and amount, then approve and deposit. Mock BTC / USDC /
        USDT are pre-deployed on Somnia testnet — anyone can call{" "}
        <code className="rounded bg-black/[0.05] px-1 py-0.5 text-[12px]">
          mint(to, amount)
        </code>{" "}
        for a self-service faucet.
      </CardDescription>
      <div className="flex flex-col gap-1.5">
        <Label>Select token</Label>
        <TokenSelect value={token} onChange={handleTokenChange} />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="erc20-amount">Amount ({token.symbol})</Label>
          {isConnected && (
            <span className="font-apple text-[12px] text-[#1a1a1a]/50">
              Balance:{" "}
              <button
                type="button"
                onClick={setMax}
                className="cursor-pointer font-medium text-[#0871E7] underline-offset-2 hover:underline"
              >
                {formattedBalance} {token.symbol}
              </button>
            </span>
          )}
        </div>
        <Input
          id="erc20-amount"
          type="number"
          step="any"
          min={0}
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={Boolean(validationError)}
          className={cn(
            validationError &&
              "border-[#B91C1C]/60 focus:border-[#B91C1C] focus:ring-[#B91C1C]/20",
          )}
        />
        {validationError && (
          <p className="font-apple text-[12px] text-[#B91C1C]">
            {validationError}
          </p>
        )}
      </div>
      {txError && (
        <p className="break-words rounded-lg bg-[#FCE4EC]/60 px-3 py-2 font-apple text-[12px] text-[#B91C1C]">
          {txError}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button
          variant={step === "approve" ? "primary" : "secondary"}
          onClick={handleApprove}
          disabled={step !== "approve" || !canSubmit || busyApprove}
        >
          {isApproving && "Confirm approve…"}
          {isApproveMining && "Approving…"}
          {!busyApprove && (step === "approve" ? "1. Approve" : "✓ Approved")}
        </Button>
        <Button
          variant="primary"
          onClick={handleDeposit}
          disabled={step !== "deposit" || !canSubmit || busyDeposit}
        >
          {isDepositing && "Confirm deposit…"}
          {isDepositMining && "Sealing on chain…"}
          {!busyDeposit && (
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
