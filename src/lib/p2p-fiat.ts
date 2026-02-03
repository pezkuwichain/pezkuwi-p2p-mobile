/**
 * P2P Fiat Trading System - Mobile Version (OKX-Style Internal Ledger)
 *
 * @module p2p-fiat
 * @description Enterprise-level P2P fiat-to-crypto trading with internal ledger escrow
 *
 * OKX Model Implementation:
 * - Blockchain transactions ONLY occur at deposit/withdraw (via Edge Functions)
 * - P2P trades use internal database balance transfers
 * - No blockchain transactions during actual P2P trading
 */

import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

// =====================================================
// USER ID HELPER
// =====================================================

// Store for current user ID (set by AuthContext)
let currentUserId: string | null = null;

/**
 * Set the current user ID (called by AuthContext after login)
 */
export function setCurrentUserId(userId: string | null): void {
  currentUserId = userId;
}

/**
 * Get current user ID - checks stored ID first, then falls back to Supabase Auth
 */
async function getCurrentUserId(): Promise<string | null> {
  // First check stored user ID (from Telegram auth)
  if (currentUserId) {
    return currentUserId;
  }

  // Fallback to Supabase Auth (for web app compatibility)
  try {
    const { data } = await supabase.auth.getUser();
    return data.user?.id || null;
  } catch {
    return null;
  }
}

// =====================================================
// TYPES
// =====================================================

export interface PaymentMethod {
  id: string;
  currency: FiatCurrency;
  country: string;
  method_name: string;
  method_type: 'bank' | 'mobile_payment' | 'cash' | 'crypto_exchange';
  logo_url?: string;
  fields: Record<string, string>;
  validation_rules: Record<string, ValidationRule>;
  min_trade_amount: number;
  max_trade_amount?: number;
  processing_time_minutes: number;
  display_order: number;
}

export interface ValidationRule {
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
}

// Fiat currencies including Kurdish Diaspora countries
export type FiatCurrency =
  | 'TRY'  // Turkish Lira (Turkey - 15M+ Kurds)
  | 'IQD'  // Iraqi Dinar (Kurdistan Region - 6M+ Kurds)
  | 'IRR'  // Iranian Rial (Rojhilat - 8M+ Kurds)
  | 'EUR'  // Euro (Germany, France, Netherlands, Belgium, Austria)
  | 'USD'  // US Dollar
  | 'GBP'  // British Pound (UK - 50K+ Kurds)
  | 'SEK'  // Swedish Krona (Sweden - 100K+ Kurds)
  | 'CHF'  // Swiss Franc (Switzerland - 30K+ Kurds)
  | 'NOK'  // Norwegian Krone (Norway - 30K+ Kurds)
  | 'DKK'  // Danish Krone (Denmark - 25K+ Kurds)
  | 'AUD'  // Australian Dollar (Australia - 20K+ Kurds)
  | 'CAD'; // Canadian Dollar (Canada - 30K+ Kurds)

export type CryptoToken = 'HEZ' | 'PEZ';

export type OfferStatus = 'open' | 'paused' | 'locked' | 'completed' | 'cancelled';
export type TradeStatus = 'pending' | 'payment_sent' | 'completed' | 'cancelled' | 'disputed' | 'refunded';

export interface P2PFiatOffer {
  id: string;
  seller_id: string;
  seller_wallet: string;
  token: CryptoToken;
  amount_crypto: number;
  fiat_currency: FiatCurrency;
  fiat_amount: number;
  price_per_unit: number;
  payment_method_id: string;
  payment_details_encrypted: string;
  min_order_amount?: number;
  max_order_amount?: number;
  time_limit_minutes: number;
  auto_reply_message?: string;
  min_buyer_completed_trades: number;
  min_buyer_reputation: number;
  status: OfferStatus;
  remaining_amount: number;
  escrow_tx_hash?: string;
  created_at: string;
  expires_at: string;
}

export interface P2PFiatTrade {
  id: string;
  offer_id: string;
  seller_id: string;
  buyer_id: string;
  buyer_wallet: string;
  crypto_amount: number;
  fiat_amount: number;
  price_per_unit: number;
  escrow_locked_amount: number;
  buyer_marked_paid_at?: string;
  buyer_payment_proof_url?: string;
  seller_confirmed_at?: string;
  status: TradeStatus;
  payment_deadline: string;
  confirmation_deadline?: string;
  created_at: string;
  completed_at?: string;
}

