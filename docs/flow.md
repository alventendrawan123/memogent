# Memogent — End-to-End System Flow

Source of truth for what Memogent does, how the parts wire together, and what's actually deployed.

> Updated 2026-05-25 after milestone `b18e49a` (security polish). Reflects live testnet deployment with full Time Capsule + AI Empathy + autonomous trigger pipeline working end-to-end.

---

## TL;DR

**Memogent is an autonomous digital legacy guardian on Somnia.** A user registers a will once and walks away. Off-chain, an agent service tracks the will, periodically dispatches AI risk assessments to the Somnia Agent Platform, and the inheritance fires automatically at the deadline via Reactivity precompile. After execution, a second LLM call generates a personalized farewell from the deceased to the beneficiary, and an encrypted Time Capsule (uploaded earlier by the owner) is unlocked for the beneficiary to decrypt via on-chain access control.

**What makes it agent-native (not "scheduled automation"):**
- Periodic risk classification by LLM consensus (`inferString`) before deadline
- LLM-generated empathy message after execution (`inferChat`)
- Multi-signal context aggregation (on-chain checkIn + wallet activity + Telegram presence)
- All AI decisions backed by validator consensus (3-of-3 subcommittee) with receipts on Shannon Explorer

**The user only does TWO actions ever:**
1. `registerWill(beneficiary, inactivePeriodSec)` — once
2. `checkIn()` — periodically (to push the deadline back)

Everything else (assessments, classification, execution, empathy, capsule delivery) is autonomous.

---

## 1. Components — what's deployed and what runs

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ON-CHAIN (Somnia Testnet, chain 50312)                                  │
│                                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                   │
│  │ MemogentCore │  │ MemogentAgent│  │ TimeCapsule  │                   │
│  │              │  │   (V1 → V3)  │  │              │                   │
│  │ - will state │  │ - assessments│  │ - cid + hash │                   │
│  │ - vault      │  │ - empathy    │  │ - AES key    │                   │
│  │ - reactivity │  │ - classification│ │ - access gate│                  │
│  │ - executor   │  │ - dispatches │  │              │                   │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                   │
│         │                 │                  │                           │
│  ┌──────┴─────────────────┴──────────────────┴──────────────────────┐   │
│  │  Somnia Reactivity Precompile (0x0000000000000000000000000000000000000100)│
│  │  - subscribe(SubscriptionData) returns subscriptionId               │
│  │  - fires onEvent() at scheduled deadline (no keeper needed)        │
│  └────────────────────────────────────────────────────────────────────┘   │
│                            ▲                                              │
│                            │ async createRequest → handleResponse        │
│  ┌─────────────────────────┴──────────────────────────────────────────┐  │
│  │  Somnia Agent Platform (0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776)│  │
│  │    LLM Inference agent (ID 12847293847561029384)                   │  │
│  │      - inferString → classification ["SAFE"|"WATCH"|"GRACE"|"EXECUTE"]│
│  │      - inferChat   → empathy message (free-form text)              │  │
│  │    (JSON API agent — planned W4 for explorer-level wallet activity)│  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
                            ▲
                            │ ethers v6 listener + write
┌───────────────────────────┴──────────────────────────────────────────────┐
│  OFF-CHAIN (TypeScript, Node 20, ESM, strict)                            │
│                                                                          │
│  ┌────────────────┐  ┌──────────────┐  ┌──────────────────────────────┐ │
│  │ Event Listener │  │ Dispatcher   │  │ Telegram Bot (grammY)        │ │
│  │                │  │              │  │                              │ │
│  │ subscribes to: │  │ - autoAssess │  │ - /start link_<token>        │ │
│  │ - WillRegistered  │   loop (5min)│  │ - /status, /help             │ │
│  │ - WillExecuted │  │ - dispatch   │  │ - activity middleware        │ │
│  │ - RiskDecision │  │   assessRisk │  │   (debounced 60s)            │ │
│  │ - Empathy*     │  │ - dispatch   │  │ - safeSend wrapper           │ │
│  │ - CapsuleAttached │   generateEmpathy│ - block detection (403)     │ │
│  └────────┬───────┘  └──────┬───────┘  └──────────────┬───────────────┘ │
│           │                 │                          │                 │
│  ┌────────┴─────────────────┴──────────────────────────┴───────────────┐ │
│  │ Signal Aggregator (composed before each assessRiskWithContext call)│ │
│  │  1. on-chain checkIn age (hours) ← Core.getWillInfo                │ │
│  │  2. wallet last-tx age (hours)   ← Shannon Explorer REST           │ │
│  │  3. Telegram last-seen age (min) ← Supabase wallet_link            │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                            │                                             │
│  ┌─────────────────────────┴───────────────────────────────────────────┐│
│  │ Supabase (hosted PostgreSQL, service_role server-side)              ││
│  │  tables: wallet_link, link_token, checkin, blocked_chat, tracked_will││
│  └─────────────────────────────────────────────────────────────────────┘│
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ CLI tools (tsx)                                                    │ │
│  │  - issue-token <wallet> : generate Telegram link token             │ │
│  │  - capsule-upload <file>: AES + Pinata + on-chain attach           │ │
│  │  - capsule-claim <owner>: query chain + Pinata fetch + AES decrypt │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
                            ▲
                            │
