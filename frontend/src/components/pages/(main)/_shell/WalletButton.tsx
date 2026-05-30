"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { LuChevronDown, LuTriangleAlert, LuWallet } from "react-icons/lu";
import { Button } from "@/components/ui";

export function WalletButton() {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!ready) {
          return (
            <div
              aria-hidden
              className="h-10 w-[120px] animate-pulse rounded-full bg-black/[0.04]"
            />
          );
        }

        if (!connected) {
          return (
            <Button onClick={openConnectModal} variant="primary" size="md">
              <LuWallet className="size-4" /> Connect
            </Button>
          );
        }

        if (chain.unsupported) {
          return (
            <Button onClick={openChainModal} variant="danger" size="md">
              <LuTriangleAlert className="size-4" /> Wrong network
            </Button>
          );
        }

        return (
          <Button onClick={openAccountModal} variant="secondary" size="md">
            <LuWallet className="size-4 text-[#1B5E20]" aria-hidden />
            {account.displayName}
            <LuChevronDown className="size-4 opacity-60" />
          </Button>
        );
      }}
    </ConnectButton.Custom>
  );
}
