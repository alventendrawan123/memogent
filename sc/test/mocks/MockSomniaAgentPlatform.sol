// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISomniaAgentPlatform} from "../../src/interfaces/ISomniaAgentPlatform.sol";
import {IAgentCallback} from "../../src/interfaces/IAgentCallback.sol";
import {Request, Response, ResponseStatus, ConsensusType} from "../../src/interfaces/SomniaAgentTypes.sol";

contract MockSomniaAgentPlatform is ISomniaAgentPlatform {
    uint256 private _nextRequestId = 1;

    struct StoredRequest {
        uint256 agentId;
        address callbackAddress;
        bytes4 callbackSelector;
        bytes payload;
        uint256 deposit;
    }

    mapping(uint256 => StoredRequest) public requests;

    function createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload
    ) external payable returns (uint256 requestId) {
        return _createRequest(agentId, callbackAddress, callbackSelector, payload, msg.value);
    }

    function createAdvancedRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes calldata payload,
        uint256 /*subcommitteeSize*/,
        uint256 /*threshold*/,
        ConsensusType /*consensusType*/,
        uint256 /*timeout*/
    ) external payable returns (uint256 requestId) {
        return _createRequest(agentId, callbackAddress, callbackSelector, payload, msg.value);
    }

    function getRequestDeposit() external pure returns (uint256) {
        return 0.03 ether;
    }

    function getAdvancedRequestDeposit(uint256 /*subcommitteeSize*/) external pure returns (uint256) {
        return 0.03 ether;
    }

    function _createRequest(
        uint256 agentId,
        address callbackAddress,
        bytes4 callbackSelector,
        bytes memory payload,
        uint256 deposit
    ) internal returns (uint256 requestId) {
        requestId = _nextRequestId++;
        requests[requestId] = StoredRequest({
            agentId: agentId,
            callbackAddress: callbackAddress,
            callbackSelector: callbackSelector,
            payload: payload,
            deposit: deposit
        });
    }

    function triggerCallback(
        uint256 requestId,
        string memory classification,
        ResponseStatus status
    ) external {
        StoredRequest memory req = requests[requestId];

        Response[] memory responses = new Response[](1);
        responses[0] = Response({
            validator: address(0xDEAD),
            result: abi.encode(classification),
            status: status,
            receipt: 1,
            timestamp: block.timestamp,
            executionCost: 0.07 ether
        });

        Request memory details = Request({
            agentId: req.agentId,
            requester: address(0),
            callbackAddress: req.callbackAddress,
            callbackSelector: req.callbackSelector,
            payload: req.payload,
            subcommitteeSize: 3,
            threshold: 2,
            consensusType: ConsensusType.Majority,
            timeout: 15 minutes,
            createdAt: block.timestamp,
            remainingBudget: 0,
            perAgentBudget: 0.07 ether
        });

        IAgentCallback(req.callbackAddress).handleResponse(requestId, responses, status, details);
    }

    receive() external payable {}
}
