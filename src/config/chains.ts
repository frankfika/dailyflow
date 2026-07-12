import { baseSepolia, optimismSepolia, arbitrumSepolia, sepolia, hardhat } from 'wagmi/chains';
import { type Chain } from 'wagmi/chains';

export interface SupportedChain extends Chain {
  custom?: {
    label: string;
    icon?: string;
  };
}

export const supportedChains = [baseSepolia, optimismSepolia, arbitrumSepolia, sepolia, hardhat] as Chain[] as SupportedChain[];

export const DEFAULT_CHAIN = baseSepolia;

export const CHAIN_CONTRACTS: Record<number, string | undefined> = {
  [baseSepolia.id]: undefined,
  [optimismSepolia.id]: undefined,
  [arbitrumSepolia.id]: undefined,
  [sepolia.id]: undefined,
  [hardhat.id]: '0xe7f1725e7734ce288f8367e1bb143e90bb3f0512',
};

export const EXPLORERS: Record<number, string> = {
  [baseSepolia.id]: 'https://sepolia.basescan.org',
  [optimismSepolia.id]: 'https://sepolia-optimism.etherscan.io',
  [arbitrumSepolia.id]: 'https://sepolia.arbiscan.io',
  [sepolia.id]: 'https://sepolia.etherscan.io',
  [hardhat.id]: '',
};

export function getChainById(chainId: number): Chain | undefined {
  return supportedChains.find(c => c.id === chainId);
}

export function getExplorerUrl(chainId: number, txHash: string): string {
  const base = EXPLORERS[chainId] || '';
  return base ? `${base}/tx/${txHash}` : '';
}

export function getContractAddress(chainId: number): string | undefined {
  return CHAIN_CONTRACTS[chainId];
}

export function setContractAddress(chainId: number, address: string): void {
  CHAIN_CONTRACTS[chainId] = address;
}
