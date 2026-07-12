// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

contract DailyFlowCapsule {
    enum CapsuleType { Commitment, Secret, Milestone }
    enum Status { Sealed, Revealed, Failed, Extended }

    struct Capsule {
        address creator;
        bytes32 contentHash;
        uint256 createdAt;
        uint256 unlockAt;
        CapsuleType capsuleType;
        bool isPublic;
        Status status;
    }

    mapping(uint256 => Capsule) public capsules;
    uint256 public capsuleCount;

    mapping(address => uint256[]) public creatorCapsules;

    event CapsuleSealed(
        uint256 indexed id,
        address indexed creator,
        bytes32 contentHash,
        uint256 unlockAt,
        CapsuleType capsuleType,
        bool isPublic
    );

    event CapsuleRevealed(
        uint256 indexed id,
        address indexed creator,
        Status status
    );

    modifier onlyCreator(uint256 id) {
        require(capsules[id].creator == msg.sender, "DailyFlowCapsule: not creator");
        _;
    }

    function seal(
        bytes32 contentHash,
        uint256 unlockAt,
        CapsuleType capsuleType,
        bool isPublic
    ) external returns (uint256 id) {
        require(contentHash != bytes32(0), "DailyFlowCapsule: empty hash");
        require(unlockAt > block.timestamp, "DailyFlowCapsule: unlock in future");

        id = ++capsuleCount;
        capsules[id] = Capsule({
            creator: msg.sender,
            contentHash: contentHash,
            createdAt: block.timestamp,
            unlockAt: unlockAt,
            capsuleType: capsuleType,
            isPublic: isPublic,
            status: Status.Sealed
        });

        creatorCapsules[msg.sender].push(id);

        emit CapsuleSealed(id, msg.sender, contentHash, unlockAt, capsuleType, isPublic);
    }

    function reveal(uint256 id, Status status) external onlyCreator(id) {
        Capsule storage c = capsules[id];
        require(c.status == Status.Sealed, "DailyFlowCapsule: not sealed");
        require(
            status == Status.Revealed || status == Status.Failed || status == Status.Extended,
            "DailyFlowCapsule: invalid status"
        );

        c.status = status;
        emit CapsuleRevealed(id, msg.sender, status);
    }

    function getCapsule(uint256 id) external view returns (Capsule memory) {
        return capsules[id];
    }

    function getCreatorCapsules(address creator) external view returns (uint256[] memory) {
        return creatorCapsules[creator];
    }
}
