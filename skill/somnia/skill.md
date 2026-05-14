# Somnia Skill — Reference for Memogent

> Authoritative reference for working with Somnia network, Reactivity precompile, and Agents.
> Sources: https://docs.somnia.network/ and https://docs.somnia.network/agents (fetched 2026-05-14) +
> verified field experience from SomMemo (`reference/SomMemo/summary.md` §9-12).

---

## 1. Network Configuration

### Mainnet (Chain ID: 5031)

| Field | Value |
|---|---|
| RPC HTTP | `https://api.infra.mainnet.somnia.network/` |
| RPC WSS | `wss://api.infra.mainnet.somnia.network/ws` |
| Explorer | `https://explorer.somnia.network` |
| Native token | SOMI |
| Agent Platform Contract | `0x5E5205CF39E766118C01636bED000A54D93163E6` |
| MultiCallV3 | `0x5e44F178E8cF9B2F5409B6f18ce936aB817C5a11` |
| CreateX | `0xD13C575ED5378fd18B100Bd87D5765d9A747358B` |
| Faucet | `https://stakely.io/faucet/somnia-somi` |

### Testnet (Chain ID: 50312)

| Field | Value |
|---|---|
| RPC HTTP (new) | `https://api.infra.testnet.somnia.network/` |
| RPC HTTP (legacy, still works) | `https://dream-rpc.somnia.network` |
| RPC WSS | `wss://api.infra.testnet.somnia.network/ws` |
| Explorer (primary) | `https://shannon-explorer.somnia.network/` |
| Explorer (alt) | `https://somnia-testnet.socialscan.io` |
| Native token | STT (Somnia Test Tokens) |
| Agent Platform Contract | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| MultiCallV3 | `0x841b8199E6d3Db3C6f264f6C2bd8848b3cA64223` |
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| Factory | `0x4be0ddfebca9a5a4a617dee4dece99e7c862dceb` |
| CreateX | `0x535822d4b86b2372FBE4fd9d1468318F04A2A640` |
| Faucet (primary) | `https://testnet.somnia.network/` |
| Reactivity Precompile | `0x0000000000000000000000000000000000000100` (same on both) |

**Memogent default: testnet (50312) until production-ready.**

---

## 2. Somnia Agents — Architecture

Somnia Agents are decentralized sandboxed compute containers. Contracts and users invoke them; a subcommittee of validators executes the request; majority consensus determines the result. Every invocation emits a **signed execution receipt** (audit trail).

### Three primary base agents

1. **JSON API Request** — fetch external JSON, extract via dot-notation selector → on-chain oracle
2. **LLM Inference** — deterministic LLM (fixed seed, controlled temperature) for text/number/chat/tool-use
3. **LLM Parse Website** — render a webpage + LLM-based structured extraction

Additional agents: Idempotent Request, JSON API Selector, Find URL for Topic.

### Determinism guarantee

Quote from docs: *"LLMs with fixed random seeds and controlled temperature parameters to produce deterministic outputs — the same input always yields the same output across all validating nodes."*

### Invocation model — **ASYNC, callback-based**

Critical for architecture: agent calls are NOT synchronous from Solidity. Contracts call `createRequest()` → request enters queue → validator subcommittee executes → callback fires on contract via `handleResponse()`.

---

## 3. Base Agent — LLM Inference

### Solidity function signatures

```solidity
// Simple string output with optional allowlist
function inferString(
    string prompt,
    string system,
    bool chainOfThought,
    string[] allowedValues
) returns (string response);

// Constrained integer output
function inferNumber(
    string prompt,
    string system,
    int256 minValue,
    int256 maxValue,
    bool chainOfThought
) returns (int256 response);

// Multi-turn chat
function inferChat(
    string[] roles,
    string[] messages,
    bool chainOfThought
) returns (string response);

// Tool-use chat with MCP servers and on-chain tools (the powerful one)
function inferToolsChat(
    string[] roles,
    string[] messages,
    string[] mcpServerUrls,
    OnchainTool[] onchainTools,
    uint256 maxIterations,
    bool chainOfThought
) returns (
    string finishReason,        // "stop" | "tool_calls" | "length" | "max_iterations"
    string response,
    string[] updatedRoles,
    string[] updatedMessages,
    string[] pendingToolCallIds,
    bytes[] pendingToolCalls    // ABI-encoded calldata to execute on-chain
);
```

