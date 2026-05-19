# Foundry Skill — Reference for Memogent Smart Contracts

> Authoritative reference for Foundry usage in Memogent.
> Sources: https://book.getfoundry.sh/ + https://github.com/foundry-rs/forge-std (fetched 2026-05-14)
> Pin: **Foundry v1.3+**, Solidity 0.8.28

---

## 1. Project setup

### Required `foundry.toml`

```toml
[profile.default]
src = "src"
test = "test"
out = "out"
solc_version = "0.8.28"
optimizer = true
optimizer_runs = 200
via_ir = false              # turn off until measured; via_ir slows compile 5-10x
fs_permissions = [{ access = "read", path = "./test/fixtures" }]

[profile.default.fuzz]
runs = 256
max_test_rejects = 65536

[profile.default.invariant]
runs = 256
depth = 15
fail_on_revert = false

[profile.ci.fuzz]
runs = 10000               # bump for CI

[profile.ci.invariant]
runs = 1024
depth = 50

[rpc_endpoints]
somnia_testnet = "${SOMNIA_RPC}"
somnia_mainnet = "${SOMNIA_MAINNET_RPC}"

[etherscan]
somnia = { key = "${SOMNIA_EXPLORER_API_KEY}", url = "https://shannon-explorer.somnia.network/api" }
```

### `remappings.txt`

```
@openzeppelin/=lib/openzeppelin-contracts/
forge-std/=lib/forge-std/src/
```

### Install dependencies

```bash
forge init --no-git --no-commit  # only if starting fresh
forge install foundry-rs/forge-std
forge install OpenZeppelin/openzeppelin-contracts
```

---

## 2. Test file naming convention

| Pattern | Purpose |
|---|---|
| `<Contract>.t.sol` | Test file (one per source contract) |
| `test_<Behavior>()` | Happy path |
| `test_RevertWhen_<Condition>()` | Expected revert — use `vm.expectRevert` BEFORE the call |
| `testFuzz_<Param>(uint256 x)` | Fuzz test |
| `invariant_<Property>()` | Stateful invariant |

```solidity
// test/MemogentCore.t.sol
contract MemogentCoreTest is Test {
    function test_RegisterWill_StoresOwner() public { /* ... */ }
    function test_RevertWhen_RegisterTwice() public {
        memogentCore.registerWill(beneficiary, 30 days);
        vm.expectRevert(MemogentCore.AlreadyRegistered.selector);
        memogentCore.registerWill(beneficiary, 30 days);
    }
    function testFuzz_DeadlineRespectsInactivePeriod(uint256 period) public { /* ... */ }
}
```

---

## 3. Essential cheatcodes for Memogent

### Time travel (for deadline / grace period tests)

```solidity
vm.warp(block.timestamp + 30 days);  // set block.timestamp
vm.roll(block.number + 100);          // set block.number
```

### Impersonation

```solidity
vm.prank(alice);                      // ONE call as alice
vm.startPrank(alice);                 // ALL calls as alice until vm.stopPrank()
vm.stopPrank();
```

### Balance manipulation

```solidity
vm.deal(alice, 100 ether);            // give alice STT
```

### Mock external calls

```solidity
// Mock Somnia Reactivity precompile
vm.mockCall(
    0x0000000000000000000000000000000000000100,
    abi.encodeWithSelector(ISomniaReactivityPrecompile.subscribe.selector),
    abi.encode(uint256(12345))   // mock subscription ID
);

// Mock Somnia Agent platform
vm.mockCall(
    0x037Bb9C718F3f7fe5eCBDB0b600D607b52706776,
    abi.encodeWithSelector(ISomniaAgents.createRequest.selector),
    abi.encode(uint256(67890))   // mock request ID
);
```

### Expect events

```solidity
vm.expectEmit(true, true, false, true);  // (idx1, idx2, idx3, dataCheck)
emit MemogentCore.WillRegistered(alice, beneficiary, deadlineMs);
memogentCore.registerWill(beneficiary, 30 days);
```

---

## 4. Fuzz testing — use `bound()`, NEVER `vm.assume`

```solidity
// ✅ RIGHT — bound() reshapes inputs into valid range
function testFuzz_DepositRespectsDailyBps(uint256 amt, uint16 bps) public {
    amt = bound(amt, 1 wei, 1_000_000 ether);
    bps = uint16(bound(bps, 1, 10_000));     // 0.01% to 100%
    vault.setDailyLimit(bps);
    vault.deposit{value: amt}();
    assertLe(vault.todaysWithdrawn(), amt * bps / 10_000);
}

// ❌ WRONG — vm.assume DISCARDS bad inputs, wastes runs
function testFuzz_BadPattern(uint256 amt) public {
    vm.assume(amt > 0 && amt < 1_000_000 ether);   // wastes most runs
    vault.deposit{value: amt}();
}
```

`bound` preserves all fuzz runs by reshaping. `vm.assume` rejects and burns runs.

---

## 5. Invariant testing for Vault

```solidity
// test/VaultHandler.sol — wraps SUT for invariant fuzzing
contract VaultHandler is Test {
    Vault vault;
    address[] public actors;

    function deposit(uint96 amt, uint256 actorSeed) external {
        amt = uint96(bound(amt, 1, 100 ether));
        address actor = actors[actorSeed % actors.length];
        vm.deal(actor, amt);
        vm.prank(actor);
        vault.deposit{value: amt}();
    }

    function withdraw(uint96 amt, uint256 actorSeed) external {
        address actor = actors[actorSeed % actors.length];
        amt = uint96(bound(amt, 1, vault.balanceOf(actor)));
        vm.prank(actor);
        vault.withdraw(amt);
    }
}

// test/Vault.invariant.t.sol
contract VaultInvariantTest is Test {
    VaultHandler handler;

    function setUp() public {
        vault = new Vault();
        handler = new VaultHandler(vault);
        targetContract(address(handler));  // fuzzer only calls handler
    }

    function invariant_TotalSupplyMatchesBalances() public {
        assertEq(vault.totalSupply(), _sumAllBalances());
    }

    function invariant_DailyWithdrawalNeverExceedsBps() public {
        assertLe(
            vault.todaysWithdrawn() * 10_000,
            vault.totalAssets() * vault.dailyBps()
        );
    }
}
```

