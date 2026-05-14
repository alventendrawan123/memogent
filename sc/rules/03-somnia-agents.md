# Smart Contract Rules — Invoking Somnia Agents

For any contract that calls Somnia's LLM Inference, JSON API, or other base agents.

## Platform contract addresses

```solidity
address constant AGENT_PLATFORM_MAINNET = 0x5E5205CF39E766118C01636bED000A54D93163E6;
address constant AGENT_PLATFORM_TESTNET = 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776;
```

Memogent default → testnet address until production.

## Invocation pattern (ASYNC callback)

Agent calls are NOT synchronous. The pattern is:

1. Encode payload → `createRequest()` → receive `requestId`
2. Store `requestId` → wait
3. Validator subcommittee executes off-chain
4. Platform contract calls back into your `handleResponse()`

```solidity
function inferLifeStatus(address user, bytes calldata signals) external {
    bytes memory payload = abi.encodeWithSelector(
        ILlmInference.inferNumber.selector,
        buildPrompt(user, signals),     // prompt
        SYSTEM_PROMPT,                  // system
        int256(0),                      // minValue
        int256(100),                    // maxValue
        false                           // chainOfThought
    );

    uint256 floor = somniaAgents.getRequestDeposit();
    uint256 deposit = floor + 0.07 ether * 3;  // 0.21 reward pot

    uint256 requestId = somniaAgents.createRequest{value: deposit}(
        LLM_INFERENCE_AGENT_ID,
        address(this),
        this.handleResponse.selector,
        payload
    );

    pendingRequests[requestId] = PendingDecision({
        user: user,
        timestamp: block.timestamp
    });
}
```

## Required callback handler

```solidity
function handleResponse(
    uint256 requestId,
    Response[] memory responses,
    ResponseStatus status,
    Request memory /*details*/
) external {
    // 1. Authenticate — only platform may call back
    require(msg.sender == address(somniaAgents), "Unauthorized callback");

    // 2. Validate request is known
    PendingDecision memory pending = pendingRequests[requestId];
    require(pending.user != address(0), "Unknown request");
    delete pendingRequests[requestId];

    // 3. Status branching
    if (status == ResponseStatus.Failed || status == ResponseStatus.TimedOut) {
        emit AgentRequestFailed(requestId, pending.user, status);
        return;
    }
    require(status == ResponseStatus.Success, "Unexpected status");

    // 4. Decode the result — type must match the agent function's return type
    int256 riskScore = abi.decode(responses[0].result, (int256));

    // 5. Act on the result
    _applyRiskDecision(pending.user, riskScore, requestId);
}
```

## MANDATORY `receive()` for rebates

Without this, unused budget is permanently lost.

```solidity
contract MemogentAgent {
    receive() external payable {}
}
```

## Deposit math — never send only the floor

```
msg.value ≥ (minPerAgentDeposit × subSize) + (per_agent_price × subSize)
         = (0.01 × 3)               + (0.07 × 3)   for LLM Inference
         = 0.03 + 0.21
         = 0.24 STT
```

### Helper

```solidity
function llmInferenceDeposit() internal view returns (uint256) {
    uint256 floor = somniaAgents.getRequestDeposit();
    return floor + 0.07 ether * 3;
}
```

### Per-agent prices (testnet & mainnet)

| Agent | Price/subcommittee | Total `msg.value` (3 validators) |
|---|---|---|
| JSON API Request | 0.03 STT | **0.12 STT** |
| LLM Inference (`inferToolsChat`, etc.) | 0.07 STT | **0.24 STT** |
| LLM Parse Website | 0.10 STT | **0.33 STT** |

## Storing `requestId` for audit

Every agent invocation MUST be tracked on-chain so judges can verify via Agent Explorer:

```solidity
event AgentRequestCreated(
    uint256 indexed requestId,
    address indexed user,
    uint256 agentId,
    bytes32 payloadHash
);
```

Receipt URL pattern (frontend-side):
`https://agents.somnia.network/receipts/{requestId}`

## Agent IDs — RESOLVE BEFORE FIRST DEPLOY

The platform takes `uint256 agentId` but docs don't enumerate the IDs. Options:
1. Read from platform contract via `cast call` (look for `agents(uint256)` or similar)
2. Inspect Agent Explorer UI source
3. Ask in Somnia dev Telegram

Don't hard-code `agentId` constants until verified. Use a `setAgentIds()` admin function for now and treat them as configurable.

## Budget safety

- Memogent contract should hold a buffer of ≥ 5 STT specifically for agent calls (in addition to 32 STT Reactivity floor)
- Emit `LowAgentBudget` event when agent-call-reserve drops below 2 STT
- The agent (off-chain) auto-tops-up via `MemogentCore.topUp()` when triggered

## Forbidden

- Don't assume sync execution — there is NO `inferStringSync()`
- Don't skip `receive()` — rebates will be lost
- Don't hard-code agent IDs without verifying against the live registry
- Don't use `transfer`/`send` — use `.call{value:}` with success check (`receive()` may need >2300 gas)
