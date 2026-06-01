<div align="center">

<img src="./frontend/public/Assets/Images/Logo-Brand/memogent-logo.png" width="60" alt="Memogent Logo">

# Memogent

**Autonomous digital inheritance on Somnia.**
**An LLM agent decides when you've gone silent — verified by validator consensus on-chain.**
**A Reactivity precompile fires execution at the deadline — even if the AI hesitates.**

[![Somnia Testnet](https://img.shields.io/badge/Somnia-Testnet-7C3AED)](https://shannon-explorer.somnia.network)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.28-363636)](https://soliditylang.org)
[![Foundry](https://img.shields.io/badge/Foundry-Forge-orange)](https://book.getfoundry.sh)
[![Next.js](https://img.shields.io/badge/Frontend-Next.js%2016-black)](https://nextjs.org)
[![Somnia Agent Platform](https://img.shields.io/badge/Somnia-Agent%20Platform-7C3AED)](https://shannon-explorer.somnia.network/address/0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

</div>

---

## What is Memogent?

**Memogent** is an autonomous digital inheritance protocol on Somnia. It builds on lessons from an earlier Reactivity-only inheritance prototype — which proved that Somnia's Reactivity precompile alone could autonomously transfer assets at a deadline — and layers an on-chain LLM agent on top.

A user registers a will, names a beneficiary, deposits assets, and (optionally) attaches an AES-256-GCM encrypted Time Capsule. Memogent then runs two autonomous systems in parallel:

1. **An on-chain AI guardian.** An off-chain Worker periodically collects three liveness signals (on-chain check-in age, wallet transaction age, Telegram presence) and dispatches them to the `MemogentAgent` contract. The contract bundles the signals with a hard-coded system prompt and forwards the request to **Somnia Agent Platform**, where three validators run the LLM independently, vote consensus, sign the verdict, and write it back on-chain. The verdict is one of `SAFE`, `WATCH`, `GRACE`, or `EXECUTE`.

2. **A Reactivity precompile fail-safe.** A `Schedule` subscription created at `registerWill()` time. At the deadline timestamp, the precompile fires `onEvent()` on `MemogentCore` autonomously — no Worker, no Telegram, no server required.

If the AI escalates to `EXECUTE`, inheritance can fire early. If the AI stays conservative, the precompile fires at the deadline regardless. Two layers of autonomy; no human in the loop.

When inheritance fires, Memogent additionally:
- Calls the LLM a second time (via `inferChat`) to generate a short personalized **AI farewell message** on-chain.
- Sends Telegram notifications to both owner and beneficiary through a grammY bot.
- Unlocks the Time Capsule for beneficiary decryption — ciphertext on IPFS, AES key gated behind a smart-contract access check.

---

## Problem

| Problem | Description |
|---------|-------------|
| **Single-mechanism inheritance is brittle** | Reactivity-only, multisig-with-timer, and similar designs use one trigger. A bug in that trigger = total loss of execution. |
| **Pure-timer inheritance is dumb** | A naive timer can't distinguish "user is genuinely gone" from "user is on vacation." It fires the moment the clock hits zero. |
| **Off-chain AI inheritance is opaque** | If you put a model behind an API, the heir can't verify why it decided "execute." There is no trail. |
| **No emotional bridge** | Most inheritance protocols transfer assets and call it done. The heir gets cold value, not closure. |

---

## Solution

| Solution | How |
|----------|-----|
| **Dual-layer autonomy** | An LLM agent for nuance + a Reactivity precompile for certainty. If either fails, the other still executes the will. |
| **Validator-signed AI decisions** | LLM runs across three Somnia validators with consensus. Verdict and prompt are both on-chain and auditable. |
| **Multi-signal reasoning** | Worker aggregates three liveness signals (on-chain check-in age, wallet tx age, Telegram presence). LLM weighs them together — a wallet that's silent on-chain but active in Telegram is treated differently from a wallet that's silent everywhere. |
| **AI-written farewell on-chain** | A second LLM call (`inferChat`) generates a short personalized note to the beneficiary the instant the will executes — composed by validator consensus, not a template. |
| **Time Capsule** | AES-256-GCM encrypted private message stored on IPFS. AES key locked behind a smart-contract access check. Decrypted in the beneficiary's browser. |

---

## Key Features

| Feature | Description |
|---------|-------------|
| Validator-signed LLM verdicts | `assessRiskWithContext` → `inferString` → 3-of-3 Somnia validators → consensus → on-chain `latestAssessment` |
| Hard-coded system prompts | Both `SYSTEM_PROMPT` (risk classifier) and `EMPATHY_SYSTEM_PROMPT` (farewell writer) are immutable contract constants — anyone can audit them on Shannon Explorer |
| Reactivity precompile fail-safe | `Schedule` subscription fires `onEvent()` at the deadline regardless of AI verdict — single-tx execution, validator-driven |
| AI farewell on-chain | After `WillExecuted`, listener auto-dispatches `generateEmpathyMessage()` → `inferChat` → on-chain `empathyMessages[user]` |
| AES-256-GCM Time Capsule | Ciphertext on IPFS via Pinata; AES key released only after will executes; decrypted in beneficiary's browser |
| Telegram delivery | grammY bot DMs owner (risk escalations, will-executed) and beneficiary (inheritance triggered, AI farewell) |
| Multi-asset vault | STT (native), ERC-20 (BTC/USDC/USDT mocks deployed for demo), ERC-721 NFTs |
| Multi-signal monitoring | Off-chain Worker pulls 3 signals: on-chain check-in age, wallet last-tx age (Shannon Explorer), Telegram last-seen (Supabase) |
| Verifiable beneficiary onboarding | SIWE invite link (single-use, 24h TTL) → beneficiary `/start` binds wallet to Telegram chat |
| On-chain history | `getCheckInHistory()` and `getVaultHistory()` — no external indexer needed |

---

## Somnia Integration

Memogent uses two Somnia primitives in concert. Here are the integration points across the codebase.

### Somnia Agent Platform (LLM consensus)

| Layer | File | Description |
|-------|------|-------------|
| **System prompts** | [sc/src/agent/MemogentAgent.sol](./sc/src/agent/MemogentAgent.sol) | `SYSTEM_PROMPT` (risk classifier) and `EMPATHY_SYSTEM_PROMPT` (farewell writer) — both hard-coded contract constants |
| **Risk dispatch** | [sc/src/agent/MemogentAgent.sol](./sc/src/agent/MemogentAgent.sol) → `_dispatchAssess` | Bundles prompt + signals + allowed values, calls `platform.createRequest(LLM_AGENT_ID, ..., inferString.selector, ...)` |
| **Empathy dispatch** | [sc/src/agent/MemogentAgent.sol](./sc/src/agent/MemogentAgent.sol) → `generateEmpathyMessage` | Calls `platform.createRequest(LLM_AGENT_ID, ..., inferChat.selector, ...)` after will execution |
| **Callback handler** | [sc/src/agent/MemogentAgent.sol](./sc/src/agent/MemogentAgent.sol) → `handleResponse` | Receives signed verdict from platform → writes `latestAssessment` / `empathyMessages` on-chain → emits `RiskDecision` / `EmpathyMessageGenerated` |
| **Agent platform constants** | [sc/src/libraries/SomniaAgentConstants.sol](./sc/src/libraries/SomniaAgentConstants.sol) | `AGENT_PLATFORM_TESTNET = 0x037B…6776`, `LLM_AGENT_ID = 12847…29384`, `LLM_PER_AGENT_PRICE = 0.07 ether` |
| **Off-chain dispatcher** | [agent/src/dispatcher/autoAssess.ts](./agent/src/dispatcher/autoAssess.ts) | Ticks every minute (configurable via env); calls `assessRiskWithContext` for any will whose per-will cooldown has elapsed |
| **Signal aggregator** | [agent/src/dispatcher/signalAggregator.ts](./agent/src/dispatcher/signalAggregator.ts) | Collects three liveness signals (on-chain via `getWillInfo`, wallet via Shannon Explorer REST, Telegram via Supabase `wallet_link`) |
| **Listener (chunked polling)** | [agent/src/listener/poller.ts](./agent/src/listener/poller.ts) | `EventPoller` class — wraps `eth_getLogs` in 999-block chunks to bypass Somnia's per-call cap; catches `AssessmentReceived`, `RiskDecision`, `EmpathyMessageGenerated`, etc. |

### Somnia Reactivity (deadline fail-safe)

| Layer | File | Description |
|-------|------|-------------|
| **Schedule subscription** | [sc/src/core/MemogentCore.sol](./sc/src/core/MemogentCore.sol) → `_createScheduleSubscription` | Calls `reactivityPrecompile.subscribe()` on every `registerWill()` and `checkIn()` with the deadline in milliseconds |
| **Event handler** | [sc/src/core/MemogentCore.sol](./sc/src/core/MemogentCore.sol) → `onEvent` | Called automatically by Somnia validators when deadline is reached. Looks up owner via `subscriptionIdToOwner` / `deadlineToOwner` (rounded), then executes inheritance |
| **AI-driven early execute** | [sc/src/core/MemogentCore.sol](./sc/src/core/MemogentCore.sol) → `executeFromAgent` | Restricted to `agentAuthority`. Lets the LLM trigger inheritance before the deadline when the verdict is `EXECUTE` |
| **Inheritance transfer** | [sc/src/core/MemogentCore.sol](./sc/src/core/MemogentCore.sol) → `_executeInheritance` | Shared path called by both `onEvent` (precompile) and `executeFromAgent` (AI). Transfers STT + ERC-20 + ERC-721 to beneficiary, sets `executed = true`, emits `WillExecuted` |
| **Reactivity precompile** | [sc/src/libraries/SomniaExtensions.sol](./sc/src/libraries/SomniaExtensions.sol) | `SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS = 0x0000…0100` |

### Time Capsule (encrypted message)

| Layer | File | Description |
|-------|------|-------------|
| **Smart contract** | [sc/src/capsule/TimeCapsule.sol](./sc/src/capsule/TimeCapsule.sol) | Stores IPFS CID + content hash + AES key per owner. `getDecryptionKey()` gated by `core.getWillInfo(owner).beneficiary == msg.sender` and `executed == true` |
| **In-browser encrypt** | [frontend/src/components/pages/(main)/OnboardCapsulePage.tsx](./frontend/src/components/pages/(main)/OnboardCapsulePage.tsx) | Plaintext never leaves the browser — `crypto.subtle` AES-256-GCM, ciphertext uploaded to IPFS via Pinata, content hash + AES key written on-chain |
| **In-browser decrypt** | [frontend/src/components/pages/(main)/ClaimPage.tsx](./frontend/src/components/pages/(main)/ClaimPage.tsx) | Beneficiary calls `getDecryptionKey()`, fetches ciphertext from IPFS, decrypts locally |
| **Telegram fallback** | [agent/src/telegram/handlers/claimcapsule.ts](./agent/src/telegram/handlers/claimcapsule.ts) | `/claimcapsule <owner>` — bot decrypts on the beneficiary's behalf and sends the file as a Telegram document |

---

## How the Two Layers Work Together

Traditional inheritance protocols pick one trigger and live with its failure modes. Memogent runs two in parallel:

```
                              Off-chain
                                  │
       ┌─────────────────  Worker (ticks every 1 min)
       │                          │
       │   1. aggregateSignals(owner)
       │      ├─ on-chain check-in age (Core.getWillInfo)
       │      ├─ wallet last tx age   (Shannon Explorer REST)
       │      └─ telegram last-seen   (Supabase wallet_link)
       │                          │
       │   2. dispatchAssessRiskWithContext(owner, signals)
       ▼                          │
On-chain (Somnia testnet)         ▼
       │           ┌──────────────────────────────┐
       │           │ MemogentAgent contract       │
       │           │   _dispatchAssess(user, sig) │
       │           │     bundle prompt + signals  │
       │           │     platform.createRequest() │
       │           └──────────────┬───────────────┘
       │                          │
       │                          ▼
       │           ┌──────────────────────────────┐
       │           │ Somnia Agent Platform        │
       │           │   3-of-3 validator consensus │
       │           │   inferString → "WATCH" etc. │
       │           │   signs verdict on-chain     │
       │           └──────────────┬───────────────┘
       │                          │
       │                          ▼
       │           ┌──────────────────────────────┐
       │           │ MemogentAgent.handleResponse │
       │           │   latestAssessment[user] = … │
       │           │   emit RiskDecision          │
       │           │   if EXECUTE → core.execute… │
       │           └──────────────┬───────────────┘
       │                          │
       │             ┌────────────┴────────────┐
       │             │                         │
       │             ▼                         ▼
       │   AI EARLY EXECUTE              PRECOMPILE FALLBACK
       │   (LLM verdict "EXECUTE")       (deadline arrived)
       │             │                         │
       │             └────────────┬────────────┘
       │                          │
       │                          ▼
       │           ┌──────────────────────────────┐
       │           │ MemogentCore                 │
       │           │   _executeInheritance()      │
       │           │   transfer STT + ERC20 + NFT │
       │           │   emit WillExecuted          │
       │           └──────────────┬───────────────┘
       │                          │
       │                          ▼
       │           ┌──────────────────────────────┐
       │           │ Off-chain Worker (listener)  │
       │           │   onWillExecuted             │
       │           │     dispatchGenerateEmpathy  │
       │           │     notifyWillExecuted (TG)  │
       │           └──────────────┬───────────────┘
       │                          │
       │                          ▼
       │           ┌──────────────────────────────┐
       │           │ MemogentAgent                │
       │           │   generateEmpathyMessage     │
       │           │   inferChat → farewell text  │
       │           │   emit EmpathyMessageGenerated│
       │           └──────────────────────────────┘
       │
       │
   Beneficiary  ◀── three Telegram DMs ──── Worker (notifyEmpathyMessage)
                ◀── /claim/<owner> page ──── Frontend (reads on-chain)
                ◀── Time Capsule decrypt ─── crypto.subtle in-browser
```

The Worker is smart enough to know *when* to ask the AI. The AI is smart enough to reason across multiple signals. The precompile guarantees that none of this matters at the deadline — it fires either way.

---

## Will State Diagram

```
[Not Registered]
      ↓ registerWill()
      ↓
   [Active] ←── checkIn() ──→ [Active]  (deadline reset, new subscription)
      │
      ├── deactive() ──→ [Inactive]     (assets returned to owner)
      │
      ├── LLM verdict EXECUTE → core.executeFromAgent ──→ [Executed]
      │
      └── deadline reached → onEvent() (precompile) ────→ [Executed]
                                                              │
                                                              ▼
                              Worker dispatches generateEmpathyMessage
                                                              │
                                                              ▼
                              Beneficiary receives Telegram DMs + claim page
```

---

## AI Verdict Classes

| Classification | Trigger | Owner experience |
|---|---|---|
| `SAFE` | Signals fresh, low pct elapsed | No Telegram notification (silent) |
| `WATCH` | Mild inactivity | Telegram DM: *"Mild inactivity detected. No action needed yet, but please check in soon."* |
| `GRACE` | Moderate inactivity, deadline approaching | Telegram DM: *"Significant inactivity detected. Please confirm you're OK by sending any message."* |
| `EXECUTE` | Critical inactivity (AI's strongest signal) | Telegram DM: *"Critical inactivity. Your digital inheritance is about to be triggered."* + on-chain `core.executeFromAgent()` attempt |

The LLM is conservative by design — it weighs signals against `inactivityPct` and refuses to recommend execution without clear evidence. If it never says `EXECUTE`, the Reactivity precompile fires at the deadline anyway.

---

## Contract Functions

### `MemogentCore` — vault, will registry, precompile bridge

#### Write

| Function | Description |
|---|---|
| `registerWill(address beneficiary, uint256 inactivePeriodSec)` | Register a new will. Creates a `Schedule` subscription with the deadline in milliseconds. |
| `checkIn()` | Prove liveness. Cancels old subscription, creates a new one with reset deadline. |
| `depositSTT()` *payable* | Deposit native STT to vault. |
| `depositToken(address token, uint256 amount)` | Deposit ERC-20 (requires prior `approve`). |
| `depositNFT(address nftContract, uint256 tokenId)` | Deposit ERC-721 (requires prior `setApprovalForAll`). |
| `withdraw()` | Return all vault assets to owner. |
| `deactive()` | Deactivate will and return all assets to owner. |
| `updateBeneficiary(address newBeneficiary)` | Change beneficiary. |
| `updateInactiveperiod(uint256 newPeriodSec)` | Change inactive period; resets deadline. |
| `executeFromAgent(address willOwner)` | Restricted to `agentAuthority`. Lets the LLM trigger inheritance early when verdict is `EXECUTE`. |
| `setAgentAuthority(address agent)` | One-shot wiring of the `MemogentAgent` contract. |
| `onEvent(uint256 subscriptionId, bytes32[] eventTopics, bytes eventData)` | Callback invoked by Somnia Reactivity precompile at the deadline. |

#### Read

| Function | Returns |
|---|---|
| `getWillInfo(address owner)` | `beneficiary, lastCheckIn, inactivePeriod, deadlineTimestamp, executed, active` |
| `getStatus(address owner)` | `"Active"` / `"Warning"` / `"Inactive"` |
| `vaultSTT(address owner)` | STT balance in vault (wei) |
| `getCheckInHistory(address owner)` | `{ timestamp, blockNumber }[]` |
| `getVaultHistory(address owner)` | `{ actType, asset, amount, timestamp, blockNumber }[]` |

### `MemogentAgent` — LLM dispatcher + callback

#### Write

| Function | Description |
|---|---|
| `assessRisk(address user)` *payable* | Dispatch risk assessment (no extra context). Used by manual triggers. |
| `assessRiskWithContext(address user, string extraSignals)` *payable* | Dispatch risk assessment with off-chain context string. Used by the autoAssess loop. |
| `generateEmpathyMessage(address user)` *payable* | After `WillExecuted`, dispatch farewell generation via `inferChat`. One-shot per user. |
| `handleResponse(uint256 requestId, Response[] responses, ResponseStatus status, Request details)` | Callback from `platform`. Decodes verdict, stores it, emits `RiskDecision` / `EmpathyMessageGenerated`. |

#### Read

| Function | Returns |
|---|---|
| `latestAssessment(address user)` | `(classification, assessedAt, requestId)` |
| `empathyMessages(address user)` | LLM-generated farewell string (empty until executed) |
| `lastAssessmentRequestAt(address user)` | Timestamp of last dispatch (used for `ASSESSMENT_COOLDOWN` check) |
| `SYSTEM_PROMPT()` | Public constant — the on-chain prompt the LLM is given for risk classification |
| `EMPATHY_SYSTEM_PROMPT()` | Public constant — the on-chain prompt the LLM is given for farewell writing |

### `TimeCapsule` — encrypted message store

| Function | Description |
|---|---|
| `attachCapsule(string cid, bytes32 contentHash, bytes32 aesKey)` | Owner stores IPFS CID, content hash, and AES key. |
| `getCapsule(address owner)` | Returns `(cid, contentHash, attachedAt)`. |
| `getDecryptionKey(address owner)` | Returns AES key. Gated by `msg.sender == beneficiary && executed == true`. |
| `hasCapsule(address owner)` / `isReleased(address owner)` | Boolean accessors used by the FE. |

### Vault Activity Types (`actType`)

| Value | Action |
|---|---|
| `0` | Deposit STT |
| `1` | Deposit ERC-20 token |
| `2` | Deposit NFT |
| `3` | Withdraw STT |
| `4` | Withdraw ERC-20 token |
| `5` | Withdraw NFT |

---

## Deployed Contracts (Somnia Testnet)

| Contract | Address | Notes |
|---|---|---|
| MemogentCore | [0x01b35186AA48d2feE071BAF36b83640660A5A6DC](https://shannon-explorer.somnia.network/address/0x01b35186AA48d2feE071BAF36b83640660A5A6DC) | Vault, will registry, Reactivity subscriber |
| MemogentAgent | [0xeFDe02B79ec2b7949689B600EC63858f8e17bc69](https://shannon-explorer.somnia.network/address/0xeFDe02B79ec2b7949689B600EC63858f8e17bc69) | LLM dispatcher; `ASSESSMENT_COOLDOWN = 1 minute` (demo-tuned — see Technical Notes) |
| TimeCapsule | [0xcB1Aa02A9B97e224403E650808776c87c22197Ec](https://shannon-explorer.somnia.network/address/0xcB1Aa02A9B97e224403E650808776c87c22197Ec) | Encrypted message store |
| Somnia Agent Platform | [0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776](https://shannon-explorer.somnia.network/address/0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776) | Testnet LLM inference contract |
| Somnia Reactivity Precompile | `0x0000000000000000000000000000000000000100` | Native chain primitive |

---

## Network Configuration

```
Network Name : Somnia Testnet
RPC URL      : https://api.infra.testnet.somnia.network/
Chain ID     : 50312
Symbol       : STT
Explorer     : https://shannon-explorer.somnia.network
```

---

## Project Structure

```
memogent/
├── sc/                              Foundry workspace (Solidity 0.8.28)
│   ├── src/
│   │   ├── core/MemogentCore.sol            Vault + will registry + Reactivity bridge
│   │   ├── agent/MemogentAgent.sol          LLM dispatcher + callback handler
│   │   ├── capsule/TimeCapsule.sol          Encrypted message store
│   │   ├── libraries/                       SomniaExtensions, SomniaAgentConstants, SafeTransfer
│   │   └── interfaces/                      ISomniaReactivityPrecompile, ISomniaAgentPlatform, IAgentCallback, ILLMAgent
│   ├── script/Deploy.s.sol                  Forge deploy script (Core + Agent + setAgentAuthority)
│   └── test/                                Foundry unit + E2E tests
│
├── agent/                           Off-chain Worker (Node 20 + TypeScript)
│   ├── src/
│   │   ├── dispatcher/
│   │   │   ├── autoAssess.ts                Periodic tick → shouldAssess → dispatch
│   │   │   ├── signalAggregator.ts          3-signal collector (Core / Shannon Explorer / Supabase)
│   │   │   └── agentWriter.ts               Sends assessRiskWithContext + generateEmpathyMessage tx
│   │   ├── listener/
│   │   │   ├── poller.ts                    Chunked EventPoller (999-block windows, Somnia-safe)
│   │   │   ├── handlers.ts                  WillRegistered / RiskDecision / WillExecuted / Empathy
│   │   │   └── willAssets.ts                Asset-summary builder for Telegram DMs
│   │   ├── telegram/                        grammY bot (handlers + dispatcher)
│   │   ├── db/                              Supabase repos (wallet_link, link_token, tracked_will, checkin)
│   │   └── cli/                             Operational CLI entrypoints
│   └── scripts/                             Dev tools (unbind-all, clear-tracked-wills, inspect, check-events, E2E tests)
│
├── frontend/                        Next.js 16 (App Router) + wagmi v2 + viem + RainbowKit
│   └── src/
│       ├── app/                             Routes: /onboard/*, /dashboard, /claim/[owner], /history, /audit/[user]
│       ├── components/pages/                Dashboard, Claim, Onboard, Audit, History (Bima's design system)
│       ├── lib/
│       │   ├── willAssets.ts                Computes delivered assets + finds WillExecuted tx (chunked search)
│       │   ├── agentActivity.ts             Reads latestAssessment + empathy + finds AssessmentReceived / EmpathyMessageGenerated tx
│       │   └── somniaLogs.ts                findLatestLog helper — chunked backward log search (Somnia 1000-block cap)
│       └── abi/                             Generated ABIs (MemogentCore, MemogentAgent, TimeCapsule)
│
├── docs/                            Demo guide + flow doc + teaser script
├── skill/                           Claude Code skill bundles (foundry / somnia / telegram)
├── reference/                       Earlier Reactivity-only prototype — preserved for diffing
└── README.md
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Blockchain | Somnia Testnet (Chain ID 50312) |
| Smart Contracts | Solidity 0.8.28 + Foundry (Forge / Cast) |
| LLM | Somnia Agent Platform — `inferString` (risk) + `inferChat` (empathy), 3-of-3 validator consensus |
| Time-based execution | Somnia Reactivity precompile (`Schedule` subscription, `0x0000…0100`) |
| Off-chain runtime | Node 20 + TypeScript on Railway (24/7 polling Worker + grammY bot + event listener) |
| Database | Supabase (Postgres) — `wallet_link`, `link_token`, `tracked_will`, `checkin` |
| Storage | IPFS via Pinata (Time Capsule ciphertext) |
| Cryptography | AES-256-GCM in-browser via `crypto.subtle` (Time Capsule encrypt/decrypt) |
| Authentication | SIWE (EIP-4361) for Telegram invite binding |
| Frontend | Next.js 16 (App Router, Turbopack) + React 19 + wagmi v2 + viem + RainbowKit |
| Token support | STT (native), ERC-20 (BTC / USDC / USDT mock deployments), ERC-721 |

---

## Quickstart

### Prerequisites

- Node 20+, pnpm
- Foundry (`curl -L https://foundry.paradigm.xyz | bash` then `foundryup`)
- A Somnia Testnet wallet with STT (get from the [Somnia faucet](https://testnet.somnia.network))

### 1. Smart contracts

```bash
cd sc
cp .env.example .env       # fill PRIVATE_KEY (deployer must hold ≥ 32 STT)
forge build
forge test                 # local unit tests against MockSomniaPrecompile
forge script script/Deploy.s.sol:DeployMemogent \
  --rpc-url $SOMNIA_RPC --broadcast --gas-estimate-multiplier 200
```

### 2. Off-chain Worker

```bash
cd agent
cp .env.example .env       # fill SUPABASE_*, TELEGRAM_BOT_TOKEN, SERVICE_PRIVATE_KEY, contract addresses
pnpm install
pnpm dev                   # tsx watch src/index.ts (listener + Worker + bot)
```

### 3. Frontend

```bash
cd frontend
pnpm install
pnpm dev                   # http://localhost:3000
```

---

## Technical Notes

### Operational requirement — 32 STT minimum on `MemogentCore`

The contract that owns the Reactivity subscription must hold ≥ 32 STT at all times. This is a holding requirement enforced by the Reactivity precompile, not a per-call deposit. If the balance drops below the threshold, subsequent `subscribe()` calls revert.

### LLM dispatch deposit math

```
LLM_PER_AGENT_PRICE      = 0.07 STT (per validator)
DEFAULT_SUBCOMMITTEE_SIZE = 3
DEPOSIT_BUFFER_PCT        = 30%

deposit ≈ platform.getRequestDeposit() + (0.07 × 3) × 1.30 ≈ 0.3 STT
Worker sends 0.4 STT as msg.value; excess is refunded.
```

### `ASSESSMENT_COOLDOWN` is currently demo-tuned

The deployed `MemogentAgent` has `ASSESSMENT_COOLDOWN = 1 minute` so that within a 20-minute demo window an LLM verdict can escalate multiple times. The production value is `1 hour` — see the comment on the constant in [sc/src/agent/MemogentAgent.sol](./sc/src/agent/MemogentAgent.sol). Off-chain, the Worker further throttles itself with `AUTO_ASSESS_COOLDOWN_MS` (3 min demo, 1 hour prod default).

### Somnia testnet `eth_getLogs` cap

Somnia testnet rejects `eth_getLogs` calls with a block range over 1000. Memogent works around this in two places:

- **Backend listener** ([agent/src/listener/poller.ts](./agent/src/listener/poller.ts)) — custom `EventPoller` that chunks the catch-up window into 999-block requests and tolerates transient RPC errors. Replaces ethers' built-in `contract.on()`, which silently breaks at scale on Somnia.
- **Frontend log search** ([frontend/src/lib/somniaLogs.ts](./frontend/src/lib/somniaLogs.ts)) — `findLatestLog` helper that walks backward from `latest` in 999-block chunks, used by the AI Activity card and Claim page to surface execution and verdict transactions.

### Why the Schedule subscription (vs BlockTick / EpochTick)

From the Somnia docs: *"The subscription to Schedule is one-off and will be deleted after triggering."*

| Event | Frequency | Right for Memogent? |
|---|---|---|
| `BlockTick` | every block (~10 Hz) | No — wasteful, fires constantly |
| `EpochTick` | every ~5 minutes | No — imprecise, can miss the deadline by minutes |
| `Schedule` | exactly at the chosen timestamp | **Yes** — one-off, precise, semantically correct |

---

## What Memogent adds over a Reactivity-only baseline

The vault, Schedule-subscription mechanism, and `onEvent` execution path follow the pattern of any straightforward Reactivity-based inheritance protocol. Memogent's contribution is the AI guardian layer on top:

| Capability | Reactivity-only baseline | Memogent |
|---|---|---|
| Autonomous on-chain execution | ✅ Reactivity precompile only | ✅ Reactivity precompile **plus** LLM-driven early execute |
| Owner liveness signal | On-chain check-in only | On-chain check-in + wallet last-tx + Telegram presence |
| Pre-execution warnings to owner | ❌ | ✅ Telegram DMs at WATCH / GRACE / EXECUTE |
| Beneficiary notifications | ❌ | ✅ Telegram DMs (asset breakdown + farewell + capsule pointer) |
| Personal message to heir | ❌ | ✅ Time Capsule (AES-256-GCM, IPFS, on-chain key gate) |
| AI-written farewell | ❌ | ✅ Generated on-chain by `inferChat`, validator-signed |
| Verifiable AI prompt | n/a | ✅ Hard-coded contract constants |

---

## License

MIT — see [LICENSE](./LICENSE).