### inferToolsChat — tool-call handling pattern

```solidity
if (keccak256(bytes(finishReason)) == keccak256("tool_calls")) {
    for (uint i = 0; i < pendingToolCalls.length; i++) {
        (bool success, bytes memory result) = targetContract.call(pendingToolCalls[i]);
        // Append result to updatedMessages, re-call inferToolsChat with updated state
    }
}
```

### TypeScript invocation (off-chain encoding the payload)

```typescript
import { encodeFunctionData } from 'viem';

const calldata = encodeFunctionData({
    abi,
    functionName: 'inferString',
    args: [
        'Analyze the following text: "Check out this amazing new product!"',
        'You are a content moderation assistant.',
        false,        // chainOfThought
        ['safe', 'unsafe']
    ]
});
```

**Model name parameter:** none — the deterministic model is fixed by Somnia per agent type.

---

## 4. Base Agent — JSON API Request

### Solidity function signatures

```solidity
function fetchString(string url, string selector) returns (string);
function fetchUint(string url, string selector, uint8 decimals) returns (uint256);
function fetchInt(string url, string selector, uint8 decimals) returns (int256);
function fetchBool(string url, string selector) returns (bool);
function fetchStringArray(string url, string selector) returns (string[]);
function fetchUintArray(string url, string selector, uint8 decimals) returns (uint256[]);
```

### Selector syntax

Dot-notation path with optional array indexing:
- `data.price` → `{"data": {"price": ...}}`
- `items[0].name` → `{"items": [{"name": ...}]}`
- `bitcoin.usd` → `{"bitcoin": {"usd": ...}}`

### Decimals scaling

`decimals=8`:
- `42000.50` → `4200050000000`
- `0.00001234` → `1234`

### TypeScript encoding example

```typescript
const calldata = encodeFunctionData({
  abi,
  functionName: 'fetchUint',
  args: [
    'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
    'bitcoin.usd',
    8
  ]
});
```

---

## 5. Invoking Agents from Solidity

### Platform contract entry points

```solidity
function createRequest(
    uint256 agentId,
    address callbackAddress,
    bytes4 callbackSelector,
    bytes calldata payload
) external payable returns (uint256 requestId);

function createAdvancedRequest(
    uint256 agentId,
    address callbackAddress,
    bytes4 callbackSelector,
    bytes calldata payload,
    uint256 subcommitteeSize,
    uint256 threshold,
    ConsensusType consensusType,
    uint256 timeout
) external payable returns (uint256 requestId);
```

### Required callback handler on your contract

```solidity
function handleResponse(
    uint256 requestId,
    Response[] memory responses,
    ResponseStatus status,
    Request memory details
) external;
```

### Response struct

```solidity
struct Response {
    address validator;
    bytes result;
    ResponseStatus status;
    uint256 receipt;
    uint256 timestamp;
    uint256 executionCost;
}

enum ResponseStatus {
    None,       // 0 - uninitialized
    Pending,    // 1 - awaiting responses
    Success,    // 2 - consensus reached
    Failed,     // 3 - validators reported failure
    TimedOut    // 4 - request timed out
}
```

### Decoding the result

```solidity
// Match the decode type to the agent function's return type
uint256 value = abi.decode(responses[0].result, (uint256));
string memory text = abi.decode(responses[0].result, (string));
(uint256 val, string memory msg) = abi.decode(responses[0].result, (uint256, string));
```

### Encoding the payload

```solidity
bytes memory payload = abi.encodeWithSelector(
    IJsonApiAgent.fetchUint.selector,
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    "bitcoin.usd",
    uint8(8)
);
```

### Required `receive()` for rebates

Every contract that invokes agents MUST implement `receive() external payable` to accept refunds:

```solidity
contract MyAgent {
    receive() external payable {}
}
```

### Security check in callback

Always validate the caller:

```solidity
function handleResponse(...) external {
    require(msg.sender == AGENT_PLATFORM_ADDRESS, "Unauthorized callback");
    require(requestId == storedRequestId[someKey], "Unknown request");
    // ...
}
```

---

## 6. Agent Gas / Cost Model

### Two-pot deposit

Every `msg.value` splits into:

1. **Operations reserve** = `minPerAgentDeposit × subcommitteeSize`
   - Default: `0.01 × 3 = 0.03 SOMI/STT`
   - Pays gas refunds + callback gas + keeper fees

