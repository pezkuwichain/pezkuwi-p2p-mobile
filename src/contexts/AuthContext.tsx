import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { setCurrentUserId } from '@/lib/p2p-fiat';

// Telegram WebApp types
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        initDataUnsafe: {
          user?: {
            id: number;
            first_name: string;
            last_name?: string;
            username?: string;
            language_code?: string;
            photo_url?: string;
          };
          auth_date: number;
          hash: string;
        };
        ready: () => void;
        expand: () => void;
        close: () => void;
        MainButton: {
          text: string;
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
        };
        HapticFeedback: {
          impactOccurred: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => void;
          notificationOccurred: (type: 'error' | 'success' | 'warning') => void;
          selectionChanged: () => void;
        };
      };
    };
  }
}

interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

interface User {
  id: string; // Supabase user ID
  telegram_id: number;
  telegram_username?: string;
  display_name: string;
  avatar_url?: string;
  wallet_address?: string;
  created_at: string;
}

interface AuthContextType {
  user: User | null;
  telegramUser: TelegramUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: () => Promise<void>;
  logout: () => void;
  linkWallet: (address: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get Telegram user from WebApp
  const getTelegramUser = useCallback((): TelegramUser | null => {
    const tg = window.Telegram?.WebApp;
    if (!tg?.initDataUnsafe?.user) {
      return null;
    }
    return tg.initDataUnsafe.user;
  }, []);

  // Login with Telegram
  const login = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const tg = window.Telegram?.WebApp;

      if (!tg?.initData) {
        throw new Error('Telegram WebApp not available. Open from Telegram.');
      }

      // Call Supabase Edge Function to verify initData and get/create user
      const { data, error: fnError } = await supabase.functions.invoke('telegram-auth', {
        body: { initData: tg.initData }
      });

      if (fnError) throw fnError;

      if (!data?.user) {
        throw new Error('Authentication failed');
      }

      setUser(data.user);
      // Use auth_user_id for P2P operations (balance queries, etc.)
      // This is the auth.users ID used by p2p_deposit_withdraw_requests FK
      const p2pUserId = data.auth_user_id || data.user.id;
      setCurrentUserId(p2pUserId);
      setTelegramUser(getTelegramUser());

      // Store session token and auth_user_id if provided
      if (data.session_token) {
        localStorage.setItem('p2p_session', data.session_token);
      }
      if (data.auth_user_id) {
        localStorage.setItem('p2p_auth_user_id', data.auth_user_id);
      }

      window.Telegram?.WebApp.HapticFeedback.notificationOccurred('success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      window.Telegram?.WebApp.HapticFeedback.notificationOccurred('error');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  }, [getTelegramUser]);

  // Logout
  const logout = useCallback(() => {
    setUser(null);
    setCurrentUserId(null); // Clear user ID for p2p-fiat functions
    localStorage.removeItem('p2p_session');
    window.Telegram?.WebApp.HapticFeedback.impactOccurred('medium');
  }, []);

  // Link wallet address
  const linkWallet = useCallback(async (address: string) => {
    if (!user) throw new Error('Not authenticated');

    const { error: updateError } = await supabase
      .from('p2p_users')
      .update({ wallet_address: address })
      .eq('telegram_id', user.telegram_id);

    if (updateError) throw updateError;

    setUser(prev => prev ? { ...prev, wallet_address: address } : null);
    window.Telegram?.WebApp.HapticFeedback.notificationOccurred('success');
  }, [user]);

  // Login via URL params (from mini-app redirect)
  const loginViaParams = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const tgId = params.get('tg_id');
    const wallet = params.get('wallet');
    const from = params.get('from');
    const ts = params.get('ts');

    if (!tgId || from !== 'miniapp') {
      return false;
    }

    // Validate timestamp (not older than 5 minutes)
    if (ts) {
      const timestamp = parseInt(ts);
      const now = Date.now();
      if (now - timestamp > 5 * 60 * 1000) {
        console.warn('URL params expired');
        return false;
      }
    }

    setIsLoading(true);

    try {
      // Verify with backend and get/create user
      const { data, error: fnError } = await supabase.functions.invoke('telegram-auth', {
        body: {
          telegram_id: parseInt(tgId),
          wallet_address: wallet || undefined,
          from_miniapp: true
        }
      });

      if (fnError) throw fnError;

      if (!data?.user) {
        throw new Error('Authentication failed');
      }

      setUser(data.user);
      // Use auth_user_id for P2P operations
      const p2pUserId = data.auth_user_id || data.user.id;
      setCurrentUserId(p2pUserId);

      // Store session token and auth_user_id
      if (data.session_token) {
        localStorage.setItem('p2p_session', data.session_token);
      }
      if (data.auth_user_id) {
        localStorage.setItem('p2p_auth_user_id', data.auth_user_id);
      }

      // Clear URL params after successful login
      window.history.replaceState({}, '', window.location.pathname);

      return true;
    } catch (err) {
      console.error('URL param login error:', err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Auto-login on mount
  useEffect(() => {
    const initAuth = async () => {
      const tg = window.Telegram?.WebApp;

      // Check for existing session first
      const sessionToken = localStorage.getItem('p2p_session');
      const storedAuthUserId = localStorage.getItem('p2p_auth_user_id');
      if (sessionToken) {
        try {
          const { data, error } = await supabase.functions.invoke('telegram-auth', {
            body: { sessionToken }
          });
          if (!error && data?.user) {
            setUser(data.user);
            // Use stored or returned auth_user_id for P2P operations
            const p2pUserId = data.auth_user_id || storedAuthUserId || data.user.id;
            setCurrentUserId(p2pUserId);
            if (data.auth_user_id) {
              localStorage.setItem('p2p_auth_user_id', data.auth_user_id);
            }
            setIsLoading(false);
            return;
          }
        } catch {
          localStorage.removeItem('p2p_session');
          localStorage.removeItem('p2p_auth_user_id');
        }
      }

      // Try Telegram WebApp auth
      if (tg?.initData) {
        tg.ready();
        tg.expand();
        setTelegramUser(getTelegramUser());
        await login();
        return;
      }

      // Try URL params auth (from mini-app redirect)
      const params = new URLSearchParams(window.location.search);
      if (params.get('from') === 'miniapp' && params.get('tg_id')) {
        const success = await loginViaParams();
        if (success) return;
      }

      setIsLoading(false);
    };

    initAuth();
  }, [getTelegramUser, login, loginViaParams]);

  const value: AuthContextType = {
    user,
    telegramUser,
    isLoading,
    isAuthenticated: !!user,
    error,
    login,
    logout,
    linkWallet
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
