# Memogent — Project Flow

Complete user journey + system interactions from onboarding to inheritance execution.

---

## TL;DR

Memogent is an **autonomous legacy guardian agent** on Somnia. Users register a digital will, deposit assets, and link multi-signal life proofs (wallet activity, check-ins, Telegram). When inactivity is suspected, an on-chain AI agent (Somnia LLM Inference) analyzes all signals, produces an auditable risk score with reasoning, and decides whether to execute the inheritance — all without external keepers, off-chain servers, or trusted third parties.

---

## 1. Components & Roles

```
┌─────────────────────────────────────────────────────────────────┐
│  ON-CHAIN (Somnia Testnet, chain 50312)                         │
│                                                                 │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────┐  ┌──────────┐  │
│  │ MemogentCore│  │MemogentAgent │  │AgentVault│  │TimeCapsule│  │
│  │             │  │              │  │          │  │           │  │
│  │ will state  │  │ AI decisions │  │ limits   │  │ IPFS keys │  │
│  │ vault state │  │ receipts     │  │ multi-   │  │ release   │  │
│  │ reactivity  │  │              │  │ stage    │  │ condition │  │
│  └─────────────┘  └──────────────┘  └──────────┘  └──────────┘  │
│         ▲                ▲                                       │
│         │                │                                       │
│  ┌──────┴────────────────┴───────────────────────────────────┐  │
│  │  Somnia Reactivity Precompile (0x...0100)                 │  │
│  │  Schedule events → fire onEvent() at deadlines            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                          ▲                                       │
│                          │ callback                              │
│  ┌───────────────────────┴───────────────────────────────────┐  │
│  │  Somnia Agent Platform (0x037Bb9C7...6776)                │  │
│  │  LLM Inference + JSON API Request                         │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            ▲
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│  OFF-CHAIN                                                      │
│                                                                 │
│  ┌──────────────────┐   ┌────────────────┐   ┌──────────────┐  │
│  │ Memogent Agent   │   │ Telegram Bot   │   │ IPFS Pinning │  │
│  │ (TypeScript)     │   │                │   │              │  │
│  │                  │   │ chat ↔ wallet  │   │ Pinata/web3  │  │
│  │ - collectors     │   │ link, life     │   │ stores       │  │
│  │ - prompt builder │   │ proof          │   │ capsule data │  │
│  │ - submitter      │   │                │   │              │  │
│  └──────────────────┘   └────────────────┘   └──────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                            ▲
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│  USER-FACING                                                    │
│                                                                 │
│  Next.js Frontend (Bima)                                        │
│  Wallet, dashboard, capsule upload, beneficiary view            │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. User Onboarding Flow

```
1. User connects wallet on Memogent FE (testnet 50312)
2. User clicks "Create Will"
3. FE calls MemogentCore.registerWill(beneficiary, inactivePeriodSec)
   ├─ Core validates: beneficiary ≠ owner, no existing will
   ├─ Core computes deadlineMs = (now + period) * 1000
   ├─ Core stores deadlineToOwner[round(deadlineMs)] = user
   └─ Core subscribes to Reactivity Schedule event at deadlineMs
4. User deposits assets:
   ├─ depositSTT() — native token
   ├─ depositToken(addr, amount) — ERC20
   └─ depositNFT(addr, tokenId) — ERC721
5. User links Telegram (optional but recommended):
   ├─ FE shows: "Open @MemogentBot and send: /start <walletAddress>"
   ├─ Bot receives, verifies signature, stores chatId ↔ wallet mapping
   └─ Bot sends welcome message
6. User uploads Time Capsule (optional):
   ├─ FE encrypts files with beneficiary's pubkey
   ├─ Uploads encrypted blob to IPFS
   ├─ Calls TimeCapsule.register(cid, encryptedKey)
   └─ Capsule released only when will is executed
```

---

## 3. Active State (Healthy)

```
Daily / weekly cadence
─────────────────────
- User makes any tx → wallet activity signal stays high
- User responds to bot message → telegram signal stays high
- User clicks "I'm alive" button → MemogentCore.checkIn()
  ├─ Core resets lastCheckIn timestamp
  ├─ Core creates a NEW Schedule subscription with new deadline
  └─ Old subscription still fires but silent-returns (deadlineToOwner deleted)

Agent heartbeat (every 24h via off-chain cron + on-chain BlockTick fallback)
───────────────────────────────────────────────────────────────────────────
- Agent collects 3 signals (wallet, checkin, telegram)
- Computes weighted score
- If score < 40 → SAFE → log only, no on-chain action
- If score ≥ 40 → triggers on-chain assessment (next section)

Operational maintenance
───────────────────────
- Agent monitors MemogentCore balance every block
- If balance < 35 STT (32 floor + 3 buffer) → tops up automatically
```

---

## 4. Inactivity Detected → AI Decision

```
Trigger sources (any of these starts the flow):
1. Schedule event fires at user's deadline (Reactivity)
2. Daily heartbeat score ≥ 40
3. User-initiated "request check" from FE

