/**
 * Express Mode Component - OKX-Style Quick Trading
 *
 * Express mode allows users to quickly buy/sell crypto at the best available rate
 * without manually selecting an offer. The system automatically matches with
 * the best available merchant.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Zap, ArrowRight, Shield, Clock, Star, AlertCircle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import type { CryptoToken, FiatCurrency } from '@pezkuwi/lib/p2p-fiat';

interface BestOffer {
  id: string;
  seller_id: string;
  price_per_unit: number;
  remaining_amount: number;
  payment_method_name: string;
  seller_reputation: number;
  seller_completed_trades: number;
  time_limit_minutes: number;
}

interface ExpressModeProps {
  onTradeStarted?: (tradeId: string) => void;
}

const SUPPORTED_TOKENS: CryptoToken[] = ['HEZ', 'PEZ'];

// All supported fiat currencies including Kurdish Diaspora countries
const SUPPORTED_FIATS: { code: FiatCurrency; name: string; symbol: string; region: string }[] = [
  // Primary regions (Kurdistan & neighboring)
  { code: 'TRY', name: 'Turkish Lira', symbol: '₺', region: 'Bakur' },
  { code: 'IQD', name: 'Iraqi Dinar', symbol: 'د.ع', region: 'Başûr' },
  { code: 'IRR', name: 'Iranian Rial', symbol: '﷼', region: 'Rojhilat' },
  // Eurozone diaspora
  { code: 'EUR', name: 'Euro', symbol: '€', region: 'EU' },
  // Other diaspora regions
  { code: 'USD', name: 'US Dollar', symbol: '$', region: 'USA' },
  { code: 'GBP', name: 'British Pound', symbol: '£', region: 'UK' },
  { code: 'SEK', name: 'Swedish Krona', symbol: 'kr', region: 'Sweden' },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr.', region: 'Switzerland' },
  { code: 'NOK', name: 'Norwegian Krone', symbol: 'kr', region: 'Norway' },
  { code: 'DKK', name: 'Danish Krone', symbol: 'kr', region: 'Denmark' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', region: 'Australia' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', region: 'Canada' },
];

export function ExpressMode({ onTradeStarted }: ExpressModeProps) {
  const [mode, setMode] = useState<'buy' | 'sell'>('buy');
  const [token, setToken] = useState<CryptoToken>('HEZ');
  const [fiat, setFiat] = useState<FiatCurrency>('TRY');
  const [amount, setAmount] = useState<string>('');
  const [inputType, setInputType] = useState<'crypto' | 'fiat'>('fiat');
  const [bestOffer, setBestOffer] = useState<BestOffer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const { user } = useAuth();
  const navigate = useNavigate();

  // Calculate conversion
  const fiatSymbol = SUPPORTED_FIATS.find(f => f.code === fiat)?.symbol || '';
  const cryptoAmount = inputType === 'crypto'
    ? parseFloat(amount) || 0
    : bestOffer ? (parseFloat(amount) || 0) / bestOffer.price_per_unit : 0;
  const fiatAmount = inputType === 'fiat'
    ? parseFloat(amount) || 0
    : bestOffer ? (parseFloat(amount) || 0) * bestOffer.price_per_unit : 0;

  // Fetch best offer when parameters change
  useEffect(() => {
    const fetchBestOffer = async () => {
      if (!amount || parseFloat(amount) <= 0) {
        setBestOffer(null);
        return;
      }

      setIsLoading(true);
      try {
        // Get best offer based on mode
        const { data, error } = await supabase
          .from('p2p_fiat_offers')
          .select(`
            id,
            seller_id,
            price_per_unit,
            remaining_amount,
            time_limit_minutes,
            payment_methods!inner(method_name),
            profiles!p2p_fiat_offers_seller_id_fkey(display_name),
            p2p_reputation!p2p_fiat_offers_seller_id_fkey(reputation_score, completed_trades)
          `)
          .eq('token', token)
          .eq('fiat_currency', fiat)
          .eq('status', 'open')
          .gt('remaining_amount', 0)
          .order('price_per_unit', { ascending: mode === 'buy' })
          .limit(1)
          .single();

        if (error) {
          setBestOffer(null);
        } else if (data) {
          setBestOffer({
            id: data.id,
            seller_id: data.seller_id,
            price_per_unit: data.price_per_unit,
            remaining_amount: data.remaining_amount,
            payment_method_name: (data.payment_methods as { method_name?: string })?.method_name || 'Bank Transfer',
            seller_reputation: (data.p2p_reputation as { reputation_score?: number })?.reputation_score || 0,
            seller_completed_trades: (data.p2p_reputation as { completed_trades?: number })?.completed_trades || 0,
            time_limit_minutes: data.time_limit_minutes,
          });
        }
      } catch (err) {
        console.error('Fetch best offer error:', err);
        setBestOffer(null);
      } finally {
        setIsLoading(false);
      }
    };

    const debounce = setTimeout(fetchBestOffer, 300);
    return () => clearTimeout(debounce);
  }, [amount, token, fiat, mode]);

  // Handle express trade
  const handleExpressTrade = async () => {
    if (!user) {
      toast.error('Please login to trade');
      return;
    }

    if (!bestOffer) {
      toast.error('No offers available');
      return;
    }

    if (cryptoAmount > bestOffer.remaining_amount) {
      toast.error(`Maximum available: ${bestOffer.remaining_amount} ${token}`);
      return;
    }

    setIsProcessing(true);
    try {
      // Accept the best offer
      const { data: result, error } = await supabase.rpc('accept_p2p_offer', {
        p_offer_id: bestOffer.id,
        p_buyer_id: user.id,
        p_buyer_wallet: '', // Will be set from user profile
        p_amount: cryptoAmount
      });

      if (error) throw error;

      const response = typeof result === 'string' ? JSON.parse(result) : result;

      if (!response.success) {
        throw new Error(response.error || 'Failed to start trade');
      }

      toast.success('Express trade started!');

      if (onTradeStarted) {
        onTradeStarted(response.trade_id);
      } else {
        navigate(`/p2p/trade/${response.trade_id}`);
      }
    } catch (err) {
      console.error('Express trade error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to start trade');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/30">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-yellow-500/20 rounded-lg">
              <Zap className="w-5 h-5 text-yellow-400" />
            </div>
            <div>
              <CardTitle className="text-lg text-white">Express Mode</CardTitle>
              <p className="text-xs text-gray-400">Instant best-rate matching</p>
            </div>
          </div>
          <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30">
            Fast
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Buy/Sell Toggle */}
        <Tabs value={mode} onValueChange={(v) => setMode(v as 'buy' | 'sell')}>
          <TabsList className="grid w-full grid-cols-2 bg-gray-800">
            <TabsTrigger value="buy" className="data-[state=active]:bg-green-600">
              Buy {token}
            </TabsTrigger>
            <TabsTrigger value="sell" className="data-[state=active]:bg-red-600">
              Sell {token}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Token & Fiat Selection */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-gray-400 text-xs">Crypto</Label>
            <Select value={token} onValueChange={(v) => setToken(v as CryptoToken)}>
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_TOKENS.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-gray-400 text-xs">Currency</Label>
            <Select value={fiat} onValueChange={(v) => setFiat(v as FiatCurrency)}>
              <SelectTrigger className="bg-gray-800 border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_FIATS.map(f => (
                  <SelectItem key={f.code} value={f.code}>
                    {f.symbol} {f.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Amount Input */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-gray-400 text-xs">
              {inputType === 'fiat' ? `Amount (${fiat})` : `Amount (${token})`}
            </Label>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-yellow-400 h-auto p-0"
              onClick={() => setInputType(inputType === 'fiat' ? 'crypto' : 'fiat')}
            >
              Switch to {inputType === 'fiat' ? token : fiat}
            </Button>
          </div>
          <div className="relative">
            <Input
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="bg-gray-800 border-gray-700 text-lg pr-16"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
              {inputType === 'fiat' ? fiatSymbol : token}
            </span>
          </div>
        </div>

        {/* Conversion Display */}
        {bestOffer && parseFloat(amount) > 0 && (
          <div className="p-3 bg-gray-800/50 rounded-lg space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">You {mode === 'buy' ? 'pay' : 'receive'}</span>
              <span className="text-white font-medium">
                {fiatSymbol}{fiatAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {fiat}
              </span>
            </div>
            <div className="flex items-center justify-center">
              <ArrowRight className="w-4 h-4 text-gray-500" />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-400">You {mode === 'buy' ? 'receive' : 'send'}</span>
              <span className="text-white font-medium">
                {cryptoAmount.toLocaleString(undefined, { maximumFractionDigits: 6 })} {token}
              </span>
            </div>
            <div className="pt-2 border-t border-gray-700 space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Rate</span>
                <span className="text-gray-300">
                  1 {token} = {fiatSymbol}{bestOffer.price_per_unit.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Merchant Rating</span>
                <span className="text-yellow-400 flex items-center gap-1">
                  <Star className="w-3 h-3" />
                  {bestOffer.seller_reputation}% ({bestOffer.seller_completed_trades} trades)
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Payment</span>
                <span className="text-gray-300">{bestOffer.payment_method_name}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500">Time Limit</span>
                <span className="text-gray-300 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {bestOffer.time_limit_minutes} min
                </span>
              </div>
            </div>
          </div>
        )}

        {/* No Offers Warning */}
        {!bestOffer && parseFloat(amount) > 0 && !isLoading && (
          <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span className="text-sm text-red-400">
              No offers available for this pair
            </span>
          </div>
        )}

        {/* Express Trade Button */}
        <Button
          className="w-full bg-yellow-500 hover:bg-yellow-600 text-black font-semibold"
          size="lg"
          onClick={handleExpressTrade}
          disabled={!bestOffer || isLoading || isProcessing || !user}
        >
          {isProcessing ? (
            <>Processing...</>
          ) : (
            <>
              <Zap className="w-4 h-4 mr-2" />
              {mode === 'buy' ? 'Buy' : 'Sell'} {token} Instantly
            </>
          )}
        </Button>

        {/* Trust Indicators */}
        <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Shield className="w-3 h-3 text-green-400" />
            Escrow Protected
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-blue-400" />
            Verified Merchants
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
