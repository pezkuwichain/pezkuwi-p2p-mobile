/**
 * Wallet Context for P2P Mobile
 *
 * In the mobile P2P app, wallet address is linked to user's profile.
 * No direct blockchain API connection needed - trades use internal ledger.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useAuth } from './AuthContext';

interface WalletContextType {
  address: string | null;
  isConnected: boolean;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const value: WalletContextType = {
    address: user?.wallet_address || null,
    isConnected: !!user?.wallet_address,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within WalletProvider');
  }
  return context;
}
