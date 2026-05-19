# Smart Contract Rules — Invoking Somnia Agents

For any contract that calls Somnia's LLM Inference, JSON API, or other base agents.

> Full API reference: [`skill/somnia/skill.md`](../../skill/somnia/skill.md) §3-§7.
> This file = project rules (what to do / avoid in Memogent code).

## Platform contract — only one to remember

```solidity
// Testnet (Memogent default)
address constant AGENT_PLATFORM = 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776;

// Mainnet (for v2)
// address constant AGENT_PLATFORM = 0x5E5205CF39E766118C01636bED000A54D93163E6;
```

## Agent IDs — hard-code as constants

```solidity
uint256 constant JSON_API_AGENT_ID = 13174292974160097713;
uint256 constant LLM_AGENT_ID      = 12847293847561029384;
// PARSE_WEBSITE_AGENT_ID intentionally omitted — Memogent does not use it
```

## ⚠️ Use `Request` struct from DOCS, not from Kali-Decoder repo

The Kali-Decoder example repo's `ISomniaAgents.sol` is **missing** the `perAgentBudget` field. Use the docs version:

```solidity
struct Request {
    uint256 agentId;
    address requester;
    address callbackAddress;
    bytes4 callbackSelector;
    bytes payload;
    uint256 subcommitteeSize;
    uint256 threshold;
    ConsensusType consensusType;
    uint256 timeout;
    uint256 createdAt;
    uint256 remainingBudget;
    uint256 perAgentBudget;  // ← Kali-Decoder OMITS this; required for ABI alignment
}
```

## ⚠️ Do NOT copy `WebDataExtractor.sol`

That file in the example repo has a WRONG platform address (`0x7407cb35...`). The 4 other contracts in the same repo use the correct `0x037Bb9...`. If we ever need Parse Website (post-v1), hand-write the integration — don't port.

## ⚠️ Do NOT use `inferToolsChat` in v1

It's in the docs but ZERO of Somnia's 5 example contracts use it. Treat as experimental. For Memogent use the battle-tested trio:
- `inferString(prompt, system, false, allowedValues)` — constrained classification
- `inferNumber(prompt, system, min, max, false)` — bounded score
- `inferChat([roles], [messages], false)` — multi-turn / empathy message

## Invocation pattern (ASYNC callback)

```solidity
function requestRiskClassification(address user) external onlyAuthorizedAgent {
    string[] memory allowedTags = new string[](4);
    allowedTags[0] = "SAFE";
    allowedTags[1] = "WATCH";
    allowedTags[2] = "GRACE";
    allowedTags[3] = "EXECUTE";

    bytes memory payload = abi.encodeWithSelector(
        ILLMAgent.inferString.selector,
        _buildPrompt(user),
        SYSTEM_PROMPT,
        false,        // chainOfThought off for speed
        allowedTags
    );

    uint256 deposit = _llmDeposit();  // floor + per-agent × 3 + 30% buffer
    uint256 requestId = ISomniaAgents(AGENT_PLATFORM).createRequest{value: deposit}(
        LLM_AGENT_ID,
        address(this),
        this.handleResponse.selector,
        payload
    );

    pendingRequests[requestId] = PendingDecision({
        user: user,
        kind: DecisionKind.RiskClassification,
        timestamp: uint64(block.timestamp)
    });

    emit AgentRequestCreated(requestId, user, LLM_AGENT_ID, keccak256(payload));
}
```

## MANDATORY callback handler

```solidity
function handleResponse(
    uint256 requestId,
    Response[] memory responses,
    ResponseStatus status,
    Request memory /*details*/
) external {
    // 1. Authenticate platform
    require(msg.sender == AGENT_PLATFORM, "unauthorized callback");

    // 2. Validate known request
    PendingDecision memory pending = pendingRequests[requestId];
    require(pending.user != address(0), "unknown request");
    delete pendingRequests[requestId];   // prevent replay

    // 3. Status handling
    if (status == ResponseStatus.Failed || status == ResponseStatus.TimedOut) {
        emit AgentRequestFailed(requestId, pending.user, status);
        return;
    }
    require(status == ResponseStatus.Success, "unexpected status");
    require(responses.length > 0, "empty response");

    // 4. Decode by kind
    if (pending.kind == DecisionKind.RiskClassification) {
        string memory tag = abi.decode(responses[0].result, (string));
        _applyTag(pending.user, tag, requestId);
    } else if (pending.kind == DecisionKind.RiskScore) {
        int256 score = abi.decode(responses[0].result, (int256));
        _applyScore(pending.user, score, requestId);
    } else if (pending.kind == DecisionKind.EmpathyMessage) {
        string memory message = abi.decode(responses[0].result, (string));
        _storeMessage(pending.user, message, requestId);
    }
}
```

## MANDATORY `receive()` for rebates

```solidity
receive() external payable {}
```

Skip this and rebates from over-deposit are permanently lost. Verified by reading SomMemo's deploy history — multiple redeploys for missing receive().

## Deposit math — use helpers, NEVER `getRequestDeposit()` alone

```solidity
/// @notice Total msg.value for LLM Inference call (floor + reward + 30% buffer)
function _llmDeposit() internal view returns (uint256) {
    uint256 floor = ISomniaAgents(AGENT_PLATFORM).getRequestDeposit();
    uint256 reward = 0.07 ether * 3;             // per-agent × subSize
    uint256 buffer = reward * 30 / 100;          // 30% safety margin
    return floor + reward + buffer;              // ≈ 0.30 STT
}

/// @notice Total msg.value for JSON API Request call
function _jsonApiDeposit() internal view returns (uint256) {
    uint256 floor = ISomniaAgents(AGENT_PLATFORM).getRequestDeposit();
    uint256 reward = 0.03 ether * 3;
    uint256 buffer = reward * 30 / 100;
    return floor + reward + buffer;              // ≈ 0.16 STT
}
```

The 30% buffer is NOT optional. From the example repo README: *"If you receive `insufficient_budget` receipts, send additional STT..."*. Sending the bare nominal causes silent skip → timeout.

## Storing `requestId` for audit

Every agent invocation MUST be tracked on-chain:

```solidity
event AgentRequestCreated(
    uint256 indexed requestId,
    address indexed user,
    uint256 indexed agentId,
    bytes32 payloadHash
);

event AgentResponseReceived(
    uint256 indexed requestId,
    address indexed user,
    ResponseStatus status,
    bytes32 resultHash
);
```

Receipt URL pattern (frontend-side):
`https://agents.somnia.network/receipts/{requestId}`

## Budget safety

- `MemogentAgent` contract holds ≥ 5 STT buffer specifically for agent calls (separate from 32 STT Reactivity floor on `MemogentCore`)
- Emit `LowAgentBudget(balance)` event when balance drops below 2 STT
- Off-chain agent monitors this event, auto-tops-up via `MemogentAgent.fundAgent()`

## Forbidden

- ❌ Don't assume sync execution — there is NO `inferStringSync()`
- ❌ Don't skip `receive()` — rebates lost forever
- ❌ Don't hard-code platform address other than `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` for testnet
- ❌ Don't use `inferToolsChat` — unproven
- ❌ Don't use Parse Website agent in v1
- ❌ Don't omit `perAgentBudget` from the `Request` struct
- ❌ Don't use `transfer`/`send` to pay back excess — use `.call{value:}` with success check
- ❌ Don't trust `getRequestDeposit()` as the full deposit — it's only the floor
