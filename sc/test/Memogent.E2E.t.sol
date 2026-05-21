// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MemogentCore} from "../src/core/MemogentCore.sol";
import {MemogentAgent} from "../src/agent/MemogentAgent.sol";
import {MockSomniaPrecompile} from "./mocks/MockSomniaPrecompile.sol";
import {MockSomniaAgentPlatform} from "./mocks/MockSomniaAgentPlatform.sol";
import {ResponseStatus} from "../src/interfaces/SomniaAgentTypes.sol";

contract MemogentE2ETest is Test {
    MemogentCore core;
    MemogentAgent agent;
    MockSomniaPrecompile mockPrecompile;
    MockSomniaAgentPlatform mockPlatform;

    uint256 constant LLM_DEPOSIT = 0.4 ether;

    function setUp() public {
        mockPrecompile = new MockSomniaPrecompile();
        mockPlatform = new MockSomniaAgentPlatform();

        core = new MemogentCore(address(mockPrecompile));
        agent = new MemogentAgent(address(mockPlatform), address(core));

        core.setAgentAuthority(address(agent));
    }

    function test_E2E_FullInheritanceLifecycle() public {
        address alice = makeAddr("alice");
        address bob = makeAddr("bob");
        address charlie = makeAddr("charlie");

        vm.deal(alice, 10 ether);
        vm.deal(charlie, 5 ether);

        // === Day 0: Alice sets up her digital will ===
        vm.prank(alice);
        core.registerWill(bob, 30 days);

        vm.prank(alice);
        core.depositSTT{value: 5 ether}();
        assertEq(core.vaultSTT(alice), 5 ether);

        // === Day 5: Alice checks in (still active) ===
        vm.warp(block.timestamp + 5 days);
        vm.prank(alice);
        core.checkIn();

        // Charlie monitors Alice's status — LLM says SAFE
        vm.prank(charlie);
        uint256 req1 = agent.assessRisk{value: LLM_DEPOSIT}(alice);
        mockPlatform.triggerCallback(req1, "SAFE", ResponseStatus.Success);

        (string memory cls1, , ) = agent.latestAssessment(alice);
        assertEq(cls1, "SAFE");

        (, , , , , bool executed, bool active, ) = core.wills(alice);
        assertFalse(executed);
        assertTrue(active);
        assertEq(core.vaultSTT(alice), 5 ether);

        // === Day 20: Alice has been quiet for 15 days (50% of threshold) ===
        vm.warp(block.timestamp + 15 days);

        vm.prank(charlie);
        uint256 req2 = agent.assessRisk{value: LLM_DEPOSIT}(alice);
        mockPlatform.triggerCallback(req2, "WATCH", ResponseStatus.Success);

        (string memory cls2, , ) = agent.latestAssessment(alice);
        assertEq(cls2, "WATCH");

        (, , , , , executed, active, ) = core.wills(alice);
        assertFalse(executed);
        assertTrue(active);

        // === Day 32: Alice has missed her deadline (107% of threshold) ===
        vm.warp(block.timestamp + 12 days);

        vm.prank(charlie);
        uint256 req3 = agent.assessRisk{value: LLM_DEPOSIT}(alice);

        uint256 bobBalanceBefore = bob.balance;

        mockPlatform.triggerCallback(req3, "EXECUTE", ResponseStatus.Success);

        // Bob receives the inheritance
        assertEq(bob.balance, bobBalanceBefore + 5 ether);
        assertEq(core.vaultSTT(alice), 0);

        // Will is permanently executed
        (, , , , , executed, active, ) = core.wills(alice);
        assertTrue(executed);
        assertFalse(active);

        (string memory cls3, , ) = agent.latestAssessment(alice);
        assertEq(cls3, "EXECUTE");
    }

    function test_E2E_NoExecution_WhenAlwaysSafe() public {
        address alice = makeAddr("alice");
        address bob = makeAddr("bob");

        vm.deal(alice, 10 ether);
        vm.deal(address(this), 5 ether);

        vm.prank(alice);
        core.registerWill(bob, 30 days);

        vm.prank(alice);
        core.depositSTT{value: 5 ether}();

        for (uint256 i = 0; i < 3; i++) {
            if (i > 0) vm.warp(block.timestamp + 2 hours);
            uint256 reqId = agent.assessRisk{value: LLM_DEPOSIT}(alice);
            mockPlatform.triggerCallback(reqId, "SAFE", ResponseStatus.Success);
        }

        (, , , , , bool executed, bool active, ) = core.wills(alice);
        assertFalse(executed);
        assertTrue(active);
        assertEq(core.vaultSTT(alice), 5 ether);
        assertEq(bob.balance, 0);
    }

    function test_E2E_CannotReexecute_AfterEXECUTE() public {
        address alice = makeAddr("alice");
        address bob = makeAddr("bob");

        vm.deal(alice, 10 ether);
        vm.deal(address(this), 5 ether);

        vm.prank(alice);
        core.registerWill(bob, 30 days);

        vm.prank(alice);
        core.depositSTT{value: 5 ether}();

        vm.warp(block.timestamp + 32 days);
        uint256 req1 = agent.assessRisk{value: LLM_DEPOSIT}(alice);
        mockPlatform.triggerCallback(req1, "EXECUTE", ResponseStatus.Success);

        assertEq(bob.balance, 5 ether);

        // Try to assess again — will is no longer active, should revert
        vm.warp(block.timestamp + 2 hours);
        vm.expectRevert("MemogentAgent: will inactive");
        agent.assessRisk{value: LLM_DEPOSIT}(alice);
    }

    receive() external payable {}
}
