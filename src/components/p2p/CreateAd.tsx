import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWallet } from '@/contexts/WalletContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  getPaymentMethods,
  validatePaymentDetails,
  type PaymentMethod,
  type FiatCurrency,
  type CryptoToken
} from '@shared/lib/p2p-fiat';

interface CreateAdProps {
  onAdCreated: () => void;
}

export function CreateAd({ onAdCreated }: CreateAdProps) {
  const { user } = useAuth();
  const { account } = useWallet();
  
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethod | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Form fields
  const [adType, setAdType] = useState<'buy' | 'sell'>('sell');
  const [token, setToken] = useState<CryptoToken>('HEZ');
  const [amountCrypto, setAmountCrypto] = useState('');
  const [fiatCurrency, setFiatCurrency] = useState<FiatCurrency>('TRY');
  const [fiatAmount, setFiatAmount] = useState('');
  const [paymentDetails, setPaymentDetails] = useState<Record<string, string>>({});
  const [timeLimit, setTimeLimit] = useState(30);
  const [minOrderAmount, setMinOrderAmount] = useState('');
  const [maxOrderAmount, setMaxOrderAmount] = useState('');

  // Load payment methods when currency changes
  useEffect(() => {
    const loadPaymentMethods = async () => {
      const methods = await getPaymentMethods(fiatCurrency);
      setPaymentMethods(methods);
      setSelectedPaymentMethod(null);
      setPaymentDetails({});
    };
    loadPaymentMethods();
  }, [fiatCurrency]);

  // Calculate price per unit
  const pricePerUnit = amountCrypto && fiatAmount 
    ? (parseFloat(fiatAmount) / parseFloat(amountCrypto)).toFixed(2)
    : '0';

  const handlePaymentMethodChange = (methodId: string) => {
    const method = paymentMethods.find(m => m.id === methodId);
    setSelectedPaymentMethod(method || null);
    
    // Initialize payment details with empty values
    if (method) {
      const initialDetails: Record<string, string> = {};
      Object.keys(method.fields).forEach(field => {
        initialDetails[field] = '';
      });
      setPaymentDetails(initialDetails);
    }
  };

  const handlePaymentDetailChange = (field: string, value: string) => {
    setPaymentDetails(prev => ({ ...prev, [field]: value }));
  };

  const handleCreateAd = async () => {
    console.log('🔥 handleCreateAd called', { account, user: user?.id });

    if (!account || !user) {
      toast.error('Please connect your wallet and log in');
      console.log('❌ No account or user', { account, user });
      return;
    }

    if (!selectedPaymentMethod) {
      toast.error('Please select a payment method');
      return;
    }

    // Validate payment details
    const validation = validatePaymentDetails(
      paymentDetails,
      selectedPaymentMethod.validation_rules
    );

    if (!validation.valid) {
      const firstError = Object.values(validation.errors)[0];
      toast.error(firstError);
      return;
    }

    // Validate amounts
    const cryptoAmt = parseFloat(amountCrypto);
    const fiatAmt = parseFloat(fiatAmount);

    if (!cryptoAmt || cryptoAmt <= 0) {
      toast.error('Invalid crypto amount');
      return;
    }

    if (!fiatAmt || fiatAmt <= 0) {
      toast.error('Invalid fiat amount');
      return;
    }

    if (selectedPaymentMethod.min_trade_amount && fiatAmt < selectedPaymentMethod.min_trade_amount) {
      toast.error(`Minimum trade amount: ${selectedPaymentMethod.min_trade_amount} ${fiatCurrency}`);
      return;
    }

    if (selectedPaymentMethod.max_trade_amount && fiatAmt > selectedPaymentMethod.max_trade_amount) {
      toast.error(`Maximum trade amount: ${selectedPaymentMethod.max_trade_amount} ${fiatCurrency}`);
      return;
    }

    setLoading(true);

    try {
      // Insert offer into Supabase
      // Note: payment_details_encrypted is stored as JSON string (encryption handled server-side in prod)
      const { data, error } = await supabase
        .from('p2p_fiat_offers')
        .insert({
          seller_id: user.id,
          seller_wallet: account,
          ad_type: adType,
          token,
          amount_crypto: cryptoAmt,
          remaining_amount: cryptoAmt,
          fiat_currency: fiatCurrency,
          fiat_amount: fiatAmt,
          payment_method_id: selectedPaymentMethod.id,
          payment_details_encrypted: JSON.stringify(paymentDetails),
          time_limit_minutes: timeLimit,
          min_order_amount: minOrderAmount ? parseFloat(minOrderAmount) : null,
          max_order_amount: maxOrderAmount ? parseFloat(maxOrderAmount) : null,
          status: 'open'
        })
        .select()
        .single();

      if (error) {
        console.error('❌ Supabase error:', error);
        toast.error(error.message || 'Failed to create offer');
        return;
      }

      console.log('✅ Offer created successfully:', data);
      toast.success('Ad created successfully!');
      onAdCreated();
    } catch (error) {
      if (import.meta.env.DEV) console.error('Create ad error:', error);
      toast.error('Failed to create offer');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <CardTitle className="text-white">Create P2P Offer</CardTitle>
        <CardDescription>
          Lock your crypto in escrow and set your price
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Ad Type Selection */}
        <div>
          <Label>I want to</Label>
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Button
              type="button"
              variant={adType === 'sell' ? 'default' : 'outline'}
              className={adType === 'sell' ? 'bg-red-600 hover:bg-red-700' : ''}
              onClick={() => setAdType('sell')}
            >
              Sell {token}
            </Button>
            <Button
              type="button"
              variant={adType === 'buy' ? 'default' : 'outline'}
              className={adType === 'buy' ? 'bg-green-600 hover:bg-green-700' : ''}
              onClick={() => setAdType('buy')}
            >
              Buy {token}
            </Button>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {adType === 'sell'
              ? 'You will receive fiat payment and send crypto to buyer'
              : 'You will send fiat payment and receive crypto from seller'}
          </p>
        </div>

        {/* Crypto Details */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="token">Token</Label>
            <Select value={token} onValueChange={(v) => setToken(v as CryptoToken)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="HEZ">HEZ</SelectItem>
                <SelectItem value="PEZ">PEZ</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="amountCrypto">Amount ({token})</Label>
            <Input
              id="amountCrypto"
              type="number"
              step="0.01"
              value={amountCrypto}
              onChange={e => setAmountCrypto(e.target.value)}
              placeholder="Amount"
              className="placeholder:text-gray-500 placeholder:opacity-50"
            />
          </div>
        </div>

        {/* Fiat Details */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="fiatCurrency">Fiat Currency</Label>
            <Select value={fiatCurrency} onValueChange={(v) => setFiatCurrency(v as FiatCurrency)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {/* Primary regions - Kurdistan & neighboring */}
                <SelectItem value="TRY">🇹🇷 Turkish Lira (TRY) - Bakur</SelectItem>
                <SelectItem value="IQD">🇮🇶 Iraqi Dinar (IQD) - Başûr</SelectItem>
                <SelectItem value="IRR">🇮🇷 Iranian Rial (IRR) - Rojhilat</SelectItem>
                {/* Eurozone diaspora */}
                <SelectItem value="EUR">🇪🇺 Euro (EUR) - EU</SelectItem>
                {/* Other diaspora regions */}
                <SelectItem value="USD">🇺🇸 US Dollar (USD)</SelectItem>
                <SelectItem value="GBP">🇬🇧 British Pound (GBP)</SelectItem>
                <SelectItem value="SEK">🇸🇪 Swedish Krona (SEK)</SelectItem>
                <SelectItem value="CHF">🇨🇭 Swiss Franc (CHF)</SelectItem>
                <SelectItem value="NOK">🇳🇴 Norwegian Krone (NOK)</SelectItem>
                <SelectItem value="DKK">🇩🇰 Danish Krone (DKK)</SelectItem>
                <SelectItem value="AUD">🇦🇺 Australian Dollar (AUD)</SelectItem>
                <SelectItem value="CAD">🇨🇦 Canadian Dollar (CAD)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="fiatAmount">Total Amount ({fiatCurrency})</Label>
            <Input
              id="fiatAmount"
              type="number"
              step="0.01"
              value={fiatAmount}
              onChange={e => setFiatAmount(e.target.value)}
              placeholder="Amount"
              className="placeholder:text-gray-500 placeholder:opacity-50"
            />
          </div>
        </div>

        {/* Price Display */}
        {amountCrypto && fiatAmount && (
          <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
            <p className="text-sm text-gray-400">Price per {token}</p>
            <p className="text-2xl font-bold text-green-400">
              {pricePerUnit} {fiatCurrency}
            </p>
          </div>
        )}

        {/* Payment Method */}
        <div>
          <Label htmlFor="paymentMethod">Payment Method</Label>
          <Select onValueChange={handlePaymentMethodChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select payment method..." />
            </SelectTrigger>
            <SelectContent>
              {paymentMethods.map(method => (
                <SelectItem key={method.id} value={method.id}>
                  {method.method_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Dynamic Payment Details Fields */}
        {selectedPaymentMethod && Object.keys(selectedPaymentMethod.fields).length > 0 && (
          <div className="space-y-4 p-4 border border-gray-700 rounded-lg">
            <h3 className="font-semibold text-white">Payment Details</h3>
            {Object.entries(selectedPaymentMethod.fields).map(([field, placeholder]) => (
              <div key={field}>
                <Label htmlFor={field}>
                  {field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Label>
                <Input
                  id={field}
                  value={paymentDetails[field] || ''}
                  onChange={(e) => handlePaymentDetailChange(field, e.target.value)}
                  placeholder={placeholder}
                  className="placeholder:text-gray-500 placeholder:opacity-50"
                />
              </div>
            ))}
          </div>
        )}

        {/* Order Limits */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="minOrder">Min Order (optional)</Label>
            <Input
              id="minOrder"
              type="number"
              step="0.01"
              value={minOrderAmount}
              onChange={e => setMinOrderAmount(e.target.value)}
              placeholder="Minimum amount (optional)"
              className="placeholder:text-gray-500 placeholder:opacity-50"
            />
          </div>
          <div>
            <Label htmlFor="maxOrder">Max Order (optional)</Label>
            <Input
              id="maxOrder"
              type="number"
              step="0.01"
              value={maxOrderAmount}
              onChange={e => setMaxOrderAmount(e.target.value)}
              placeholder="Maximum amount (optional)"
              className="placeholder:text-gray-500 placeholder:opacity-50"
            />
          </div>
        </div>

        {/* Time Limit */}
        <div>
          <Label htmlFor="timeLimit">Payment Time Limit (minutes)</Label>
          <Select value={timeLimit.toString()} onValueChange={(v) => setTimeLimit(parseInt(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="15">15 minutes</SelectItem>
              <SelectItem value="30">30 minutes</SelectItem>
              <SelectItem value="60">1 hour</SelectItem>
              <SelectItem value="120">2 hours</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button 
          onClick={handleCreateAd} 
          className="w-full"
          disabled={loading}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating offer & locking escrow...
            </>
          ) : (
            'Create Offer'
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
