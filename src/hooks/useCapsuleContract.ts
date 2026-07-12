import {
  useAccount,
  useChainId,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';
import { keccak256, toHex } from 'viem';
import { DAILY_FLOW_CAPSULE_ABI } from '../contracts/abi';
import { getContractAddress, getExplorerUrl, supportedChains, type SupportedChain } from '../config/chains';
import type { Capsule, CapsuleInput } from '../api/client';

export function useCapsuleContract() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { writeContract, data: hash, isPending, error } = useWriteContract();

  const currentChain = supportedChains.find(c => c.id === chainId) as SupportedChain | undefined;
  const contractAddress = chainId ? getContractAddress(chainId) : undefined;
  const canSeal = isConnected && !!contractAddress;

  const sealCapsule = async (localCapsule: Capsule, input: CapsuleInput) => {
    if (!address) throw new Error('Wallet not connected');
    if (!contractAddress) throw new Error(`No contract deployed on chain ${chainId}`);
    if (!currentChain) throw new Error(`Chain ${chainId} not supported`);

    const contentHash = keccak256(toHex(localCapsule.content));
    const unlockAt = BigInt(Math.floor(new Date(input.unlockAt).getTime() / 1000));
    const capsuleType = input.type === 'commitment' ? 0 : input.type === 'secret' ? 1 : 2;

    return writeContract({
      address: contractAddress as `0x${string}`,
      abi: DAILY_FLOW_CAPSULE_ABI,
      functionName: 'seal',
      args: [contentHash, unlockAt, capsuleType, input.isPublic ?? false],
      chain: currentChain,
      account: address,
    });
  };

  const revealCapsule = async (onChainId: number, status: number) => {
    if (!address) throw new Error('Wallet not connected');
    if (!contractAddress) throw new Error(`No contract deployed on chain ${chainId}`);
    if (!currentChain) throw new Error(`Chain ${chainId} not supported`);

    return writeContract({
      address: contractAddress as `0x${string}`,
      abi: DAILY_FLOW_CAPSULE_ABI,
      functionName: 'reveal',
      args: [BigInt(onChainId), status],
      chain: currentChain,
      account: address,
    });
  };

  return {
    address,
    isConnected,
    chainId,
    currentChain,
    contractAddress,
    canSeal,
    isPending,
    error,
    hash,
    explorerUrl: hash && chainId ? getExplorerUrl(chainId, hash) : undefined,
    sealCapsule,
    revealCapsule,
    switchChain,
  };
}
