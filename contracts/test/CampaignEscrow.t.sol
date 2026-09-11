// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {CampaignEscrow, IReceiver} from "../src/CampaignEscrow.sol";
import {MockUSDC} from "../src/MockUSDC.sol";

contract CampaignEscrowTest is Test {
    MockUSDC internal usdc;
    CampaignEscrow internal escrow;

    address internal operator = makeAddr("operator");
    address internal forwarder = makeAddr("forwarder");
    address internal brand = makeAddr("brand");
    address internal otherBrand = makeAddr("otherBrand");
    address internal installer = makeAddr("installer");
    address internal verifier = makeAddr("verifier");
    address internal cleaner = makeAddr("cleaner");

    bytes32 internal constant CAMPAIGN = keccak256("campaign-1");
    bytes32 internal constant PLACEMENT = keccak256("placement-1");
    bytes32 internal constant EVIDENCE = keccak256("evidence-1");

    uint96 internal constant INSTALL = 6e6;
    uint96 internal constant VERIFY = 4e6;
    uint96 internal constant CLEANUP = 2e6;

    function setUp() public {
        usdc = new MockUSDC();
        escrow = new CampaignEscrow(address(usdc), operator, forwarder);
        usdc.mint(brand, 100e6);
        vm.prank(brand);
        usdc.approve(address(escrow), type(uint256).max);
    }

    function _fundAndRegister() internal {
        vm.prank(brand);
        escrow.fundCampaign(CAMPAIGN, 60e6);
        vm.startPrank(operator);
        escrow.registerPlacement(PLACEMENT, CAMPAIGN, INSTALL, VERIFY, CLEANUP);
        escrow.assignWorkers(PLACEMENT, installer, verifier);
        vm.stopPrank();
    }

    function _report(bool approved) internal {
        vm.prank(forwarder);
        escrow.onReport("", abi.encode(PLACEMENT, approved, EVIDENCE));
    }

    function test_fundCampaignPullsTokensAndRecordsFunder() public {
        vm.prank(brand);
        escrow.fundCampaign(CAMPAIGN, 60e6);

        (address funder, uint128 funded,,,) = escrow.campaigns(CAMPAIGN);
        assertEq(funder, brand);
        assertEq(funded, 60e6);
        assertEq(usdc.balanceOf(address(escrow)), 60e6);
        assertEq(escrow.availableBudget(CAMPAIGN), 60e6);
    }

    function test_onlyFunderCanTopUp() public {
        vm.prank(brand);
        escrow.fundCampaign(CAMPAIGN, 10e6);
        usdc.mint(otherBrand, 10e6);
        vm.startPrank(otherBrand);
        usdc.approve(address(escrow), 10e6);
        vm.expectRevert(CampaignEscrow.NotFunder.selector);
        escrow.fundCampaign(CAMPAIGN, 10e6);
        vm.stopPrank();
    }

    function test_registerPlacementReservesBudget() public {
        _fundAndRegister();
        assertEq(escrow.availableBudget(CAMPAIGN), 60e6 - INSTALL - VERIFY - CLEANUP);
    }

    function test_registerPlacementCannotExceedBudget() public {
        vm.prank(brand);
        escrow.fundCampaign(CAMPAIGN, 5e6);
        vm.prank(operator);
        vm.expectRevert(CampaignEscrow.InsufficientBudget.selector);
        escrow.registerPlacement(PLACEMENT, CAMPAIGN, INSTALL, VERIFY, CLEANUP);
    }

    function test_onlyOperatorRegisters() public {
        vm.prank(brand);
        escrow.fundCampaign(CAMPAIGN, 60e6);
        vm.prank(brand);
        vm.expectRevert(CampaignEscrow.NotOperator.selector);
        escrow.registerPlacement(PLACEMENT, CAMPAIGN, INSTALL, VERIFY, CLEANUP);
    }

    function test_selfVerifiedPlacementPaysOneWorkerBothRewards() public {
        vm.prank(brand);
        escrow.fundCampaign(CAMPAIGN, 60e6);
        vm.startPrank(operator);
        escrow.registerPlacement(PLACEMENT, CAMPAIGN, INSTALL, VERIFY, CLEANUP);
        escrow.assignWorkers(PLACEMENT, installer, installer);
        vm.stopPrank();

        _report(true);
        assertEq(usdc.balanceOf(installer), INSTALL + VERIFY);
        assertEq(escrow.heldBalance(CAMPAIGN), 60e6 - INSTALL - VERIFY);
    }

    function test_selfVerifiedPlacementStaysLockedWhenRejected() public {
        vm.prank(brand);
        escrow.fundCampaign(CAMPAIGN, 60e6);
        vm.startPrank(operator);
        escrow.registerPlacement(PLACEMENT, CAMPAIGN, INSTALL, VERIFY, CLEANUP);
        escrow.assignWorkers(PLACEMENT, installer, installer);
        vm.stopPrank();

        _report(false);
        assertEq(usdc.balanceOf(installer), 0);
    }

    function test_onlyForwarderDeliversReports() public {
        _fundAndRegister();
        vm.prank(operator);
        vm.expectRevert(CampaignEscrow.NotForwarder.selector);
        escrow.onReport("", abi.encode(PLACEMENT, true, EVIDENCE));
    }

    function test_approvedReportPaysInstallerAndVerifier() public {
        _fundAndRegister();
        _report(true);

        assertEq(usdc.balanceOf(installer), INSTALL);
        assertEq(usdc.balanceOf(verifier), VERIFY);
        (,,,,,, CampaignEscrow.PlacementStatus status, bytes32 evidence) = escrow.placements(PLACEMENT);
        assertEq(uint8(status), uint8(CampaignEscrow.PlacementStatus.Verified));
        assertEq(evidence, EVIDENCE);
        // Cleanup reserve stays locked in the escrow.
        assertEq(escrow.heldBalance(CAMPAIGN), 60e6 - INSTALL - VERIFY);
    }

    function test_rejectedReportKeepsPaymentLocked() public {
        _fundAndRegister();
        _report(false);

        assertEq(usdc.balanceOf(installer), 0);
        assertEq(usdc.balanceOf(verifier), 0);
        (,,,,,, CampaignEscrow.PlacementStatus status,) = escrow.placements(PLACEMENT);
        assertEq(uint8(status), uint8(CampaignEscrow.PlacementStatus.Registered));

        // A recaptured proof can still be approved later.
        _report(true);
        assertEq(usdc.balanceOf(installer), INSTALL);
    }

    function test_cannotFinalizeTwice() public {
        _fundAndRegister();
        _report(true);
        vm.prank(forwarder);
        vm.expectRevert(CampaignEscrow.InvalidPlacementStatus.selector);
        escrow.onReport("", abi.encode(PLACEMENT, true, EVIDENCE));
    }

    function test_cannotFinalizeWithoutWorkers() public {
        vm.prank(brand);
        escrow.fundCampaign(CAMPAIGN, 60e6);
        vm.prank(operator);
        escrow.registerPlacement(PLACEMENT, CAMPAIGN, INSTALL, VERIFY, CLEANUP);
        vm.prank(forwarder);
        vm.expectRevert(CampaignEscrow.WorkersUnassigned.selector);
        escrow.onReport("", abi.encode(PLACEMENT, true, EVIDENCE));
    }

    function test_cleanupReleasesReserveAfterVerification() public {
        _fundAndRegister();
        vm.prank(operator);
        vm.expectRevert(CampaignEscrow.InvalidPlacementStatus.selector);
        escrow.releaseCleanup(PLACEMENT, cleaner);

        _report(true);
        vm.prank(operator);
        escrow.releaseCleanup(PLACEMENT, cleaner);
        assertEq(usdc.balanceOf(cleaner), CLEANUP);
    }

    function test_refundReturnsOnlyUncommittedBudget() public {
        _fundAndRegister();
        uint256 before = usdc.balanceOf(brand);
        vm.prank(brand);
        escrow.refundUncommitted(CAMPAIGN);

        assertEq(usdc.balanceOf(brand) - before, 60e6 - INSTALL - VERIFY - CLEANUP);
        assertEq(escrow.availableBudget(CAMPAIGN), 0);

        vm.prank(brand);
        vm.expectRevert(CampaignEscrow.NothingToRefund.selector);
        escrow.refundUncommitted(CAMPAIGN);
    }

    function test_supportsReceiverInterface() public view {
        assertTrue(escrow.supportsInterface(type(IReceiver).interfaceId));
    }

    function test_onlyOwnerSetsForwarder() public {
        vm.prank(brand);
        vm.expectRevert(CampaignEscrow.NotOwner.selector);
        escrow.setForwarder(brand);
        escrow.setForwarder(operator);
        assertEq(escrow.forwarder(), operator);
    }
}
