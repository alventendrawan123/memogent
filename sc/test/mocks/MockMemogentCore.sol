// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IMemogentCore} from "../../src/capsule/TimeCapsule.sol";

contract MockMemogentCore is IMemogentCore {
    struct WillState {
        address beneficiary;
        uint256 lastCheckIn;
        uint256 inactivePeriod;
        uint256 deadlineTimestamp;
        bool executed;
        bool active;
    }

    mapping(address => WillState) public willOf;

    function setWill(address owner, address beneficiary, bool active, bool executed) external {
        willOf[owner] = WillState({
            beneficiary: beneficiary,
            lastCheckIn: block.timestamp,
            inactivePeriod: 30 days,
            deadlineTimestamp: (block.timestamp + 30 days) * 1000,
            executed: executed,
            active: active
        });
    }

    function getWillInfo(address owner) external view returns (
        address beneficiary,
        uint256 lastCheckIn,
        uint256 inactivePeriod,
        uint256 deadlineTimestamp,
        bool executed,
        bool active
    ) {
        WillState memory w = willOf[owner];
        return (w.beneficiary, w.lastCheckIn, w.inactivePeriod, w.deadlineTimestamp, w.executed, w.active);
    }
}
