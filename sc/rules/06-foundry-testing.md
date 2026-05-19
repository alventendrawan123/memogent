# Smart Contract Rules — Foundry Testing

Testing patterns specific to Memogent's contracts.

> Full Foundry reference: [`skill/foundry/skill.md`](../../skill/foundry/skill.md).
> This file = project-specific testing rules.

## Foundry version

Pin to **stable v1.3+** in `foundry.toml` profile. Don't pin to a specific commit; use stable releases.

## Test layout

```
sc/test/
├── MemogentCore.t.sol           unit tests for core
├── MemogentAgent.t.sol          unit tests for agent
├── AgentVault.t.sol             unit tests for vault
├── TimeCapsule.t.sol            unit tests for capsule
├── integration/
│   ├── HappyPath.t.sol          end-to-end: register → grace → execute
│   ├── Reactivity.t.sol         reactivity precompile mock flows
│   └── AgentCallbacks.t.sol     agent platform mock flows
├── invariant/
│   ├── Vault.invariant.t.sol    vault property tests
│   └── VaultHandler.sol         handler for invariant fuzzing
├── fork/
│   └── SomniaPrecompiles.t.sol  fork-test precompile + agent platform exist
├── mocks/
│   ├── MockSomniaPrecompile.sol  (port from SomMemo reference)
│   └── MockAgentPlatform.sol     (new — simulate createRequest + callbacks)
└── fixtures/
    └── prompts.json              test prompts for LLM mock returns
```

## Test naming (enforced)

| Pattern | Purpose |
|---|---|
| `test_<Behavior>()` | Happy path |
| `test_RevertWhen_<Condition>()` | Expected revert — `vm.expectRevert` BEFORE the call |
| `testFuzz_<Param>(uint256 x)` | Fuzz test |
| `invariant_<Property>()` | Stateful invariant |

## Mock Somnia Reactivity precompile

Port `reference/SomMemo/sc/contracts/mock/MockSomniaPrecompile.sol` directly:

```solidity
// test/mocks/MockSomniaPrecompile.sol
import {ISomniaReactivityPrecompile, ISomniaEventHandler} from "../../src/interfaces/ISomniaReactivityPrecompile.sol";

contract MockSomniaPrecompile is ISomniaReactivityPrecompile {
    uint256 private nextId = 1;
    mapping(uint256 => SubscriptionData) public subscriptions;

    function subscribe(SubscriptionData memory data) external returns (uint256) {
        uint256 id = nextId++;
        subscriptions[id] = data;
        return id;
    }

    function unsubscribe(uint256 id) external { delete subscriptions[id]; }

    // Test helper: manually fire onEvent on the handler
    function triggerEvent(uint256 subscriptionId, uint256 deadlineMs) external {
        SubscriptionData memory s = subscriptions[subscriptionId];
        bytes32[] memory topics = new bytes32[](2);
        topics[0] = keccak256("Schedule(uint256)");
        topics[1] = bytes32(deadlineMs);
        ISomniaEventHandler(s.handlerContractAddress).onEvent(subscriptionId, topics, "");
    }

    function getSubscriptionInfo(uint256 id) external view returns (SubscriptionData memory, address owner) {
        return (subscriptions[id], address(0));
    }
}
```

## Mock Agent Platform (new — not in SomMemo)

```solidity
// test/mocks/MockAgentPlatform.sol
import {ISomniaAgents, Response, ResponseStatus, Request} from "../../src/interfaces/ISomniaAgents.sol";

contract MockAgentPlatform is ISomniaAgents {
    uint256 private nextId = 1;
    struct StoredReq {
        address callback;
        bytes4 selector;
        bytes payload;
    }
    mapping(uint256 => StoredReq) public stored;

    function createRequest(
        uint256 /*agentId*/,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256) {
        uint256 id = nextId++;
        stored[id] = StoredReq(callbackAddress, callbackSelector, payload);
        return id;
    }

    function getRequestDeposit() external pure returns (uint256) { return 0.03 ether; }

    // Test helper: simulate platform calling back with a result
    function fireCallback(uint256 requestId, bytes memory result, ResponseStatus status) external {
        StoredReq memory req = stored[requestId];
        Response[] memory responses = new Response[](1);
        responses[0] = Response({
            validator: address(this),
            result: result,
            status: status,
            receipt: 0,
            timestamp: block.timestamp,
            executionCost: 0
        });
        Request memory r;  // empty for mock
        (bool ok, ) = req.callback.call(
            abi.encodeWithSelector(req.selector, requestId, responses, status, r)
        );
        require(ok, "callback failed");
    }

    receive() external payable {}
}
```

