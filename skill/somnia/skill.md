# Somnia Skill — Reference for Memogent

> Authoritative reference for working with Somnia network, Reactivity precompile, and Agents.
> Sources: https://docs.somnia.network/ + https://docs.somnia.network/agents (fetched 2026-05-14)
> + verified field experience from SomMemo (`reference/SomMemo/summary.md` §9-12)
> + [Kali-Decoder/Somnia-Agentic-examples](https://github.com/Kali-Decoder/Somnia-Agentic-examples) (Somnia's own examples)

---

## 0. Locked decisions for Memogent

| Topic | Decision | Source |
|---|---|---|
| Network | Somnia Testnet (chain 50312) until production | hackathon scope |
| Agents in use | **LLM Inference + JSON API Request** (2 of 3 base agents) | research 2026-05-14 |
| LLM function | `inferString` (classification) + `inferNumber` (score) + `inferChat` (message) | battle-tested in 5 example contracts |
| **NOT using** | `inferToolsChat` (no production example), Parse Website (cost+latency+fragility) | research finding |
| Deposit buffer | +30% above nominal (0.30 STT for LLM, 0.16 STT for JSON API) | repo README recommendation |
| Subcommittee size | 3 (default) | docs |

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
| Receipts API | `https://receipts.mainnet.agents.somnia.host` |

### Testnet (Chain ID: 50312) — Memogent default

| Field | Value |
|---|---|
| RPC HTTP (new) | `https://api.infra.testnet.somnia.network/` |
| RPC HTTP (legacy, still works) | `https://dream-rpc.somnia.network` |
| RPC WSS | `wss://api.infra.testnet.somnia.network/ws` |
| Explorer (primary) | `https://shannon-explorer.somnia.network/` |
| Explorer (alt) | `https://somnia-testnet.socialscan.io` |
| Native token | STT (Somnia Test Tokens) |
| Agent Platform Contract | `0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776` |
| Faucet (primary) | `https://testnet.somnia.network/` |
| Reactivity Precompile | `0x0000000000000000000000000000000000000100` (same on both networks) |
| Receipts API | `https://receipts.testnet.agents.somnia.host` |
| Agent Explorer UI | `https://agents.somnia.network` |

---

## 2. Somnia Agents — Architecture

Somnia Agents are decentralized sandboxed compute containers. Contracts and users invoke them; a subcommittee of 3 validators executes the request; majority consensus (threshold 2) determines the result. Every invocation emits a **signed execution receipt** (audit trail).

### Three base agents available

1. **JSON API Request** — fetch external JSON, extract via dot-notation → on-chain oracle (✅ Memogent uses)
2. **LLM Inference** — deterministic LLM (fixed seed, controlled temperature) for text/number/chat (✅ Memogent uses)
3. **LLM Parse Website** — browser-render + LLM extract (❌ Memogent skips: see §11)

**No other agents exist.** "Idempotent Request", "JSON API Selector", "Find URL for Topic" referenced elsewhere all 404 on docs.

### Determinism guarantee

Quote from docs: *"LLMs with fixed random seeds and controlled temperature parameters to produce deterministic outputs — the same input always yields the same output across all validating nodes."* Temperature/seed are NOT user-tunable.

### Invocation model — ASYNC, callback-based

Contract calls `createRequest()` → request enters queue → validator subcommittee executes off-chain → platform calls back via `handleResponse()` on YOUR contract. Typical latency: 10-60 seconds for JSON API and LLM, 30-90 seconds for Parse Website.

---

## 3. Agent IDs (LOCKED — hard-code in Memogent)

```solidity
uint256 constant JSON_API_AGENT_ID    = 13174292974160097713;  // 0xB6CB1D9F538391F1
uint256 constant LLM_AGENT_ID         = 12847293847561029384;  // 0xB23FA1FD0F4FFE08
uint256 constant PARSE_WEBSITE_AGENT_ID = 12875401142070969085; // 0xB2A39E62488CB47D
```

Source: hardcoded constants in Kali-Decoder example contracts, cross-verified against the LLM Parse Website docs page. **NOT enumerated in any official registry view.** Memogent hard-codes these.

**Same IDs on mainnet and testnet** (only the platform address changes).

---

## 4. LLM Inference Agent — Reference

### Interface

```solidity
interface ILLMAgent {
    // String output, optionally constrained to allowedValues
    function inferString(
        string calldata prompt,
        string calldata system,
        bool chainOfThought,
        string[] calldata allowedValues   // empty = unconstrained
    ) external returns (string memory);

    // Integer output, bounded [minValue, maxValue]
    function inferNumber(
        string calldata prompt,
        string calldata system,
        int256 minValue,
        int256 maxValue,
        bool chainOfThought
    ) external returns (int256);

    // Multi-turn chat
    function inferChat(
        string[] calldata roles,    // e.g. ["system", "user", "assistant", "user"]
        string[] calldata messages,
        bool chainOfThought
    ) external returns (string memory);
}
```

### ⚠️ `inferToolsChat` — AVOID

Documented in official docs but **NOT used in any production example**. Treat as experimental.

```solidity
// DO NOT USE in Memogent v1
function inferToolsChat(
    string[] roles,
    string[] messages,
    string[] mcpServerUrls,
    OnchainTool[] onchainTools,
    uint256 maxIterations,
    bool chainOfThought
) returns (
    string finishReason,
    string response,
    string[] updatedRoles,
    string[] updatedMessages,
    string[] pendingToolCallIds,
    bytes[] pendingToolCalls
);
```

### Battle-tested usage patterns (verbatim from examples)

#### Constrained classification (`inferString` with `allowedValues`)

```solidity
// From DaoProposalReview.sol — 4-way classification
string[] memory allowedValues = new string[](4);
allowedValues[0] = "SAFE";
allowedValues[1] = "SPAM";
allowedValues[2] = "HARMFUL";
allowedValues[3] = "DUPLICATE";

bytes memory payload = abi.encodeWithSelector(
    ILLMAgent.inferString.selector,
    prompt,
    "You are a strict DAO governance moderator.",  // system
    false,                                          // chainOfThought
    allowedValues
);
```

**Memogent will use this pattern with `["SAFE", "WATCH", "GRACE", "EXECUTE"]`.**

#### Bounded numeric score (`inferNumber`)

```solidity
// From SentimentAnalyzer.sol — 1-100 sentiment score
bytes memory payload = abi.encodeWithSelector(
    ILLMAgent.inferNumber.selector,
    prompt,
    "You are a crypto market sentiment analyst. Return only a number.",
    int256(1),    // minValue
    int256(100),  // maxValue
    false         // chainOfThought
);
```

**Memogent will use this for risk score 0-100.**

### Constraints & limits

| Aspect | Value |
|---|---|
| Underlying model | NOT disclosed (opaque) |
| Temperature/seed | Fixed for determinism (not user-tunable) |
| Max prompt/response length | NOT documented — budget ~4 KB conservatively |
| `allowedValues` enforcement | STRICT — output is one of the strings exactly |
| `inferNumber` out-of-range | Coerced into [min, max] (undocumented; safe to assume) |
| `chainOfThought = true` | More tokens, slower, more nuanced reasoning |

---

## 5. JSON API Request Agent — Reference

### Interface

```solidity
interface IJsonApiAgent {
    function fetchString(string url, string selector) returns (string);
    function fetchUint(string url, string selector, uint8 decimals) returns (uint256);
    function fetchInt(string url, string selector, uint8 decimals) returns (int256);
    function fetchBool(string url, string selector) returns (bool);
    function fetchStringArray(string url, string selector) returns (string[]);
    function fetchUintArray(string url, string selector, uint8 decimals) returns (uint256[]);
}
```

### Selector syntax

Dot-notation with array indexing:
- `data.price` → `{"data": {"price": ...}}`
- `items[0].name` → `{"items": [{"name": ...}]}`
- `result.timestamp` → standard JSON-RPC response shape

### Decimals scaling

`decimals=8`:
- `42000.50` → `4200050000000`
- `0.00001234` → `1234`

### Battle-tested usage

```solidity
// From PriceOracle.sol — fetch BTC price as uint
bytes memory payload = abi.encodeWithSelector(
    IJsonApiAgent.fetchUint.selector,
    "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
    "bitcoin.usd",
    uint8(8)
);
```

### Constraints & limits

| Aspect | Value |
|---|---|
| HTTP methods | GET only (no parameter for POST body) |
| Auth headers / bearer tokens | **NOT supported** — function signature has no headers field |
| Response size limits | NOT documented |
| Timeout | Inherits platform default (15 min end-to-end) |
| Caching | NOT documented |
| Rate limits | NOT documented |
| Failure modes | Invalid JSON, selector miss, unreachable URL → `ResponseStatus.Failed` |

---

## 6. Invoking Agents from Solidity

### Platform interface

```solidity
interface ISomniaAgents {
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

    function getRequestDeposit() external view returns (uint256);
    function getAdvancedRequestDeposit(uint256 subSize) external view returns (uint256);
}
```

### ⚠️ `Request` struct — USE DOCS VERSION (includes `perAgentBudget`)

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
    uint256 perAgentBudget;     // ← Kali-Decoder repo OMITS this; do NOT copy their interface
}
```

### Required callback handler

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
    bytes result;             // ABI-encoded — type matches agent function's return
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
// LLM inferString → string
string memory tag = abi.decode(responses[0].result, (string));

// LLM inferNumber → int256
int256 score = abi.decode(responses[0].result, (int256));

// JSON API fetchUint → uint256
uint256 value = abi.decode(responses[0].result, (uint256));

// JSON API fetchBool → bool
bool flag = abi.decode(responses[0].result, (bool));
```

