// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ISomniaReactivityPrecompile} from "../../src/interfaces/ISomniaReactivityPrecompile.sol";
import {ISomniaEventHandler} from "../../src/interfaces/ISomniaEventHandler.sol";

contract MockSomniaPrecompile is ISomniaReactivityPrecompile {
    uint256 private _nextId = 1;
    mapping(uint256 => bool) public activeSubscriptions;
    mapping(uint256 => uint256) public deadlineMsOf;

    function subscribe(SubscriptionData memory data) external returns (uint256) {
        uint256 id = _nextId++;
        activeSubscriptions[id] = true;
        deadlineMsOf[id] = uint256(data.eventTopics[1]);
        return id;
    }

    function unsubscribe(uint256 subscriptionId) external {
        activeSubscriptions[subscriptionId] = false;
    }

    function triggerOnEvent(address handler, uint256 subscriptionId) external {
        bytes32[] memory topics = new bytes32[](4);
        topics[0] = keccak256("Schedule(uint256)");
        topics[1] = bytes32(deadlineMsOf[subscriptionId]);
        ISomniaEventHandler(handler).onEvent(subscriptionId, topics, "");
    }
}