## Time travel for deadline tests

```solidity
function test_OnEvent_FiresAfterDeadline() public {
    memogentCore.registerWill(beneficiary, 30 days);
    Will memory w = memogentCore.willInfo(alice);
    uint256 deadlineMs = w.deadlineMs;

    // Travel to AFTER deadline
    vm.warp((deadlineMs / 1000) + 1);

    // Mock fires the event
    mockPrecompile.triggerEvent(w.subscriptionId, deadlineMs);

    // Assert RiskEscalation emitted, agent invoked
    assertEq(uint8(memogentCore.status(alice)), uint8(Status.Escalated));
}
```

## Testing async agent callbacks

```solidity
function test_HandleResponse_AppliesRiskTag() public {
    // 1. Trigger request (mock platform stores it)
    vm.deal(address(memogentAgent), 1 ether);
    uint256 reqId = memogentAgent.requestRiskAssessment(alice);

    // 2. Mock platform fires callback with "GRACE"
    mockPlatform.fireCallback(reqId, abi.encode("GRACE"), ResponseStatus.Success);

    // 3. Assert state changed
    assertEq(memogentAgent.latestTag(alice), "GRACE");
}
```

## Fuzz testing daily/weekly vault limits

```solidity
function testFuzz_VaultRespectsDailyLimit(uint128 deposited, uint16 bps) public {
    deposited = uint128(bound(deposited, 1 ether, 100_000 ether));
    bps = uint16(bound(bps, 1, 10_000));  // 0.01% to 100%

    vm.deal(alice, deposited);
    vm.prank(alice);
    vault.deposit{value: deposited}();
    vault.setDailyLimit(alice, bps);

    uint256 maxRelease = uint256(deposited) * bps / 10_000;
    vm.prank(address(memogentAgent));
    vault.releaseStage(alice, maxRelease + 1);  // should clamp or revert

    assertLe(vault.todaysReleased(alice), maxRelease);
}
```

## Invariant tests for vault

```solidity
// test/invariant/Vault.invariant.t.sol
contract VaultInvariantTest is Test {
    AgentVault vault;
    VaultHandler handler;

    function setUp() public {
        vault = new AgentVault(address(this));
        handler = new VaultHandler(vault);
        targetContract(address(handler));
    }

    function invariant_TotalSupplyEqualsSumOfDeposits() public {
        assertEq(vault.totalAssets(), handler.sumDeposits());
    }

    function invariant_DailyReleasedNeverExceedsLimit() public {
        for (uint i = 0; i < handler.actorCount(); i++) {
            address a = handler.actors(i);
            assertLe(
                vault.todaysReleased(a) * 10_000,
                vault.balanceOf(a) * vault.dailyBps(a)
            );
        }
    }
}
```

## Fork tests (use sparingly)

Only for verifying Somnia precompile / platform exist. Pin to a specific block:

```bash
forge test --match-path test/fork/*.t.sol --fork-url somnia_testnet --fork-block-number 12345678
```

```solidity
function test_PrecompileExists_OnFork() public view {
    address precompile = 0x0000000000000000000000000000000000000100;
    uint256 codeSize;
    assembly { codeSize := extcodesize(precompile) }
    assertGt(codeSize, 0);
}

function test_AgentPlatformExists_OnFork() public view {
    address platform = 0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776;
    uint256 codeSize;
    assembly { codeSize := extcodesize(platform) }
    assertGt(codeSize, 0);
}
```

Don't run fork tests in CI by default — they consume RPC quota. Reserve for periodic manual verification.

## Coverage targets

| Contract | Lines target |
|---|---|
| `MemogentCore` | 90%+ |
| `MemogentAgent` | 80%+ (platform interaction lower) |
| `AgentVault` | 95%+ (money path) |
| `TimeCapsule` | 90%+ |
| Mocks | not measured |

```bash
forge coverage --report lcov --report summary
```

## Forbidden

- ❌ `vm.assume` for fuzz inputs (use `bound`)
- ❌ Fork tests in CI default (RPC quota)
- ❌ Sharing state between tests (Foundry resets per-test, but mock state is shared if not reset in `setUp`)
- ❌ `via_ir` enabled unless we hit "stack too deep" or size limit
- ❌ Pinning Foundry to specific commit (use stable releases)
- ❌ Calling real Somnia precompiles in unit tests (always mock)
- ❌ Testing only happy paths — every `revert` in source code needs a `test_RevertWhen_*`
