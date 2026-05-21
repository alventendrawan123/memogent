// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MemogentCore} from "../src/core/MemogentCore.sol";
import {MemogentAgent} from "../src/agent/MemogentAgent.sol";
import {SomniaExtensions} from "../src/libraries/SomniaExtensions.sol";
import {SomniaAgentConstants} from "../src/libraries/SomniaAgentConstants.sol";

contract DeployMemogent is Script {
    function run() external returns (MemogentCore memogentCore, MemogentAgent memogentAgent) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address precompile = vm.envOr(
            "SOMNIA_PRECOMPILE",
            SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS
        );
        address platform = vm.envOr(
            "SOMNIA_AGENT_PLATFORM",
            SomniaAgentConstants.AGENT_PLATFORM_TESTNET
        );
        address deployer = vm.addr(deployerKey);

        console2.log("===========================================");
        console2.log("Memogent Full System Deployment");
        console2.log("===========================================");
        console2.log("Deployer:        ", deployer);
        console2.log("Balance (wei):   ", deployer.balance);
        console2.log("Balance (STT):   ", deployer.balance / 1 ether);
        console2.log("Precompile:      ", precompile);
        console2.log("Agent Platform:  ", platform);
        console2.log("-------------------------------------------");

        require(deployer.balance >= 32 ether, "Deploy: deployer must hold >=32 STT for Reactivity");

        vm.startBroadcast(deployerKey);

        memogentCore = new MemogentCore(precompile);
        console2.log("MemogentCore deployed at:", address(memogentCore));

        memogentAgent = new MemogentAgent(platform, address(memogentCore));
        console2.log("MemogentAgent deployed at:", address(memogentAgent));

        memogentCore.setAgentAuthority(address(memogentAgent));
        console2.log("Agent authority set on Core");

        vm.stopBroadcast();

        console2.log("-------------------------------------------");
        console2.log("Deployment complete");
        console2.log("Core:  ", address(memogentCore));
        console2.log("Agent: ", address(memogentAgent));
        console2.log("===========================================");
    }
}

contract DeployMemogentCoreOnly is Script {
    function run() external returns (MemogentCore memogentCore) {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address precompile = vm.envOr(
            "SOMNIA_PRECOMPILE",
            SomniaExtensions.SOMNIA_REACTIVITY_PRECOMPILE_ADDRESS
        );
        address deployer = vm.addr(deployerKey);

        console2.log("Deployer:", deployer);
        console2.log("Balance:", deployer.balance);
        console2.log("Precompile:", precompile);

        vm.startBroadcast(deployerKey);
        memogentCore = new MemogentCore(precompile);
        vm.stopBroadcast();

        console2.log("MemogentCore deployed at:", address(memogentCore));
    }
}
