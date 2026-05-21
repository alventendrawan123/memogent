// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MemogentCore} from "../src/core/MemogentCore.sol";
import {MockSomniaPrecompile} from "./mocks/MockSomniaPrecompile.sol";

contract MemogentCoreTest is Test {
    MemogentCore memogentCore;
    MockSomniaPrecompile mockPrecompile;

    address owner;
    address beneficiary;
    address hacker;

    function setUp() public {
        owner = address(this);
        beneficiary = makeAddr("beneficiary");
        hacker = makeAddr("hacker");

        mockPrecompile = new MockSomniaPrecompile();
        memogentCore = new MemogentCore(address(mockPrecompile));
    }

    function test_RegisterWill_StoresOwner() public {
        memogentCore.registerWill(beneficiary, 30 days);
        (address bnf, , uint256 period, , bool executed, bool active) =
            memogentCore.getWillInfo(owner);
        assertEq(bnf, beneficiary);
        assertEq(period, 30 days);
        assertFalse(executed);
        assertTrue(active);
    }

    function test_RevertWhen_BeneficiaryEqualsOwner() public {
        vm.expectRevert(bytes("Memogent: Beneficiary cannot be the same as owner"));
        memogentCore.registerWill(owner, 30 days);
    }

    function test_RevertWhen_RegisterTwice() public {
        memogentCore.registerWill(beneficiary, 30 days);
        vm.expectRevert(bytes("Memogent: Will already registered"));
        memogentCore.registerWill(beneficiary, 90 days);
    }

    function test_DepositSTT_IncreasesVault() public {
        memogentCore.registerWill(beneficiary, 30 days);
        vm.deal(owner, 10 ether);
        memogentCore.depositSTT{value: 1 ether}();
        assertEq(memogentCore.vaultSTT(owner), 1 ether);
    }

    function test_RevertWhen_DepositZeroSTT() public {
        memogentCore.registerWill(beneficiary, 30 days);
        vm.expectRevert(bytes("Memogent: Amount must be greater than 0"));
        memogentCore.depositSTT{value: 0}();
    }

    function test_CheckIn_UpdatesLastCheckIn() public {
        memogentCore.registerWill(beneficiary, 30 days);
        (, uint256 beforeTs, , , , ) = memogentCore.getWillInfo(owner);

        vm.warp(block.timestamp + 1 hours);
        memogentCore.checkIn();

        (, uint256 afterTs, , , , ) = memogentCore.getWillInfo(owner);
        assertGt(afterTs, beforeTs);
    }

    function test_OnEvent_TransfersSTTToBeneficiary() public {
        memogentCore.registerWill(beneficiary, 30 days);
        vm.deal(owner, 10 ether);
        memogentCore.depositSTT{value: 1 ether}();

        uint256 beneficiaryBefore = beneficiary.balance;
        (, , , uint256 deadlineMs, , ) = memogentCore.getWillInfo(owner);

        vm.warp(deadlineMs / 1000 + 1);
        mockPrecompile.triggerOnEvent(address(memogentCore), 1);

        assertGt(beneficiary.balance, beneficiaryBefore);
        assertEq(memogentCore.vaultSTT(owner), 0);

        (, , , , bool executed, bool active) = memogentCore.getWillInfo(owner);
        assertTrue(executed);
        assertFalse(active);
    }

    function test_OnEvent_SilentReturn_WhenUnknownSubscription() public {
        memogentCore.registerWill(beneficiary, 30 days);
        vm.deal(owner, 10 ether);
        memogentCore.depositSTT{value: 1 ether}();

        bytes32[] memory emptyTopics = new bytes32[](0);
        vm.prank(hacker);
        memogentCore.onEvent(999, emptyTopics, "");

        assertEq(memogentCore.vaultSTT(owner), 1 ether);
    }

    function test_SetAgentAuthority_StoresAddress() public {
        address agent = makeAddr("agent");
        memogentCore.setAgentAuthority(agent);
        assertEq(memogentCore.agentAuthority(), agent);
    }

    function test_RevertWhen_NonDeployerSetsAgent() public {
        address agent = makeAddr("agent");
        vm.prank(hacker);
        vm.expectRevert(bytes("Memogent: not deployer"));
        memogentCore.setAgentAuthority(agent);
    }

    function test_RevertWhen_SetAgentTwice() public {
        address agent = makeAddr("agent");
        memogentCore.setAgentAuthority(agent);

        address newAgent = makeAddr("newAgent");
        vm.expectRevert(bytes("Memogent: agent already set"));
        memogentCore.setAgentAuthority(newAgent);
    }

    function test_RevertWhen_SetAgentToZero() public {
        vm.expectRevert(bytes("Memogent: zero address"));
        memogentCore.setAgentAuthority(address(0));
    }

    function test_ExecuteFromAgent_RevertWhen_NotAgent() public {
        memogentCore.registerWill(beneficiary, 30 days);

        vm.expectRevert(bytes("Memogent: not agent"));
        memogentCore.executeFromAgent(owner);
    }

    function test_ExecuteFromAgent_TriggersInheritance() public {
        memogentCore.registerWill(beneficiary, 30 days);
        vm.deal(owner, 10 ether);
        memogentCore.depositSTT{value: 1 ether}();

        address agent = makeAddr("agent");
        memogentCore.setAgentAuthority(agent);

        uint256 beneficiaryBefore = beneficiary.balance;

        vm.prank(agent);
        memogentCore.executeFromAgent(owner);

        assertEq(beneficiary.balance, beneficiaryBefore + 1 ether);
        assertEq(memogentCore.vaultSTT(owner), 0);

        (, , , , bool executed, bool active) = memogentCore.getWillInfo(owner);
        assertTrue(executed);
        assertFalse(active);
    }

    receive() external payable {}
}
