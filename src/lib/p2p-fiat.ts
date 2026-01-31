/**
 * P2P Fiat Trading System - Mobile Version (OKX-Style Internal Ledger)
 *
 * @module p2p-fiat
 * @description P2P fiat-to-crypto trading with internal ledger escrow
 *
 * Security Model:
 * - Authentication via Telegram initData (cryptographically signed)
 * - Blockchain transactions ONLY occur at deposit/withdraw (backend)
 * - P2P trades use internal database balance transfers
 * - No client-side blockchain transactions
 */

import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

// =====================================================
// TYPES
// =====================================================

export type FiatCurrency =
  | 'TRY' | 'IQD' | 'IRR' | 'EUR' | 'USD' | 'GBP'
  | 'SEK' | 'CHF' | 'NOK' | 'DKK' | 'AUD' | 'CAD';

export type CryptoToken = 'HEZ' | 'PEZ';
export type OfferStatus = 'open' | 'paused' | 'locked' | 'completed' | 'cancelled';
export type TradeStatus = 'pending' | 'payment_sent' | 'completed' | 'cancelled' | 'disputed' | 'refunded';

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
}

export interface ValidationRule {
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
}

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
}

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

// =====================================================
// VALIDATION
// =====================================================

export interface ValidationRule {
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  required?: boolean;
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
// PAYMENT METHODS
// =====================================================

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
    return [];
  }
}

// =====================================================
// OFFERS
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

export async function acceptFiatOffer(params: {
  offerId: string;
  buyerWallet: string;
  amount?: number;
}): Promise<string> {
  const { offerId, buyerWallet, amount } = params;

  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    const { data: offer } = await supabase
      .from('p2p_fiat_offers')
      .select('remaining_amount, min_buyer_completed_trades, min_buyer_reputation')
      .eq('id', offerId)
      .single();

    if (!offer) throw new Error('Offer not found');

    const tradeAmount = amount || offer.remaining_amount;

    // Check reputation requirements
    if (offer.min_buyer_completed_trades > 0 || offer.min_buyer_reputation > 0) {
      const { data: reputation } = await supabase
        .from('p2p_reputation')
        .select('completed_trades, reputation_score')
        .eq('user_id', user.user.id)
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

    // Atomic accept
    const { data: result, error: rpcError } = await supabase.rpc('accept_p2p_offer', {
      p_offer_id: offerId,
      p_buyer_id: user.user.id,
      p_buyer_wallet: buyerWallet,
      p_amount: tradeAmount
    });

    if (rpcError) throw rpcError;

    const response = typeof result === 'string' ? JSON.parse(result) : result;

    if (!response.success) {
      throw new Error(response.error || 'Failed to accept offer');
    }

    toast.success('Trade started! Send payment within time limit.');
    return response.trade_id;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to accept offer';
    toast.error(message);
    throw error;
  }
}

// =====================================================
// TRADES
// =====================================================

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

export async function markPaymentSent(
  tradeId: string,
  paymentProofUrl?: string
): Promise<void> {
  try {
    const confirmationDeadline = new Date(Date.now() + 60 * 60 * 1000); // 60 min

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
    toast.success('Payment marked as sent. Waiting for seller confirmation...');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to mark payment';
    toast.error(message);
    throw error;
  }
}

export async function confirmPaymentReceived(tradeId: string): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const sellerId = userData.user?.id;
    if (!sellerId) throw new Error('Not authenticated');

    const { data: trade } = await supabase
      .from('p2p_fiat_trades')
      .select('*, p2p_fiat_offers(token)')
      .eq('id', tradeId)
      .single();

    if (!trade) throw new Error('Trade not found');
    if (trade.seller_id !== sellerId) throw new Error('Only seller can confirm');
    if (trade.status !== 'payment_sent') throw new Error('Payment not marked as sent');

    toast.info('Releasing crypto to buyer...');

    // Release escrow internally
    const { data: result, error: releaseError } = await supabase.rpc('release_escrow_internal', {
      p_from_user_id: trade.seller_id,
      p_to_user_id: trade.buyer_id,
      p_token: trade.p2p_fiat_offers.token,
      p_amount: trade.crypto_amount,
      p_reference_type: 'trade',
      p_reference_id: tradeId
    });

    if (releaseError) throw releaseError;

    const response = typeof result === 'string' ? JSON.parse(result) : result;
    if (!response.success) throw new Error(response.error || 'Failed to release');

    // Update trade status
    await supabase
      .from('p2p_fiat_trades')
      .update({
        seller_confirmed_at: new Date().toISOString(),
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('id', tradeId);

    toast.success('Payment confirmed! Crypto released to buyer.');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to confirm';
    toast.error(message);
    throw error;
  }
}

export async function cancelTrade(tradeId: string, reason?: string): Promise<void> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) throw new Error('Not authenticated');

    const { data: trade } = await supabase
      .from('p2p_fiat_trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (!trade) throw new Error('Trade not found');
    if (trade.status !== 'pending') throw new Error('Cannot cancel at this stage');

    await supabase
      .from('p2p_fiat_trades')
      .update({
        status: 'cancelled',
        cancelled_by: user.user.id,
        cancel_reason: reason
      })
      .eq('id', tradeId);

    // Restore offer amount
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
          status: 'open'
        })
        .eq('id', trade.offer_id);
    }

    toast.success('Trade cancelled');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to cancel';
    toast.error(message);
    throw error;
  }
}

// =====================================================
// REPUTATION
// =====================================================

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
    console.error('Get reputation error:', error);
    return null;
  }
}

// =====================================================
// INTERNAL BALANCE (OKX-Style)
// =====================================================

export async function getInternalBalances(): Promise<InternalBalance[]> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return [];

    const { data, error } = await supabase.rpc('get_user_internal_balance', {
      p_user_id: userId
    });

    if (error) throw error;
    return typeof data === 'string' ? JSON.parse(data) : (data || []);
  } catch (error) {
    console.error('Get balances error:', error);
    return [];
  }
}

export async function getInternalBalance(token: CryptoToken): Promise<InternalBalance | null> {
  const balances = await getInternalBalances();
  return balances.find(b => b.token === token) || null;
}

export async function requestWithdraw(
  token: CryptoToken,
  amount: number,
  walletAddress: string
): Promise<string> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error('Not authenticated');

    if (amount <= 0) throw new Error('Amount must be greater than 0');
    if (!walletAddress || walletAddress.length < 40) throw new Error('Invalid wallet address');

    toast.info('Processing withdrawal request...');

    const { data, error } = await supabase.rpc('request_withdraw', {
      p_user_id: userId,
      p_token: token,
      p_amount: amount,
      p_wallet_address: walletAddress
    });

    if (error) throw error;

    const result = typeof data === 'string' ? JSON.parse(data) : data;
    if (!result.success) throw new Error(result.error || 'Request failed');

    toast.success(`Withdrawal request submitted! ${amount} ${token} will be sent.`);
    return result.request_id;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Request failed';
    toast.error(message);
    throw error;
  }
}

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
    console.error('Get history error:', error);
    return [];
  }
}

export async function getPlatformWalletAddress(): Promise<string> {
  const DEFAULT_ADDRESS = '5DFwqK698vL4gXHEcanaewnAqhxJ2rjhAogpSTHw3iwGDwd3';
  try {
    const { data, error } = await supabase
      .from('p2p_config')
      .select('value')
      .eq('key', 'platform_escrow_wallet')
      .single();

    if (error) return DEFAULT_ADDRESS;
    return data?.value || DEFAULT_ADDRESS;
  } catch {
    return DEFAULT_ADDRESS;
  }
}