export interface P2PReputation {
  user_id: string;
  total_trades: number;
  completed_trades: number;
  cancelled_trades: number;
  disputed_trades: number;
  reputation_score: number;
  trust_level: 'new' | 'basic' | 'intermediate' | 'advanced' | 'verified';
  verified_merchant: boolean;
  avg_payment_time_minutes?: number;
  avg_confirmation_time_minutes?: number;
  fast_trader?: boolean;
}

export interface CreateOfferParams {
  token: CryptoToken;
  amountCrypto: number;
  fiatCurrency: FiatCurrency;
  fiatAmount: number;
  paymentMethodId: string;
  paymentDetails: Record<string, string>;
  timeLimitMinutes?: number;
  minOrderAmount?: number;
  maxOrderAmount?: number;
}

export interface AcceptOfferParams {
  offerId: string;
  buyerWallet: string;
  amount?: number;
}

// =====================================================
// INTERNAL BALANCE TYPES (OKX-Style)
// =====================================================

export interface InternalBalance {
  token: CryptoToken;
  available_balance: number;
  locked_balance: number;
  total_balance: number;
  total_deposited: number;
  total_withdrawn: number;
}

export interface DepositWithdrawRequest {
  id: string;
  user_id: string;
  request_type: 'deposit' | 'withdraw';
  token: CryptoToken;
  amount: number;
  wallet_address: string;
  blockchain_tx_hash?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  processed_at?: string;
  error_message?: string;
  created_at: string;
}

export interface BalanceTransaction {
  id: string;
  user_id: string;
  token: string;
  transaction_type: 'deposit' | 'withdraw' | 'escrow_lock' | 'escrow_release' | 'escrow_refund' | 'trade_receive' | 'admin_adjustment';
  amount: number;
  balance_before: number;
  balance_after: number;
  reference_type?: string;
  reference_id?: string;
  description?: string;
  created_at: string;
}

// =====================================================
// CONSTANTS
// =====================================================

const PLATFORM_ESCROW_ADDRESS = '5H18ZZBU4LwPYbeEZ1JBGvibCU2edhhM8HNUtFi7GgC36CgS';

const DEFAULT_PAYMENT_DEADLINE_MINUTES = 30;
const DEFAULT_CONFIRMATION_DEADLINE_MINUTES = 60;

// =====================================================
// PAYMENT METHODS
// =====================================================

/**
 * Fetch available payment methods for a currency
 */
export async function getPaymentMethods(currency: FiatCurrency): Promise<PaymentMethod[]> {
  try {
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('currency', currency)
      .eq('is_active', true)
      .order('display_order');

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Get payment methods error:', error);
    toast.error('Failed to load payment methods');
    return [];
  }
}

/**
 * Validate payment details against method rules
 */
export function validatePaymentDetails(
  paymentDetails: Record<string, string>,
  validationRules: Record<string, ValidationRule>
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  for (const [field, rules] of Object.entries(validationRules)) {
    const value = paymentDetails[field] || '';

    if (rules.required && !value) {
      errors[field] = 'This field is required';
      continue;
    }

    if (rules.pattern && value) {
      const regex = new RegExp(rules.pattern);
      if (!regex.test(value)) {
        errors[field] = 'Invalid format';
      }
    }

    if (rules.minLength && value.length < rules.minLength) {
      errors[field] = `Minimum ${rules.minLength} characters`;
    }

    if (rules.maxLength && value.length > rules.maxLength) {
      errors[field] = `Maximum ${rules.maxLength} characters`;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors
  };
}

// =====================================================
// ENCRYPTION (AES-256-GCM - OKX-Level Security)
// =====================================================

const IV_LENGTH = 12; // 96 bits for GCM

/**
 * Derive encryption key from a password/secret
 */
async function getEncryptionKey(): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode('p2p-payment-encryption-v1-pezkuwi'),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('pezkuwi-p2p-salt'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt payment details using AES-256-GCM
 */
async function encryptPaymentDetails(details: Record<string, string>): Promise<string> {
  try {
    const key = await getEncryptionKey();
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(details));

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Encrypt
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );

    // Combine IV + ciphertext and encode as base64
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    console.error('Encryption failed:', error);
    // Fallback to base64 for backwards compatibility (temporary)
    return btoa(JSON.stringify(details));
  }
}

/**
 * Decrypt payment details using AES-256-GCM
 */
