# Smart Contract Rules — Security

Hackathon judges WILL look at this. Defense-in-depth, but pragmatic for 4-week scope.

## Reentrancy

### CEI everywhere (Checks-Effects-Interactions)

```solidity
function execute(address user) external onlyAgent nonReentrant {
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

### Use `ReentrancyGuardTransient` (EIP-1153) — saves ~5k gas vs classic

```solidity
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";

contract AgentVault is ReentrancyGuardTransient {
    function execute(...) external nonReentrant { /* ... */ }
}
```

Uses EIP-1153 transient storage — much cheaper than the classic `ReentrancyGuard` (no SLOAD/SSTORE on lock slot).

**Verify Somnia Testnet supports EIP-1153 before committing** (Pectra+ chains do). If not supported, fall back to classic `ReentrancyGuard` — identical security, ~5k more gas per call.

### Rules for applying `nonReentrant`

- Apply to EVERY state-changing external function on `AgentVault` (especially `execute`, `partialRelease`, `cancelRelease`)
- `nonReentrant` functions cannot call each other — if `execute()` needs to call `_partialRelease()`, make the internal one `private` (no modifier) and only guard the entry point

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

## ERC-20 — MANDATORY `SafeERC20` + balance-delta accounting

```solidity
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

using SafeERC20 for IERC20;
```

### Pattern: handle fee-on-transfer tokens (USDT-like)

Memogent vaults may receive arbitrary ERC-20s. Some tokens deduct a fee on transfer — the `amount` parameter is NOT the actual delivered amount. ALWAYS use balance-delta accounting:

```solidity
function depositToken(IERC20 token, uint256 declaredAmount) external onlyActiveWill {
    uint256 balBefore = token.balanceOf(address(this));
    token.safeTransferFrom(msg.sender, address(this), declaredAmount);
    uint256 actual = token.balanceOf(address(this)) - balBefore;
    // Store ACTUAL, not declared — critical for fee-on-transfer compatibility
    vaultTokens[msg.sender][address(token)] += actual;
}
```

### Why mandatory

Without this, an attacker can deposit a fee-on-transfer token claiming 1000 units, contract records 1000, but only ~990 land in vault. On withdrawal, vault tries to send 1000 → fails or drains other users.

Skip this only if vault is hard-whitelisted to known-good tokens (USDC, DAI, WETH).

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
