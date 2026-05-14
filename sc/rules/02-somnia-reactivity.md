# Smart Contract Rules — Somnia Reactivity

Hard-won rules from SomMemo development. Violating any of these silently breaks the system.

## Constants (use a library)

```solidity
library SomniaExtensions {
    address internal constant SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS =
        0x0000000000000000000000000000000000000100;
    bytes32 internal constant SCHEDULE_SELECTOR =
        keccak256("Schedule(uint256)");
}
```

## Interface — DO NOT modify field types

```solidity
struct SubscriptionData {
    bytes32[4] eventTopics;
    address origin;                  // wildcard with address(0)
    address caller;                  // wildcard with address(0)
    address emitter;                 // 0x0...0100 for system events
    address handlerContractAddress;
    bytes4 handlerFunctionSelector;
    uint64 priorityFeePerGas;        // uint64 — NOT uint256
    uint64 maxFeePerGas;             // uint64 — NOT uint256
    uint64 gasLimit;                 // uint64 — NOT uint256
    bool isGuaranteed;
    bool isCoalesced;
}
```

**Why uint64 matters:** Wrong type compiles but reverts at runtime. Verified from SomMemo redeploy #2.

## Gas configuration (default for Memogent handlers)

```solidity
priorityFeePerGas: 2_000_000_000,   // 2 gwei
maxFeePerGas:     10_000_000_000,   // 10 gwei
gasLimit:          3_000_000,
isGuaranteed:      true,
isCoalesced:       false
```

Numeric trap: `10n` = 10 wei, NOT 10 gwei. Always include the full 9 zeros or use a helper.

## Schedule event — the only one Memogent uses

- Selector: `SomniaExtensions.SCHEDULE_SELECTOR`
- Timestamp in **milliseconds**: `(block.timestamp + periodSec) * 1000`
- One-off: auto-deletes after firing — no manual unsubscribe needed
- Minimum: next second from current block

## MANDATORY deadline rounding

Somnia delivers `eventTopics[1]` with ±ms variance. Always round on store AND lookup:

```solidity
uint256 roundedDeadline = (deadlineMs / 1000) * 1000;
deadlineToOwner[roundedDeadline] = msg.sender;  // on register/checkIn
// ...later in onEvent...
uint256 key = (uint256(eventTopics[1]) / 1000) * 1000;
address owner = deadlineToOwner[key];
```

## onEvent handler rules

### Forbidden

```solidity
// ❌ THIS BREAKS — Somnia execution engine uses an address different from 0x...0100
require(msg.sender == SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS, "...");

// ❌ THIS BREAKS — Somnia may fire 1 sec before exact deadline
require(block.timestamp >= deadlineSec, "...");
```

### Required pattern

```solidity
function onEvent(
    uint256 subscriptionId,
    bytes32[] calldata eventTopics,
    bytes calldata /*eventData*/
) external override {
    // 1. Look up owner via dual-mapping (subscriptionId may not match!)
    address owner = subscriptionIdToOwner[subscriptionId];
    if (owner == address(0) && eventTopics.length > 1) {
        uint256 key = (uint256(eventTopics[1]) / 1000) * 1000;
        owner = deadlineToOwner[key];
    }
    if (owner == address(0)) return;  // unknown deadline, silent return

    // 2. State checks
    Will storage will = wills[owner];
    if (!will.active || will.executed) return;

    // 3. CEI — set state BEFORE external calls
    will.executed = true;
    will.active = false;

    // 4. Effects + external interactions
    // ... transfer logic ...
}
```

## subscriptionId mismatch — known issue

- `subscribe()` returns ID like `10151+`
- Somnia calls `onEvent` with a global counter (`256`, `257`, ...)
- → `subscriptionIdToOwner[someniaCounter]` is `address(0)`
- **Always implement dual-lookup**: `subscriptionIdToOwner` → fallback to `deadlineToOwner`

## Unsubscribe — testnet limitation

```solidity
// ❌ Reverts on testnet — contract cannot unsubscribe its own subscription
reactivityPrecompile.unsubscribe(subId);
```

Workaround: skip the unsubscribe call. Schedule events are one-off and auto-delete. For check-in flows, just create a new subscription with a new deadline; the old `onEvent` will fire but silent-return because `deadlineToOwner[oldKey]` was deleted on check-in.

## 32 STT operational floor

The subscription owner (your contract) must hold ≥ 32 STT at all times. Below this → all subscriptions pause silently.

- Fund immediately after deploy via `script/FundContract.s.sol`
- Add a `view` function `function operationalBalance() returns (uint256)` so the agent can monitor and top-up
- Emit a `LowBalance(balance)` event when balance < 35 STT (warning threshold)

## Custom event subscription (Memogent will use this for agent decisions)

`MemogentAgent` will emit `RiskDecision` events that `MemogentCore` subscribes to. Pattern:

```solidity
SubscriptionData({
    eventTopics: [RiskDecision.selector, bytes32(0), bytes32(0), bytes32(0)],
    emitter: address(memogentAgent),  // NOT the precompile — the emitting contract
    caller: address(memogentAgent),
    // ...
});
```
