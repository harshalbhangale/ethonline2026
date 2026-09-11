// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {CampaignEscrow} from "../src/CampaignEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

/// Deploys MockUSDC and CampaignEscrow.
///
/// Env:
///   PRIVATE_KEY        deployer; becomes escrow owner and operator
///   CRE_FORWARDER      Chainlink CRE forwarder allowed to deliver reports
///   USDC_ADDRESS       optional; reuse this token instead of deploying MockUSDC,
///                      so a new escrow version keeps the balances already held
contract Deploy is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerKey);
        address forwarder = vm.envAddress("CRE_FORWARDER");

        address token = vm.envOr("USDC_ADDRESS", address(0));

        vm.startBroadcast(deployerKey);
        if (token == address(0)) token = address(new MockUSDC());
        CampaignEscrow escrow = new CampaignEscrow(token, deployer, forwarder);
        vm.stopBroadcast();

        console2.log("Token", token);
        console2.log("CampaignEscrow", address(escrow));
        console2.log("Operator", deployer);
        console2.log("Forwarder", forwarder);
    }
}
