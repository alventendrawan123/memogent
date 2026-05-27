"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAccount } from "wagmi";

export function MainGate({ children }: { children: React.ReactNode }) {
  const { isConnected, status } = useAccount();
  const router = useRouter();

  useEffect(() => {
    if (status === "connecting" || status === "reconnecting") return;
    if (!isConnected) router.replace("/");
  }, [isConnected, status, router]);

  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="font-instrument text-[32px] leading-tight text-[#1a1a1a]">
          Connect your wallet to continue.
        </p>
        <p className="font-apple text-[14px] text-[#1a1a1a]/60">
          Memogent watches the wallet you sign in with. Use the button in the
          top-right to connect.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
