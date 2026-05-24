// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IMemogentCore {
    function getWillInfo(address owner) external view returns (
        address beneficiary,
        uint256 lastCheckIn,
        uint256 inactivePeriod,
        uint256 deadlineTimestamp,
        bool executed,
        bool active
    );
}

contract TimeCapsule {
    IMemogentCore public immutable core;

    struct Capsule {
        string cid;
        bytes32 contentHash;
        bytes encryptionKey;
        uint256 attachedAt;
    }

    mapping(address => Capsule) private _capsules;

    event CapsuleAttached(address indexed owner, address indexed beneficiary, string cid, bytes32 contentHash);
    event CapsuleUpdated(address indexed owner, string oldCid, string newCid);
    event CapsuleRemoved(address indexed owner, string cid);

    constructor(address _core) {
        require(_core != address(0), "TimeCapsule: zero core");
        core = IMemogentCore(_core);
    }

    function attachCapsule(
        string calldata cid,
        bytes32 contentHash,
        bytes calldata encryptionKey
    ) external {
        require(bytes(cid).length > 0, "TimeCapsule: empty cid");
        require(encryptionKey.length > 0, "TimeCapsule: empty key");

        (address beneficiary, , , , bool executed, bool active) = core.getWillInfo(msg.sender);
        require(beneficiary != address(0), "TimeCapsule: no will");
        require(active, "TimeCapsule: will inactive");
        require(!executed, "TimeCapsule: already executed");

        string memory oldCid = _capsules[msg.sender].cid;

        _capsules[msg.sender] = Capsule({
            cid: cid,
            contentHash: contentHash,
            encryptionKey: encryptionKey,
            attachedAt: block.timestamp
        });

        if (bytes(oldCid).length > 0) {
            emit CapsuleUpdated(msg.sender, oldCid, cid);
        }
        emit CapsuleAttached(msg.sender, beneficiary, cid, contentHash);
    }

    function removeCapsule() external {
        string memory cid = _capsules[msg.sender].cid;
        require(bytes(cid).length > 0, "TimeCapsule: no capsule");

        (, , , , bool executed, ) = core.getWillInfo(msg.sender);
        require(!executed, "TimeCapsule: already executed");

        delete _capsules[msg.sender];
        emit CapsuleRemoved(msg.sender, cid);
    }

    function isReleased(address owner) external view returns (bool) {
        (, , , , bool executed, ) = core.getWillInfo(owner);
        return executed;
    }

    function getCapsule(address owner) external view returns (
        string memory cid,
        bytes32 contentHash,
        uint256 attachedAt
    ) {
        Capsule memory c = _capsules[owner];
        return (c.cid, c.contentHash, c.attachedAt);
    }

    function getDecryptionKey(address owner) external view returns (bytes memory) {
        Capsule memory c = _capsules[owner];
        require(bytes(c.cid).length > 0, "TimeCapsule: no capsule");

        (address beneficiary, , , , bool executed, ) = core.getWillInfo(owner);
        require(msg.sender == beneficiary, "TimeCapsule: not beneficiary");
        require(executed, "TimeCapsule: not yet released");

        return c.encryptionKey;
    }

    function hasCapsule(address owner) external view returns (bool) {
        return bytes(_capsules[owner].cid).length > 0;
    }
}
