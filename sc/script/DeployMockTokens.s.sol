// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {MockERC20} from "../src/test/MockERC20.sol";

contract DeployMockTokens is Script {
    function run()
        external
        returns (MockERC20 btc, MockERC20 usdc, MockERC20 usdt)
    {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);

        console2.log("===========================================");
        console2.log("Deploy Mock ERC20 (BTC / USDC / USDT)");
        console2.log("===========================================");
        console2.log("Deployer: ", deployer);

        vm.startBroadcast(deployerKey);

        btc = new MockERC20("Mock Bitcoin", "BTC", 8);
        usdc = new MockERC20("Mock USD Coin", "USDC", 6);
        usdt = new MockERC20("Mock Tether", "USDT", 6);

        btc.mint(deployer, 1_000 * 10 ** 8);
        usdc.mint(deployer, 10_000_000 * 10 ** 6);
        usdt.mint(deployer, 10_000_000 * 10 ** 6);

        vm.stopBroadcast();

        console2.log("BTC  (8 dec):  ", address(btc));
        console2.log("USDC (6 dec):  ", address(usdc));
        console2.log("USDT (6 dec):  ", address(usdt));
        console2.log("");
        console2.log("Faucet hint: anyone can call mint(to, amount) - permissionless.");
    }
}
