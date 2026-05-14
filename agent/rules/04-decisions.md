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
1. Off-chain agent: detects trigger (Schedule fire | daily | manual)
2. Off-chain agent: builds signals, builds prompt payload
3. Off-chain agent: calls MemogentAgent.requestAssessment(user, payload)
   → contract calls SomniaAgents.createRequest with payload
   → emits AgentRequestCreated(requestId, user)
4. Validator subcommittee executes inferNumber → callback
5. MemogentAgent.handleResponse:
   - decodes riskScore from responses[0].result
   - records AgentDecisionReceipt struct
   - emits RiskDecision(user, riskScore, riskTag, reasoningHash, requestId)
6. MemogentCore (subscribed to RiskDecision via Reactivity) reacts:
   - SAFE / WATCH → log only
   - GRACE → set graceEndsAt, emit GraceStarted
   - EXECUTE → start vault drain (via AgentVault.executeStage)
7. Off-chain agent: listens to events, sends Telegram notifications + updates IPFS capsule
```

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
