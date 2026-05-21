// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {ICredential} from "@naba-finance/uaepass/contracts/ICredential.sol";
import {NabaUAEGatedToken} from "../contracts/NabaUAEGatedToken.sol";

/// @notice Deploys NabaUAEGatedToken.
/// @dev Env:
///        CREDENTIAL  - UAE Pass Credential address (defaults to the canonical
///                      same-address deployment 0x8bA9...Cb0e)
///        OWNER       - token owner / whitelist admin (defaults to broadcaster)
///      Run:
///        forge script script/Deploy.s.sol:Deploy \
///          --rpc-url polygon --broadcast --account <acct> --sender <addr>
contract Deploy is Script {
    address constant DEFAULT_CREDENTIAL = 0x8bA9eB1FF63DEd9145d341f316758e6Ca132Cb0e;

    function run() external returns (NabaUAEGatedToken token) {
        address credential = vm.envOr("CREDENTIAL", DEFAULT_CREDENTIAL);
        address owner = vm.envOr("OWNER", msg.sender);

        vm.startBroadcast();
        token = new NabaUAEGatedToken(ICredential(credential), owner);
        vm.stopBroadcast();

        console2.log("NabaUAEGatedToken:", address(token));
        console2.log("credential:", credential);
        console2.log("owner:", owner);
    }
}