### MANDATORY `receive() external payable {}`

Without this, rebates from over-deposit are permanently lost. Add to EVERY contract that invokes agents.

```solidity
contract MemogentAgent {
    receive() external payable {}
}
```

### Security in callback

```solidity
function handleResponse(uint256 requestId, ...) external {
    require(msg.sender == AGENT_PLATFORM_ADDRESS, "unauthorized");
    require(pendingRequests[requestId].user != address(0), "unknown request");
    delete pendingRequests[requestId];  // prevent replay
    // ...
}
```

---

## 7. Gas / Cost Model

### Two-pot deposit

Every `msg.value` splits into:

1. **Operations reserve** = `minPerAgentDeposit × subcommitteeSize` = `0.01 × 3 = 0.03 STT`
2. **Agent reward pot** = `msg.value − operations reserve` (distributed equally to subcommittee)

### Per-agent fixed prices (subcommittee=3)

| Agent | Per-agent | Reward pot | **Nominal `msg.value`** | **Recommended (+30%)** |
|---|---|---|---|---|
| JSON API Request | 0.03 STT | 0.09 STT | 0.12 STT | **0.16 STT** |
| LLM Inference | 0.07 STT | 0.21 STT | 0.24 STT | **0.30 STT** |
| LLM Parse Website (not used) | 0.10 STT | 0.30 STT | 0.33 STT | 0.40 STT |

