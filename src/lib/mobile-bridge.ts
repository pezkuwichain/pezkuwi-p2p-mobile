/**
 * Mobile Bridge Utility
 *
 * Handles communication between the web app and native mobile app (React Native WebView).
 * When running inside the Pezkuwi mobile app, this bridge enables:
 * - Native wallet integration (address, signing)
 * - Platform detection
 * - Native navigation
 */

// Type definitions for the native bridge
declare global {
  interface Window {
    PEZKUWI_MOBILE?: boolean;
    PEZKUWI_PLATFORM?: 'ios' | 'android';
    PEZKUWI_ADDRESS?: string;
    PEZKUWI_ACCOUNT_NAME?: string;
    ReactNativeWebView?: {
      postMessage: (message: string) => void;
    };
    PezkuwiNativeBridge?: {
      signTransaction: (payload: { section: string; method: string; args: unknown[] }, callback: (hash: string | null, error: string | null) => void) => void;
      connectWallet: () => void;
      goBack: () => void;
      isWalletConnected: () => boolean;
      getAddress: () => string | null;
    };
  }
}

export interface MobileBridgeState {
  isMobile: boolean;
  platform: 'ios' | 'android' | 'web';
  walletAddress: string | null;
  accountName: string | null;
  isWalletConnected: boolean;
}

/**
 * Check if running inside mobile WebView
 */
export function isMobileApp(): boolean {
  return typeof window !== 'undefined' && window.PEZKUWI_MOBILE === true;
}

/**
 * Get current platform
 */
export function getPlatform(): 'ios' | 'android' | 'web' {
  if (!isMobileApp()) return 'web';
  return window.PEZKUWI_PLATFORM || 'android';
}

/**
 * Get native wallet address (if connected in mobile app)
 */
export function getNativeWalletAddress(): string | null {
  if (!isMobileApp()) return null;
  return window.PEZKUWI_ADDRESS || window.PezkuwiNativeBridge?.getAddress() || null;
}

/**
 * Get native account name
 */
export function getNativeAccountName(): string | null {
  if (!isMobileApp()) return null;
  return window.PEZKUWI_ACCOUNT_NAME || null;
}

/**
 * Check if native wallet is connected
 */
export function isNativeWalletConnected(): boolean {
  if (!isMobileApp()) return false;
  return window.PezkuwiNativeBridge?.isWalletConnected() || !!window.PEZKUWI_ADDRESS;
}

/**
 * Request wallet connection from native app
 */
export function requestNativeWalletConnection(): void {
  if (!isMobileApp()) return;
  window.PezkuwiNativeBridge?.connectWallet();
}

export interface TransactionPayload {
  section: string;
  method: string;
  args: unknown[];
}

/**
 * Sign and submit transaction using native wallet
 * Returns a promise that resolves with the block hash or rejects with error
 */
export function signTransactionNative(payload: TransactionPayload): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!isMobileApp() || !window.PezkuwiNativeBridge) {
      reject(new Error('Native bridge not available'));
      return;
    }

    window.PezkuwiNativeBridge.signTransaction(payload, (hash, error) => {
      if (error) {
        reject(new Error(error));
      } else if (hash) {
        resolve(hash);
      } else {
        reject(new Error('No transaction hash returned'));
      }
    });
  });
}

/**
 * Legacy: Sign transaction using native wallet (raw hex - deprecated)
 * @deprecated Use signTransactionNative with TransactionPayload instead
 */
export function signTransactionNativeHex(extrinsicHex: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!isMobileApp() || !window.ReactNativeWebView) {
      reject(new Error('Native bridge not available'));
      return;
    }

    // For backwards compatibility, send as legacy format
    window.ReactNativeWebView.postMessage(JSON.stringify({
      type: 'SIGN_TRANSACTION_LEGACY',
      payload: { extrinsicHex }
    }));

    // Note: This won't work without proper callback handling
    reject(new Error('Legacy signing not supported - use TransactionPayload'));
  });
}

/**
 * Navigate back in native app
 */
export function navigateBackNative(): void {
  if (!isMobileApp()) return;
  window.PezkuwiNativeBridge?.goBack();
}

/**
 * Send message to native app
 */
export function sendMessageToNative(type: string, payload?: unknown): void {
  if (!isMobileApp() || !window.ReactNativeWebView) return;

  window.ReactNativeWebView.postMessage(JSON.stringify({ type, payload }));
}

/**
 * Get current mobile bridge state
 */
export function getMobileBridgeState(): MobileBridgeState {
  const isMobile = isMobileApp();
  return {
    isMobile,
    platform: getPlatform(),
    walletAddress: getNativeWalletAddress(),
    accountName: getNativeAccountName(),
    isWalletConnected: isNativeWalletConnected(),
  };
}

/**
 * Log to native console (for debugging)
 */
export function logToNative(message: string, data?: unknown): void {
  if (!isMobileApp()) {
    console.log(message, data);
    return;
  }

  sendMessageToNative('CONSOLE_LOG', { message, data });
}

// Export a singleton for easy access
export const mobileBridge = {
  isMobileApp,
  getPlatform,
  getNativeWalletAddress,
  getNativeAccountName,
  isNativeWalletConnected,
  requestNativeWalletConnection,
  signTransactionNative,
  navigateBackNative,
  sendMessageToNative,
  getMobileBridgeState,
  logToNative,
};

export default mobileBridge;
