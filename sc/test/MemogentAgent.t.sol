// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {MemogentCore} from "../src/core/MemogentCore.sol";
import {MemogentAgent} from "../src/agent/MemogentAgent.sol";
import {MockSomniaPrecompile} from "./mocks/MockSomniaPrecompile.sol";
import {MockSomniaAgentPlatform} from "./mocks/MockSomniaAgentPlatform.sol";
import {Request, Response, ResponseStatus} from "../src/interfaces/SomniaAgentTypes.sol";

contract MemogentAgentTest is Test {
    MemogentCore core;
    MemogentAgent agent;
    MockSomniaPrecompile mockPrecompile;
    MockSomniaAgentPlatform mockPlatform;

    address user;
    address beneficiary;
    address stranger;

    uint256 constant INACTIVE_PERIOD = 30 days;
    uint256 constant LLM_DEPOSIT = 0.303 ether;

    function setUp() public {
        user = makeAddr("user");
        beneficiary = makeAddr("beneficiary");
        stranger = makeAddr("stranger");

        mockPrecompile = new MockSomniaPrecompile();
        mockPlatform = new MockSomniaAgentPlatform();

        core = new MemogentCore(address(mockPrecompile));
        agent = new MemogentAgent(address(mockPlatform), address(core));

        core.setAgentAuthority(address(agent));

        vm.deal(user, 10 ether);
        vm.deal(address(this), 10 ether);

        vm.prank(user);
        core.registerWill(beneficiary, INACTIVE_PERIOD);
    }

    function test_AssessRisk_DispatchesRequest() public {
        uint256 requestId = agent.assessRisk{value: LLM_DEPOSIT}(user);

        assertEq(requestId, 1);
        (address pendingUser, uint256 requestedAt) = agent.pendingAssessments(requestId);
        assertEq(pendingUser, user);
        assertEq(requestedAt, block.timestamp);
    }

    function test_AssessRisk_RevertWhen_ZeroUser() public {
        vm.expectRevert("MemogentAgent: zero user");
        agent.assessRisk{value: LLM_DEPOSIT}(address(0));
    }

    function test_AssessRisk_RevertWhen_NoWill() public {
        vm.expectRevert("MemogentAgent: no will");
        agent.assessRisk{value: LLM_DEPOSIT}(stranger);
    }

    function test_AssessRisk_RevertWhen_InsufficientDeposit() public {
        vm.expectRevert("MemogentAgent: insufficient deposit");
        agent.assessRisk{value: 0.1 ether}(user);
    }

    function test_AssessRisk_RevertWhen_CooldownActive() public {
        agent.assessRisk{value: LLM_DEPOSIT}(user);

        vm.expectRevert("MemogentAgent: cooldown active");
        agent.assessRisk{value: LLM_DEPOSIT}(user);
    }

    function test_AssessRisk_AllowsAfterCooldown() public {
        agent.assessRisk{value: LLM_DEPOSIT}(user);

        vm.warp(block.timestamp + 1 hours + 1);
        uint256 secondRequestId = agent.assessRisk{value: LLM_DEPOSIT}(user);
        assertEq(secondRequestId, 2);
    }

    function test_AssessRisk_RefundsExcess() public {
        uint256 balBefore = address(this).balance;
        agent.assessRisk{value: 1 ether}(user);
        uint256 balAfter = address(this).balance;
        assertEq(balBefore - balAfter, LLM_DEPOSIT);
    }

    function test_HandleResponse_RevertWhen_NotPlatform() public {
        Response[] memory emptyResponses = new Response[](0);
        Request memory emptyRequest;

        vm.expectRevert("MemogentAgent: not platform");
        agent.handleResponse(1, emptyResponses, ResponseStatus.Success, emptyRequest);
    }

    function test_HandleResponse_RevertWhen_UnknownRequest() public {
        Response[] memory emptyResponses = new Response[](0);
        Request memory emptyRequest;

        vm.prank(address(mockPlatform));
        vm.expectRevert("MemogentAgent: unknown request");
        agent.handleResponse(999, emptyResponses, ResponseStatus.Success, emptyRequest);
    }

    function test_HandleResponse_StoresAssessment_OnSafe() public {
        uint256 requestId = agent.assessRisk{value: LLM_DEPOSIT}(user);

        mockPlatform.triggerCallback(requestId, "SAFE", ResponseStatus.Success);

        (string memory classification, uint256 assessedAt, uint256 storedRequestId) = agent.latestAssessment(user);
        assertEq(classification, "SAFE");
        assertEq(assessedAt, block.timestamp);
        assertEq(storedRequestId, requestId);
    }

    function test_HandleResponse_DoesNotExecute_OnSafe() public {
        uint256 requestId = agent.assessRisk{value: LLM_DEPOSIT}(user);
        mockPlatform.triggerCallback(requestId, "SAFE", ResponseStatus.Success);

        (, , , , , bool executed, bool active, ) = core.wills(user);
        assertFalse(executed);
        assertTrue(active);
    }

    function test_HandleResponse_TriggersExecute_OnEXECUTE() public {
        vm.prank(user);
        core.depositSTT{value: 1 ether}();

        uint256 beneficiaryBalBefore = beneficiary.balance;
        uint256 requestId = agent.assessRisk{value: LLM_DEPOSIT}(user);

        mockPlatform.triggerCallback(requestId, "EXECUTE", ResponseStatus.Success);

        (, , , , , bool executed, bool active, ) = core.wills(user);
        assertTrue(executed);
        assertFalse(active);
        assertEq(beneficiary.balance, beneficiaryBalBefore + 1 ether);
    }

    function test_HandleResponse_EmitsAssessmentFailed_OnFailedStatus() public {
        uint256 requestId = agent.assessRisk{value: LLM_DEPOSIT}(user);

        mockPlatform.triggerCallback(requestId, "", ResponseStatus.Failed);

        (string memory classification, , ) = agent.latestAssessment(user);
        assertEq(classification, "");

        (, , , , , bool executed, , ) = core.wills(user);
        assertFalse(executed);
    }

    function test_HandleResponse_DeletesPending_OnSuccess() public {
        uint256 requestId = agent.assessRisk{value: LLM_DEPOSIT}(user);
        mockPlatform.triggerCallback(requestId, "WATCH", ResponseStatus.Success);

        (address pendingUser, ) = agent.pendingAssessments(requestId);
        assertEq(pendingUser, address(0));
    }

    function test_AssessRiskWithContext_DispatchesRequest() public {
        string memory ctx = "lastTxAgeHours=2; tgLastSeenHours=1";
        uint256 requestId = agent.assessRiskWithContext{value: LLM_DEPOSIT}(user, ctx);

        assertEq(requestId, 1);
        (address pendingUser, ) = agent.pendingAssessments(requestId);
        assertEq(pendingUser, user);
    }

    function test_AssessRiskWithContext_FullFlow_TriggersExecute() public {
        vm.prank(user);
        core.depositSTT{value: 1 ether}();

        string memory ctx = "lastTxAgeHours=720; tgLastSeenHours=720";
        uint256 requestId = agent.assessRiskWithContext{value: LLM_DEPOSIT}(user, ctx);

        uint256 beneficiaryBalBefore = beneficiary.balance;
        mockPlatform.triggerCallback(requestId, "EXECUTE", ResponseStatus.Success);

        (, , , , , bool executed, , ) = core.wills(user);
        assertTrue(executed);
        assertEq(beneficiary.balance, beneficiaryBalBefore + 1 ether);
    }

    function test_GenerateEmpathy_RevertWhen_ZeroUser() public {
        vm.expectRevert("MemogentAgent: zero user");
        agent.generateEmpathyMessage{value: LLM_DEPOSIT}(address(0));
    }

    function test_GenerateEmpathy_RevertWhen_NoWill() public {
        vm.expectRevert("MemogentAgent: no will");
        agent.generateEmpathyMessage{value: LLM_DEPOSIT}(stranger);
    }

    function test_GenerateEmpathy_RevertWhen_NotExecuted() public {
        vm.expectRevert("MemogentAgent: will not yet executed");
        agent.generateEmpathyMessage{value: LLM_DEPOSIT}(user);
    }

    function test_GenerateEmpathy_DispatchesAfterExecution() public {
        vm.prank(user);
        core.depositSTT{value: 1 ether}();
        uint256 assessReq = agent.assessRisk{value: LLM_DEPOSIT}(user);
        mockPlatform.triggerCallback(assessReq, "EXECUTE", ResponseStatus.Success);

        uint256 empathyReq = agent.generateEmpathyMessage{value: LLM_DEPOSIT}(user);
        assertEq(empathyReq, 2);
        assertEq(agent.pendingEmpathy(empathyReq), user);
    }

    function test_HandleResponse_Empathy_StoresMessage() public {
        vm.prank(user);
        core.depositSTT{value: 1 ether}();
        uint256 assessReq = agent.assessRisk{value: LLM_DEPOSIT}(user);
        mockPlatform.triggerCallback(assessReq, "EXECUTE", ResponseStatus.Success);

        uint256 empathyReq = agent.generateEmpathyMessage{value: LLM_DEPOSIT}(user);
        string memory genMsg = "I am sorry I could not reach you in person. Thank you for being my person. Take care of yourself.";
        mockPlatform.triggerCallback(empathyReq, genMsg, ResponseStatus.Success);

        assertEq(agent.empathyMessages(user), genMsg);
        assertEq(agent.pendingEmpathy(empathyReq), address(0));
    }

    function test_GenerateEmpathy_RevertWhen_AlreadyGenerated() public {
        vm.prank(user);
        core.depositSTT{value: 1 ether}();
        uint256 assessReq = agent.assessRisk{value: LLM_DEPOSIT}(user);
        mockPlatform.triggerCallback(assessReq, "EXECUTE", ResponseStatus.Success);

        uint256 empathyReq = agent.generateEmpathyMessage{value: LLM_DEPOSIT}(user);
        mockPlatform.triggerCallback(empathyReq, "some message", ResponseStatus.Success);

        vm.expectRevert("MemogentAgent: message already generated");
        agent.generateEmpathyMessage{value: LLM_DEPOSIT}(user);
    }

    receive() external payable {}
}
