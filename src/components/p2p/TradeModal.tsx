import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertTriangle, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { acceptFiatOffer, type P2PFiatOffer } from '@/lib/p2p-fiat';

interface TradeModalProps {
  offer: P2PFiatOffer;
  onClose: () => void;
  onTradeStarted?: (tradeId: string) => void;
}

export function TradeModal({ offer, onClose, onTradeStarted }: TradeModalProps) {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const cryptoAmount = parseFloat(amount) || 0;
  const fiatAmount = cryptoAmount * offer.price_per_unit;
  const isValidAmount = cryptoAmount > 0 && cryptoAmount <= offer.remaining_amount;

  const meetsMinOrder = !offer.min_order_amount || cryptoAmount >= offer.min_order_amount;
  const meetsMaxOrder = !offer.max_order_amount || cryptoAmount <= offer.max_order_amount;

  const handleInitiateTrade = async () => {
    if (!user) {
      toast.error('Please log in first');
      return;
    }

    if (offer.seller_id === user.id) {
      toast.error('You cannot trade with your own offer');
      return;
    }

    if (!isValidAmount) {
      toast.error('Invalid amount');
      return;
    }

    if (!meetsMinOrder) {
      toast.error(`Minimum order: ${offer.min_order_amount} ${offer.token}`);
      return;
    }

    if (!meetsMaxOrder) {
      toast.error(`Maximum order: ${offer.max_order_amount} ${offer.token}`);
      return;
    }

    setLoading(true);

    try {
      const tradeId = await acceptFiatOffer({
        offerId: offer.id,
        buyerWallet: user.wallet_address || '',
        amount: cryptoAmount
      });

      toast.success('Trade initiated! Proceed to payment.');
      onClose();
      onTradeStarted?.(tradeId);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Accept offer error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Buy {offer.token}</DialogTitle>
          <DialogDescription>
            Rate: {offer.price_per_unit.toFixed(4)} {offer.fiat_currency}/{offer.token}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="amount">Amount ({offer.token})</Label>
            <Input
              id="amount"
              type="number"
              placeholder={`Max: ${offer.remaining_amount}`}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              max={offer.remaining_amount}
              min={offer.min_order_amount || 0}
              step="0.0001"
            />
            <p className="text-xs text-muted-foreground">
              Available: {offer.remaining_amount.toFixed(4)} {offer.token}
            </p>
          </div>

          {cryptoAmount > 0 && (
            <div className="p-3 bg-accent rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">You pay</span>
                <span className="font-medium">
                  {fiatAmount.toFixed(2)} {offer.fiat_currency}
                </span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-muted-foreground">You receive</span>
                <span className="font-medium">
                  {cryptoAmount.toFixed(4)} {offer.token}
                </span>
              </div>
            </div>
          )}

          <Alert variant="default" className="border-yellow-500/50">
            <Clock className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Payment must be completed within {offer.time_limit_minutes} minutes
            </AlertDescription>
          </Alert>

          {!meetsMinOrder && offer.min_order_amount && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Minimum order: {offer.min_order_amount} {offer.token}
              </AlertDescription>
            </Alert>
          )}

          {!meetsMaxOrder && offer.max_order_amount && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Maximum order: {offer.max_order_amount} {offer.token}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleInitiateTrade}
            disabled={loading || !isValidAmount || !meetsMinOrder || !meetsMaxOrder}
          >
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {loading ? 'Processing...' : 'Start Trade'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
