// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

library SomniaExtensions {
    address internal constant SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS =
        0x0000000000000000000000000000000000000100;

    bytes32 internal constant SCHEDULE_SELECTOR = keccak256("Schedule(uint256)");
}