### ⚠️ TWO TRAPS

#### Trap 1: `getRequestDeposit()` is the FLOOR, not the deposit

Returns only `minPerAgentDeposit × subSize` = 0.03 STT. Sending exactly this → `perAgentBudget = 0` → runners skip request → silent timeout.

```solidity
// ❌ WRONG
uint256 deposit = platform.getRequestDeposit();
platform.createRequest{value: deposit}(...);  // Will time out

// ✅ RIGHT
uint256 floor = platform.getRequestDeposit();
uint256 perAgent = 0.07 ether;                // LLM Inference per-agent price
uint256 buffer = (perAgent * 3) * 30 / 100;   // 30% buffer
uint256 deposit = floor + (perAgent * 3) + buffer;
platform.createRequest{value: deposit}(...);
```

#### Trap 2: Insufficient budget = silent skip

Repo README explicitly mentions: *"If you receive `insufficient_budget` receipts, send additional STT while invoking the request."* Treat the 30% buffer as a requirement, not a suggestion.

### Default config

| Parameter | Default |
|---|---|
| `minPerAgentDeposit` | 0.01 STT/SOMI |
| `defaultSubcommitteeSize` | 3 |
| `defaultThreshold` | 2 |
| `defaultTimeout` | 15 minutes |

---

## 8. Execution Receipts (Audit Trail)

