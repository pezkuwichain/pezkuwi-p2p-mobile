import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Wallet,
  ArrowDownToLine,
  ArrowUpFromLine,
  RefreshCw,
  Lock,
  Unlock
} from 'lucide-react';
import { getInternalBalances, type InternalBalance } from '@shared/lib/p2p-fiat';

interface InternalBalanceCardProps {
  onDeposit?: () => void;
  onWithdraw?: () => void;
}

export function InternalBalanceCard({ onDeposit, onWithdraw }: InternalBalanceCardProps) {
  const [balances, setBalances] = useState<InternalBalance[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchBalances = async () => {
    try {
      const data = await getInternalBalances();
      setBalances(data);
    } catch (error) {
      console.error('Failed to fetch balances:', error);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchBalances();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await fetchBalances();
  };

  const formatBalance = (value: number, decimals: number = 4) => {
    return value.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Wallet className="h-5 w-5" />
            P2P Internal Balance
          </CardTitle>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Internal balance for P2P trading. Deposit to start selling.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {balances.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Wallet className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">No balance yet</p>
            <p className="text-xs">Deposit crypto to start P2P trading</p>
          </div>
        ) : (
          balances.map((balance) => (
            <div
              key={balance.token}
              className="p-4 rounded-lg bg-muted/50 border"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-primary">
                      {balance.token.charAt(0)}
                    </span>
                  </div>
                  <span className="font-semibold">{balance.token}</span>
                </div>
                <Badge variant="outline" className="text-xs">
                  Total: {formatBalance(balance.total_balance)}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Unlock className="h-4 w-4 text-green-500" />
                  <div>
                    <p className="text-muted-foreground text-xs">Available</p>
                    <p className="font-medium text-green-600">
                      {formatBalance(balance.available_balance)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-yellow-500" />
                  <div>
                    <p className="text-muted-foreground text-xs">Locked (Escrow)</p>
                    <p className="font-medium text-yellow-600">
                      {formatBalance(balance.locked_balance)}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  <span>Total Deposited: </span>
                  <span className="text-foreground">{formatBalance(balance.total_deposited, 2)}</span>
                </div>
                <div>
                  <span>Total Withdrawn: </span>
                  <span className="text-foreground">{formatBalance(balance.total_withdrawn, 2)}</span>
                </div>
              </div>
            </div>
          ))
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            variant="default"
            className="flex-1"
            onClick={onDeposit}
          >
            <ArrowDownToLine className="h-4 w-4 mr-2" />
            Deposit
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={onWithdraw}
            disabled={balances.every(b => b.available_balance <= 0)}
          >
            <ArrowUpFromLine className="h-4 w-4 mr-2" />
            Withdraw
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
