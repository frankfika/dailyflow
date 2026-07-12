/**
 * DailyFlowCapsule contract ABI
 * Generated from contracts/contracts/DailyFlowCapsule.sol
 */
export const DAILY_FLOW_CAPSULE_ABI = [
  {
    inputs: [],
    name: 'capsuleCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: '', type: 'uint256' }],
    name: 'capsules',
    outputs: [
      { name: 'creator', type: 'address' },
      { name: 'contentHash', type: 'bytes32' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'unlockAt', type: 'uint256' },
      { name: 'capsuleType', type: 'uint8' },
      { name: 'isPublic', type: 'bool' },
      { name: 'status', type: 'uint8' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'contentHash', type: 'bytes32' },
      { name: 'unlockAt', type: 'uint256' },
      { name: 'capsuleType', type: 'uint8' },
      { name: 'isPublic', type: 'bool' },
    ],
    name: 'seal',
    outputs: [{ name: 'id', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'id', type: 'uint256' },
      { name: 'status', type: 'uint8' },
    ],
    name: 'reveal',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'id', type: 'uint256' }],
    name: 'getCapsule',
    outputs: [
      { name: 'creator', type: 'address' },
      { name: 'contentHash', type: 'bytes32' },
      { name: 'createdAt', type: 'uint256' },
      { name: 'unlockAt', type: 'uint256' },
      { name: 'capsuleType', type: 'uint8' },
      { name: 'isPublic', type: 'bool' },
      { name: 'status', type: 'uint8' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'creator', type: 'address' }],
    name: 'getCreatorCapsules',
    outputs: [{ name: '', type: 'uint256[]' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: true, name: 'creator', type: 'address' },
      { name: 'contentHash', type: 'bytes32' },
      { name: 'unlockAt', type: 'uint256' },
      { name: 'capsuleType', type: 'uint8' },
      { name: 'isPublic', type: 'bool' },
    ],
    name: 'CapsuleSealed',
    type: 'event',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: 'id', type: 'uint256' },
      { indexed: true, name: 'creator', type: 'address' },
      { name: 'status', type: 'uint8' },
    ],
    name: 'CapsuleRevealed',
    type: 'event',
  },
] as const;
