# Agent Rules — Decision Output & On-chain Submission

How agent decisions become permanent, auditable on-chain receipts.

## What goes on-chain — what stays off-chain

| Data | Where | Why |
|---|---|---|
| `riskScore` (uint8 0–100) | on-chain | drives state machine |
| `riskTag` (SAFE/WATCH/GRACE/EXECUTE) | on-chain | UI + event filtering |
| `reasoningHash` (bytes32) | on-chain | tamper-proof reference |
| `agentRequestId` (uint256) | on-chain | link to Somnia receipt URL |
| `signalSnapshot` (struct) | on-chain | what signals fed the decision |
| Full reasoning text | OFF-chain | Somnia receipt + IPFS pin (optional) |
| Empathetic message text | OFF-chain | Telegram + IPFS for time capsule |

**Rule:** never put raw LLM output text on-chain. Always hash. Storage is too expensive and judges don't need the prose on-chain to verify.

## Decision struct (mirror in agent/types.ts and MemogentAgent.sol)

```typescript
export interface AgentDecisionReceipt {
    user: `0x${string}`;
    timestamp: number;          // unix seconds
    riskScore: number;          // 0-100
    riskTag: RiskTag;
    reasoningHash: `0x${string}`;
    agentRequestId: bigint;
    signalSnapshot: {
        wallet: number;
        checkin: number;
        telegram: number;
        weights: { wallet: number; checkin: number; telegram: number };
    };
}
```

Matching Solidity:

```solidity
struct AgentDecisionReceipt {
    address user;
    uint64 timestamp;
    uint8 riskScore;
    uint8 riskTag;             // enum index
    bytes32 reasoningHash;
    uint256 agentRequestId;
    SignalSnapshot signals;
}
```

## Reasoning hash — deterministic

```typescript
import { keccak256, toUtf8Bytes } from 'ethers';

export function hashReasoning(input: {
    prompt: string;
    response: string;
    signals: SignalSet;
    requestId: bigint;
}): `0x${string}` {
    const canonical = JSON.stringify({
        p: input.prompt,
        r: input.response,
        s: input.signals,
        id: input.requestId.toString(),
    });
    return keccak256(toUtf8Bytes(canonical)) as `0x${string}`;
}
```

`canonical` MUST be the same on every node — keys sorted, no whitespace, no Date objects.

## Submission flow

```
1. Off-chain agent: detects trigger (Schedule fire | daily heartbeat | manual)
2. Off-chain agent: builds signals
3. Off-chain agent: calls MemogentAgent.requestRiskAssessment(user)
   ├─ MemogentAgent invokes JSON API agent ×2 in parallel:
   │  - fetchUint  → wallet last-activity timestamp (Somnia explorer API)
   │  - fetchBool  → Telegram bot health
   ├─ MemogentAgent invokes LLM Inference agent ×2 in parallel:
   │  - inferString with allowedValues=[SAFE,WATCH,GRACE,EXECUTE] → tag
   │  - inferNumber bounds=[0,100] → risk score
   └─ Each call: validator subcommittee=3, threshold=2, async callback
4. MemogentAgent.handleResponse receives each callback:
   - Decodes result based on pendingRequest.kind
   - Once all 4 responses received, records AgentDecisionReceipt struct
   - Emits RiskDecision(user, score, tag, reasoningHash, requestIds[])
5. MemogentCore (subscribed to RiskDecision via Reactivity) reacts:
   - SAFE / WATCH → log only
   - GRACE → set graceEndsAt, emit GraceStarted
   - EXECUTE → start vault drain (via AgentVault.executeStage)
6. [On GRACE or EXECUTE only] MemogentAgent invokes inferChat:
   - Generates empathetic message to owner (GRACE) or beneficiary (EXECUTE)
   - Stores message hash on-chain; full text in receipt
7. Off-chain agent: listens to events, sends Telegram notifications, releases IPFS capsule via Lighthouse Kavach shareFile (already pre-registered at capsule-creation time)
```

**NOTE:** We deliberately do NOT use `inferToolsChat` (experimental — zero production examples in Somnia repo). We compose `inferString` + `inferNumber` + `inferChat` instead, which are all battle-tested.

## Empathetic message generation (off-chain)

When `riskTag == GRACE` or `EXECUTE`:
- Generate empathetic message using `inferChat` (separate on-chain call) OR use a templated message off-chain
- For v1: **templated** off-chain (cost control). Templates in `agent/src/messages/templates.ts`.
- Future: on-chain `inferChat` for fully agent-generated personalized messages

Templates take placeholders: `{ownerName}`, `{beneficiaryName}`, `{daysInactive}`, `{nextStep}`.

## What judges will check

Each Memogent decision must be traceable in 4 hops:
1. UI shows risk score → links to
2. on-chain `RiskDecision` event → links to
3. `agentRequestId` → links to
4. Somnia receipt URL → shows the LLM's actual reasoning

Make sure the UI (Bima) renders all 4 links. We provide the addresses in `docs/AGENT-API.md`.

## Forbidden

- ❌ Mutating risk thresholds mid-flight without an on-chain event
- ❌ Storing decisions in a database that isn't reproducible from on-chain state
- ❌ Sending Telegram notifications BEFORE the on-chain receipt is written (race condition: user gets notified, then tx fails, system is inconsistent)
- ❌ Using `Date.now()` in `hashReasoning` (non-deterministic — receipt won't match across nodes)