Handler pattern ensures sequences stay valid through fuzz depth.

---

## 6. Testing async agent callbacks

The Somnia platform calls back into `handleResponse`. In tests, simulate via `vm.prank`:

```solidity
function test_HandleResponseFromPlatform() public {
    // 1. Trigger a request (which would normally invoke platform)
    vm.deal(address(this), 1 ether);
    uint256 reqId = agent.requestRiskAssessment(alice);

    // 2. Simulate platform calling back
    Response[] memory responses = new Response[](1);
    responses[0] = Response({
        validator: address(0xdead),
        result: abi.encode("GRACE"),
        status: ResponseStatus.Success,
        receipt: 0,
        timestamp: block.timestamp,
        executionCost: 0.07 ether
    });
    Request memory request;  // empty Request for the test

    vm.prank(AGENT_PLATFORM_ADDRESS);
    agent.handleResponse(reqId, responses, ResponseStatus.Success, request);

    // 3. Assert state change
    assertEq(uint8(agent.latestTag(alice)), uint8(RiskTag.GRACE));
}
```

---

## 7. Fork testing on Somnia Testnet

```bash
# Pin block for determinism — never rely on "latest"
forge test --fork-url $SOMNIA_RPC --fork-block-number 12345678 -vvv
```

```solidity
contract MemogentForkTest is Test {
    function setUp() public {
        vm.createSelectFork(vm.envString("SOMNIA_RPC"), 12345678);
    }

    function test_ReactivityPrecompile_Exists() public view {
        uint256 codeSize;
        address precompile = 0x0000000000000000000000000000000000000100;
        assembly { codeSize := extcodesize(precompile) }
        assertGt(codeSize, 0, "Reactivity precompile missing on this fork");
    }
}
```

Use fork tests sparingly — most logic should be unit-testable with mocks. Reserve forks for verifying precompile/platform existence.

---

## 8. Coverage

```bash
forge coverage --report lcov --report summary
```

Memogent targets:
- `MemogentCore`: 90%+ lines
- `MemogentAgent`: 80%+ (platform interaction needs fork tests for full coverage)
- `AgentVault`: 95%+ (critical money path)
- `TimeCapsule`: 90%+
- Mocks/scripts: not measured

---

## 9. Deployment via `forge script`

```solidity
// script/Deploy.s.sol
import {Script} from "forge-std/Script.sol";
import {MemogentCore} from "../src/core/MemogentCore.sol";
import {MemogentAgent} from "../src/core/MemogentAgent.sol";
import {AgentVault} from "../src/vault/AgentVault.sol";
import {TimeCapsule} from "../src/capsule/TimeCapsule.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerKey);

        MemogentCore core = new MemogentCore();
        MemogentAgent agent = new MemogentAgent(address(core));
        AgentVault vault = new AgentVault(address(agent));
        TimeCapsule capsule = new TimeCapsule(address(core));

        core.setAgent(address(agent));
        core.setVault(address(vault));
        core.setCapsule(address(capsule));

        vm.stopBroadcast();
    }
}
```

Run:
```bash
forge script script/Deploy.s.sol --rpc-url somnia_testnet --broadcast --verify
```

The `--broadcast` flag actually submits txs. The `--verify` flag attempts Etherscan-style verification using the config in `foundry.toml`.

---

## 10. Critical gotchas

- ⚠️ **`vm.warp` is sticky** — once called, subsequent calls don't auto-reset. Reset in `setUp` or test isolation.
- ⚠️ **`vm.prank` is ONE-shot** — only the next call is impersonated. Use `vm.startPrank`/`vm.stopPrank` for blocks.
- ⚠️ **`vm.mockCall` matches by FIRST 4 bytes** of calldata (selector). To match specific args, encode them too.
- ⚠️ **`forge coverage` is SLOW** — disable optimizer for accurate line coverage; expect 5-10x slower than tests.
- ⚠️ **`fs_permissions`** required for `vm.readFile` / `vm.readFileBinary` — explicitly list paths in `foundry.toml`.
- ⚠️ **`via_ir` slows compile drastically** — only enable if hitting "stack too deep" or contract size limits.
- ⚠️ **Don't pin Foundry to a specific commit** — use stable releases or `stable` tag.

---

## 11. Useful URLs

| Topic | URL |
|---|---|
| Foundry book | https://book.getfoundry.sh/ |
| Cheatcodes reference | https://getfoundry.sh/forge/cheatcodes |
| Fuzz testing | https://getfoundry.sh/forge/fuzz-testing |
| Invariant testing | https://getfoundry.sh/forge/invariant-testing |
| Fork testing | https://getfoundry.sh/forge/tests/fork-testing |
| Best practices | https://getfoundry.sh/guides/best-practices/writing-tests/ |
| Config reference | https://www.getfoundry.sh/config |
| forge-std | https://github.com/foundry-rs/forge-std |
| OpenZeppelin | https://github.com/OpenZeppelin/openzeppelin-contracts |

---

*Last updated: 2026-05-14. Update when Foundry releases a major version.*
