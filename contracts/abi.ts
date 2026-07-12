import { parseAbi } from "viem";

export const DAILY_FLOW_CAPSULE_ABI = parseAbi([
  "function capsuleCount() view returns (uint256)",
  "function capsules(uint256) view returns (address creator, bytes32 contentHash, uint256 createdAt, uint256 unlockAt, uint8 capsuleType, bool isPublic, uint8 status)",
  "function creatorCapsules(address, uint256) view returns (uint256)",
  "function getCapsule(uint256 id) view returns (address creator, bytes32 contentHash, uint256 createdAt, uint256 unlockAt, uint8 capsuleType, bool isPublic, uint8 status)",
  "function getCreatorCapsules(address creator) view returns (uint256[] memory)",
  "function seal(bytes32 contentHash, uint256 unlockAt, uint8 capsuleType, bool isPublic) returns (uint256 id)",
  "function reveal(uint256 id, uint8 status)",
  "event CapsuleSealed(uint256 indexed id, address indexed creator, bytes32 contentHash, uint256 unlockAt, uint8 capsuleType, bool isPublic)",
  "event CapsuleRevealed(uint256 indexed id, address indexed creator, uint8 status)",
] as const);

export const DAILY_FLOW_CAPSULE_BYTECODE = "0x" as const;
