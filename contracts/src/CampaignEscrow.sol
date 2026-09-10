// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface IERC20Minimal {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IERC165 {
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

/// @notice Chainlink CRE report receiver interface.
interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title CampaignEscrow
/// @notice Holds a brand's campaign budget and pays physical work only after
///         independent, confidential verification.
///
/// Money flow:
///   brand treasury --fundCampaign--> escrow
///   operator registers each placement, reserving installer, verifier and
///   cleanup rewards from the campaign budget
///   Chainlink CRE confidential workflow --onReport--> verdict
///     approved: installer and verifier are paid; cleanup reward stays reserved
///     rejected: rewards stay locked for a recapture
///   cleanup verified --> cleanup reward released
///   anything never committed can be refunded to the funder
///
/// Sensitive evidence (exact GPS, raw video, selfies) never touches this
/// contract; only a keccak256 commitment to it does.
contract CampaignEscrow is IReceiver {
    enum PlacementStatus {
        None,
        Registered,
        Verified,
        Removed
    }

    struct Campaign {
        address funder;
        uint128 funded;
        uint128 committed;
        uint128 paidOut;
        uint128 refunded;
    }

    struct Placement {
        bytes32 campaignId;
        address installer;
        address verifier;
        uint96 installerReward;
        uint96 verifierReward;
        uint96 cleanupReward;
        PlacementStatus status;
        bytes32 evidenceHash;
    }

    IERC20Minimal public immutable token;
    address public owner;
    address public operator;
    /// @notice The Chainlink CRE forwarder allowed to deliver verification reports.
    address public forwarder;

    mapping(bytes32 => Campaign) public campaigns;
    mapping(bytes32 => Placement) public placements;

    event CampaignFunded(bytes32 indexed campaignId, address indexed funder, uint256 amount);
    event PlacementRegistered(
        bytes32 indexed placementId,
        bytes32 indexed campaignId,
        uint256 installerReward,
        uint256 verifierReward,
        uint256 cleanupReward
    );
    event WorkersAssigned(bytes32 indexed placementId, address indexed installer, address indexed verifier);
    event PlacementVerified(
        bytes32 indexed placementId,
        bytes32 indexed campaignId,
        bytes32 evidenceHash,
        uint256 installerPaid,
        uint256 verifierPaid
    );
    event PlacementRejected(bytes32 indexed placementId, bytes32 indexed campaignId, bytes32 evidenceHash);
    event CleanupReleased(bytes32 indexed placementId, address indexed cleaner, uint256 amount);
    event CampaignRefunded(bytes32 indexed campaignId, address indexed funder, uint256 amount);
    event ForwarderUpdated(address indexed forwarder);
    event OperatorUpdated(address indexed operator);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    error NotOwner();
    error NotOperator();
    error NotForwarder();
    error ZeroAmount();
    error ZeroAddress();
    error NotFunder();
    error UnfundedCampaign();
    error PlacementExists();
    error InsufficientBudget();
    error InvalidPlacementStatus();
    error WorkersUnassigned();
    error SelfVerification();
    error NothingToRefund();
    error TransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyOperator() {
        if (msg.sender != operator && msg.sender != owner) revert NotOperator();
        _;
    }

    constructor(address token_, address operator_, address forwarder_) {
        if (token_ == address(0) || operator_ == address(0) || forwarder_ == address(0)) revert ZeroAddress();
        token = IERC20Minimal(token_);
        owner = msg.sender;
        operator = operator_;
        forwarder = forwarder_;
        emit OwnershipTransferred(address(0), msg.sender);
        emit OperatorUpdated(operator_);
        emit ForwarderUpdated(forwarder_);
    }

    // ------------------------------------------------------------------
    // Brand
    // ------------------------------------------------------------------

    /// @notice Deposits campaign budget. The first depositor becomes the funder,
    ///         who alone may add more and who receives any refund.
    function fundCampaign(bytes32 campaignId, uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        Campaign storage campaign = campaigns[campaignId];
        if (campaign.funder == address(0)) {
            campaign.funder = msg.sender;
        } else if (campaign.funder != msg.sender) {
            revert NotFunder();
        }

        campaign.funded += uint128(amount);
        _pull(msg.sender, amount);
        emit CampaignFunded(campaignId, msg.sender, amount);
    }

    /// @notice Returns budget that was never committed to a placement.
    function refundUncommitted(bytes32 campaignId) external {
        Campaign storage campaign = campaigns[campaignId];
        if (msg.sender != campaign.funder && msg.sender != operator && msg.sender != owner) revert NotFunder();

        uint256 amount = availableBudget(campaignId);
        if (amount == 0) revert NothingToRefund();

        campaign.refunded += uint128(amount);
        _push(campaign.funder, amount);
        emit CampaignRefunded(campaignId, campaign.funder, amount);
    }

    // ------------------------------------------------------------------
    // Operator
    // ------------------------------------------------------------------

    /// @notice Reserves a placement's rewards from its campaign budget.
    function registerPlacement(
        bytes32 placementId,
        bytes32 campaignId,
        uint96 installerReward,
        uint96 verifierReward,
        uint96 cleanupReward
    ) external onlyOperator {
        Placement storage placement = placements[placementId];
        if (placement.status != PlacementStatus.None) revert PlacementExists();

        Campaign storage campaign = campaigns[campaignId];
        if (campaign.funder == address(0)) revert UnfundedCampaign();

        uint256 total = uint256(installerReward) + verifierReward + cleanupReward;
        if (total > availableBudget(campaignId)) revert InsufficientBudget();

        campaign.committed += uint128(total);
        placement.campaignId = campaignId;
        placement.installerReward = installerReward;
        placement.verifierReward = verifierReward;
        placement.cleanupReward = cleanupReward;
        placement.status = PlacementStatus.Registered;

        emit PlacementRegistered(placementId, campaignId, installerReward, verifierReward, cleanupReward);
    }

    /// @notice Records who installed and who independently verified.
    function assignWorkers(bytes32 placementId, address installer, address verifier) external onlyOperator {
        Placement storage placement = placements[placementId];
        if (placement.status != PlacementStatus.Registered) revert InvalidPlacementStatus();
        if (installer == address(0) || verifier == address(0)) revert ZeroAddress();
        if (installer == verifier) revert SelfVerification();

        placement.installer = installer;
        placement.verifier = verifier;
        emit WorkersAssigned(placementId, installer, verifier);
    }

    /// @notice Pays the reserved cleanup reward once removal is verified.
    function releaseCleanup(bytes32 placementId, address cleaner) external onlyOperator {
        Placement storage placement = placements[placementId];
        if (placement.status != PlacementStatus.Verified) revert InvalidPlacementStatus();
        if (cleaner == address(0)) revert ZeroAddress();

        placement.status = PlacementStatus.Removed;
        uint256 amount = placement.cleanupReward;
        campaigns[placement.campaignId].paidOut += uint128(amount);
        _push(cleaner, amount);
        emit CleanupReleased(placementId, cleaner, amount);
    }

    // ------------------------------------------------------------------
    // Chainlink CRE
    // ------------------------------------------------------------------

    /// @notice Receives the confidential workflow's verdict.
    /// @dev report = abi.encode(bytes32 placementId, bool approved, bytes32 evidenceHash)
    function onReport(bytes calldata, bytes calldata report) external override {
        if (msg.sender != forwarder) revert NotForwarder();
        (bytes32 placementId, bool approved, bytes32 evidenceHash) = abi.decode(report, (bytes32, bool, bytes32));
        _finalize(placementId, approved, evidenceHash);
    }

    function _finalize(bytes32 placementId, bool approved, bytes32 evidenceHash) private {
        Placement storage placement = placements[placementId];
        if (placement.status != PlacementStatus.Registered) revert InvalidPlacementStatus();
        if (placement.installer == address(0) || placement.verifier == address(0)) revert WorkersUnassigned();

        placement.evidenceHash = evidenceHash;

        if (!approved) {
            // Payment stays locked so the placement can be recaptured.
            emit PlacementRejected(placementId, placement.campaignId, evidenceHash);
            return;
        }

        placement.status = PlacementStatus.Verified;
        uint256 installerPaid = placement.installerReward;
        uint256 verifierPaid = placement.verifierReward;
        campaigns[placement.campaignId].paidOut += uint128(installerPaid + verifierPaid);

        _push(placement.installer, installerPaid);
        _push(placement.verifier, verifierPaid);
        emit PlacementVerified(placementId, placement.campaignId, evidenceHash, installerPaid, verifierPaid);
    }

    function supportsInterface(bytes4 interfaceId) public pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    /// @notice Budget not yet committed to a placement or refunded.
    function availableBudget(bytes32 campaignId) public view returns (uint256) {
        Campaign storage campaign = campaigns[campaignId];
        return uint256(campaign.funded) - campaign.committed - campaign.refunded;
    }

    /// @notice Budget still held by the escrow for this campaign, including
    ///         locked rewards and the cleanup reserve.
    function heldBalance(bytes32 campaignId) external view returns (uint256) {
        Campaign storage campaign = campaigns[campaignId];
        return uint256(campaign.funded) - campaign.paidOut - campaign.refunded;
    }

    // ------------------------------------------------------------------
    // Admin
    // ------------------------------------------------------------------

    function setForwarder(address forwarder_) external onlyOwner {
        if (forwarder_ == address(0)) revert ZeroAddress();
        forwarder = forwarder_;
        emit ForwarderUpdated(forwarder_);
    }

    function setOperator(address operator_) external onlyOwner {
        if (operator_ == address(0)) revert ZeroAddress();
        operator = operator_;
        emit OperatorUpdated(operator_);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ------------------------------------------------------------------
    // Token helpers
    // ------------------------------------------------------------------

    function _pull(address from, uint256 amount) private {
        if (!token.transferFrom(from, address(this), amount)) revert TransferFailed();
    }

    function _push(address to, uint256 amount) private {
        if (amount == 0) return;
        if (!token.transfer(to, amount)) revert TransferFailed();
    }
}
