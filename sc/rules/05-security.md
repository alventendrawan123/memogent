# Smart Contract Rules — Security

Hackathon judges WILL look at this. Defense-in-depth, but pragmatic for 4-week scope.

## Reentrancy

### CEI everywhere (Checks-Effects-Interactions)

```solidity
function execute(address user) external onlyAgent {
    // 1. CHECKS
    Will storage w = wills[user];
    if (!w.active || w.executed) revert Core_InvalidState();

    // 2. EFFECTS (state changes BEFORE external calls)
    w.executed = true;
    w.active = false;
    uint256 amount = vaultSTT[user];
    vaultSTT[user] = 0;

    // 3. INTERACTIONS
    (bool ok, ) = w.beneficiary.call{value: amount}("");
    require(ok, "transfer failed");
}
```

### No reentrancy guard required if CEI is strict

Adding `nonReentrant` is fine but adds bytes. CEI alone is sufficient when followed religiously. Audit every external call for compliance.

## Access control

- `MemogentCore` user functions: `msg.sender` is the will owner (no admin needed for state changes)
- `MemogentAgent.handleResponse`: `require(msg.sender == address(somniaAgents))`
- `MemogentAgent.executeOnVault`: only called internally — no external entry
- `AgentVault` all state-changers: `onlyAgent` modifier (i.e., `require(msg.sender == address(agent))`)
- `TimeCapsule.releaseKey`: only beneficiary on a will-executed condition

### No owner / admin keys

- No `Ownable`. No upgrade keys. No emergency pause.
- Reason: hackathon judges devalue centralization; for v1 we lean fully trustless.
- If we MUST add admin (e.g., to set agent IDs), use a time-locked multisig pattern and disclose in README.

## Input validation

- `_beneficiary != address(0)`
- `_beneficiary != msg.sender`
- `_inactivePeriodSec > 0` (and ≤ a sane upper bound, e.g., 5 years)
- All ERC20/ERC721 calls check `balanceOf` / `ownerOf` before transfer
- All amount values reverted if `> type(uint128).max` (defense against fee-on-transfer tokens)

## External call safety

- Use `.call{value:}("")` not `.transfer()` or `.send()` — gas stipend issues
- Check return `bool ok`
- For ERC20: use `SafeERC20` from OpenZeppelin if dealing with non-standard tokens. Default `IERC20.transfer` is fine for known tokens.

## Reactivity-specific

- See `02-somnia-reactivity.md` — never `require(msg.sender == precompileAddress)` in `onEvent`
- `deadlineToOwner` IS the access control for `onEvent` (only registered deadlines are processed)

## Agent-callback specific

```solidity
function handleResponse(uint256 requestId, ...) external {
    require(msg.sender == address(somniaAgents), "unauthorized");
    require(pendingRequests[requestId].user != address(0), "unknown request");
    delete pendingRequests[requestId];  // prevent replay
    // ...
}
```

## Vault limits (agent-gated transfers)

```solidity
struct VaultLimits {
    uint128 dailyLimitBps;    // basis points of vault per 24h (e.g., 1000 = 10%)
    uint128 weeklyLimitBps;   // basis points per 7 days (e.g., 5000 = 50%)
}

mapping(address => uint256) public dailyReleased;
mapping(address => uint256) public weeklyReleased;
mapping(address => uint256) public lastDailyReset;
```

Why: even if the agent is compromised or hallucinates a 100% risk score, vault can't be drained instantly.

## Custom errors over revert strings

```solidity
// ❌
require(amount > 0, "MemogentCore: amount must be > 0");

// ✅
error Core_ZeroAmount();
if (amount == 0) revert Core_ZeroAmount();
```

Saves bytecode + cheaper revert.

## Events for every state change

Required events:
- `WillRegistered`, `WillCheckedIn`, `WillDeactivated`, `WillExecuted`
- `VaultDeposited`, `VaultWithdrawn`, `VaultStageReleased`
- `AgentRequestCreated`, `AgentDecisionReceived`, `RiskDecision`
- `LowOperationalBalance`, `LowAgentBudget`

Events are the audit trail. Judges, frontends, and indexers all rely on them.

## Pragma & licensing

Every `.sol` file starts with:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;
```

## What NOT to do

- ❌ `tx.origin` for authorization (phishing vector). `tx.origin` IS valid for *reading the subscription owner* inside `onEvent` per Somnia docs — but never use it for `require(...)`.
- ❌ `block.timestamp` for randomness
- ❌ Loops over unbounded arrays in user-callable functions (DoS vector)
- ❌ `delegatecall` to user-supplied addresses
- ❌ Constructor with unbounded loops or external calls
