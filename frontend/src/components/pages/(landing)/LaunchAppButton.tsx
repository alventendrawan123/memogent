"use client";

import { useConnectModal } from "@rainbow-me/rainbowkit";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { memogentCoreAbi } from "@/abi/MemogentCore";
import { CONTRACTS } from "@/lib/contracts";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function LaunchAppButton() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const [intent, setIntent] = useState(false);

  const { data: willInfo, isLoading: willLoading } = useReadContract({
    address: CONTRACTS.memogentCore,
    abi: memogentCoreAbi,
    functionName: "getWillInfo",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address) },
  });

  const hasWill =
    !!willInfo && (willInfo[5] === true || willInfo[0] !== ZERO_ADDRESS);

  useEffect(() => {
    if (!intent || !isConnected || !address) return;
    if (willLoading || willInfo === undefined) return;
    router.push(hasWill ? "/dashboard" : "/onboard/create");
    setIntent(false);
  }, [intent, isConnected, address, willInfo, willLoading, hasWill, router]);

  const handleClick = () => {
    if (!isConnected) {
      setIntent(true);
      openConnectModal?.();
      return;
    }
    if (willInfo === undefined || willLoading) {
      setIntent(true);
      return;
    }
    router.push(hasWill ? "/dashboard" : "/onboard/create");
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="group relative inline-flex cursor-pointer items-center justify-center overflow-hidden rounded-full bg-[#0871E7] px-5 py-2 font-sans text-[14px] text-white shadow-[inset_0_-4px_4px_rgba(255,255,255,0.39)] outline-1 outline-[#0871E7] -outline-offset-1 transition hover:bg-[#0866D6]"
    >
      <span
        aria-hidden
        className="absolute left-[10%] top-[1px] h-4 w-[80%] rounded-[12px] bg-gradient-to-b from-[#DEF0FC] to-transparent transition-transform duration-300 group-hover:scale-x-105"
      />
      <span className="relative z-10">Launch App</span>
    </button>
  );
}
