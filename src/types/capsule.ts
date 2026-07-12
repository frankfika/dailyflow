export interface Capsule {
  id: string;
  title: string;
  content: string;
  type: 'commitment' | 'secret' | 'milestone';
  status: 'sealed' | 'revealed' | 'failed' | 'extended';
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
  type: Capsule['type'];
  unlockAt: string;
  isPublic?: boolean;
  isEncrypted?: boolean;
  tags?: string[];
  linkedTaskId?: string;
  linkedNoteId?: string;
}

export interface CapsuleRevealInput {
  status: Extract<Capsule['status'], 'revealed' | 'failed' | 'extended'>;
  reflection?: string;
  newUnlockAt?: string;
}
