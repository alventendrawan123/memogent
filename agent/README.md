# agent/

Off-chain TypeScript agent for Memogent — runs 24/7, collects multi-signal life proofs (wallet, check-in, Telegram), and submits AI decisions on-chain.

## Layout (planned for W2)

| Path | Purpose |
|---|---|
| [rules/](./rules/) | Project conventions — read before coding |
| `src/` | TypeScript source (collectors, reasoning, submitters) |
| `test/` | Vitest tests |
| `abi/` | Contract ABIs (generated from `sc/out/` after compile) |
| `package.json` | Somnia Agent Kit, ethers v6, telegraf |
| `Dockerfile` | For VPS / Railway deployment |
| `.env.example` | `AGENT_PRIVATE_KEY`, `TELEGRAM_BOT_TOKEN`, `IPFS_KEY` |

## Status

W1 (current): rules + skill reference only. Scaffolding begins W2.

See [docs/flow.md](../docs/flow.md) §3-§6 for how this agent interacts with on-chain contracts.
