export const CONTRACTS = {
  memogentCore: "0x01b35186AA48d2feE071BAF36b83640660A5A6DC",
  memogentAgent: "0xeFDe02B79ec2b7949689B600EC63858f8e17bc69",
  timeCapsule: "0xcB1Aa02A9B97e224403E650808776c87c22197Ec",
  somniaAgents: "0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776",
} as const;

export const TEST_TOKENS = {
  erc20Mock: "0x83699CDCb35B5442904D9c45cD4973E734de69aD",
  erc721Mock: "0xe7095E235c10165Ec04a8b9d28Fc4d0b37392779",
} as const;

// Branded mock ERC20s deployed for the deposit demo (faucet-style mint is permissionless)
export const MOCK_TOKENS = {
  btc: {
    address: "0x58d1DABa1eC6Aa6BF9417f18B78D199f827Aeea7",
    decimals: 8,
  },
  usdc: {
    address: "0xD6693BA206ad5E38Ac295c4b91d62F6a4cc055Ea",
    decimals: 6,
  },
  usdt: {
    address: "0xD10Ca33B8008fb6c40a1489d0F7d86473A1DC3d7",
    decimals: 6,
  },
} as const;

export const SHANNON_EXPLORER = "https://shannon-explorer.somnia.network";
export const SOMNIA_FAUCET = "https://testnet.somnia.network/";
export const TELEGRAM_BOT_URL = "https://t.me/memogent_v1_bot";
export const PINATA_GATEWAY = "https://gateway.pinata.cloud/ipfs";
