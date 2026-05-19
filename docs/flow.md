# Memogent — Project Flow

End-to-end system flow: user onboarding, autonomous monitoring, AI-driven inheritance execution.

> Locked decisions referenced: [`skill/somnia/skill.md`](../skill/somnia/skill.md) §0 — Memogent uses 2 of 3 Somnia base agents (LLM Inference + JSON API), pure `inferString`/`inferNumber`/`inferChat` (NOT `inferToolsChat`).

---

## TL;DR

Memogent is an **autonomous legacy guardian agent** on Somnia. Users register a digital will, deposit assets, and link multi-signal life proofs (wallet activity, custom check-ins, Telegram). When inactivity is suspected:
1. Memogent invokes **Somnia JSON API agents** to fetch life-proof signals with validator consensus
2. Memogent invokes **Somnia LLM Inference agents** (`inferString` + `inferNumber`) to classify and score risk
3. Each decision is recorded as an on-chain `AgentDecisionReceipt` linked to a Somnia Agent receipt URL
4. Graduated execution via `AgentVault` with daily/weekly limits
5. Time Capsule release through Lighthouse Kavach — beneficiary signs at claim time

All without external keepers, off-chain servers as oracles, or trusted third parties.

---

## 1. Components & Roles

```
┌──────────────────────────────────────────────────────────────────────┐
│  ON-CHAIN (Somnia Testnet, chain 50312)                              │
│                                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ MemogentCore│  │MemogentAgent │  │AgentVault│  │ TimeCapsule  │  │
│  │             │  │              │  │          │  │              │  │
│  │ will state  │  │ AI decisions │  │ limits   │  │ IPFS cid     │  │
│  │ vault state │  │ receipts     │  │ multi-   │  │ release flag │  │
│  │ reactivity  │  │ requestIds   │  │ stage    │  │ (no keys!)   │  │
│  └─────────────┘  └──────────────┘  └──────────┘  └──────────────┘  │
│         ▲                ▲                                            │
│         │                │                                            │
│  ┌──────┴────────────────┴────────────────────────────────────────┐  │
│  │  Somnia Reactivity Precompile (0x0...0100)                     │  │
│  │  Schedule events fire onEvent() at deadlines                   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                          ▲                                            │
│                          │ async callback (handleResponse)            │
│  ┌───────────────────────┴────────────────────────────────────────┐  │
│  │  Somnia Agent Platform (0x037Bb9C7...6776)                     │  │
│  │  ├─ JSON API Request agent (ID 13174292974160097713)           │  │
│  │  └─ LLM Inference agent (ID 12847293847561029384)              │  │
│  │  [Parse Website agent — DELIBERATELY NOT USED]                 │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                            ▲
                            │
┌───────────────────────────┴──────────────────────────────────────────┐
│  OFF-CHAIN (TypeScript, Node 20+)                                    │
│                                                                      │
│  ┌──────────────────┐  ┌─────────────────┐  ┌──────────────────┐    │
│  │ Memogent Agent   │  │ Telegram Bot    │  │ Lighthouse IPFS  │    │
│  │ (orchestrator)   │  │ (grammy)        │  │ + Kavach         │    │
│  │                  │  │                 │  │                  │    │
│  │ - WSS listener   │  │ - SIWE linking  │  │ - uploadEncrypted│    │
│  │ - signal trigger │  │ - last_seen     │  │ - shareFile      │    │
│  │ - tx submitter   │  │ - check-in btns │  │ - threshold key  │    │
│  │ - budget monitor │  │ - block detect  │  │   (5-node net)   │    │
│  └──────────────────┘  └─────────────────┘  └──────────────────┘    │
│                          │                                            │
│                          ▼                                            │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ SQLite (better-sqlite3) — wallet_link, link_token, checkin,   │  │
│  │                            blocked_at, capsule_ledger          │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                            ▲
                            │
┌───────────────────────────┴──────────────────────────────────────────┐
│  USER-FACING (Bima's domain — Next.js, out of our scope)             │
│  Wallet connect • dashboard • capsule upload • beneficiary claim     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Agent Composition (the agent-native pitch)

Memogent uses **2 of 3 Somnia base agents** in a multi-call composition. Each inheritance decision passes through both agents and produces 4+ consensus-backed responses.

| Phase | Agent | Function | Purpose | Cost (with buffer) |
|---|---|---|---|---|
| **Signal collection** | JSON API Request | `fetchUint(explorerUrl, "result.timestamp", 0)` | Wallet last-activity timestamp | 0.16 STT |
| **Signal collection** | JSON API Request | `fetchBool(telegramGetMeUrl, "ok")` | Telegram bot health | 0.16 STT |
| **Risk reasoning** | LLM Inference | `inferString(prompt, system, false, ["SAFE","WATCH","GRACE","EXECUTE"])` | Classification | 0.30 STT |
| **Risk reasoning** | LLM Inference | `inferNumber(prompt, system, 0, 100, false)` | Confidence score | 0.30 STT |
| **Communication (only on GRACE/EXECUTE)** | LLM Inference | `inferChat(roles, messages, false)` | Empathetic message to beneficiary | 0.30 STT |

**Why no `inferToolsChat`:** zero production examples in Somnia's own example repo. Treated as experimental for v1.

**Why no Parse Website:** 0.33 STT/call, 30-90s latency, sample contract has wrong platform address. Memogent signals are structured (timestamps, booleans) — JSON API is sufficient.

**Result:** every dollar moved by Memogent is the output of validator consensus on 4 independent agent invocations, each with an auditable receipt URL.

---

## 3. User Onboarding Flow

```
1. User connects wallet on Memogent FE (Bima's UI; testnet 50312)

2. User clicks "Create Will"
   ├─ FE calls MemogentCore.registerWill(beneficiary, inactivePeriodSec)
   ├─ Core validates: beneficiary != owner, no existing will, period > 0
   ├─ Core computes deadlineMs = (now + period) * 1000
   ├─ Core stores deadlineToOwner[(deadlineMs/1000)*1000] = user (rounded)
   └─ Core subscribes to Reactivity Schedule event at deadlineMs

3. User deposits assets to MemogentCore:
   ├─ depositSTT() — native token (msg.value)
   ├─ depositToken(addr, amount) — ERC-20 (uses SafeERC20 + balance-delta)
   └─ depositNFT(addr, tokenId) — ERC-721 (safeTransferFrom)

4. User links Telegram (optional but signal weight depends on it):
   ├─ FE: user signs SIWE message (EIP-4361, chainId=50312, nonce, statement)
   ├─ Agent: validates signature, issues opaque link_<uuid> token (5-min TTL)
   ├─ FE: deep-links user to https://t.me/MemogentBot?start=link_<token>
   ├─ Bot: receives /start link_<token>, validates, persists wallet_link row
   └─ Bot: "Linked ✅ — I'll check on you periodically"

5. User creates Time Capsule (optional):
   ├─ FE/CLI: user picks file (text/image/video, ≤ 50 MB)
   ├─ Testator signs Lighthouse Kavach auth message ONCE
   ├─ lighthouse.uploadEncrypted(file, apiKey, testator, signed) → returns cid
   ├─ lighthouse.shareFile(testator, [beneficiary], cid, signed) → grants access
   ├─ FE calls TimeCapsule.registerCapsule(cid, beneficiary)
   └─ No encryption keys on-chain — Kavach holds them via threshold cryptography
```

**Key design choice — Time Capsule:** beneficiary does NOT need to participate at creation. They sign once at claim time (post-execution) to retrieve the decryption key from Kavach's 5-node network. MetaMask's `eth_getEncryptionPublicKey` is deprecated, so we don't roll our own ECIES.

---

## 4. Active State (Healthy)

```
Continuous (off-chain, runs on agent VPS)
─────────────────────────────────────────
- Agent WSS-subscribes to MemogentCore.RiskEscalation events
- Telegram bot middleware updates last_seen_at on every user message
- Agent monitors MemogentCore balance; tops up if < 35 STT (32 floor + 3 buffer)

User-initiated (whenever)
─────────────────────────
- Any on-chain tx by user → wallet activity signal stays high
- User replies to bot or taps "I'm alive" button → telegram signal stays high
- User clicks "I'm alive" button in app → MemogentCore.checkIn()
  ├─ Core resets lastCheckIn timestamp
  ├─ Core creates a NEW Schedule subscription with new deadline
  └─ Old subscription still fires but silent-returns (deadlineToOwner deleted on check-in)

Periodic heartbeat (off-chain timer, every 24h)
───────────────────────────────────────────────
- Agent calls MemogentCore.viewSignalSnapshot(user)
  → returns (lastCheckIn, walletLastTx_offchain, telegramLastSeen)
- Agent computes weighted preliminary score (no agent calls yet — saves STT)
- If preliminary score < 40 → SAFE → log only, no on-chain action
- If preliminary score >= 40 → trigger full assessment (next section)
```

**Cooldown:** minimum 6h between full agent assessments per user (preliminary heartbeat doesn't count).

**Hard cap:** 30 full assessments per user per month. Beyond this, fallback to deterministic threshold logic (no agent calls).

---

## 5. Inactivity Detected → AI Decision

Triggered by **any** of:
1. **Reactivity Schedule** fires at user's deadline (most common — deadline reached)
2. **Off-chain heartbeat** preliminary score ≥ 40 (early detection)
3. **User-initiated** "request check now" button (rare — for testing/demo)

```
Step 1. MemogentCore.onEvent (Reactivity callback) — case (1) only
        ├─ Look up owner via dual-mapping (subscriptionId → fallback deadlineToOwner)
        ├─ If unknown deadline → silent return
        ├─ Set state: w.escalated = true (still active, but elevated)
        └─ Emit RiskEscalation(user, deadlineMs)

Step 2. Off-chain agent (listens to RiskEscalation or heartbeat trigger):
        ├─ Build prompt with user-specific context (cached signal history)
        ├─ Call MemogentAgent.requestRiskAssessment(user)
        │  → contract invokes 2 parallel calls:
        │
        │  ╔═══════════════════════════════════════════════════════════╗
        │  ║ Parallel agent invocations from MemogentAgent             ║
        │  ║                                                           ║
        │  ║  JSON API ×2:                                             ║
        │  ║  ├─ fetchUint(explorerApiUrl, "result.timestamp", 0)      ║
        │  ║  │   → wallet last-activity timestamp                     ║
        │  ║  └─ fetchBool(telegramHealthUrl, "ok")                    ║
        │  ║      → telegram bot operational?                          ║
        │  ║                                                           ║
        │  ║  LLM Inference ×2:                                        ║
        │  ║  ├─ inferString(prompt, system, false,                    ║
        │  ║  │   ["SAFE","WATCH","GRACE","EXECUTE"]) → tag            ║
        │  ║  └─ inferNumber(prompt, system, 0, 100, false) → score   ║
        │  ║                                                           ║
        │  ║  Each: subcommittee=3, threshold=2, async callback        ║
        │  ║  Each: validator consensus on result                      ║
        │  ║  Each: signed execution receipt accessible at             ║
        │  ║         https://agents.somnia.network/receipts/{id}       ║
        │  ╚═══════════════════════════════════════════════════════════╝

Step 3. Each agent platform fires callback → MemogentAgent.handleResponse
        ├─ Verifies msg.sender == platform contract address
        ├─ Decodes result based on stored pendingRequest.kind
        ├─ Accumulates the 4 results in pendingAssessment[user]
        └─ When all 4 received:
            ├─ Compute reasoningHash = keccak256(canonical(signals, tag, score))
            ├─ Write AgentDecisionReceipt struct on-chain
            └─ Emit RiskDecision(user, tag, score, reasoningHash, requestIds[])

Step 4. MemogentCore reacts to RiskDecision (subscribed via Reactivity custom event):
        ├─ SAFE     → log, no further action
        ├─ WATCH    → emit RiskWatch (off-chain agent sends Telegram nudge)
        ├─ GRACE    → set graceEndsAt = now + 48h, emit GraceStarted
        │             ├─ Trigger inferChat call → empathetic msg to owner
        │             └─ Off-chain: send Telegram alert with countdown
        └─ EXECUTE  → call AgentVault.startExecution(user)
                      └─ Trigger inferChat call → message for beneficiary
```

---

## 6. Grace Period

```
- 48-hour countdown begins on GRACE
- Telegram bot sends daily reminders (rate-limited via safeSend)
- Owner can call MemogentCore.checkIn() at any time during grace:
  ├─ Will state returns to Active
  ├─ Telegram bot acknowledges
  ├─ Future agent assessments resume normal cooldown
  └─ AgentVault.startExecution NEVER triggered

- If graceEndsAt passes without checkIn:
  ├─ Off-chain agent detects via timer
  ├─ Calls MemogentAgent.finalizeExecution(user)
  └─ Proceeds to Section 7 (Vault Drain)
```

---

## 7. Execution (Vault Drain — Multi-Stage)

`AgentVault.startExecution(user)` — callable only by `MemogentAgent`. Releases assets to beneficiary in 3 stages with daily/weekly bps limits.

```
Stage 1: Initial release (10% of vault, ~2 minutes after start)
         ├─ Compute amounts: STT, each ERC-20, each NFT
         ├─ Enforce dailyLimit: clamp release to dailyBps * totalAssets / 10000
         ├─ Transfer to beneficiary (CEI: state first, then external calls)
         └─ Emit VaultStageReleased(user, stage=1, amount, reasonHash)

Stage 2: Secondary release (40% additional, ~1 hour after stage 1)
         └─ Owner has emergency window — see "Pause" section below

Stage 3: Final release (remaining 50% + all NFTs, ~24 hours after stage 1)
         ├─ Transfer all remaining STT
         ├─ Transfer all NFTs (safeTransferFrom)
         ├─ Mark will.executed = true, will.active = false
         └─ Emit WillExecuted(user, beneficiary, executedAt)
```

**Per-stage safeguards:**
- ReentrancyGuardTransient on every state-changing function
- SafeERC20 + balance-delta accounting for fee-on-transfer compatibility
- Daily/weekly bps limits enforced per stage (clamp, don't revert — graceful degradation)
- All releases emit events with reason hashes for full audit trail

**Why multi-stage:**
- Protects against agent hallucination or compromised agent address
- Even if Stage 1 fires incorrectly, owner has emergency window
- Stage 3 = point of no return; Stages 1-2 = recoverable

---

## 8. Time Capsule Release

```
On WillExecuted event:
─────────────────────
1. TimeCapsule (subscribed to WillExecuted via Reactivity) reacts
2. TimeCapsule.releaseCapsule(testator) — internal, only via Core
   ├─ Marks capsule[testator].released = true
   └─ Emit CapsuleReleased(testator, beneficiary, cid)

3. Off-chain agent (listens to CapsuleReleased):
   ├─ Looks up beneficiary in wallet_link table
   ├─ If linked → bot sends DM with claim link
   │   "Capsule from {testator} is now claimable.
   │    Visit https://memogent.xyz/claim/{cid} to access."
   └─ If NOT linked → no DM; beneficiary discovers via Bima's claim page

4. Beneficiary visits claim page (Bima's FE):
   ├─ Connect wallet
   ├─ FE calls lighthouse.getAuthMessage(beneficiary)
   ├─ Beneficiary signs auth message (FIRST interaction with Lighthouse)
   ├─ FE calls lighthouse.fetchEncryptionKey(cid, beneficiary, signed)
   │   → Kavach's 5-node network releases threshold key shards
   ├─ FE calls lighthouse.decryptFile(cid, key)
   └─ Beneficiary sees the message / video / docs in browser
```

**Key facts:**
- Beneficiary never participated at capsule creation
- No decryption keys stored on-chain
- Kavach threshold cryptography protects against single-node compromise

---

## 9. Audit Trail — What Judges Can Verify

For any will execution, judges trace this chain:

```
Frontend
  └─ shows WillExecuted notification
  └─ links to: Memogent Explorer page for {user}
       ├─ shows all AgentDecisionReceipt entries (one per assessment)
       ├─ each receipt links to:
       │   ├─ Somnia tx hash on shannon-explorer (createRequest tx)
       │   ├─ Somnia tx hash for callback (handleResponse tx)
       │   └─ Somnia agent receipt URL: agents.somnia.network/receipts/{requestId}
       │       └─ shows: actual prompt, LLM response, signal values,
       │                  validator addresses, signatures, timestamps
       ├─ shows all VaultStageReleased events with reason hashes
       └─ shows CapsuleReleased event with IPFS cid
```

**Verifiability claim:**
Every action taken by Memogent is the output of:
1. A specific AI decision recorded in `AgentDecisionReceipt`
2. Backed by 3-validator consensus on each agent invocation (`requestId` + receipt)
3. Constrained by `AgentVault` daily/weekly bps limits
4. Tied to specific signal snapshots in the receipt struct

This is what makes Memogent **agent-native** vs. automation: every release is the output of an autonomous, auditable, consensus-backed AI judgment — never a hard-coded `if (timestamp > deadline)`.

---

## 10. Sequence Diagram — Happy-Path Inheritance

```
User    FE      Core     Reactivity   Agent    JSON API  LLM      Vault    Beneficiary
 │       │       │           │          │         │       │         │           │
 │ make  │       │           │          │         │       │         │           │
 │ will  │       │           │          │         │       │         │           │
 │──────▶│ regWill          │          │         │       │         │           │
 │       │──────▶│ subscribe │          │         │       │         │           │
 │       │       │──────────▶│          │         │       │         │           │
 │       │       │           │          │         │       │         │           │
 │ deposit STT/Token/NFT     │          │         │       │         │           │
 │──────▶│──────▶│           │          │         │       │         │           │
 │       │       │           │          │         │       │         │           │
 │ /start link_xxx via Telegram         │         │       │         │           │
 │ (links wallet ↔ chat_id)             │         │       │         │           │
 │                                       │         │       │         │           │
 │ upload capsule → Lighthouse Kavach   │         │       │         │           │
 │ FE calls TimeCapsule.registerCapsule(cid, beneficiary)│         │           │
 │                                                                              │
 ║  ... time passes ... user becomes inactive ...                                ║
 │                                                                              │
 │       │       │           │ Schedule │         │       │         │           │
 │       │       │◀──fire────│ event    │         │       │         │           │
 │       │       │ onEvent   │          │         │       │         │           │
 │       │       │─emit─────▶│          │         │       │         │           │
 │       │       │ RiskEscalation       │         │       │         │           │
 │       │       │           │          │◀─listen-│       │         │           │
 │       │       │           │          │ via WSS │       │         │           │
 │       │       │           │          │         │       │         │           │
 │       │       │           │          │ requestRiskAssessment(user)           │
 │       │       │           │          │─call────────────┼─────────┼───────────│
 │       │       │           │          │ MemogentAgent invokes 4 parallel:    │
 │       │       │           │          │         │       │         │           │
 │       │       │           │          │ ┌──fetchUint   wallet ts ─┐         │
 │       │       │           │          │ ├──fetchBool   telegram ok─┤         │
 │       │       │           │          │ ├──inferString tag        ─┤         │
 │       │       │           │          │ └──inferNumber score     ─┘         │
 │       │       │           │          │         │       │         │           │
 │       │       │           │          │◀───4 async callbacks─────┐           │
 │       │       │           │          │ handleResponse × 4        │           │
 │       │       │           │          │ → AgentDecisionReceipt     │           │
 │       │       │           │          │ → emit RiskDecision(GRACE) │           │
 │       │       │◀──────────────────────│                          │           │
 │       │       │ enter GRACE state    │                          │           │
 │       │       │ emit GraceStarted    │                          │           │
 │       │       │                      │ inferChat → empathy msg  │           │
 │       │       │                      │ → store messageHash      │           │
 │       │       │                      │                          │           │
 │ ... 48h passes without checkIn ...   │                          │           │
 │       │       │                      │ finalizeExecution(user)  │           │
 │       │       │                      │─────────────────────────▶│ start     │
 │       │       │                      │                          │ stages    │
 │       │       │                      │                          │──────────▶│
 │       │       │                      │                          │ stage 1-3 │
 │       │       │                      │                          │──────────▶│
 │       │       │ WillExecuted event ──────────────────────────────│           │
 │       │       │ CapsuleReleased event ──────────────────────────│           │
 │       │       │                      │                          │           │
 │       │ Bima's FE shows claim link                              │           │
 │       │ + bot DMs beneficiary (if linked)                       │           │
 │       │◀─────────────────────────────────────────────────────────────────────│
 │       │ beneficiary signs Lighthouse auth → fetchEncryptionKey                │
 │       │ → decrypt capsule client-side                                         │
```

---

## 11. Key Numbers

| Metric | Value | Source |
|---|---|---|
| Default inactive period | configurable (sec); demo uses 5 min | tunable |
| Default grace period | 48h | tunable |
| Risk threshold for GRACE | score ≥ 60 OR tag == "GRACE" | tunable |
| Risk threshold for EXECUTE | score ≥ 80 OR tag == "EXECUTE" | tunable |
| Cost per JSON API call (with 30% buffer) | 0.16 STT | research |
| Cost per LLM call (with 30% buffer) | 0.30 STT | research |
| Full assessment cost (4 agents) | 0.92 STT | sum |
| GRACE/EXECUTE add-on (inferChat) | 0.30 STT | research |
| Daily heartbeat cost (preliminary, off-chain) | 0 STT | no agent calls |
| Min operational balance (Reactivity floor) | 32 STT | docs |
| Agent budget buffer (for ~5 assessments) | 5 STT | budget rule |
| Daily vault release limit (default) | 10% of total | tunable |
| Weekly vault release limit (default) | 50% of total | tunable |
| Cooldown between agent assessments | 6h | rate-limit |
| Hard cap agent assessments/user/month | 30 | budget cap |
| Subcommittee size per agent call | 3 | Somnia default |
| Threshold for consensus | 2 of 3 | Somnia default |
| Default agent request timeout | 15 minutes | Somnia default |

---

## 12. Network Configuration (Somnia Testnet)

| Field | Value |
|---|---|
| Chain ID | 50312 |
| RPC HTTP | `https://api.infra.testnet.somnia.network/` |
| RPC WSS | `wss://api.infra.testnet.somnia.network/ws` |
| Explorer | `https://shannon-explorer.somnia.network/` |
| Reactivity Precompile | `0x0000000000000000000000000000000000000100` |
| Agent Platform | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| JSON API Agent ID | `13174292974160097713` |
| LLM Inference Agent ID | `12847293847561029384` |
| Faucet | `https://testnet.somnia.network/` |
| Agent Receipts API | `https://receipts.testnet.agents.somnia.host` |
| Agent Explorer UI | `https://agents.somnia.network` |

---

## 13. What Bima Needs From Us

For Memogent FE, Bima reads (full ABI in `docs/CONTRACT-INTERFACES.md` — W2 deliverable):

### Read functions (view)
- `MemogentCore.willInfo(user)` → `{beneficiary, lastCheckIn, deadlineMs, status, ...}`
- `MemogentCore.getStatus(user)` → `"Active" | "Warning" | "Grace" | "Inactive" | "Executed"`
- `MemogentCore.vaultBalances(user)` → `{stt, tokens[], nfts[]}`
- `MemogentAgent.latestDecision(user)` → `AgentDecisionReceipt`
- `MemogentAgent.decisionHistory(user)` → `AgentDecisionReceipt[]`
- `TimeCapsule.capsuleInfo(testator)` → `{cid, beneficiary, released, releasedAt}`

### Events to subscribe (WSS)
- `WillRegistered(owner, beneficiary, deadlineMs)`
- `CheckedIn(owner, newDeadlineMs)`
- `RiskDecision(user, tag, score, reasoningHash, requestIds[])` — key UI event
- `GraceStarted(user, graceEndsAt)`
- `VaultStageReleased(user, stage, amount, reasonHash)`
- `WillExecuted(user, beneficiary, executedAt)`
- `CapsuleReleased(testator, beneficiary, cid)`

### Off-chain URLs Bima links
- Tx hashes → `https://shannon-explorer.somnia.network/tx/{hash}`
- Agent receipts → `https://agents.somnia.network/receipts/{requestId}`
- Capsule decryption → call `lighthouse.fetchEncryptionKey` + `lighthouse.decryptFile`

---

## 14. What Jeje Needs From Us

For the 2-5 min demo video, full storyboard in `docs/DEMO-SCRIPT.md` (W4). High-level beats:

1. **Problem framing (15s)** — crypto inheritance is broken (keepers, centralized, no judgment)
2. **SomMemo intro (15s)** — our prior winning project, on-chain digital will
3. **Memogent introduction (30s)** — *agent-native* upgrade: 2 base agents + multi-signal reasoning
4. **Live demo (90s)** — register → inactivity → 4-agent assessment → GRACE → execute → capsule claim
5. **Architecture + agent-native pitch (45s)** — show the receipt chain, validator consensus, cost per decision
6. **Roadmap + ask (15s)** — multi-agent consensus, mainnet, hiring

Key visuals Jeje can pull:
- The "Components & Roles" ASCII diagram in §1
- The "Agent Composition" table in §2
- The sequence diagram in §10
- A real Somnia agent receipt URL (post-demo) showing actual validator signatures

---

*Last updated: 2026-05-14. Locked decisions consolidated from research §0 → §11 of `skill/somnia/skill.md`.*
