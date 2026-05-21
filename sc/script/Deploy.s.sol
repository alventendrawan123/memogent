// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MemogentCore} from "../src/core/MemogentCore.sol";
import {SomniaExtensions} from "../src/libraries/SomniaExtensions.sol";

contract DeployMemogentCore is Script {
    function run() external returns (MemogentCore memogentCore) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address precompile = vm.envOr(
            "SOMNIA_PRECOMPILE",
            SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS
        );
        address deployer = vm.addr(deployerKey);

        console2.log("Deployer:", deployer);
        console2.log("Deployer balance:", deployer.balance);
        console2.log("Precompile:", precompile);

        vm.startBroadcast(deployerKey);
        memogentCore = new MemogentCore(precompile);
        vm.stopBroadcast();

        console2.log("MemogentCore deployed at:", address(memogentCore));
    }
}
