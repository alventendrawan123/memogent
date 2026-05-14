# Smart Contract Rules — Memogent Architecture

The 4-contract split for Memogent (approved 2026-05-14).

## Contract responsibilities

```
┌──────────────────────────────────────────────────────────────────┐
│ MemogentCore.sol                                                 │
│  ─ Will registry, beneficiary, deadline state                    │
│  ─ Schedule subscription via Reactivity precompile               │
│  ─ User-facing entry points: registerWill, checkIn, deactivate   │
│  ─ Holds user STT/ERC20/NFT deposits (vault state lives here)    │
│  ─ Holds the 32 STT operational floor for Reactivity             │
└─────────────────┬────────────────────────────────────────────────┘
                  │ emits RiskEscalation event when Schedule fires
                  ▼
┌──────────────────────────────────────────────────────────────────┐
│ MemogentAgent.sol                                                │
│  ─ Subscribes to MemogentCore.RiskEscalation                     │
│  ─ Invokes Somnia LLM Inference agent (createRequest)            │
│  ─ Receives callback (handleResponse) with risk score            │
│  ─ Stores AgentDecisionReceipt on-chain (audit trail)            │
│  ─ Emits RiskDecision event                                      │
│  ─ Holds STT buffer for agent invocations (≥5 STT)               │
└─────────────────┬────────────────────────────────────────────────┘
                  │ approved decision → call into AgentVault
                  ▼
┌──────────────────────────────────────────────────────────────────┐
│ AgentVault.sol                                                   │
│  ─ Multi-stage release (grace → warning → execute)               │
│  ─ Daily / weekly transfer limits per will                       │
│  ─ Records each release event with reason hash                   │
│  ─ Only callable by MemogentAgent (onlyAgent modifier)           │
└─────────────────┬────────────────────────────────────────────────┘
                  │ on full execution
                  ▼
┌──────────────────────────────────────────────────────────────────┐
│ TimeCapsule.sol                                                  │
│  ─ IPFS pointers (CID + encrypted key)                           │
│  ─ Release condition: linked-will-executed                       │
│  ─ Beneficiary can claim encryption key once condition met       │
└──────────────────────────────────────────────────────────────────┘
```

## Why split — not optional

SomMemo is already 25,343 bytes (over 24,576 mainnet cap). Memogent adds: agent invocation, receipt storage, multi-stage vault, IPFS pointer mappings. A monolithic contract would absolutely exceed the limit, even with optimizer.

## Inter-contract communication

- **Core → Agent**: via `emit RiskEscalation` + Reactivity subscription (Agent subscribes to Core's event)
- **Agent → Vault**: direct call `vault.executeStage(user, amount, reasonHash)` (onlyAgent)
- **Vault → Beneficiary**: direct STT/token transfer
- **Capsule ← Core**: read-only view `core.willExecuted(user)` to gate key release

## Storage layout discipline

- **No shared structs** — each contract owns its own state schema
- Cross-contract reads use view functions (`core.willInfo(user)`), never `extcodecopy`
- Don't pack unrelated state into same struct just for gas — readability wins

## Upgrade strategy

- **No proxies** for v1 (hackathon scope) — too risky to debug in 4 weeks
- Future upgrade path: redeploy with state migration script. Document state schema in `docs/STATE-SCHEMA.md` for future migration.

## Naming convention

- All Memogent contracts prefixed with `Memogent` (Core, Agent) or descriptive (`AgentVault`, `TimeCapsule`)
- All events prefixed with subject: `WillRegistered`, `RiskEscalation`, `VaultStageExecuted`, `CapsuleReleased`
- All custom errors prefixed with contract name: `error Core_AlreadyRegistered()`, `error Agent_NotAuthorized()`

## Forbidden

- Don't merge MemogentCore and MemogentAgent — they MUST be separate to stay under size limit
- Don't pull OpenZeppelin contracts you don't need (every import adds bytes)
- Don't store reasoning text on-chain — store reasoning HASH only (`bytes32`). Full text lives in Somnia receipt URL.
- Don't expose admin functions without a clear migration path
