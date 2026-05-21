// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ICredential} from "@naba-finance/uaepass/contracts/ICredential.sol";

/// @title  Naba UAE Gated Token (NUAE)
/// @author Naba Finance
/// @notice Demo ERC-20 gated on UAE Pass identity.
///
///         - Anyone who is a UAE Pass account can **claim** tokens (faucet),
///           once per 24h, in a decaying amount: 1, 1/2, 1/3, 1/4 ... NUAE.
///         - Tokens can only be **transferred** between eligible parties,
///           where eligible = UAE Pass account OR owner-whitelisted address.
///         - The whitelist exists so DEX contracts (e.g. a Uniswap v2 pair and
///           router) can hold/route NUAE, enabling NUAE/USDC swaps while plain
///           wallet-to-wallet transfers stay restricted to UAE Pass users.
///
/// @dev    9 decimals. Claim mints new supply; there is no fixed cap. The
///         eligibility predicate calls {ICredential.wasCreatedByUAEPass}, which
///         is a provenance check (see the SDK docs) — not real-time control.
contract NabaUAEGatedToken is ERC20, Ownable2Step {
    /// @dev 9 decimals per the token spec.
    uint8 private constant DECIMALS = 9;

    /// @notice 1 NUAE in base units (10**9). The first claim mints exactly this.
    uint256 public constant ONE_NUAE = 10 ** DECIMALS;

    /// @notice Minimum time between two claims by the same account.
    uint256 public constant CLAIM_COOLDOWN = 24 hours;

    /// @notice One-time seed amount the owner can mint to bootstrap DEX
    ///         liquidity (100 NUAE). See {mintInitialLiquidity}.
    uint256 public constant INITIAL_LIQUIDITY = 100 * ONE_NUAE;

    /// @notice The UAE Pass credential contract used for eligibility checks.
    ICredential public immutable credential;

    /// @notice Per-account claim accounting.
    /// @param lastClaimAt Unix timestamp of the account's most recent claim (0 = never).
    /// @param claimCount  Number of successful claims so far.
    struct ClaimInfo {
        uint64 lastClaimAt;
        uint64 claimCount;
    }

    /// @notice Claim accounting per address.
    mapping(address account => ClaimInfo) public claims;

    /// @notice Addresses allowed to send/receive NUAE regardless of UAE Pass
    ///         status (e.g. DEX pair/router). Managed by the owner.
    mapping(address account => bool) public isWhitelisted;

    /// @notice Whether the one-time {mintInitialLiquidity} has been used.
    bool public initialLiquidityMinted;

    /// @notice Emitted on a successful claim.
    event Claimed(address indexed account, uint256 amount, uint256 claimCount);
    /// @notice Emitted when an address's whitelist status changes.
    event WhitelistUpdated(address indexed account, bool whitelisted);
    /// @notice Emitted when the one-time seed liquidity is minted to the owner.
    event InitialLiquidityMinted(address indexed to, uint256 amount);

    /// @notice Caller is not a UAE Pass account (claims are UAE-Pass-only).
    error NotEligible(address account);
    /// @notice Claim attempted before the 24h cooldown elapsed.
    error ClaimTooSoon(uint256 availableAt);
    /// @notice Transfer blocked because a party is not eligible.
    error TransferNotAllowed(address from, address to);
    /// @notice Zero address supplied where not allowed.
    error ZeroAddress();
    /// @notice {mintInitialLiquidity} was already called.
    error InitialLiquidityAlreadyMinted();

    /// @param _credential UAE Pass credential contract (mainnet: 0x8bA9...Cb0e).
    /// @param initialOwner Owner that manages the whitelist (use a multisig in prod).
    constructor(ICredential _credential, address initialOwner)
        ERC20("Naba UAE Gated Token", "NUAE")
        Ownable(initialOwner)
    {
        if (address(_credential) == address(0)) revert ZeroAddress();
        credential = _credential;
    }

    /// @inheritdoc ERC20
    function decimals() public pure override returns (uint8) {
        return DECIMALS;
    }

    // ============================================================
    //                        Eligibility
    // ============================================================

    /// @notice Whether `account` may send/receive NUAE.
    /// @dev Whitelisted OR UAE Pass provenance.
    function isEligible(address account) public view returns (bool) {
        return isWhitelisted[account] || credential.wasCreatedByUAEPass(account);
    }

    /// @notice Amount the next claim by `account` would mint (1/(n+1) NUAE).
    function nextClaimAmount(address account) public view returns (uint256) {
        return ONE_NUAE / (uint256(claims[account].claimCount) + 1);
    }

    /// @notice Timestamp at which `account` may claim again (0 = claimable now).
    function claimableAt(address account) public view returns (uint256) {
        uint64 last = claims[account].lastClaimAt;
        if (last == 0) return 0;
        return uint256(last) + CLAIM_COOLDOWN;
    }

    // ============================================================
    //                           Claim
    // ============================================================

    /// @notice Claim the next decaying allotment of NUAE. UAE Pass accounts
    ///         only; at most once per {CLAIM_COOLDOWN}.
    function claim() external {
        // Claiming (minting) is restricted to genuine UAE Pass accounts; the
        // whitelist is only for transfer/DEX routing, not for minting.
        if (!credential.wasCreatedByUAEPass(msg.sender)) revert NotEligible(msg.sender);

        ClaimInfo memory info = claims[msg.sender];
        if (info.lastClaimAt != 0) {
            uint256 availableAt = uint256(info.lastClaimAt) + CLAIM_COOLDOWN;
            if (block.timestamp < availableAt) revert ClaimTooSoon(availableAt);
        }

        uint256 newCount = uint256(info.claimCount) + 1;
        uint256 amount = ONE_NUAE / newCount; // 1, 1/2, 1/3, ...

        claims[msg.sender] = ClaimInfo({lastClaimAt: uint64(block.timestamp), claimCount: uint64(newCount)});

        _mint(msg.sender, amount);
        emit Claimed(msg.sender, amount, newCount);
    }

    // ============================================================
    //                      Owner: seed liquidity
    // ============================================================

    /// @notice Mint the one-time {INITIAL_LIQUIDITY} (100 NUAE) to the current
    ///         owner, to bootstrap a DEX pool. Callable exactly once.
    /// @dev    To then add liquidity, the owner must also whitelist itself and
    ///         the DEX pair/router (see {setWhitelisted}), since transfers are
    ///         gated and the owner is not a UAE Pass account.
    function mintInitialLiquidity() external onlyOwner {
        if (initialLiquidityMinted) revert InitialLiquidityAlreadyMinted();
        initialLiquidityMinted = true;
        address to = owner();
        _mint(to, INITIAL_LIQUIDITY);
        emit InitialLiquidityMinted(to, INITIAL_LIQUIDITY);
    }

    // ============================================================
    //                      Whitelist (owner)
    // ============================================================

    /// @notice Set the whitelist status of a single address.
    function setWhitelisted(address account, bool whitelisted) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        isWhitelisted[account] = whitelisted;
        emit WhitelistUpdated(account, whitelisted);
    }

    /// @notice Set the whitelist status of many addresses to the same value.
    function setWhitelistedBatch(address[] calldata accounts, bool whitelisted) external onlyOwner {
        for (uint256 i; i < accounts.length; ++i) {
            address account = accounts[i];
            if (account == address(0)) revert ZeroAddress();
            isWhitelisted[account] = whitelisted;
            emit WhitelistUpdated(account, whitelisted);
        }
    }

    // ============================================================
    //                      Transfer gating
    // ============================================================

    /// @inheritdoc ERC20
    /// @dev Mint (from == 0) and burn (to == 0) are exempt; every peer transfer
    ///      requires both parties to be {isEligible}.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            if (!isEligible(from) || !isEligible(to)) revert TransferNotAllowed(from, to);
        }
        super._update(from, to, value);
    }
}