2. **Agent reward pot** = `msg.value − operations reserve`
   - Distributed equally to subcommittee members
   - `perAgentBudget = (deposit − reserve) / subcommitteeSize`

### Per-agent fixed prices

| Agent Type | Price | Rationale |
|---|---|---|
| JSON API Request | 0.03 SOMI/STT | Single HTTP call |
| LLM Inference | 0.07 SOMI/STT | GPU-backed |
| LLM Parse Website | 0.10 SOMI/STT | Browser + LLM |

### Total `msg.value` required (default subcommittee 3)

| Agent | Operations | Reward pot | **Total** |
|---|---|---|---|
| JSON API | 0.03 | 0.09 | **0.12 STT** |
| LLM Inference | 0.03 | 0.21 | **0.24 STT** |
| LLM Parse Website | 0.03 | 0.30 | **0.33 STT** |

### Critical gotcha

> "`getRequestDeposit()` returns the **operations-reserve floor** ... It is **not** the deposit you should send in practice — pay it only and your request will time out."

Sending exactly the floor gives `perAgentBudget = 0` → runners skip → timeout.

### Correct deposit formula

```
msg.value ≥ (minPerAgentDeposit × subSize) + (per_agent_price × subSize)
```

### Code: standard LLM Inference request

```solidity
uint256 floor = somniaAgents.getRequestDeposit();
uint256 perAgent = 0.07 ether;
uint256 deposit = floor + perAgent * 3;
somniaAgents.createRequest{value: deposit}(
    agentId,
    address(this),
    this.handleResponse.selector,
    payload
);
```

### Default config parameters

| Parameter | Default |
|---|---|
| `minPerAgentDeposit` | 0.01 SOMI/STT |
| `defaultSubcommitteeSize` | 3 |
| `defaultThreshold` | 2 |
| `defaultTimeout` | 15 minutes |

### Unanswered: agent IDs

Docs do not enumerate which `agentId` corresponds to LLM Inference vs JSON API. Action: query the platform contract at runtime or check `https://agents.somnia.network` UI, then hard-code in `agent/config.ts`.

---

## 7. Execution Receipts (Audit Trail)

### Retrieval

| Method | Endpoint |
|---|---|
| Web UI | `https://agents.somnia.network/receipts/<request-id>` |
| Mainnet API | `https://receipts.mainnet.agents.somnia.host?requestId=<id>` |
| Testnet API | `https://receipts.testnet.agents.somnia.host?requestId=<id>` |

### Contents

Each receipt is a timestamped sequence of step types:
- `request_received`
- `http_request` / `http_response`
- `llm_request` / `llm_response`
- `value_extracted`
- `response_encoded`
- `error`

### Consensus vs receipt

- The **final result** is what validators reach consensus on.
- The **receipt** captures *one validator's* execution trace — may vary node-to-node.

### Memogent use

Store `requestId` on-chain when invoking an agent. Frontend/judges can audit by appending `/receipts/<id>` to the Agent Explorer URL.

---

## 8. Somnia Reactivity Precompile

### Address (constant across networks)

```solidity
address constant SOMNIA_REACTIVITY_PRECOMPILE = 0x0000000000000000000000000000000000000100;
```

### Interface (verified working from SomMemo deploy)

```solidity
interface ISomniaReactivityPrecompile {
    struct SubscriptionData {
        bytes32[4] eventTopics;
        address origin;                 // address(0) = wildcard
        address caller;                 // address(0) = wildcard
        address emitter;                // 0x...0100 for system events
        address handlerContractAddress;
        bytes4 handlerFunctionSelector;
        uint64 priorityFeePerGas;       // uint64 NOT uint256 — runtime revert otherwise
        uint64 maxFeePerGas;            // uint64
        uint64 gasLimit;                // uint64
        bool isGuaranteed;
        bool isCoalesced;
    }

    function subscribe(SubscriptionData memory data) external returns (uint256 subscriptionId);
    function unsubscribe(uint256 subscriptionId) external;
    function getSubscriptionInfo(uint256 id) external view returns (SubscriptionData memory, address owner);
}

interface ISomniaEventHandler {
    function onEvent(
        uint256 subscriptionId,
        bytes32[] calldata eventTopics,
        bytes calldata eventData
    ) external;
}
```

### Three system events

