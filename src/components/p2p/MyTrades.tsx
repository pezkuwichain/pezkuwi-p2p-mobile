import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { getUserTrades, type P2PFiatTrade } from '@/lib/p2p-fiat';
import { useAuth } from '@/contexts/AuthContext';
import { formatDistanceToNow } from 'date-fns';

interface MyTradesProps {
  onTradeSelect: (tradeId: string) => void;
}

export function MyTrades({ onTradeSelect }: MyTradesProps) {
  const [trades, setTrades] = useState<P2PFiatTrade[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    const fetchTrades = async () => {
      if (!user) return;
      setIsLoading(true);
      try {
        const data = await getUserTrades(user.id);
        setTrades(data);
      } catch (error) {
        console.error('Fetch trades error:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTrades();
  }, [user]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-yellow-400 border-yellow-400"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'payment_sent':
        return <Badge variant="outline" className="text-blue-400 border-blue-400"><Clock className="w-3 h-3 mr-1" />Payment Sent</Badge>;
      case 'completed':
        return <Badge variant="outline" className="text-green-400 border-green-400"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="text-gray-400 border-gray-400"><XCircle className="w-3 h-3 mr-1" />Cancelled</Badge>;
      case 'disputed':
        return <Badge variant="outline" className="text-red-400 border-red-400"><AlertTriangle className="w-3 h-3 mr-1" />Disputed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (trades.length === 0) {
    return (
      <div className="text-center p-8 text-muted-foreground">
        <p>No trades yet</p>
        <p className="text-sm mt-1">Start by accepting an offer</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      {trades.map((trade) => (
        <Card
          key={trade.id}
          className="bg-card cursor-pointer hover:bg-accent/50 transition-colors"
          onClick={() => onTradeSelect(trade.id)}
        >
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold">
                {trade.crypto_amount.toFixed(4)} HEZ
              </span>
              {getStatusBadge(trade.status)}
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>${trade.fiat_amount.toFixed(2)}</span>
              <span>{formatDistanceToNow(new Date(trade.created_at), { addSuffix: true })}</span>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {user?.id === trade.seller_id ? 'Selling' : 'Buying'}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
