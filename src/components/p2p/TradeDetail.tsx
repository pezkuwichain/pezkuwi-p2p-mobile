import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle2, XCircle, AlertTriangle, Copy, Check } from 'lucide-react';
import { getTradeById, markPaymentSent, confirmPaymentReceived, cancelTrade, type P2PFiatTrade } from '@/lib/p2p-fiat';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface TradeDetailProps {
  tradeId: string;
}

export function TradeDetail({ tradeId }: TradeDetailProps) {
  const [trade, setTrade] = useState<P2PFiatTrade | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { user } = useAuth();

  const fetchTrade = async () => {
    setIsLoading(true);
    try {
      const data = await getTradeById(tradeId);
      setTrade(data);
    } catch (error) {
      console.error('Fetch trade error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTrade();
    // Poll for updates
    const interval = setInterval(fetchTrade, 10000);
    return () => clearInterval(interval);
  }, [tradeId]);

  const handleMarkPaid = async () => {
    setActionLoading(true);
    try {
      await markPaymentSent(tradeId);
      await fetchTrade();
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirm = async () => {
    setActionLoading(true);
    try {
      await confirmPaymentReceived(tradeId);
      await fetchTrade();
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this trade?')) return;
    setActionLoading(true);
    try {
      await cancelTrade(tradeId);
      await fetchTrade();
    } finally {
      setActionLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!trade) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        Trade not found
      </div>
    );
  }

  const isSeller = user?.id === trade.seller_id;
  const isBuyer = user?.id === trade.buyer_id;

  const getStatusBadge = () => {
    switch (trade.status) {
      case 'pending':
        return <Badge className="bg-yellow-500"><Clock className="w-3 h-3 mr-1" />Waiting for Payment</Badge>;
      case 'payment_sent':
        return <Badge className="bg-blue-500"><Clock className="w-3 h-3 mr-1" />Payment Sent</Badge>;
      case 'completed':
        return <Badge className="bg-green-500"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'cancelled':
        return <Badge variant="secondary"><XCircle className="w-3 h-3 mr-1" />Cancelled</Badge>;
      case 'disputed':
        return <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Disputed</Badge>;
      default:
        return <Badge>{trade.status}</Badge>;
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Status Card */}
      <Card className="bg-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Trade Status</CardTitle>
            {getStatusBadge()}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <span className="font-semibold">{trade.crypto_amount.toFixed(4)} HEZ</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Price</span>
              <span className="font-semibold">${trade.fiat_amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Rate</span>
              <span>${trade.price_per_unit.toFixed(4)}/HEZ</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{formatDistanceToNow(new Date(trade.created_at), { addSuffix: true })}</span>
            </div>
            {trade.payment_deadline && trade.status === 'pending' && (
              <div className="flex justify-between text-yellow-400">
                <span>Payment Deadline</span>
                <span>{formatDistanceToNow(new Date(trade.payment_deadline), { addSuffix: true })}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Role-specific info */}
      {isBuyer && trade.status === 'pending' && (
        <Card className="bg-card border-yellow-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Payment Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Send the payment to the seller and mark as paid when done.
            </p>
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={handleMarkPaid}
                disabled={actionLoading}
              >
                {actionLoading ? 'Processing...' : 'I Have Paid'}
              </Button>
              <Button
                variant="outline"
                onClick={handleCancel}
                disabled={actionLoading}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isSeller && trade.status === 'payment_sent' && (
        <Card className="bg-card border-blue-500/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Confirm Payment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Buyer has marked payment as sent. Check your account and confirm when received.
            </p>
            {trade.buyer_payment_proof_url && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.open(trade.buyer_payment_proof_url, '_blank')}
              >
                View Payment Proof
              </Button>
            )}
            <Button
              className="w-full bg-green-600 hover:bg-green-700"
              onClick={handleConfirm}
              disabled={actionLoading}
            >
              {actionLoading ? 'Processing...' : 'Confirm Payment Received'}
            </Button>
          </CardContent>
        </Card>
      )}

      {trade.status === 'completed' && (
        <Card className="bg-card border-green-500/50">
          <CardContent className="py-6 text-center">
            <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" />
            <p className="font-semibold text-green-400">Trade Completed!</p>
            <p className="text-sm text-muted-foreground mt-1">
              {isBuyer ? 'HEZ has been credited to your balance.' : 'Payment has been received.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Trade ID */}
      <Card className="bg-card">
        <CardContent className="py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Trade ID</span>
            <button
              className="flex items-center gap-1 text-sm font-mono"
              onClick={() => copyToClipboard(trade.id)}
            >
              {trade.id.slice(0, 8)}...
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
