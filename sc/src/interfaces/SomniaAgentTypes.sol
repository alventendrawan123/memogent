// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

enum ResponseStatus {
    None,
    Pending,
    Success,
    Failed,
    TimedOut
}

enum ConsensusType {
    Majority,
    Unanimous
}

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
    uint256 perAgentBudget;
}

struct Response {
    address validator;
    bytes result;
    ResponseStatus status;
    uint256 receipt;
    uint256 timestamp;
    uint256 executionCost;
}