| Event | Frequency | Use |
|---|---|---|
| `BlockTick(uint64 blockNumber)` | every block (~10/s) | continuous monitoring |
| `EpochTick(uint64 epoch, uint64 blockNumber)` | every epoch (~5 min) | periodic checks |
| `Schedule(uint256 timestampMillis)` | one-off at exact ms | deadlines, inheritance |

### Memogent uses Schedule

- Selector: `keccak256("Schedule(uint256)")`
- Timestamp in **milliseconds** (`block.timestamp * 1000`)
- One-off: auto-deleted after firing — no manual cleanup
- Minimum: next second from current block
- **±ms variance** in delivery — MUST round `(deadlineMs / 1000) * 1000` on store AND lookup

### Recommended gas config (medium-complexity handler)

```
priorityFeePerGas : 2_000_000_000   (2 gwei)
maxFeePerGas      : 10_000_000_000  (10 gwei)
gasLimit          : 3_000_000
isGuaranteed      : true
isCoalesced       : false
```

### Holding requirement

Subscription owner (your contract) must hold **≥ 32 STT/SOMI** at all times. Below this, all subscriptions pause silently. Not spent — just held.

### onEvent handler rules (from SomMemo battle-testing)

1. **DO NOT** `require(msg.sender == precompileAddress)` — Somnia execution engine uses a different address; this check causes silent failure.
2. Validate via your own `deadlineToOwner` mapping (only registered deadlines are processed).
3. `tx.origin` IS the subscription owner.
4. `subscriptionId` returned by `subscribe()` ≠ what Somnia passes to `onEvent()` (Somnia uses a global execution counter). Use deadline-based lookup as primary.
5. CEI pattern: set `executed=true` BEFORE any external transfer.

### Custom Solidity events as subscription source

Beyond system events, you can subscribe to events emitted by ANY contract. Set `emitter` to that contract's address. Use case for Memogent: subscribe to `MemogentAgent.RiskDecision` to trigger downstream actions.

---

## 9. Memogent-Specific Decisions & Gaps

### Decisions locked
- Network: Somnia **Testnet (50312)** for hackathon
- LLM: **`inferToolsChat`** (Somnia LLM Inference agent) only — no Claude/OpenAI
- Reactivity: Schedule event for inactivity deadline (same pattern as SomMemo)
- Build: **Foundry** (not Hardhat)
- Contract structure: 4-contract split (Core + Agent + Vault + Capsule)

### Known gaps to resolve during W1
- **Exact agent IDs** for `createRequest()` — not in docs; resolve via Agent Explorer UI or platform contract read
- **Reactivity SDK** (`@somnia-chain/reactivity`) version+API for off-chain agent — docs page 404'd, fetch separately or test directly
- **Receipt verification on-chain** — docs don't describe on-chain verification (only off-chain URL retrieval). Memogent stores `requestId` + treats receipt URL as audit artifact for judges.

### Things we know for certain
- Async callback model: every agent call needs `handleResponse()` callback + `receive()` for rebate
- Deposit math: LLM Inference = 0.24 STT per call. Memogent must hold buffer (e.g., 5 STT for ~20 calls)
- 32 STT holding requirement for Reactivity is SEPARATE from the agent budget — Memogent contract holds 32 + reserve for agent calls

---

## 10. Quick Reference URLs

| Topic | URL |
|---|---|
| Main docs | https://docs.somnia.network/ |
| Agents overview | https://docs.somnia.network/agents |
| Agent Explorer (UI) | https://agents.somnia.network |
| Network info | https://docs.somnia.network/developer/network-info |
| Agent gas fees | https://docs.somnia.network/agents/invoking-agents/gas-fees |
| Agent receipts | https://docs.somnia.network/agents/invoking-agents/receipts |
| Solidity invocation | https://docs.somnia.network/agents/invoking-agents/from-solidity |
| Reactivity overview | https://docs.somnia.network/developer/reactivity |
| Full docs export | https://docs.somnia.network/llms-full.txt |
| Dev Discord | `#dev-chat` |
| Dev Telegram | https://t.me/+XHq0F0JXMyhmMzM0 |
| Dev Email | developers@somnia.foundation |

---

*Last updated: 2026-05-14. Re-fetch quarterly or before any production deploy. Some Reactivity pages 404'd at fetch time — supplement with `reference/SomMemo/summary.md` §9-12 until docs are restored.*
