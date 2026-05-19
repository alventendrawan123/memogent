# Agent Rules — TypeScript Conventions

Applies to all code under `d:\memogent\agent\`.

## Runtime & tooling

- **Node.js** ≥ 20.x (Somnia Agent Kit requirement)
- **TypeScript** ≥ 5.4 with `strict: true`
- Module system: **ESM** (`"type": "module"` in package.json)
- Package manager: **pnpm** preferred (matches SomMemo frontend), npm acceptable
- Run with **`tsx`** in dev (`tsx watch src/index.ts`), compile to `dist/` for production

## Project layout

```
agent/
├── src/
│   ├── index.ts            entrypoint — agent loop
│   ├── collectors/         signal collection (wallet, telegram, checkin)
│   ├── reasoning/          prompt building, inferToolsChat invocation, scoring
│   ├── submitters/         on-chain submission (createRequest, handleDecision)
│   ├── ipfs/               capsule upload/fetch
│   ├── store/              local persistence (SQLite for telegram state)
│   ├── abi/                generated from sc/out (manual copy step)
│   ├── config.ts           env loading, network selection, addresses
│   └── types.ts            shared types
├── test/                   vitest tests
├── package.json
├── tsconfig.json
├── Dockerfile              for VPS/Railway deployment
└── .env.example
```

## TypeScript style

- **No `any`**. Use `unknown` + type guards.
- **No `enum`** — prefer `as const` objects or string literal unions
- Imports: relative paths with `.js` extension (ESM requirement)
- Functions return explicit types when public/exported

```typescript
// ✅
export type RiskTag = 'SAFE' | 'WATCH' | 'GRACE' | 'EXECUTE';

export async function computeRisk(signals: Signals): Promise<RiskScore> { ... }

// ❌
export enum RiskTag { Safe, Watch, Grace, Execute }
export async function computeRisk(signals) { ... }
```

## Async / error handling

- Always `await` — no floating promises
- Wrap external calls (RPC, Telegram, agent platform) in retries with exponential backoff
- Never swallow errors silently — log with context, decide explicitly to continue or abort
- Use a single shared `logger` (pino or console — pick once in W1, stick with it)

## Dependencies — locked choices

| Purpose | Package | Why |
|---|---|---|
| EVM client | `ethers` v6 | matches SomMemo; viem allowed for ABI encoding helpers only |
| Telegram Bot API | **`grammy`** (NOT `telegraf`) | Bot API 9.6+ active; telegraf stale since Feb 2024 (only supports Bot API 7.1) |
| IPFS storage + encryption | `@lighthouse-web3/sdk` | pay-once perpetual; built-in Kavach access control |
| Env loading | `dotenv` | standard |
| Logging | `pino` | structured JSON logs, fast |
| Local store | `better-sqlite3` | fastest sync SQLite for Node; ACID; no async overhead |
| Tests | `vitest` | ESM-native, fast |
| ABI encoding helpers | `viem` (optional) | `encodeFunctionData`, `keccak256` — for building agent payloads |

Don't introduce `web3.js`, `wagmi`, alternative LLM SDKs, or other Telegram libraries without explicit decision.

## Configuration

- All env vars loaded via `src/config.ts` — single source of truth
- Required env vars defined in `.env.example` with comments
- No `process.env.XXX` outside `config.ts`
- Network selection via `MEMOGENT_NETWORK=testnet|mainnet` (default `testnet`)

## Forbidden

- ❌ `console.log` in production paths (use logger)
- ❌ Synchronous filesystem ops in request paths (`fs.readFileSync` only in startup)
- ❌ Hard-coded contract addresses in source — pull from `config.ts`
- ❌ `eval`, `Function()` constructors, or dynamic `require`
- ❌ Mixing CJS and ESM (this project is ESM only)