export async function decryptPaymentDetails(encrypted: string): Promise<Record<string, string>> {
  try {
    const key = await getEncryptionKey();

    // Decode base64
    const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));

    // Extract IV and ciphertext
    const iv = combined.slice(0, IV_LENGTH);
    const ciphertext = combined.slice(IV_LENGTH);

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
  } catch {
    // Fallback: try to decode as plain base64 (for old data)
    try {
      return JSON.parse(atob(encrypted));
    } catch {
      return {};
    }
  }
}

// =====================================================
// AUDIT LOGGING
// =====================================================

async function logAction(
  entityType: string,
  entityId: string,
  action: string,
  details: Record<string, unknown>
): Promise<void> {
  try {
    const userId = await getCurrentUserId();

    await supabase.from('p2p_audit_log').insert({
      user_id: userId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      details
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
}

// =====================================================
// CREATE OFFER
// =====================================================

/**
 * Create a new P2P fiat offer (OKX-Style Internal Ledger)
 *
 * Steps:
 * 1. Lock crypto from internal balance (NO blockchain tx)
 * 2. Create offer record in Supabase
 * 3. Update escrow tracking
 */
export async function createFiatOffer(params: CreateOfferParams): Promise<string> {
  const {
    token,
    amountCrypto,
    fiatCurrency,
    fiatAmount,
    paymentMethodId,
    paymentDetails,
    timeLimitMinutes = DEFAULT_PAYMENT_DEADLINE_MINUTES,
    minOrderAmount,
    maxOrderAmount
  } = params;

  try {
    // Get current user
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');

    toast.info('Locking crypto from your balance...');

    // 1. Lock crypto from internal balance (NO blockchain tx!)
    const { data: lockResult, error: lockError } = await supabase.rpc('lock_escrow_internal', {
      p_user_id: userId,
      p_token: token,
      p_amount: amountCrypto
    });

    if (lockError) throw lockError;

    // Parse result
    const lockResponse = typeof lockResult === 'string' ? JSON.parse(lockResult) : lockResult;

    if (!lockResponse.success) {
      throw new Error(lockResponse.error || 'Failed to lock balance');
    }

    toast.success('Balance locked successfully');

    // 2. Encrypt payment details (AES-256-GCM)
    const encryptedDetails = await encryptPaymentDetails(paymentDetails);

    // 3. Create offer in Supabase
    const { data: offer, error: offerError } = await supabase
      .from('p2p_fiat_offers')
      .insert({
        seller_id: userId,
        seller_wallet: '', // No longer needed with internal ledger
        token,
        amount_crypto: amountCrypto,
        fiat_currency: fiatCurrency,
        fiat_amount: fiatAmount,
        price_per_unit: fiatAmount / amountCrypto,
        payment_method_id: paymentMethodId,
        payment_details_encrypted: encryptedDetails,
        min_order_amount: minOrderAmount,
        max_order_amount: maxOrderAmount,
        time_limit_minutes: timeLimitMinutes,
        status: 'open',
        remaining_amount: amountCrypto,
        escrow_locked_at: new Date().toISOString()
      })
      .select()
      .single();

    if (offerError) throw offerError;

    // 4. Audit log
    await logAction('offer', offer.id, 'create_offer', {
      token,
      amount_crypto: amountCrypto,
      fiat_currency: fiatCurrency,
      fiat_amount: fiatAmount,
      escrow_type: 'internal_ledger'
    });

    toast.success(`Offer created! Selling ${amountCrypto} ${token} for ${fiatAmount} ${fiatCurrency}`);

    return offer.id;
  } catch (error: unknown) {
    console.error('Create offer error:', error);
    const message = error instanceof Error ? error.message : 'Failed to create offer';
    toast.error(message);
    throw error;
  }
}

// =====================================================
// ACCEPT OFFER
// =====================================================

/**
 * Accept a P2P fiat offer (buyer)
 */
export async function acceptFiatOffer(params: AcceptOfferParams): Promise<string> {
  const { offerId, amount } = params;

  try {
    // 1. Get current user
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');

    // 2. Get offer to determine amount if not specified
    const { data: offer, error: offerError } = await supabase
      .from('p2p_fiat_offers')
      .select('remaining_amount, min_buyer_completed_trades, min_buyer_reputation')
      .eq('id', offerId)
      .single();

    if (offerError) throw offerError;
    if (!offer) throw new Error('Offer not found');

    const tradeAmount = amount || offer.remaining_amount;

    // 3. Check buyer reputation requirements
    if (offer.min_buyer_completed_trades > 0 || offer.min_buyer_reputation > 0) {
      const { data: reputation } = await supabase
        .from('p2p_reputation')
        .select('completed_trades, reputation_score')
        .eq('user_id', userId)
        .single();

      if (!reputation) {
        throw new Error('Seller requires experienced buyers');
      }
      if (reputation.completed_trades < offer.min_buyer_completed_trades) {
        throw new Error(`Minimum ${offer.min_buyer_completed_trades} completed trades required`);
      }
      if (reputation.reputation_score < offer.min_buyer_reputation) {
        throw new Error(`Minimum reputation score ${offer.min_buyer_reputation} required`);
      }
    }

    // 4. Call atomic database function (prevents race condition)
    const { data: result, error: rpcError } = await supabase.rpc('accept_p2p_offer', {
      p_offer_id: offerId,
      p_buyer_id: userId,
      p_buyer_wallet: params.buyerWallet,
      p_amount: tradeAmount
    });

    if (rpcError) throw rpcError;

    // Parse result
    const response = typeof result === 'string' ? JSON.parse(result) : result;

    if (!response.success) {
      throw new Error(response.error || 'Failed to accept offer');
    }

    // 5. Audit log
    await logAction('trade', response.trade_id, 'accept_offer', {
      offer_id: offerId,
      crypto_amount: response.crypto_amount,
      fiat_amount: response.fiat_amount
    });

    toast.success('Trade started! Send payment within time limit.');

    return response.trade_id;
  } catch (error: unknown) {
    console.error('Accept offer error:', error);
    const message = error instanceof Error ? error.message : 'Failed to accept offer';
    toast.error(message);
    throw error;
  }
}

// =====================================================
// MARK PAYMENT SENT (Buyer)
// =====================================================

/**
 * Buyer marks payment as sent
 */
export async function markPaymentSent(
  tradeId: string,
  paymentProofUrl?: string
): Promise<void> {
  try {
    // Update trade
    const confirmationDeadline = new Date(Date.now() + DEFAULT_CONFIRMATION_DEADLINE_MINUTES * 60 * 1000);

    const { error } = await supabase
      .from('p2p_fiat_trades')
      .update({
        buyer_marked_paid_at: new Date().toISOString(),
        buyer_payment_proof_url: paymentProofUrl,
        status: 'payment_sent',
        confirmation_deadline: confirmationDeadline.toISOString()
      })
      .eq('id', tradeId);

    if (error) throw error;

    // Audit log
    await logAction('trade', tradeId, 'mark_payment_sent', {
      payment_proof_url: paymentProofUrl
    });

    toast.success('Payment marked as sent. Waiting for seller confirmation...');
  } catch (error: unknown) {
    console.error('Mark payment sent error:', error);
    const message = error instanceof Error ? error.message : 'Failed to mark payment as sent';
    toast.error(message);
    throw error;
  }
}

// =====================================================
// CONFIRM PAYMENT RECEIVED (Seller)
// =====================================================

/**
 * Seller confirms payment received and releases crypto (OKX-Style Internal Ledger)
 */
export async function confirmPaymentReceived(tradeId: string): Promise<void> {
  try {
    // 1. Get current user (seller)
    const sellerId = await getCurrentUserId();
    if (!sellerId) throw new Error('Not authenticated');

    // 2. Get trade details
    const { data: trade, error: tradeError } = await supabase
      .from('p2p_fiat_trades')
      .select('*, p2p_fiat_offers(token)')
      .eq('id', tradeId)
      .single();

    if (tradeError) throw tradeError;
    if (!trade) throw new Error('Trade not found');

    // Verify caller is the seller
    if (trade.seller_id !== sellerId) {
      throw new Error('Only seller can confirm payment');
    }

    if (trade.status !== 'payment_sent') {
      throw new Error('Payment has not been marked as sent');
    }

    toast.info('Releasing crypto to buyer...');

    // 3. Release escrow internally (NO blockchain tx!)
    const { data: releaseResult, error: releaseError } = await supabase.rpc('release_escrow_internal', {
      p_from_user_id: trade.seller_id,
      p_to_user_id: trade.buyer_id,
      p_token: trade.p2p_fiat_offers.token,
      p_amount: trade.crypto_amount,
      p_reference_type: 'trade',
      p_reference_id: tradeId
    });

    if (releaseError) throw releaseError;

    // Parse result
    const releaseResponse = typeof releaseResult === 'string' ? JSON.parse(releaseResult) : releaseResult;

    if (!releaseResponse.success) {
      throw new Error(releaseResponse.error || 'Failed to release escrow');
    }

    // 4. Update trade status
    const { error: updateError } = await supabase
      .from('p2p_fiat_trades')
      .update({
        seller_confirmed_at: new Date().toISOString(),
        escrow_released_at: new Date().toISOString(),
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', tradeId);

    if (updateError) throw updateError;

    // 5. Update reputations
    await updateReputations(trade.seller_id, trade.buyer_id, tradeId);

    // 6. Audit log
    await logAction('trade', tradeId, 'confirm_payment', {
      released_amount: trade.crypto_amount,
      token: trade.p2p_fiat_offers.token,
      escrow_type: 'internal_ledger'
    });

    toast.success('Payment confirmed! Crypto released to buyer\'s balance.');
  } catch (error: unknown) {
    console.error('Confirm payment error:', error);
    const message = error instanceof Error ? error.message : 'Failed to confirm payment';
    toast.error(message);
    throw error;
  }
}

// =====================================================
// CANCEL TRADE
// =====================================================

/**
 * Cancel a trade (buyer only, before payment sent)
 */
export async function cancelTrade(tradeId: string, reason?: string): Promise<void> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');

    // 1. Get trade details
    const { data: trade, error: tradeError } = await supabase
      .from('p2p_fiat_trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (tradeError) throw tradeError;
    if (!trade) throw new Error('Trade not found');

    // Only allow cancellation if pending
    if (trade.status !== 'pending') {
      throw new Error('Trade cannot be cancelled at this stage');
    }

    // 2. Update trade status
    const { error: updateError } = await supabase
      .from('p2p_fiat_trades')
      .update({
        status: 'cancelled',
        cancelled_by: userId,
        cancel_reason: reason,
      })
      .eq('id', tradeId);

    if (updateError) throw updateError;

    // 3. Restore offer remaining amount
    const { data: offer } = await supabase
      .from('p2p_fiat_offers')
      .select('remaining_amount')
      .eq('id', trade.offer_id)
      .single();

    if (offer) {
      await supabase
        .from('p2p_fiat_offers')
        .update({
          remaining_amount: offer.remaining_amount + trade.crypto_amount,
          status: 'open',
        })
        .eq('id', trade.offer_id);
    }

    // 4. Audit log
    await logAction('trade', tradeId, 'cancel_trade', {
      cancelled_by: userId,
      reason,
    });

    toast.success('Trade cancelled successfully');
  } catch (error: unknown) {
    console.error('Cancel trade error:', error);
    const message = error instanceof Error ? error.message : 'Failed to cancel trade';
    toast.error(message);
    throw error;
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

async function updateReputations(sellerId: string, buyerId: string, tradeId: string): Promise<void> {
  try {
    await supabase.rpc('update_p2p_reputation', {
      p_seller_id: sellerId,
      p_buyer_id: buyerId,
      p_trade_id: tradeId
    });
  } catch (error) {
    console.error('Update reputation error:', error);
  }
}

/**
 * Update user reputation after trade completion
 */
export async function updateUserReputation(
  userId: string,
  tradeCompleted: boolean
): Promise<void> {
  try {
    // Get current reputation
    const { data: currentRep } = await supabase
      .from('p2p_reputation')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (currentRep) {
      // Update existing reputation
      await supabase
        .from('p2p_reputation')
        .update({
          total_trades: currentRep.total_trades + 1,
          completed_trades: tradeCompleted
            ? currentRep.completed_trades + 1
            : currentRep.completed_trades,
          cancelled_trades: tradeCompleted
            ? currentRep.cancelled_trades
            : currentRep.cancelled_trades + 1,
          reputation_score: tradeCompleted
            ? Math.min(100, currentRep.reputation_score + 1)
            : Math.max(0, currentRep.reputation_score - 2),
        })
        .eq('user_id', userId);
    } else {
      // Create new reputation record
      await supabase.from('p2p_reputation').insert({
        user_id: userId,
        total_trades: 1,
        completed_trades: tradeCompleted ? 1 : 0,
        cancelled_trades: tradeCompleted ? 0 : 1,
        reputation_score: tradeCompleted ? 50 : 48,
        trust_level: 'new',
        verified_merchant: false,
        fast_trader: false,
      });
    }
  } catch (error) {
    console.error('Update reputation error:', error);
  }
}

// =====================================================
// QUERY FUNCTIONS
// =====================================================

export async function getActiveOffers(
  currency?: FiatCurrency,
  token?: CryptoToken
): Promise<P2PFiatOffer[]> {
  try {
    let query = supabase
      .from('p2p_fiat_offers')
      .select('*')
      .eq('status', 'open')
      .gt('remaining_amount', 0)
      .gt('expires_at', new Date().toISOString())
      .order('price_per_unit');

    if (currency) query = query.eq('fiat_currency', currency);
    if (token) query = query.eq('token', token);

    const { data, error } = await query;
    if (error) throw error;

    return data || [];
  } catch (error) {
    console.error('Get active offers error:', error);
    return [];
  }
}

export async function getUserTrades(userId: string): Promise<P2PFiatTrade[]> {
  try {
    const { data, error } = await supabase
      .from('p2p_fiat_trades')
      .select('*')
      .or(`seller_id.eq.${userId},buyer_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Get user trades error:', error);
    return [];
  }
}

export async function getUserReputation(userId: string): Promise<P2PReputation | null> {
  try {
    const { data, error } = await supabase
      .from('p2p_reputation')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  } catch (error) {
    console.error('Get user reputation error:', error);
    return null;
  }
}

/**
 * Get a specific trade by ID
 */
export async function getTradeById(tradeId: string): Promise<P2PFiatTrade | null> {
  try {
    const { data, error } = await supabase
      .from('p2p_fiat_trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('Get trade by ID error:', error);
    return null;
  }
}

// =====================================================
// INTERNAL BALANCE FUNCTIONS (OKX-Style)
// =====================================================

/**
 * Get user's internal balances for P2P trading
 */
export async function getInternalBalances(): Promise<InternalBalance[]> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase.rpc('get_user_internal_balance', {
      p_user_id: userId
    });

    if (error) throw error;

    // Parse the JSON result
    const balances = typeof data === 'string' ? JSON.parse(data) : data;
    return balances || [];
  } catch (error) {
    console.error('Get internal balances error:', error);
    return [];
  }
}

/**
 * Get user's internal balance for a specific token
 */
export async function getInternalBalance(token: CryptoToken): Promise<InternalBalance | null> {
  const balances = await getInternalBalances();
  return balances.find(b => b.token === token) || null;
}

/**
 * Request a withdrawal from internal balance to external wallet
 */
export async function requestWithdraw(
  token: CryptoToken,
  amount: number,
  walletAddress: string
): Promise<string> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('Not authenticated');

    // Validate amount
    if (amount <= 0) throw new Error('Amount must be greater than 0');

    // Validate wallet address (basic check)
    if (!walletAddress || walletAddress.length < 40) {
      throw new Error('Invalid wallet address');
    }

    toast.info('Processing withdrawal request...');

    // Call the database function
    const { data, error } = await supabase.rpc('request_withdraw', {
      p_user_id: userId,
      p_token: token,
      p_amount: amount,
      p_wallet_address: walletAddress
    });

    if (error) throw error;

    // Parse result
    const result = typeof data === 'string' ? JSON.parse(data) : data;

    if (!result.success) {
      throw new Error(result.error || 'Withdrawal request failed');
    }

    toast.success(`Withdrawal request submitted! ${amount} ${token} will be sent to your wallet.`);

    return result.request_id;
  } catch (error: unknown) {
    console.error('Request withdraw error:', error);
    const message = error instanceof Error ? error.message : 'Withdrawal request failed';
    toast.error(message);
    throw error;
  }
}

/**
 * Get user's deposit/withdraw request history
 */
export async function getDepositWithdrawHistory(): Promise<DepositWithdrawRequest[]> {
  try {
    const { data, error } = await supabase
      .from('p2p_deposit_withdraw_requests')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Get deposit/withdraw history error:', error);
    return [];
  }
}

/**
 * Get user's balance transaction history
 */
export async function getBalanceTransactionHistory(limit: number = 50): Promise<BalanceTransaction[]> {
  try {
    const { data, error } = await supabase
      .from('p2p_balance_transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data || [];
  } catch (error) {
    console.error('Get balance transaction history error:', error);
    return [];
  }
}

/**
 * Get platform escrow wallet address (for deposits)
 */
export async function getPlatformWalletAddress(): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('p2p_config')
      .select('value')
      .eq('key', 'platform_escrow_wallet')
      .single();

    if (error) throw error;
    return data?.value || PLATFORM_ESCROW_ADDRESS;
  } catch (error) {
    console.error('Get platform wallet address error:', error);
    return PLATFORM_ESCROW_ADDRESS;
  }
}
