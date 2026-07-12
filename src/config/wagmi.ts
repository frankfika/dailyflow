import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createConfig, http } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { baseSepolia, optimismSepolia, arbitrumSepolia, sepolia, hardhat } from 'wagmi/chains';
import * as React from 'react';

const queryClient = new QueryClient();

export const wagmiConfig = createConfig({
  chains: [baseSepolia, optimismSepolia, arbitrumSepolia, sepolia, hardhat],
  connectors: [injected()],
  transports: {
    [baseSepolia.id]: http(),
    [optimismSepolia.id]: http(),
    [arbitrumSepolia.id]: http(),
    [sepolia.id]: http(),
    [hardhat.id]: http('http://127.0.0.1:8545'),
  },
});

export function Web3Providers({ children }: { children: React.ReactNode }) {
  return (
    React.createElement(WagmiProvider, { config: wagmiConfig },
      React.createElement(QueryClientProvider, { client: queryClient }, children)
    )
  );
}
