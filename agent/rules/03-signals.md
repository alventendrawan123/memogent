# Agent Rules — Signal Collection & Weighting

The Multi-Signal Life Guardian behavior. Locked weights and rules per user decision 2026-05-14.

## In scope for v1

| # | Signal | Weight | Source |
|---|---|---|---|
| 1 | Wallet activity | **40%** | On-chain RPC (`eth_getTransactionCount`, last tx timestamp) |
| 2 | Custom check-in | **35%** | `MemogentCore.lastCheckIn(user)` |
| 3 | Telegram activity | **25%** | Telegram Bot API + local SQLite store |

**Total: 100%.** Adjusted from initial spec — X/Twitter and Health API explicitly OUT of scope for v1.

## Out of scope (don't implement)

- X / Twitter (was 8%) — user dropped
- Health API (was 12%) — user dropped
- Any third-party identity provider (worldcoin, civic, etc.)

## Per-signal collection rules

### Signal 1 — Wallet activity (40%)

- Query: latest tx (or block) involving `user` address on Somnia testnet
- Use `eth_getTransactionCount` change rate + most recent tx timestamp via explorer API or indexed log query
- Cache RPC result for 60 seconds (10x per minute is plenty for daily-resolution decisions)
- Score: `inactivityDays = (now - lastTxTimestamp) / 86400`. Map to 0–100 via piecewise:
  - 0–7 days → score 0–10 (very active)
  - 7–30 days → 10–40
  - 30–90 days → 40–70
  - 90+ days → 70–100

### Signal 2 — Custom check-in (35%)

- Read `MemogentCore.lastCheckIn(user)` (existing pattern from SomMemo)
- Score = same piecewise as wallet but based on this single timestamp
- Note: this is the strongest "yes I'm alive" signal because it's an intentional act

### Signal 3 — Telegram (25%)

- Telegram Bot polls each registered user's chat with periodic check-in buttons
- Bot listens for any user message in the bot chat → updates `lastSeenAt` in SQLite
- If user hasn't messaged for X days → score increases
- Required: user must link their telegram via `/start <walletAddress>` command first
- If a user isn't linked, this signal weight redistributes to the other two (40 → 53%, 35 → 47%)

## Aggregation

```typescript
function aggregateSignals(signals: SignalSet): WeightedScore {
    const w = activeWeights(signals);  // redistribute if a signal is missing

    const score =
        w.wallet  * signals.wallet  +
        w.checkin * signals.checkin +
        w.telegram * signals.telegram;

    return { value: Math.round(score), components: signals, weights: w };
}
```

Pass `WeightedScore` as JSON in the prompt to `inferToolsChat`. The LLM produces the FINAL on-chain risk score (0–100) plus reasoning — that's what triggers actions, not the weighted average alone.

## Thresholds for action

| Risk band | Tag | Action |
|---|---|---|
| 0–39 | SAFE | log only, no on-chain action |
| 40–59 | WATCH | emit `RiskWatch` event, notify owner via Telegram |
| 60–79 | GRACE | start grace period (24–48h configurable), send empathetic message, notify beneficiary they may need to confirm soon |
| 80–100 | EXECUTE | after grace period expires without check-in → call `AgentVault.executeStage` |

Bands are tunable per-user via `setRiskThresholds()` in `MemogentCore`. Defaults shown above.

## Sampling cadence

- Trigger #1: Schedule event from Reactivity fires at user's deadline → immediate full check
- Trigger #2: Daily heartbeat (every 24h, BlockTick subscription is too noisy)
- Trigger #3: User-initiated via FE "request agent check now" button — bypasses cooldown

## Cooldown / anti-abuse

- Minimum 6h between agent invocations per user (prevents costs from spiraling)
- Hard cap: 30 agent invocations per user per month
- If cap exceeded → emit `AgentBudgetExceeded` and fall back to deterministic threshold logic (no LLM)

## Forbidden

- ❌ Counting failed transactions as "activity" (could be bot probing)
- ❌ Trusting an unverified Telegram message claim (must come through the bot, not a forwarded screenshot)
- ❌ Using a third-party "is wallet alive" oracle — defeats the agent-native pitch
- ❌ Re-weighting signals dynamically based on LLM output (judges suspect this is gameable)
