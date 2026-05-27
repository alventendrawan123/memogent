# frontend/

Next.js frontend for Memogent — Bima's domain. Smart contract team and AI agent team do NOT touch this directory.

## Read first

**[rules/bima-guide.md](./rules/bima-guide.md)** — comprehensive end-to-end guide. Tech stack, network config, contract integration, user flows, Telegram linking (SIWE), Time Capsule upload/claim (Lighthouse Kavach), UI state mapping, security rules, coordination protocol.

## Layout (planned for W2-W4)

| Path | Purpose |
|---|---|
| [rules/](./rules/) | Project conventions for FE (THIS folder) |
| `app/` | Next.js App Router pages |
| `components/` | Shared UI components (shadcn/ui based) |
| `lib/` | wagmi config, chains, contract helpers |
| `abi/` | Contract ABIs synced from `sc/out/` |
| `public/` | Static assets |
| `package.json` | Next.js, wagmi, viem, RainbowKit, Lighthouse SDK, siwe |
| `.env.example` | `NEXT_PUBLIC_MEMOGENT_CORE`, `NEXT_PUBLIC_LIGHTHOUSE_API_KEY`, `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` |

## Status

W1 (current): guide drafted. Scaffolding begins when Bima starts (any time).

See [docs/flow.md](../docs/flow.md) §13 for the specific list of read functions, events, and URLs Bima needs from the smart contract layer.

## Coordination

- ABI changes or new events → smart contract team pings in shared chat
- UX questions about flow → reference `docs/flow.md` first
- Contract bugs → file a clear repro (chain, tx hash, expected vs actual)