Flow:
─────
Step 1. MemogentCore (if triggered via Reactivity) emits RiskEscalation(user, deadlineMs)
        └─ Off-chain agent listens via WSS, picks up the event

Step 2. Off-chain agent:
        ├─ Collects current signal values (wallet activity, last checkIn, last Telegram)
        ├─ Computes weighted preliminary score
        ├─ Builds prompt for inferNumber:
        │  └─ "Given these signals: {json}, output a risk score 0-100..."
        └─ Calls MemogentAgent.requestAssessment(user, encodedPayload)

Step 3. MemogentAgent.requestAssessment:
        ├─ Verifies caller is authorized agent address
        ├─ Builds deposit: getRequestDeposit() + 0.07 STT * 3
        ├─ Calls SomniaAgents.createRequest{value: deposit}(
        │     LLM_AGENT_ID,
        │     address(this),
        │     this.handleResponse.selector,
        │     payload
        │  )
        ├─ Stores pendingRequests[requestId] = { user, timestamp }
        └─ Emits AgentRequestCreated(requestId, user, payloadHash)

Step 4. Somnia validator subcommittee (3 validators) executes:
        ├─ Decode payload → call inferNumber on the LLM container
        ├─ LLM runs deterministically (fixed seed, controlled temp)
        ├─ Each validator returns ABI-encoded int256 result
        ├─ Consensus reached (majority match) → result + receipt finalized
        └─ Platform contract calls back into MemogentAgent.handleResponse

Step 5. MemogentAgent.handleResponse:
        ├─ Verifies msg.sender == SomniaAgents platform
        ├─ Decodes int256 riskScore from responses[0].result
        ├─ Computes riskTag (SAFE/WATCH/GRACE/EXECUTE)
        ├─ Computes reasoningHash (off-chain agent submits this separately or contract reconstructs)
        ├─ Stores AgentDecisionReceipt struct (on-chain audit log)
        └─ Emits RiskDecision(user, score, tag, reasoningHash, requestId)

Step 6. MemogentCore (subscribed to RiskDecision via Reactivity) reacts:
        ├─ SAFE       → log, no action
        ├─ WATCH      → emit RiskWatch, off-chain agent sends Telegram nudge
        ├─ GRACE      → set graceEndsAt = now + 48h, emit GraceStarted
        │              → off-chain agent sends empathetic message to owner +
        │                preliminary heads-up to beneficiary
        └─ EXECUTE    → call AgentVault.startExecution(user)
```

---

## 5. Grace Period

```
- User has 48 hours to call checkIn() and prove they're alive
- During grace, Telegram bot sends daily reminders
- If user checkIn() before graceEndsAt:
  ├─ Will state returns to Active
  ├─ Telegram bot acknowledges, sends "good to see you"
  └─ Next agent check resumes normal cadence

- If graceEndsAt passes without checkIn:
  ├─ Off-chain agent detects via timer
  ├─ Triggers MemogentAgent.finalizeExecution(user)
  └─ Goes to next section
```

---

## 6. Execution (Vault Drain)

```
AgentVault.startExecution(user) — called by MemogentAgent only
───────────────────────────────────────────────────────────────
Stage 1: Initial release (10% to beneficiary, ~2 min after start)
         ├─ Send STT proportional release
         ├─ Send ERC20 proportional releases
         └─ Emit VaultStageReleased(user, stage=1, amount, ...)

Stage 2: Secondary release (40% additional, ~1 hour after stage 1)
         └─ Allows owner one last emergency window to pause

Stage 3: Final release (remaining 50% + all NFTs, ~24 hours after stage 1)
         ├─ Transfer all remaining STT
         ├─ Transfer all NFTs (safeTransferFrom)
         ├─ Mark will.executed = true, will.active = false
         └─ Emit WillExecuted(user, beneficiary, executedAt)

Per stage: daily/weekly limits enforced. If limits would be exceeded,
release smaller amount and queue remainder.
```

Why multi-stage: protects against agent hallucination or single-stage attack. Even if Stage 1 fires incorrectly, owner has window to intervene before Stage 3.

---

## 7. Time Capsule Release

```
On WillExecuted event:
─────────────────────
1. TimeCapsule observes the event
2. Marks capsule[user] as released
3. Off-chain agent sends Telegram + email to beneficiary:
   "You have received a Time Capsule from {ownerName}.
    Visit https://memogent.xyz/claim/{user} to access."

4. Beneficiary visits claim page:
   ├─ Connect wallet
   ├─ Sign challenge proving they ARE the beneficiary
   ├─ TimeCapsule.releaseKey() returns the encrypted symmetric key
   ├─ FE fetches encrypted blob from IPFS
   ├─ FE decrypts blob with key + beneficiary's wallet privkey
   └─ Beneficiary sees the message / video / docs