### Retrieval

| Method | Endpoint |
|---|---|
| Web UI | `https://agents.somnia.network/receipts/<request-id>` |
| Mainnet API | `https://receipts.mainnet.agents.somnia.host?requestId=<id>` |
| Testnet API | `https://receipts.testnet.agents.somnia.host?requestId=<id>` |

### Step types in receipt

- `request_received`
- `http_request` / `http_response`
- `llm_request` / `llm_response`
- `value_extracted`
- `response_encoded`
- `error`

### Critical — consensus vs receipt

- The **final encoded result** is what validators reach consensus on (use this for contract logic)
- The **receipt** captures ONE validator's execution trace — may vary between nodes (audit display only)

### Memogent storage pattern

Store `requestId` on-chain when invoking. Frontend appends `/receipts/<id>` for judge verification.

---

## 9. Somnia Reactivity Precompile

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
        address emitter;                // 0x...0100 for system events; or custom contract for custom events
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

| Event | Frequency | Memogent use |
|---|---|---|
| `BlockTick(uint64 blockNumber)` | every block (~10/s) | not used (too noisy) |
| `EpochTick(uint64 epoch, uint64 blockNumber)` | every epoch (~5 min) | not used |
| `Schedule(uint256 timestampMillis)` | one-off at exact ms | **YES — inactivity deadline trigger** |

### Schedule event specifics

- Selector: `keccak256("Schedule(uint256)")`
- Timestamp in **milliseconds** (`block.timestamp * 1000`)
- One-off: auto-deleted after firing — no manual cleanup
- Minimum: next second from current block
- **±ms variance** in delivery — MUST round `(deadlineMs / 1000) * 1000` on store AND lookup

### Recommended gas config (medium-complexity handler)

```solidity
priorityFeePerGas : 2_000_000_000   // 2 gwei
maxFeePerGas      : 10_000_000_000  // 10 gwei
gasLimit          : 3_000_000
isGuaranteed      : true
isCoalesced       : false
```

### Holding requirement

Subscription owner (your contract) must hold **≥ 32 STT/SOMI** at all times. Below this → all subscriptions pause silently. Not spent — just held.

### onEvent handler rules (from SomMemo battle-testing)

1. **DO NOT** `require(msg.sender == precompileAddress)` — Somnia execution engine uses a different address; this check causes silent failure.
2. Validate via your own `deadlineToOwner` mapping (only registered deadlines are processed).
3. `tx.origin` IS the subscription owner.
4. `subscriptionId` returned by `subscribe()` ≠ what Somnia passes to `onEvent()` (Somnia uses a global execution counter). Use deadline-based lookup as primary.
5. CEI pattern: set `executed=true` BEFORE any external transfer.

### Custom Solidity events as subscription source

Beyond system events, you can subscribe to events emitted by ANY contract. Set `emitter` to that contract's address. **Memogent uses this:** `MemogentCore` subscribes to `MemogentAgent.RiskDecision` events to react to AI decisions.

---

## 10. Working Code Patterns (verbatim from Kali-Decoder examples)

### Request lifecycle (PriceOracle.sol)

```solidity
function _requestPrice(string memory url, string memory selector) internal returns (uint256 requestId) {
    bytes memory payload = abi.encodeWithSelector(
        IJsonApiAgent.fetchUint.selector, url, selector, uint8(8)
    );
    uint256 deposit = REQUEST_DEPOSIT;          // 12e16 = 0.12 STT nominal (use 0.16 with buffer)
    require(msg.value >= deposit, "Insufficient deposit");
    requestId = PLATFORM.createRequest{value: deposit}(
        JSON_API_AGENT_ID,
        address(this),
        this.handleResponse.selector,
        payload
    );
    pendingRequests[requestId] = true;
    emit PriceRequested(requestId, url, selector);
    if (msg.value > deposit) {
        payable(msg.sender).transfer(msg.value - deposit);  // refund excess (defensive)
    }
}
```

