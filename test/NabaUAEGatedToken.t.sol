// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ICredential} from "@naba-finance/uaepass/contracts/ICredential.sol";
import {NabaUAEGatedToken} from "../contracts/NabaUAEGatedToken.sol";

/// @dev Minimal ICredential whose provenance answers are settable per address.
contract MockCredential is ICredential {
    mapping(address => bool) public uaePass;

    function setUAEPass(address account, bool v) external {
        uaePass[account] = v;
    }

    function wasCreatedByUAEPass(address account) external view returns (bool) {
        return uaePass[account];
    }

    // Unused surface — present only to satisfy the interface.
    function validator() external pure returns (address) {
        return address(0);
    }

    function isTrustedFactory(address) external pure returns (bool) {
        return false;
    }

    function getFactories() external pure returns (address[] memory f) {
        return f;
    }

    function factoriesLength() external pure returns (uint256) {
        return 0;
    }
}

contract NabaUAEGatedTokenTest is Test {
    MockCredential cred;
    NabaUAEGatedToken token;

    address owner = makeAddr("owner");
    address alice = makeAddr("alice"); // UAE Pass user
    address bob = makeAddr("bob"); // UAE Pass user
    address mallory = makeAddr("mallory"); // NOT a UAE Pass user
    address pair = makeAddr("pair"); // DEX pair (whitelisted, not UAE Pass)

    uint256 constant ONE = 1e9; // 1 NUAE (9 decimals)

    function setUp() public {
        cred = new MockCredential();
        cred.setUAEPass(alice, true);
        cred.setUAEPass(bob, true);
        token = new NabaUAEGatedToken(ICredential(address(cred)), owner);
    }

    // ---------------------------------------------------------- basics

    function test_Metadata() public view {
        assertEq(token.name(), "Naba UAE Gated Token");
        assertEq(token.symbol(), "NUAE");
        assertEq(token.decimals(), 9);
        assertEq(token.owner(), owner);
    }

    // ---------------------------------------------------------- claim

    function test_FirstClaimMintsOneNUAE() public {
        vm.prank(alice);
        token.claim();
        assertEq(token.balanceOf(alice), ONE);
        (, uint64 count) = token.claims(alice);
        assertEq(count, 1);
    }

    function test_ClaimDecays_HalfThenThird() public {
        vm.prank(alice);
        token.claim(); // 1

        vm.warp(block.timestamp + 24 hours);
        vm.prank(alice);
        token.claim(); // + 1/2

        vm.warp(block.timestamp + 24 hours);
        vm.prank(alice);
        token.claim(); // + 1/3

        // 1e9 + 5e8 + 333333333
        assertEq(token.balanceOf(alice), ONE + ONE / 2 + ONE / 3);
    }

    function test_ClaimTooSoonReverts() public {
        vm.prank(alice);
        token.claim();

        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NabaUAEGatedToken.ClaimTooSoon.selector, block.timestamp + 24 hours));
        token.claim();
    }

    function test_ClaimAfterCooldownSucceeds() public {
        vm.prank(alice);
        token.claim();
        vm.warp(block.timestamp + 24 hours);
        vm.prank(alice);
        token.claim();
        (, uint64 count) = token.claims(alice);
        assertEq(count, 2);
    }

    function test_NonUAEPassCannotClaim() public {
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(NabaUAEGatedToken.NotEligible.selector, mallory));
        token.claim();
    }

    function test_WhitelistAloneCannotClaim() public {
        // Whitelisting is for transfers, not minting.
        vm.prank(owner);
        token.setWhitelisted(mallory, true);
        vm.prank(mallory);
        vm.expectRevert(abi.encodeWithSelector(NabaUAEGatedToken.NotEligible.selector, mallory));
        token.claim();
    }

    function test_NextClaimAmountView() public {
        assertEq(token.nextClaimAmount(alice), ONE);
        vm.prank(alice);
        token.claim();
        assertEq(token.nextClaimAmount(alice), ONE / 2);
    }

    // ---------------------------------------------------------- transfers

    function test_TransferBetweenUAEPassUsers() public {
        vm.prank(alice);
        token.claim();
        vm.prank(alice);
        token.transfer(bob, 1000);
        assertEq(token.balanceOf(bob), 1000);
    }

    function test_TransferToNonUAEPassReverts() public {
        vm.prank(alice);
        token.claim();
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(NabaUAEGatedToken.TransferNotAllowed.selector, alice, mallory));
        token.transfer(mallory, 1000);
    }

    // ---------------------------------------------------------- DEX scenario

    function test_SellToWhitelistedPair() public {
        vm.prank(owner);
        token.setWhitelisted(pair, true);

        vm.prank(alice);
        token.claim();
        // user -> pair (sell): from eligible, to whitelisted -> allowed
        vm.prank(alice);
        token.transfer(pair, 1000);
        assertEq(token.balanceOf(pair), 1000);
    }

    function test_BuyFromWhitelistedPairToUAEPassUser() public {
        vm.prank(owner);
        token.setWhitelisted(pair, true);

        vm.prank(alice);
        token.claim();
        vm.prank(alice);
        token.transfer(pair, 1000);

        // pair -> bob (buy): from whitelisted, to eligible -> allowed
        vm.prank(pair);
        token.transfer(bob, 1000);
        assertEq(token.balanceOf(bob), 1000);
    }

    function test_PairCannotSendToNonUAEPass() public {
        vm.prank(owner);
        token.setWhitelisted(pair, true);

        vm.prank(alice);
        token.claim();
        vm.prank(alice);
        token.transfer(pair, 1000);

        // pair -> mallory: to not eligible -> blocked
        vm.prank(pair);
        vm.expectRevert(abi.encodeWithSelector(NabaUAEGatedToken.TransferNotAllowed.selector, pair, mallory));
        token.transfer(mallory, 1000);
    }

    // ---------------------------------------------------------- seed liquidity

    function test_MintInitialLiquidity() public {
        vm.prank(owner);
        token.mintInitialLiquidity();
        assertEq(token.balanceOf(owner), 100 * ONE);
        assertTrue(token.initialLiquidityMinted());
    }

    function test_MintInitialLiquidityOnlyOnce() public {
        vm.prank(owner);
        token.mintInitialLiquidity();
        vm.prank(owner);
        vm.expectRevert(NabaUAEGatedToken.InitialLiquidityAlreadyMinted.selector);
        token.mintInitialLiquidity();
    }

    function test_MintInitialLiquidityOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert();
        token.mintInitialLiquidity();
    }

    function test_OwnerCanSeedPoolAfterSelfWhitelist() public {
        // Realistic flow: owner mints seed, whitelists itself + the pair,
        // then moves NUAE to the pair (as addLiquidity would).
        vm.startPrank(owner);
        token.mintInitialLiquidity();
        token.setWhitelisted(owner, true);
        token.setWhitelisted(pair, true);
        token.transfer(pair, 100 * ONE);
        vm.stopPrank();
        assertEq(token.balanceOf(pair), 100 * ONE);
    }

    // ---------------------------------------------------------- whitelist auth

    function test_OnlyOwnerCanWhitelist() public {
        vm.prank(alice);
        vm.expectRevert();
        token.setWhitelisted(pair, true);
    }

    function test_WhitelistBatch() public {
        address[] memory accts = new address[](2);
        accts[0] = pair;
        accts[1] = mallory;
        vm.prank(owner);
        token.setWhitelistedBatch(accts, true);
        assertTrue(token.isWhitelisted(pair));
        assertTrue(token.isWhitelisted(mallory));
    }
}
