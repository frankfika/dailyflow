import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { supportedChains } from '../config/chains';

export function WalletConnectButton({ language }: { language: 'en' | 'zh' }) {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const injectedConnector = connectors.find(c => c.id === 'injected');

  return (
    <div className="flex items-center gap-2">
      {!isConnected ? (
        <button
          onClick={() => {
            const connector = injectedConnector || connectors[0];
            if (connector) connect({ connector });
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors active:scale-95"
        >
          {language === 'zh' ? '连接钱包' : 'Connect Wallet'}
        </button>
      ) : (
        <>
          <select
            onChange={e => switchChain?.({ chainId: Number(e.target.value) })}
            className="appearance-none pl-2 pr-6 py-1.5 text-xs font-medium bg-white border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-200"
          >
            {supportedChains.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            onClick={() => disconnect()}
            className="text-[10px] px-2 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg font-medium truncate max-w-[140px] hover:bg-emerald-100 transition-colors"
          >
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </button>
        </>
      )}
    </div>
  );
}