┌───────────────────────────┴──────────────────────────────────────────────┐
│  USER-FACING (Bima's domain — Next.js)                                   │
│  Wallet connect • dashboard • capsule UI • beneficiary claim             │
│  See: frontend/rules/bima-guide.md                                       │
└──────────────────────────────────────────────────────────────────────────┘
```

### Live deployed addresses (Somnia Testnet, chain 50312)

| Contract | Address | Status |
|---|---|---|
| MemogentCore | `0x01b35186AA48d2feE071BAF36b83640660A5A6DC` | verified |
| MemogentAgent V1 (has `executeFromAgent` authority) | `0x6C3AB5fC3a7dC664b836762fBb162c9A59fD3803` | verified |
| MemogentAgent V2 (multi-signal) | `0xC00de2cAeFdD9895d0c2513523dCF6E5A1300c10` | verified |
| **MemogentAgent V3 (multi-signal + empathy) — ACTIVE** | `0x20b6af8924fdA1e3Ba49aeEFfE83029aC35D8867` | verified |
| TimeCapsule | `0x15054710dE55813Db967d85fb5B09DcfDF36c9b6` | verified |
| ERC20Mock (test) | `0x83699CDCb35B5442904D9c45cD4973E734de69aD` | — |
| ERC721Mock (test) | `0xe7095E235c10165Ec04a8b9d28Fc4d0b37392779` | — |

**Why three Agent versions?** `MemogentCore.setAgentAuthority` is one-shot — once set, it cannot change. V1 holds the authority to call `executeFromAgent` (privileged path). V2 added multi-signal context. V3 added LLM-generated empathy. V3 wraps `core.executeFromAgent` in `try/catch` — when its classification says EXECUTE, it asks Core to execute; Core rejects (V3 isn't the authority) and V3 emits `ExecutionRejectedByCore`. **Reactivity remains the deterministic execution path at deadline regardless of which Agent version is active.** This is by design: Agents are reasoning layers; Reactivity is the always-on safety net.

### Off-chain stack (decisions locked)

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node 20 + TypeScript 5 (ESM, strict) | Modern, matches Somnia Agent Kit |
| Chain client | ethers v6 with `staticNetwork` Network | Avoids Somnia RPC's slow `eth_chainId` first-call timeout |
| Telegram lib | **grammY** | Bot API 9.6+, telegraf is stale since Feb 2024 |
| Database | **Supabase (hosted PostgreSQL)** | Bima FE can query same tables via supabase-js with RLS; ephemeral agent servers (no persistent volume needed) |
| IPFS | **Pinata** (free 1GB tier) | Lighthouse Kavach encryption nodes unreachable from Indonesian ISP (`node.lighthouse.storage` blocked) |
| Encryption | **Node native AES-256-GCM** | Local encrypt before upload; key stored on-chain behind beneficiary+executed access gate |
| Logger | pino + pino-pretty (dev) | Structured JSON logs |

---

## 2. Smart contract layer — function-level reference

### 2.1 MemogentCore (`0x01b3...A6DC`)

State:
```solidity
struct Will {
    address owner;
    address beneficiary;
    uint256 lastCheckIn;
    uint256 inactivePeriod;
    uint256 deadlineTimestamp;     // ms (Reactivity precompile expects ms)
    bool executed;
    bool active;
    uint256 subscriptionId;        // Reactivity subscription
}

mapping(address => Will) public wills;
mapping(address => uint256) public vaultSTT;
mapping(address => TokenAsset[]) public vaultTokens;
mapping(address => NFTAsset[]) public vaultNFTs;
mapping(uint256 => address) public subscriptionIdToOwner;
mapping(uint256 => address) public deadlineToOwner;   // fallback lookup (dual-mapping)

address public immutable deployer;
address public agentAuthority;    // set ONCE via setAgentAuthority
ISomniaReactivityPrecompile public immutable reactivityPrecompile;
```

User-facing writes (all `nonReentrant` after polish `b18e49a`):
| Function | Effect |
|---|---|
| `registerWill(beneficiary, inactivePeriodSec)` | Create will, subscribe to Reactivity Schedule event at `(now + period) * 1000` ms |
| `checkIn()` | Reset `lastCheckIn = now`, subscribe NEW Reactivity event at new deadline, old subscription will silent-return when it fires (dual lookup falls through) |
| `depositSTT() payable` | Adds `msg.value` to `vaultSTT[msg.sender]` |
| `depositToken(token, amount)` | `transferFrom` token to contract, append to `vaultTokens[msg.sender]` (uses `SafeTransfer`) |
| `depositNFT(nft, tokenId)` | `safeTransferFrom` NFT, append to `vaultNFTs[msg.sender]` |
| `withdraw()` | Owner pulls all assets back. Will stays active but vault is empty until next deposit |
| `updateBeneficiary(newBeneficiary)` | Change beneficiary (active will only) |
| `updateInactiveperiod(newPeriodSec)` | Resubscribe Reactivity at new deadline |
| `deactive()` | Mark will inactive (must withdraw first via `withdraw()` for assets back) |

Privileged writes:
| Function | Caller | Effect |
|---|---|---|
| `setAgentAuthority(agent)` | `deployer` only, once | Sets `agentAuthority`. Cannot change after |
| `executeFromAgent(willOwner)` | `agentAuthority` only | Calls internal `_executeInheritance` |
| `onEvent(subscriptionId, topics, data)` | Reactivity precompile | Resolves owner via dual-mapping, calls `_executeInheritance` |

Reads (all view):
| Function | Returns |
|---|---|
| `wills(user)` | full Will struct via auto-generated tuple |
| `getWillInfo(user)` | `(beneficiary, lastCheckIn, inactivePeriod, deadlineTimestamp, executed, active)` |
| `getStatus(user)` | `"Active"` \| `"Warning"` \| `"Inactive"` (computed from current block.timestamp vs deadline; status display only — execution is via Reactivity) |
| `vaultSTT(user)` | uint256 wei balance |
| `getCheckInHistory(user)` | `CheckInRecord[]` |
| `getVaultHistory(user)` | `VaultRecord[]` |

Events:
- `WillRegistered(owner indexed, beneficiary indexed, deadlineMs)`
- `CheckedIn(owner indexed, newDeadlineMs)`
- `DepositSTT(owner indexed, amount)`
- `DepositToken(owner indexed, token indexed, amount)`
- `DepositNFT(owner indexed, nftContract indexed, tokenId)`
- `Withdrawn(owner indexed, sttAmount)`
- `BeneficiaryUpdated(owner indexed, newBeneficiary indexed)`
- `WillDeactivates(owner indexed)`
- `WillExecuted(owner indexed, beneficiary indexed, executedAt)` — KEY event, fires both from `onEvent` (Reactivity) and `executeFromAgent` (AI) paths

Internal:
- `_executeInheritance(owner)`: drain STT to beneficiary, transfer all tokens (`SafeTransfer.safeTransfer`), transfer all NFTs (`safeTransferFrom`), mark `executed=true, active=false`, emit `WillExecuted`. Single source of truth — both `onEvent` and `executeFromAgent` route here.

### 2.2 MemogentAgent V3 (`0x20b6...8867`)

State:
```solidity
ISomniaAgentPlatform public immutable platform;
MemogentCore public immutable core;
address public immutable deployer;

mapping(uint256 => PendingAssessment) public pendingAssessments;  // requestId → user
mapping(address => RiskAssessment) public latestAssessment;        // user → last classification
mapping(address => uint256) public lastAssessmentRequestAt;        // cooldown tracker

mapping(uint256 => address) public pendingEmpathy;                 // requestId → user (empathy-only)
mapping(address => string) public empathyMessages;                 // user → LLM-generated farewell

string public constant SYSTEM_PROMPT = "...classifier prompt...";
string public constant EMPATHY_SYSTEM_PROMPT = "...empathy prompt...";
uint256 public constant ASSESSMENT_COOLDOWN = 1 hours;
```

Public writes:
| Function | Caller | Effect |
|---|---|---|
| `assessRisk(user) payable` | anyone, 0.4 STT | Dispatches LLM `inferString` with simple inactivity-% prompt |
| `assessRiskWithContext(user, extraSignals) payable` | anyone, 0.4 STT | Dispatches `inferString` with multi-signal context appended to prompt |
| `generateEmpathyMessage(user) payable` | anyone, 0.4 STT | After will executed, dispatches `inferChat` for farewell message. One-shot per user |
| `handleResponse(requestId, responses, status, details)` | Somnia Agent Platform only | Routes to `_handleEmpathyResponse` if requestId is in pendingEmpathy, else does assessment flow |

Cooldowns:
- Per-user, 1 hour between `assessRisk*` calls (prevents spam)
- Empathy is one-shot per executed will (`empathyMessages[user] != ""` blocks re-generation)

Read:
| Function | Returns |
|---|---|
| `latestAssessment(user)` | `(classification, assessedAt, requestId)` tuple |
| `empathyMessages(user)` | LLM-generated farewell string (empty if not yet generated) |
| `lastAssessmentRequestAt(user)` | timestamp for cooldown calc |
| `pendingAssessments(requestId)` | `(user, requestedAt)` for in-flight assessments |
| `pendingEmpathy(requestId)` | user address for in-flight empathy calls |
| `platform()`, `core()`, `deployer()` | immutable addresses |

Events:
- `AssessmentRequested(requestId indexed, user indexed, deposit)`
- `AssessmentRequestedWithContext(requestId indexed, user indexed, contextSummary)` — V2+ only
- `AssessmentReceived(requestId indexed, user indexed, classification)`
- `RiskDecision(user indexed, classification, timestamp)` — KEY UI event
- `ExecutionTriggered(user indexed)` — fires when classification == EXECUTE
- `ExecutionRejectedByCore(user indexed, reason)` — V3 only, expected since V3 isn't the authority
- `AssessmentFailed(requestId indexed, user indexed, status)`
- `EmpathyMessageRequested(requestId indexed, user indexed, deposit)` — V3 only
- `EmpathyMessageGenerated(user indexed, message)` — V3 only, KEY UI event
- `EmpathyMessageFailed(requestId indexed, user indexed, status)` — V3 only

Internal flow (`_dispatchAssess`):
1. Build prompt from `core.wills(user)` + `extraSignals` if provided
2. Encode `inferString` payload with allowed values `["SAFE","WATCH","GRACE","EXECUTE"]`
3. Compute deposit: `platform.getRequestDeposit() + perAgent*3 + 30% buffer` ≈ 0.30 STT
4. `platform.createRequest{value: deposit}` → returns requestId
5. Store `pendingAssessments[requestId] = (user, now)`
6. Emit `AssessmentRequested` + optional `AssessmentRequestedWithContext`
7. Refund excess STT to caller

`handleResponse` flow:
1. `require(msg.sender == platform)` — auth check
2. Lookup requestId in `pendingEmpathy` first; if hit, route to `_handleEmpathyResponse` and return
3. Otherwise look up `pendingAssessments`; delete (replay protection)
4. On `Failed` status → emit `AssessmentFailed` and return
5. Decode classification string from `responses[0].result`
6. Store in `latestAssessment[user]`, emit `AssessmentReceived` + `RiskDecision`
7. If classification == `"EXECUTE"`: emit `ExecutionTriggered`, try `core.executeFromAgent(user)` (V3 wraps in try/catch → emits `ExecutionRejectedByCore` on failure)

### 2.3 TimeCapsule (`0x1505...c9b6`)

State:
```solidity
IMemogentCore public immutable core;

struct Capsule {
    string cid;             // Pinata IPFS CID
    bytes32 contentHash;    // keccak256(plaintext) for integrity
    bytes encryptionKey;    // AES-256 key (32 bytes)
    uint256 attachedAt;
}

mapping(address => Capsule) private _capsules;
```

Writes:
| Function | Caller | Effect |
|---|---|---|
| `attachCapsule(cid, contentHash, encryptionKey)` | will owner, active will | Upserts capsule. Emits `CapsuleAttached`. Updating overwrites + emits `CapsuleUpdated` |
| `removeCapsule()` | will owner, will not yet executed | Deletes capsule. Emits `CapsuleRemoved` |

Reads:
| Function | Returns |
|---|---|
| `getCapsule(owner)` | `(cid, contentHash, attachedAt)` — encryption key NOT exposed |
| `getDecryptionKey(owner)` | `bytes` — only callable by beneficiary AND only if will executed (cross-contract check to `core.getWillInfo`) |
| `isReleased(owner)` | bool — true if will executed |
| `hasCapsule(owner)` | bool |

Access control:
- `attachCapsule` requires `active && !executed` (must be alive)
- `removeCapsule` requires `!executed` (privacy: revoke before death)
- `getDecryptionKey` requires `msg.sender == beneficiary` AND `executed == true`

**MVP limitation documented:** The AES key is stored in contract storage. Even though `_capsules` is private and `getDecryptionKey` is gated, the storage slot is readable via `eth_getStorageAt` — a determined attacker with the CID could decrypt early. Production would use Lit Protocol custom conditions (which Lighthouse Kavach wraps) for trustless time-locked encryption.

Events:
- `CapsuleAttached(owner indexed, beneficiary indexed, cid, contentHash)`
- `CapsuleUpdated(owner indexed, oldCid, newCid)`
- `CapsuleRemoved(owner indexed, cid)`

---

## 3. Off-chain agent layer

Lives in `agent/` (Node 20, TypeScript, ESM). Started with `pnpm dev` (development) or `pnpm start` (production after `pnpm build`).

### 3.1 Layout

```
agent/src/
├── index.ts                  entrypoint — wires listener, telegram, dispatcher
├── config.ts                 single source of truth for env (validated at startup)
├── logger.ts                 pino + pino-pretty
├── cli/
│   ├── issue-token.ts        pnpm issue-token <wallet>
│   ├── capsule-upload.ts     pnpm capsule-upload <file>
│   └── capsule-claim.ts      pnpm capsule-claim <owner> [output]
├── db/
│   ├── schema.sql            run once in Supabase SQL Editor
│   ├── supabase.ts           service_role typed client
│   ├── types.ts              WalletLink, LinkToken, Checkin, BlockedChat, TrackedWill + Database
│   └── repos/                one repo per table
├── listener/
│   ├── abi.ts                event signatures (MemogentCore + Agent + TimeCapsule)
│   ├── handlers.ts           per-event handlers
│   ├── capsuleClient.ts      read-only TimeCapsule queries
│   └── index.ts              ethers Contract.on() subscriptions
├── dispatcher/
│   ├── agentWriter.ts        Wallet-signed assessRisk + assessRiskWithContext + generateEmpathy
│   ├── signalAggregator.ts   3-source signal fetch (chain + explorer + telegram)
│   ├── autoAssess.ts         periodic loop (5min tick)
│   └── index.ts              create + start/stop
└── telegram/
    ├── bot.ts                grammY Bot + safeSend wrapper
    ├── dispatcher.ts         notifyRiskDecision + notifyWillExecuted + notifyEmpathyMessage
    ├── middleware/activity.ts  debounced last_seen_at writes
    ├── handlers/             /start, /help, /status
    └── index.ts              wire + bot.start() polling
```

### 3.2 Supabase tables

| Table | Purpose |
|---|---|
| `wallet_link` | wallet ↔ Telegram chat_id binding + last_seen_at |
| `link_token` | one-time SIWE-style tokens (10 min TTL) for wallet linking |
| `checkin` | history of bot-initiated "are you alive?" prompts + user responses |
| `blocked_chat` | users who blocked the bot (from `my_chat_member` event + 403 errors) |
| `tracked_will` | dispatcher state — populated by listener on `WillRegistered`, updated on `AssessmentRequested`/`RiskDecision`/`WillExecuted` |

### 3.3 Event subscriptions

| Event | Source | Handler action |
|---|---|---|
| `WillRegistered` | Core | upsert `tracked_will`; log |
| `WillExecuted` | Core | `tracked_will.markExecuted`; fetch capsule; notify Telegram; **trigger `dispatchGenerateEmpathy`** |
| `AssessmentRequested` | Agent V3 | update `tracked_will.last_assessed_at_ms` |
| `RiskDecision` | Agent V3 | update `tracked_will.last_classification`; notify Telegram if not SAFE |
| `ExecutionTriggered` | Agent V3 | log warn |
| `EmpathyMessageGenerated` | Agent V3 | look up beneficiary in tracked_will; safeSend message to Telegram chat |
| `CapsuleAttached` | TimeCapsule | log info |

### 3.4 Autonomous assess loop

Runs every `TICK_INTERVAL_MS` (default 5 min, configurable):

```
for each tracked_will where active == true:
  if now >= deadline_ms:      skip (Reactivity will fire)
  if (now - last_assessed_at_ms) < 1 hour: skip (cooldown)

  signals = aggregateSignals(owner):
    - on-chain checkIn age (hours)  ← core.getWillInfo
    - wallet last-tx age (hours)    ← shannon-explorer REST
    - Telegram last-seen age (min)  ← supabase wallet_link

  context = signalsToString(signals)  
           = "checkInAgeHours=X; walletTxAgeHours=Y; tgLastSeenMin=Z"

  dispatchAssessRiskWithContext(owner, context)
    → agent.assessRiskWithContext{value: 0.4 STT}
    → builds prompt + dispatches to Somnia LLM agent
```

### 3.5 Signal aggregator detail

```typescript
async function aggregateSignals(user) {
  return {
    onChainCheckInAgeHours: /* Math.floor((now/1000 - lastCheckIn) / 3600) */,
    walletLastTxAgeHours: /* from https://shannon-explorer.somnia.network/api/v2/addresses/{user}/transactions?limit=1 */,
    telegramLastSeenAgeMin: /* from Supabase wallet_link.last_seen_at */
  };
}
```

Each signal degrades gracefully: missing → `null` (omitted from context) or `"unlinked"` (Telegram). The LLM sees whatever's available.

### 3.6 Telegram bot

- Username: `@memogent_v1_bot`
- Commands: `/start [link_<token>]`, `/help`, `/status`
- Activity middleware: debounced last_seen_at update (max 1 write per 60s per chat)
- Block detection: `my_chat_member` event + 403 on outbound → upsert `blocked_chat`
- `safeSend(chatId, text, opts?)`: try/catch around `bot.api.sendMessage`, marks chat as blocked on 403, logs 400 (user never started bot)

Notification triggers:
| Trigger | Recipient | Message |
|---|---|---|
| `RiskDecision != SAFE` | linked owner | "📋/⚠️/🚨 Wallet X risk: {WATCH\|GRACE\|EXECUTE}..." |
| `WillExecuted` | linked owner + linked beneficiary | "Your will has been executed..." / "You have been named beneficiary by..." (+ capsule CID if attached) |
| `EmpathyMessageGenerated` | linked beneficiary | "💌 A final note from {owner}: _<message>_ (Generated by Memogent AI via Somnia LLM consensus)" |

---

## 4. User journeys

### 4.1 Owner onboarding (5 minutes, mostly setup once)

```
1. Connect wallet (Bima FE — Somnia chain 50312)
2. registerWill(beneficiary, inactivePeriodSec)
   → Core subscribes Reactivity Schedule event at deadline
   → off-chain listener catches WillRegistered → inserts tracked_will row
   → autoAssess loop will pick it up on next 5-min tick
3. depositSTT() + optional depositToken/depositNFT
4. (Optional) Link Telegram:
   → FE issues SIWE message → user signs
   → Backend verifies sig, creates link_token (10min TTL)
   → User opens https://t.me/memogent_v1_bot?start=link_<token>
   → Bot upserts wallet_link with chat_id
5. (Optional) Upload Time Capsule:
   → User picks file in FE OR runs `pnpm capsule-upload <file>` from agent CLI
   → AES-256-GCM encrypt locally
   → Upload ciphertext to Pinata IPFS → CID
   → TimeCapsule.attachCapsule(cid, hash, key)
```

### 4.2 Active state (zero-touch)

```
- Reactivity Schedule sits idle until deadline
- Off-chain autoAssess loop (5min tick):
  → reads tracked_will from Supabase
  → for each active will: aggregate signals, call agent.assessRiskWithContext
  → respects 1-hour cooldown per user
- LLM responds in 5-30 seconds with classification
- If not SAFE: bot pings linked owner
- User responds to bot OR clicks check-in on FE OR sends any on-chain tx:
  → signals refresh on next assessment cycle
  → LLM sees recent activity → classification stays SAFE
```

### 4.3 Inactivity → execution (the moment that matters)

```
At deadline (deterministic):
  Reactivity precompile fires Schedule event
  → Core.onEvent(subscriptionId, topics, data)
  → resolves owner via subscriptionIdToOwner (or fallback deadlineToOwner)
  → _executeInheritance(owner):
      • Transfer all vault STT to beneficiary
      • SafeTransfer all vault ERC20 to beneficiary
      • safeTransferFrom all vault NFTs to beneficiary
      • Mark executed=true, active=false
      • Emit WillExecuted

Concurrent off-chain reaction (within seconds of WillExecuted):
  Listener catches WillExecuted:
    → tracked_will.markExecuted
    → fetchCapsule(owner) — check if TimeCapsule has content
    → notifyWillExecuted: bot DM's linked owner + linked beneficiary
                          (includes CID if capsule exists)
    → dispatchGenerateEmpathy(owner):
        • agent.generateEmpathyMessage{value: 0.4 STT}
        • Somnia LLM inferChat with EMPATHY_SYSTEM_PROMPT
        • ~5-30 seconds: LLM returns farewell text
        • Agent V3 stores in empathyMessages[owner], emits EmpathyMessageGenerated

Listener catches EmpathyMessageGenerated:
  → notifyEmpathyMessage: query tracked_will for beneficiary
  → walletLink.getByWallet(beneficiary) — is beneficiary linked to Telegram?
  → If yes: safeSend bot message:
      "💌 A final note from 0xb24B...9bD:
       _<AI generated message>_
       (Generated by Memogent AI via Somnia LLM consensus)"
```

### 4.4 Beneficiary claim Time Capsule (after execution)

```
1. Beneficiary receives Telegram notif with CID
2. Beneficiary runs `pnpm capsule-claim <owner-address>` from CLI, OR Bima FE provides web UI
3. Client:
   • cast call TimeCapsule.getCapsule(owner) → (cid, contentHash, attachedAt)
   • cast call TimeCapsule.isReleased(owner) → true (else abort)
   • cast call TimeCapsule.getDecryptionKey(owner)
     → contract verifies msg.sender == beneficiary && will.executed
     → returns AES-256 key
   • fetch https://gateway.pinata.cloud/ipfs/{cid} → encrypted blob
   • Decrypt locally: AES-256-GCM with key + iv (first 12 bytes) + authTag (next 16)
   • Verify keccak256(plaintext) == contentHash
   • Display message/file
```

---

## 5. Critical gotchas (learned the hard way)

### Somnia chain
- **`evm_version = "paris"`** in foundry.toml is MANDATORY. Default Cancun emits PUSH0 opcode which Somnia's EVM rejects with OUT_OF_GAS. Project rule + repo memory: [`project_somnia_gas_gotcha.md`].
- **Somnia gas is 10-100× standard EVM** for CREATE and non-trivial calls. Foundry's `eth_estimateGas` under-provisions when wrapped by forge script/forge create. **Use `cast send` with manual `--gas-limit` set to 2× Somnia's own `eth_estimateGas`** for reliable deploys.
- **32 STT minimum holding** for any contract that calls `reactivityPrecompile.subscribe`. We fund MemogentCore with 35 STT after deploy.
- **`subscriptionId` + fallback `deadlineToOwner` dual-mapping** — Reactivity passes `eventTopics[1] = deadlineMs` but with ±ms variance from contract storage. Rounded lookup `(eventTopics[1] / 1000) * 1000` resolves the mismatch.
- **Plain transfers DO work at standard 21k gas**. Only contract CALLs are gas-inflated.

### Somnia Agent Platform
- **Agent IDs are global constants** (same on testnet + mainnet): LLM = `12847293847561029384`, JSON API = `13174292974160097713`, Parse Website = `12875401142070969085` (do NOT use — sample contract has wrong platform addr).
- **`inferToolsChat` is experimental** — Somnia's own example repo has zero production uses. Stick with `inferString`, `inferNumber`, `inferChat`.
- **30% deposit buffer** required (`SOMNIA_DEPOSIT_BUFFER_STT=0.30`). Below that, requests skip silently.
- **`Request` struct mismatch** — official docs include `perAgentBudget` field, repo `ISomniaAgents.sol` omits it. Use docs version (we did).

### Off-chain agent
- **ethers v6 + Somnia RPC**: pass explicit `Network` + `staticNetwork: true` to JsonRpcProvider, otherwise the first `eth_chainId` call times out 5s.
- **Lighthouse Kavach blocked** for some ISPs (we hit this). Pinata is our backup.
- **Telegram bot token**: never share publicly; rotate via BotFather `/revoke` if exposed.

---

## 6. Audit trail — what judges can verify

For any Memogent inheritance execution, this chain is publicly verifiable:

1. **WillRegistered tx** on Shannon Explorer → shows owner, beneficiary, deadlineMs
2. **Subscribe tx** to Reactivity precompile (chained from same block) → shows scheduled event
3. **DepositSTT/Token/NFT txs** → shows assets entering Core's vault
4. **(Continuous) AssessmentRequested events** during the assessment loop → each one references a Somnia Agent Platform requestId
5. **Each Agent receipt URL**: validator signatures on the actual LLM prompt + response
6. **RiskDecision events** → on-chain classification stored
7. **WillExecuted event** at deadline → STT + tokens + NFTs transferred to beneficiary (visible in transaction internal txs)
8. **EmpathyMessageRequested + EmpathyMessageGenerated** → second LLM call, message stored on-chain
9. **CapsuleAttached** → CID + hash committed; gateway URL `https://gateway.pinata.cloud/ipfs/{cid}` is public (ciphertext only; key gated by `getDecryptionKey`)

**The agent-native claim:** every state change carries provenance back to either (a) the user's explicit signature, (b) the Somnia Reactivity precompile firing at a scheduled deadline, or (c) a Somnia Agent Platform LLM consensus result with a public receipt. No off-chain server is trusted as an oracle.

---

## 7. Costs (Somnia testnet, current observed)

| Operation | Cost (STT) | Notes |
|---|---|---|
| Deploy MemogentCore | ~0.26 | one-time |
| Deploy MemogentAgent (V1/V2/V3) | ~0.14-0.22 | one-time |
| Deploy TimeCapsule | ~0.10 | one-time |
| `setAgentAuthority` | ~0.001 | one-time |
| Fund Core for Reactivity | 35 | one-time, returned via withdraw of unused balance |
| `registerWill` (includes Reactivity subscribe) | ~0.01 | per will |
| `depositSTT` | ~0.006 + value | per deposit |
| `checkIn` | ~0.01 | per check-in (resubscribes Reactivity) |
| `assessRiskWithContext` | 0.4 (0.303 LLM + buffer) | per AI assessment, refund excess |
| `generateEmpathyMessage` | 0.4 | per execution, one-shot |
| `attachCapsule` | ~0.03 | per capsule |
| `getDecryptionKey` | 0 | view, no gas (called by beneficiary) |
| WillExecuted via Reactivity (no agent gas) | sponsored | precompile handles |

**Rule of thumb**: 1 STT per will-lifecycle handles ~2 assessments + execution + empathy.

---

## 8. Network reference

| Field | Value |
|---|---|
| Chain ID | 50312 |
| RPC HTTP (primary) | `https://api.infra.testnet.somnia.network/` |
| RPC HTTP (legacy fallback) | `https://dream-rpc.somnia.network` |
| RPC WSS | `wss://api.infra.testnet.somnia.network/ws` |
| Explorer (Blockscout) | `https://shannon-explorer.somnia.network/` |
| Explorer REST API | `https://shannon-explorer.somnia.network/api/v2/` |
| Reactivity Precompile | `0x0000000000000000000000000000000000000100` |
| Agent Platform | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| Faucet | `https://testnet.somnia.network/` |
| LLM Agent ID | `12847293847561029384` |
| JSON API Agent ID | `13174292974160097713` |

---

## 9. What's NOT built (and why)

| Feature | Status | Notes |
|---|---|---|
| AgentVault (multi-stage release with daily limits) | NOT BUILT | Original plan called for staged 10%/40%/50% release. We ship single-stage (all-at-once) execution. Multi-stage was deemed unnecessary complexity; the AI risk gate before EXECUTE provides the safety. Vault can be added in V2 without breaking compat |
| JSON API on-chain signal collection | NOT BUILT | Wallet last-tx + Telegram health are aggregated OFF-CHAIN by the dispatcher and passed to LLM via `extraSignals` string. Going on-chain via JSON API would require multi-call aggregation, callback coordination, and additional 0.32 STT per assessment. Trade-off accepted for hackathon |
| Risk score (`inferNumber 0-100`) | NOT BUILT | Only categorical classification (`inferString`) is implemented. Score would require a second LLM call per assessment (0.30 STT extra) and visible-but-not-actionable in current UI. Categorical is sufficient for the demo |
| Lighthouse Kavach Time Capsule | REPLACED | ISP-blocked. Pinata + AES + on-chain key gate is the working substitute |
| Real-time Dashboard FE | Bima's domain | We provide ABIs + addresses; Bima builds the UI per `frontend/rules/bima-guide.md` |
| Multi-signature owner approval | NOT BUILT | Single-owner per will. Future work |
| ENS resolution for beneficiary input | NOT BUILT | Use raw addresses; Bima can wrap |
| Mainnet deploy | NOT BUILT | Hackathon scope is testnet. Mainnet would need mainnet Agent Platform address swap (`0x5E5205CF39E766118C01636bED000A54D93163E6`) |

---

## 10. Sequence diagram — happy-path inheritance with empathy

```
User    FE/CLI    Core      Reactivity  Listener  AutoAssess  Agent V3  LLM      TgBot     Beneficiary
 │       │         │            │          │           │          │       │         │            │
 │ registerWill (beneficiary, inactivePeriodSec)        │          │       │         │            │
 │──────▶│ writeContract                                │          │       │         │            │
 │       │────────▶│ subscribe Reactivity Schedule      │          │       │         │            │
 │       │         │───────────▶│          │           │          │       │         │            │
 │       │         │ emit WillRegistered  │           │          │       │         │            │
 │       │         │──────────────────────▶ catches    │          │       │         │            │
 │       │         │                      │ insert tracked_will   │       │         │            │
 │       │         │                      │           │          │       │         │            │
 │ depositSTT 1 ETH                       │           │          │       │         │            │
 │──────▶│────────▶│                      │           │          │       │         │            │
 │       │         │                      │           │          │       │         │            │
 │ (optional) link Telegram, upload capsule via CLI    │          │       │         │            │
 │                                        │           │          │       │         │            │
 ║  ... time passes ... 5 minutes later first autoAssess tick ...                              ║
 │                                        │           │          │       │         │            │
 │       │         │                      │           │ tick     │       │         │            │
 │       │         │                      │           │ listActive│      │         │            │
 │       │         │                      │           │ aggregateSignals │         │            │
 │       │         │                      │           │  ↳ getWillInfo from Core  │         │            │
 │       │         │                      │           │  ↳ shannon-explorer REST  │         │            │
 │       │         │                      │           │  ↳ supabase wallet_link  │         │            │
 │       │         │                      │           │ dispatchAssessRiskWithContext        │            │
 │       │         │                      │           │──────────▶│ assessRiskWithContext   │            │
 │       │         │                      │           │           │ (0.4 STT)         │            │
 │       │         │                      │           │           │ createRequest─▶│         │            │
 │       │         │                      │           │           │                │         │            │
 │       │         │                      │           │           │ ◀──handleResponse (~5-30s)            │
 │       │         │                      │           │           │ classification="SAFE"   │            │
 │       │         │                      │           │ ◀───── emit RiskDecision  │         │            │
 │       │         │                      │           │ tracked_will.update      │         │            │
 │       │         │                      │           │ notifyRiskDecision (SAFE → silent)│            │
 │                                        │           │          │       │         │            │
 ║  ... continues every 60+ min, classification stays SAFE while user active ...                ║
 ║                                                                                              ║
 ║  ... user goes inactive ... deadline approaches ... LLM may escalate to WATCH/GRACE ...      ║
 │                                        │           │          │       │         │            │
 │                                        │ Reactivity fires Schedule at deadline               │
 │       │         │ ◀──onEvent───────────│           │          │       │         │            │
 │       │         │ _executeInheritance()│           │          │       │         │            │
 │       │         │  ↳ STT/tokens/NFTs to beneficiary           │       │         │            │
 │       │         │ emit WillExecuted    │           │          │       │         │            │
 │       │         │──────────────────────│──────────▶ catches   │       │         │            │
 │       │         │                                  │ tracked_will.markExecuted │            │
 │       │         │                                  │ fetchCapsule(owner) ─▶ TimeCapsule.getCapsule │
 │       │         │                                  │ notifyWillExecuted ─────────▶│ inheritance + CID │
 │       │         │                                  │ dispatchGenerateEmpathy(owner)│            │
 │       │         │                                  │──────────▶│ generateEmpathyMessage    │            │
 │       │         │                                  │           │ (0.4 STT)         │            │
 │       │         │                                  │           │ createRequest─▶│ inferChat │            │
 │       │         │                                  │           │                │         │            │
 │       │         │                                  │           │ ◀──handleResponse (~5-30s)            │
 │       │         │                                  │           │ store empathyMessages    │            │
 │       │         │                                  │ ◀───── emit EmpathyMessageGenerated   │            │
 │       │         │                                  │ notifyEmpathyMessage────────▶│ 💌 farewell │            │
 │       │         │                                  │          │       │         │            │
 │       │         │                                  │          │       │         │ Beneficiary: "📥 1 STT, 💌 message" │
 │       │         │                                  │          │       │         │            │
 ║  ... later ... beneficiary runs `pnpm capsule-claim <owner>` from CLI ...                    ║
 │       │         │                                  │          │       │         │            │
 │       │         │ ◀── cast call getDecryptionKey(owner)─────── │       │         │ ◀──────────│
 │       │         │ require(msg.sender == beneficiary && executed)      │         │            │
 │       │         │ return AES key                  │           │       │         │            │
 │       │         │                                  │          │       │         │ fetch Pinata CID      │
 │       │         │                                  │          │       │         │ AES-256-GCM decrypt   │
 │       │         │                                  │          │       │         │ display message       │
```

---

## 11. Demo storyboard pointers (for Jeje)

The 75-second autonomous cycle proven in commit `7745377` is the headline demo:

```
T+0:00   User registers will (60s period) — only manual action
T+1:00   Reactivity fires → assets to beneficiary, WillExecuted
T+1:00   Bot DM #1: "You have been named beneficiary by 0xc582..."
T+1:06   AI empathy message arrives in chat: "I hope this reaches you well..."
```

Total: 6 seconds from execution to AI farewell. Real Somnia LLM consensus. Real on-chain receipts.

Key Somnia primitives to call out in the video:
1. **Reactivity precompile** — "the chain wakes itself up at the deadline, no keeper required"
2. **Agent Platform LLM** — "decisions are made by validator consensus, not a centralized server"
3. **TimeCapsule on-chain access control** — "the AES key only unlocks if the beneficiary signs AND the will has executed"

---

*Generated 2026-05-25, reflecting commit `b18e49a` and all 5 deployed contracts. For per-contract function detail, read the source in `sc/src/`. For off-chain code, read `agent/src/`. For FE integration, read `frontend/rules/bima-guide.md`.*
