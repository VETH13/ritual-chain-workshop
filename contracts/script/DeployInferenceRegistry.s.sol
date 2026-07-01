// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {InferenceRegistry} from "../src/InferenceRegistry.sol";

contract DeployInferenceRegistry is Script {
    function run() external returns (InferenceRegistry registry) {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        registry = new InferenceRegistry();

        vm.stopBroadcast();

        // Log the deployed address
        console.log("InferenceRegistry deployed at:", address(registry));
    }
}
