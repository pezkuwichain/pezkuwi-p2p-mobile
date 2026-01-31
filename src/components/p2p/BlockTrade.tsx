/**
 * Block Trade Component - OKX-Style OTC Trading
 *
 * Block trades are for large volume trades that are handled differently
 * from regular P2P trades. They offer:
 * - Custom pricing negotiation
 * - Dedicated support
 * - Multi-tranche settlements
 * - Enhanced privacy
 */

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Blocks, Shield, Clock, Lock, MessageSquare, ChevronRight,
  Building2, AlertTriangle
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { CryptoToken, FiatCurrency } from '@pezkuwi/lib/p2p-fiat';

interface BlockTradeRequest {
  id: string;
  type: 'buy' | 'sell';
  token: CryptoToken;
  fiat_currency: FiatCurrency;
  amount: number;
  target_price?: number;
  message?: string;
  status: 'pending' | 'negotiating' | 'approved' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
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

// Minimum amounts for block trade (in USD equivalent)
const MINIMUM_BLOCK_AMOUNTS: Record<CryptoToken, number> = {
  HEZ: 10000,  // 10,000 HEZ minimum
  PEZ: 50000,  // 50,000 PEZ minimum
};

export function BlockTrade() {
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [type, setType] = useState<'buy' | 'sell'>('buy');
  const [token, setToken] = useState<CryptoToken>('HEZ');
  const [fiat, setFiat] = useState<FiatCurrency>('USD');
  const [amount, setAmount] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requests, setRequests] = useState<BlockTradeRequest[]>([]);

  const { user } = useAuth();
  const fiatSymbol = SUPPORTED_FIATS.find(f => f.code === fiat)?.symbol || '';
  const minAmount = MINIMUM_BLOCK_AMOUNTS[token];

  // Fetch user's block trade requests
  React.useEffect(() => {
    if (!user) return;

    const fetchRequests = async () => {
      const { data, error } = await supabase
        .from('p2p_block_trade_requests')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setRequests(data);
      }
    };

    fetchRequests();
  }, [user]);

  const handleSubmitRequest = async () => {
    if (!user) {
      toast.error('Please login to submit a block trade request');
      return;
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum < minAmount) {
      toast.error(`Minimum amount for ${token} block trade is ${minAmount.toLocaleString()} ${token}`);
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('p2p_block_trade_requests')
        .insert({
          user_id: user.id,
          type,
          token,
          fiat_currency: fiat,
          amount: amountNum,
          target_price: targetPrice ? parseFloat(targetPrice) : null,
          message: message || null,
          status: 'pending'
        })
        .select()
        .single();

      if (error) throw error;

      toast.success('Block trade request submitted! Our OTC desk will contact you within 24 hours.');
      setShowRequestModal(false);
      setAmount('');
      setTargetPrice('');
      setMessage('');

      // Add to local state
      setRequests(prev => [data, ...prev]);
    } catch (err) {
      console.error('Block trade request error:', err);
      toast.error('Failed to submit request');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: BlockTradeRequest['status']) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      negotiating: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      approved: 'bg-green-500/20 text-green-400 border-green-500/30',
      in_progress: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      completed: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
      cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
    };
    return styles[status] || styles.pending;
  };

  return (
    <>
      <Card className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border-purple-500/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Blocks className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <CardTitle className="text-lg text-white">Block Trade (OTC)</CardTitle>
                <CardDescription className="text-gray-400">
                  Large volume trades with custom pricing
                </CardDescription>
              </div>
            </div>
            <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
              VIP
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Features */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Lock className="w-4 h-4 text-purple-400" />
              <span>Private Negotiation</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Shield className="w-4 h-4 text-green-400" />
              <span>Escrow Protected</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Building2 className="w-4 h-4 text-blue-400" />
              <span>Dedicated Support</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Clock className="w-4 h-4 text-yellow-400" />
              <span>Flexible Settlement</span>
            </div>
          </div>

          {/* Minimum Amounts Info */}
          <div className="p-3 bg-gray-800/50 rounded-lg">
            <p className="text-xs text-gray-500 mb-2">Minimum Block Trade Amounts:</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(MINIMUM_BLOCK_AMOUNTS).map(([t, min]) => (
                <Badge key={t} variant="outline" className="border-gray-700 text-gray-300">
                  {min.toLocaleString()} {t}
                </Badge>
              ))}
            </div>
          </div>

          {/* Request Button */}
          <Button
            className="w-full bg-purple-600 hover:bg-purple-700"
            onClick={() => setShowRequestModal(true)}
          >
            <MessageSquare className="w-4 h-4 mr-2" />
            Request Block Trade
            <ChevronRight className="w-4 h-4 ml-auto" />
          </Button>

          {/* Active Requests */}
          {requests.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Your Requests:</p>
              {requests.slice(0, 3).map(req => (
                <div
                  key={req.id}
                  className="p-2 bg-gray-800/50 rounded-lg flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${req.type === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                      {req.type.toUpperCase()}
                    </span>
                    <span className="text-sm text-white">
                      {req.amount.toLocaleString()} {req.token}
                    </span>
                  </div>
                  <Badge className={getStatusBadge(req.status)}>
                    {req.status.replace('_', ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Request Modal */}
      <Dialog open={showRequestModal} onOpenChange={setShowRequestModal}>
        <DialogContent className="bg-gray-900 border-gray-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Blocks className="w-5 h-5 text-purple-400" />
              Block Trade Request
            </DialogTitle>
            <DialogDescription className="text-gray-400">
              Submit a request for our OTC desk to handle your large volume trade.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Buy/Sell Toggle */}
            <Tabs value={type} onValueChange={(v) => setType(v as 'buy' | 'sell')}>
              <TabsList className="grid w-full grid-cols-2 bg-gray-800">
                <TabsTrigger value="buy" className="data-[state=active]:bg-green-600">
                  Buy
                </TabsTrigger>
                <TabsTrigger value="sell" className="data-[state=active]:bg-red-600">
                  Sell
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Token & Fiat */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-400 text-xs">Token</Label>
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

            {/* Amount */}
            <div>
              <Label className="text-gray-400 text-xs">Amount ({token})</Label>
              <Input
                type="number"
                placeholder={`Min: ${minAmount.toLocaleString()}`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="bg-gray-800 border-gray-700"
              />
              <p className="text-xs text-gray-500 mt-1">
                Minimum: {minAmount.toLocaleString()} {token}
              </p>
            </div>

            {/* Target Price (Optional) */}
            <div>
              <Label className="text-gray-400 text-xs">Target Price (Optional)</Label>
              <div className="relative">
                <Input
                  type="number"
                  placeholder="Your desired price per unit"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  className="bg-gray-800 border-gray-700 pr-16"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">
                  {fiatSymbol}/{token}
                </span>
              </div>
            </div>

            {/* Message */}
            <div>
              <Label className="text-gray-400 text-xs">Additional Details (Optional)</Label>
              <Textarea
                placeholder="Settlement preferences, timeline, payment methods..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="bg-gray-800 border-gray-700 min-h-[80px]"
              />
            </div>

            {/* Warning */}
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400 mt-0.5" />
              <p className="text-xs text-yellow-400">
                Block trades require KYC verification and may take 24-48 hours to process.
                Our OTC desk will contact you via email.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRequestModal(false)}
              className="border-gray-700"
            >
              Cancel
            </Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700"
              onClick={handleSubmitRequest}
              disabled={isSubmitting || !amount || parseFloat(amount) < minAmount}
            >
              {isSubmitting ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