### Callback security pattern

```solidity
function handleResponse(
    uint256 requestId,
    Response[] memory responses,
    ResponseStatus status,
    Request memory /* details */
) external {
    require(msg.sender == address(PLATFORM), "Only platform");
    require(pendingRequests[requestId], "Unknown request");
    delete pendingRequests[requestId];
    if (status == ResponseStatus.Success && responses.length > 0) {
        latestPrice = abi.decode(responses[0].result, (uint256));
        emit PriceReceived(requestId, latestPrice);
    } else {
        emit RequestFailed(requestId, status);
    }
}

receive() external payable {}  // MANDATORY
```

### Off-chain polling pattern (TypeScript via viem)

```typescript
const POLL_INTERVAL = 2000;
const TIMEOUT = 120_000;
const startTime = Date.now();
while (Date.now() - startTime < TIMEOUT) {
    const successEvents = await contract.getEvents.PriceReceived(
        { requestId },
        { fromBlock }
    );
    if (successEvents.length > 0) { /* handle */ break; }
    const failEvents = await contract.getEvents.RequestFailed(
        { requestId },
        { fromBlock }
    );
    if (failEvents.length > 0) { /* handle */ break; }
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
}
```

---

## 11. Why Memogent skips LLM Parse Website

| Factor | Detail |
|---|---|
| Cost | 0.33 STT/call (2× JSON API) |
| Latency | 30-90 seconds (browser render) |
| Sample contract bug | `WebDataExtractor.sol` uses wrong platform address `0x7407cb35...` |
| Fragility | Anti-bot (Cloudflare), JS-heavy SPAs, auth-walled pages |
| Use-case mismatch | Memogent signals are structured (timestamps, booleans) → JSON API enough |

For Memogent v1: skip. Document as "out of v1 scope" in pitch.

---

## 12. Memogent agent composition

```
TRIGGER (Schedule fires / daily heartbeat / user request)
    ↓
JSON API agent × 2 (parallel)
    ├─ fetchUint  — wallet last activity from Somnia explorer API
    └─ fetchBool  — Telegram bot health
    ↓ consensus-backed signals
LLM Inference × 2 (parallel)
    ├─ inferString — classification into [SAFE, WATCH, GRACE, EXECUTE]
    └─ inferNumber — risk score 0-100
    ↓
On-chain AgentDecisionReceipt + RiskDecision event
    ↓
[if GRACE/EXECUTE] LLM Inference inferChat → empathetic message
    ↓
Beneficiary notified (Telegram + on-chain event)
```

**Cost per full decision cycle:** ~0.92 STT (2 × 0.16 JSON API + 2 × 0.30 LLM). Daily heartbeat (signal-only, no LLM): ~0.32 STT.

---

## 13. Quick Reference URLs

| Topic | URL |
|---|---|
| Main docs | https://docs.somnia.network/ |
| Agents overview | https://docs.somnia.network/agents |
| Agent Explorer (UI) | https://agents.somnia.network |
| Network info | https://docs.somnia.network/developer/network-info |
| Agent gas fees | https://docs.somnia.network/agents/invoking-agents/gas-fees |
| Agent receipts | https://docs.somnia.network/agents/invoking-agents/receipts |
| Solidity invocation | https://docs.somnia.network/agents/invoking-agents/from-solidity |
| LLM Inference docs | https://docs.somnia.network/agents/base-agents/llm-inference |
| JSON API docs | https://docs.somnia.network/agents/base-agents/json-api-request |
| Reactivity overview | https://docs.somnia.network/developer/reactivity |
| Full docs export | https://docs.somnia.network/llms-full.txt |
| **Example repo** | https://github.com/Kali-Decoder/Somnia-Agentic-examples |
| Dev Telegram | https://t.me/+XHq0F0JXMyhmMzM0 |
| Dev Email | developers@somnia.foundation |

---

*Last updated: 2026-05-14. Re-fetch quarterly or before any production deploy. Some Reactivity docs pages 404'd at fetch time — supplement with `reference/SomMemo/summary.md` §9-12 until docs are restored.*
