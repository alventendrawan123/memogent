// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface ISomniaEventHandler {
    function onEvent(
        uint256 subscriptionId,
        bytes32[] calldata eventTopics,
        bytes calldata eventData
    ) external;
}
