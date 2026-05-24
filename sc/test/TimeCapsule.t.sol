// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {TimeCapsule} from "../src/capsule/TimeCapsule.sol";
import {MockMemogentCore} from "./mocks/MockMemogentCore.sol";

contract TimeCapsuleTest is Test {
    TimeCapsule capsule;
    MockMemogentCore mockCore;

    address owner;
    address beneficiary;
    address stranger;

    string constant CID = "bafybeib2lk75e5p3v3qj6hxz7w7tkpx5yk6vqgczdxypn2hskwbqzmlxiq";
    bytes32 constant CHASH = bytes32(uint256(0xdeadbeef));
    bytes constant KEY = hex"0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef000000000000000000000000";

    function setUp() public {
        owner = makeAddr("owner");
        beneficiary = makeAddr("beneficiary");
        stranger = makeAddr("stranger");

        mockCore = new MockMemogentCore();
        capsule = new TimeCapsule(address(mockCore));

        mockCore.setWill(owner, beneficiary, true, false);
    }

    function test_Constructor_RevertWhen_ZeroCore() public {
        vm.expectRevert("TimeCapsule: zero core");
        new TimeCapsule(address(0));
    }

    function test_AttachCapsule_StoresData() public {
        vm.prank(owner);
        capsule.attachCapsule(CID, CHASH, KEY);

        (string memory cid, bytes32 hash, uint256 attachedAt) = capsule.getCapsule(owner);
        assertEq(cid, CID);
        assertEq(hash, CHASH);
        assertEq(attachedAt, block.timestamp);
    }

    function test_AttachCapsule_RevertWhen_EmptyCid() public {
        vm.expectRevert("TimeCapsule: empty cid");
        vm.prank(owner);
        capsule.attachCapsule("", CHASH, KEY);
    }

    function test_AttachCapsule_RevertWhen_EmptyKey() public {
        vm.expectRevert("TimeCapsule: empty key");
        vm.prank(owner);
        capsule.attachCapsule(CID, CHASH, "");
    }

    function test_AttachCapsule_RevertWhen_NoWill() public {
        vm.expectRevert("TimeCapsule: no will");
        vm.prank(stranger);
        capsule.attachCapsule(CID, CHASH, KEY);
    }

    function test_AttachCapsule_RevertWhen_WillInactive() public {
        mockCore.setWill(owner, beneficiary, false, false);
        vm.expectRevert("TimeCapsule: will inactive");
        vm.prank(owner);
        capsule.attachCapsule(CID, CHASH, KEY);
    }

    function test_AttachCapsule_RevertWhen_AlreadyExecuted() public {
        mockCore.setWill(owner, beneficiary, true, true);
        vm.expectRevert("TimeCapsule: already executed");
        vm.prank(owner);
        capsule.attachCapsule(CID, CHASH, KEY);
    }

    function test_AttachCapsule_OverwritesExisting() public {
        vm.prank(owner);
        capsule.attachCapsule(CID, CHASH, KEY);

        string memory newCid = "bafkreichangedfileexample";
        bytes32 newHash = bytes32(uint256(0xfeedface));
        bytes memory newKey = hex"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

        vm.prank(owner);
        capsule.attachCapsule(newCid, newHash, newKey);

        (string memory cid, bytes32 hash, ) = capsule.getCapsule(owner);
        assertEq(cid, newCid);
        assertEq(hash, newHash);
    }

    function test_RemoveCapsule_DeletesData() public {
        vm.prank(owner);
        capsule.attachCapsule(CID, CHASH, KEY);

        vm.prank(owner);
        capsule.removeCapsule();

        (string memory cid, , ) = capsule.getCapsule(owner);
        assertEq(cid, "");
        assertFalse(capsule.hasCapsule(owner));
    }

    function test_RemoveCapsule_RevertWhen_NoCapsule() public {
        vm.expectRevert("TimeCapsule: no capsule");
        vm.prank(owner);
        capsule.removeCapsule();
    }

    function test_RemoveCapsule_RevertWhen_AlreadyExecuted() public {
        vm.prank(owner);
        capsule.attachCapsule(CID, CHASH, KEY);

        mockCore.setWill(owner, beneficiary, false, true);

        vm.expectRevert("TimeCapsule: already executed");
        vm.prank(owner);
        capsule.removeCapsule();
    }

    function test_IsReleased_FalseWhenActive() public view {
        assertFalse(capsule.isReleased(owner));
    }

    function test_IsReleased_TrueWhenExecuted() public {
        mockCore.setWill(owner, beneficiary, false, true);
        assertTrue(capsule.isReleased(owner));
    }

    function test_HasCapsule() public {
        assertFalse(capsule.hasCapsule(owner));

        vm.prank(owner);
        capsule.attachCapsule(CID, CHASH, KEY);

        assertTrue(capsule.hasCapsule(owner));
    }

    function test_GetDecryptionKey_RevertWhen_NoCapsule() public {
        vm.expectRevert("TimeCapsule: no capsule");
        vm.prank(beneficiary);
        capsule.getDecryptionKey(owner);
    }

    function test_GetDecryptionKey_RevertWhen_NotBeneficiary() public {
        vm.prank(owner);
        capsule.attachCapsule(CID, CHASH, KEY);

        mockCore.setWill(owner, beneficiary, false, true);

        vm.expectRevert("TimeCapsule: not beneficiary");
        vm.prank(stranger);
        capsule.getDecryptionKey(owner);
    }

    function test_GetDecryptionKey_RevertWhen_NotExecuted() public {
        vm.prank(owner);
        capsule.attachCapsule(CID, CHASH, KEY);

        vm.expectRevert("TimeCapsule: not yet released");
        vm.prank(beneficiary);
        capsule.getDecryptionKey(owner);
    }

    function test_GetDecryptionKey_ReturnsKey_WhenAllOk() public {
        vm.prank(owner);
        capsule.attachCapsule(CID, CHASH, KEY);

        mockCore.setWill(owner, beneficiary, false, true);

        vm.prank(beneficiary);
        bytes memory key = capsule.getDecryptionKey(owner);
        assertEq(keccak256(key), keccak256(KEY));
    }
}
