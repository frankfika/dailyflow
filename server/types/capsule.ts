/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type CapsuleType = 'commitment' | 'secret' | 'milestone';
export type CapsuleStatus = 'sealed' | 'revealed' | 'failed' | 'extended';

export interface Capsule {
  id: string;
  title: string;
  content: string;
  type: CapsuleType;
  status: CapsuleStatus;
  createdAt: string;
  unlockAt: string;
  revealedAt?: string;
  reflection?: string;
  isPublic: boolean;
  isEncrypted: boolean;
  tags: string[];
  linkedTaskId?: string;
  linkedNoteId?: string;
  proof?: {
    provider: 'local' | 'arweave' | 'evm';
    txId?: string;
    chainId?: number;
    contractAddress?: string;
    onChainId?: number;
    contentHash?: string;
    gatewayUrl?: string;
  };
}

export interface CapsuleInput {
  title: string;
  content: string;
  type: CapsuleType;
  unlockAt: string;
  isPublic?: boolean;
  isEncrypted?: boolean;
  tags?: string[];
  linkedTaskId?: string;
  linkedNoteId?: string;
}

export interface CapsuleRevealInput {
  status: Extract<CapsuleStatus, 'revealed' | 'failed' | 'extended'>;
  reflection?: string;
  newUnlockAt?: string;
}
