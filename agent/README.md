# agent/

Off-chain agent for Memogent — listens to on-chain events, runs a Telegram bot for activity tracking and beneficiary notifications, dispatches AI risk assessment requests.

## Stack

- **Runtime:** Node.js ≥ 20 + TypeScript 5 (ESM, strict)
- **Chain client:** ethers v6
- **Telegram:** grammY (NOT telegraf)
- **Database:** Supabase (hosted PostgreSQL, accessed via supabase-js)
- **IPFS (W3):** Lighthouse + Kavach
- **Logging:** pino with pino-pretty in dev

## Architecture

```
              ┌─────────────────────────────────────┐
              │           agent/src/index.ts         │
              └───────────┬─────────────────────────┘
                          │
            ┌─────────────┴──────────────┐
            │                            │
     ┌──────▼──────┐             ┌───────▼────────┐
     │  listener/  │             │  telegram/     │
     │  (events)   │             │  (bot + msgs)  │
     └──────┬──────┘             └───────┬────────┘
            │                            │
            └──────────┬─────────────────┘
                       │
                ┌──────▼──────┐
                │  db/        │
                │  Supabase   │
                └─────────────┘
```

- **listener/** — subscribes to `MemogentAgent.RiskDecision`, `MemogentCore.WillExecuted` etc. via ethers `contract.on()`. On event, calls into `telegram/dispatcher`.
- **telegram/** — grammY bot. Handles `/start <token>`, `/help`, `/status`, activity middleware (debounced last_seen_at writes), and outbound notifications.
- **db/** — Supabase client + typed repos per table.

## Tables (Supabase)

| Table | Purpose |
|---|---|
| `wallet_link` | bind wallet ↔ Telegram chat_id, track last seen |
| `link_token` | one-time tokens for SIWE wallet linking (10 min TTL) |
| `checkin` | history of "are you alive?" prompts + responses |
| `blocked_chat` | users who blocked the bot |

Schema: [src/db/schema.sql](./src/db/schema.sql). Run once in Supabase SQL Editor.

## Setup

### 1. Install deps

```bash
pnpm install
pnpm approve-builds   # approve esbuild (used by tsx + vitest)
```

### 2. Supabase

- Create project at https://supabase.com (Free tier OK)
- Settings → API Keys → copy **service_role** (legacy JWT) for `SUPABASE_SERVICE_ROLE_KEY`
- SQL Editor → paste [src/db/schema.sql](./src/db/schema.sql) → Run

### 3. Telegram bot

- Open [@BotFather](https://t.me/BotFather) on Telegram → `/newbot` → follow prompts
- Copy the HTTP API token → `TELEGRAM_BOT_TOKEN` in `.env`

### 4. .env

```bash
cp .env.example .env
nano .env
```

Required at minimum: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

Optional (fills in as you go): `TELEGRAM_BOT_TOKEN`, `MEMOGENT_CORE_ADDRESS`, `MEMOGENT_AGENT_ADDRESS`, `SERVICE_PRIVATE_KEY`.

### 5. Run

```bash
pnpm dev
```

The agent will boot with whatever pieces are configured. Missing pieces are logged as `WARN` and skipped (e.g. listener disabled if contracts not deployed).

## CLI: issue a link token

To link a wallet to a Telegram chat without the FE (for local testing):

```bash
pnpm issue-token 0x1234...abcd
```

Output:
```
Wallet:  0x1234...abcd
Token:   link_abc123def456...
TTL:     10 minutes
https://t.me/<BOT_USERNAME>?start=link_abc123def456...
```

Open the URL in Telegram → bot says "Wallet linked". Send any message to verify activity middleware updates `last_seen_at`.

## Commands

| Command | Description |
|---|---|
| `pnpm dev` | Run agent with hot reload |
| `pnpm build` | Compile TS to `dist/` |
| `pnpm start` | Run compiled output (production) |
| `pnpm typecheck` | Verify TS types without emitting |
| `pnpm test` | Run vitest tests |
| `pnpm issue-token <addr>` | Issue a link token (10 min TTL) |

## File layout

```
src/
├── index.ts                  entrypoint
├── config.ts                 env loading
├── logger.ts                 pino logger
├── cli/
│   └── issue-token.ts        CLI: issue link token
├── db/
│   ├── schema.sql            run in Supabase SQL editor
│   ├── supabase.ts           typed client (service_role)
│   ├── types.ts              TS types matching tables
│   └── repos/                one repo per table
│       ├── walletLink.ts
│       ├── linkToken.ts
│       ├── checkin.ts
│       ├── blockedChat.ts
│       └── index.ts          barrel
├── listener/
│   ├── abi.ts                event signatures
│   ├── handlers.ts           per-event handlers
│   └── index.ts              create/start listener
└── telegram/
    ├── bot.ts                grammy Bot + safeSend
    ├── dispatcher.ts         outbound notifications
    ├── middleware/
    │   └── activity.ts       debounced last_seen_at
    ├── handlers/
    │   ├── start.ts          /start <token>
    │   ├── help.ts           /help
    │   └── status.ts         /status
    └── index.ts              wire + start/stop
```

## See also

- [Project rules](./rules/) — TS conventions, signals, decisions, telegram, IPFS
- [Skill: telegram](../skill/telegram/skill.md) — grammY reference, rate limits
- [Skill: somnia](../skill/somnia/skill.md) — Reactivity precompile, Agent platform
- [docs/flow.md](../docs/flow.md) — end-to-end system flow
- [sc/](../sc/) — Solidity contracts (MemogentCore + MemogentAgent)
