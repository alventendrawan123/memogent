import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "viem";
import { somniaTestnet } from "./chains";

export const wagmiConfig = getDefaultConfig({
  appName: "Memogent",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "",
  chains: [somniaTestnet],
  transports: {
    [somniaTestnet.id]: http("https://api.infra.testnet.somnia.network/"),
  },
  ssr: true,
});