```

---

## 8. Audit Trail — What Judges Can Verify

For any will execution, judges can trace this chain:

```
Frontend
  └─ shows WillExecuted notification
  └─ links to: Memogent Explorer page for {user}
       ├─ shows all AgentDecisionReceipt entries
       ├─ each links to:
       │   ├─ Somnia tx hash on shannon-explorer
       │   └─ Somnia agent receipt: agents.somnia.network/receipts/{requestId}
       │       └─ shows: LLM prompt, LLM response, signals, validator signatures
       └─ shows all VaultStageReleased events with reason hashes
```

**Verifiability claim:** every dollar moved was authorized by:
1. A specific AI decision (in `AgentDecisionReceipt`)
2. Backed by a specific Somnia validator consensus (`requestId` + receipt)
3. Constrained by a specific vault limit (in `AgentVault`)
4. Tied to a specific signal snapshot (in the receipt)

This is what makes Memogent **agent-native** rather than automation: every action is the output of an autonomous, auditable, consensus-backed AI judgment — not a hard-coded `if (timestamp > deadline)`.

---

## 9. Sequence Diagram — Happy-Path Inheritance

```
User      FE        Core      Reactivity   Agent     LLM        Vault    Beneficiary
 │         │         │           │           │         │          │           │
 │ create  │         │           │           │         │          │           │
 │────────▶│ register│           │           │         │          │           │
 │         │────────▶│ subscribe │           │         │          │           │
 │         │         │──────────▶│           │         │          │           │
 │ deposit │         │           │           │         │          │           │
 │────────▶│────────▶│           │           │         │          │           │
 │         │         │           │           │         │          │           │
 ║  ... time passes ... user inactive ...                                      ║
 │         │         │           │           │         │          │           │
 │         │         │◀──fire────│ Schedule  │         │          │           │
 │         │         │ onEvent   │           │         │          │           │
 │         │         │─emit─────▶│ RiskEscal │         │          │           │
 │         │         │           │           │         │          │           │
 │         │         │           │           │◀────────│ listen   │           │
 │         │         │           │           │ collect signals    │           │
 │         │         │           │           │─request─▶          │           │
 │         │         │           │           │         │ inference│           │
 │         │         │           │           │◀──reply─│          │           │
 │         │         │           │           │ riskTag │          │           │
 │         │         │           │           │ = EXECUTE          │           │
 │         │         │           │           │────────────────────▶ start     │
 │         │         │           │           │         │          │ stage 1   │
 │         │         │           │           │         │          │──────────▶│
 │         │         │           │           │         │          │ ...stages │
 │         │         │           │           │         │          │──────────▶│
 │         │         │           │           │         │          │ WillExec  │
 │         │         │◀──────────────────────────────────────────│           │
 │         │ notify  │           │           │         │          │           │
 │         │◀────────────────────────────────────────────────────────────────│
 │         │ capsule release link sent                                       │
```

---

## 10. Key Numbers

| Metric | Value |
|---|---|
| Default inactive period | configurable (sec); demo uses 5 min |
| Default grace period | 48h |
| Risk threshold for GRACE | 60 |
| Risk threshold for EXECUTE | 80 |
| LLM cost per check | 0.24 STT |
| Min operational balance | 32 STT (Reactivity floor) |
| Agent budget buffer | 5 STT (for ~20 LLM calls) |
| Daily vault limit (default) | 10% of total vault |
| Weekly vault limit (default) | 50% of total vault |
| Agent heartbeat cadence | 24h |
| Cooldown between agent calls | 6h |
| Hard cap agent calls/month | 30 per user |

---

## 11. What Bima needs from us

For FE integration, Bima reads:
- `MemogentCore.willInfo(user)` → struct (existing SomMemo pattern)
- `MemogentCore.getStatus(user)` → "Active" | "Warning" | "Grace" | "Inactive" | "Executed"
- `MemogentAgent.latestDecision(user)` → AgentDecisionReceipt
- `MemogentAgent.decisionHistory(user)` → AgentDecisionReceipt[]
- Subscribes to events: `RiskDecision`, `GraceStarted`, `VaultStageReleased`, `WillExecuted`, `CapsuleReleased`

Full interface spec → `docs/CONTRACT-INTERFACES.md` (W2 deliverable).

---

## 12. What Jeje needs from us

For the 2-5 min demo video, the storyboard is in `docs/DEMO-SCRIPT.md` (W4). High-level beats:

1. Problem framing (15s) — crypto inheritance is broken
2. SomMemo intro (15s) — what existed before
3. Memogent introduction (30s) — the autonomous guardian
4. Live demo (90s) — register → inactivity → AI analyzes → grace → execute → capsule
5. Architecture diagram + agent-native pitch (45s)
6. Roadmap + ask (15s)

---

*Last updated: 2026-05-14. Update on every architecture change.*
