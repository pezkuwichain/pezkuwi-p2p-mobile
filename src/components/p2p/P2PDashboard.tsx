import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  PlusCircle, ClipboardList, TrendingUp, CheckCircle2, Clock,
  ArrowLeft, Zap, Blocks, Wallet, UserCheck, Store
} from 'lucide-react';
import { AdList } from './AdList';
import { CreateAd } from './CreateAd';
import { NotificationBell } from './NotificationBell';
import { QuickFilterBar } from './OrderFilters';
import { InternalBalanceCard } from './InternalBalanceCard';
import { DepositModal } from './DepositModal';
import { WithdrawModal } from './WithdrawModal';
import { ExpressMode } from './ExpressMode';
import { BlockTrade } from './BlockTrade';
import { MyTrades } from './MyTrades';
import { TradeDetail } from './TradeDetail';
import { DEFAULT_FILTERS, type P2PFilters } from './types';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

type View = 'main' | 'create-ad' | 'my-trades' | 'trade-detail';

interface UserStats {
  activeTrades: number;
  completedTrades: number;
  totalVolume: number;
}

export function P2PDashboard() {
  const [view, setView] = useState<View>('main');
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null);
  const [userStats, setUserStats] = useState<UserStats>({ activeTrades: 0, completedTrades: 0, totalVolume: 0 });
  const [filters, setFilters] = useState<P2PFilters>(DEFAULT_FILTERS);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);
  const { user, isLoading, error, login } = useAuth();

  const handleBalanceUpdated = () => {
    setBalanceRefreshKey(prev => prev + 1);
  };

  const handleTradeStarted = (tradeId: string) => {
    setSelectedTradeId(tradeId);
    setView('trade-detail');
  };

  // Fetch user stats
  useEffect(() => {
    const fetchStats = async () => {
      if (!user) return;

      try {
        const { count: activeCount } = await supabase
          .from('p2p_fiat_trades')
          .select('*', { count: 'exact', head: true })
          .or(`seller_id.eq.${user.id},buyer_id.eq.${user.id}`)
          .in('status', ['pending', 'payment_sent']);

        const { count: completedCount } = await supabase
          .from('p2p_fiat_trades')
          .select('*', { count: 'exact', head: true })
          .or(`seller_id.eq.${user.id},buyer_id.eq.${user.id}`)
          .eq('status', 'completed');

        const { data: trades } = await supabase
          .from('p2p_fiat_trades')
          .select('fiat_amount')
          .or(`seller_id.eq.${user.id},buyer_id.eq.${user.id}`)
          .eq('status', 'completed');

        const totalVolume = trades?.reduce((sum, t) => sum + (t.fiat_amount || 0), 0) || 0;

        setUserStats({
          activeTrades: activeCount || 0,
          completedTrades: completedCount || 0,
          totalVolume,
        });
      } catch (err) {
        console.error('Fetch stats error:', err);
      }
    };

    fetchStats();
  }, [user]);

  // Loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Connecting...</p>
        </div>
      </div>
    );
  }

  // Not authenticated
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-4">
        <div className="text-center max-w-sm">
          <Wallet className="w-16 h-16 text-primary mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">P2P Trading</h1>
          <p className="text-muted-foreground mb-6">
            Trade crypto with local currency securely via Telegram.
          </p>
          {error && (
            <p className="text-red-500 text-sm mb-4">{error}</p>
          )}
          <Button onClick={login} size="lg" className="w-full">
            Login with Telegram
          </Button>
        </div>
      </div>
    );
  }

  // Trade detail view
  if (view === 'trade-detail' && selectedTradeId) {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 bg-background/95 backdrop-blur border-b border-border p-4">
          <Button variant="ghost" size="sm" onClick={() => setView('my-trades')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </header>
        <TradeDetail tradeId={selectedTradeId} />
      </div>
    );
  }

  // My trades view
  if (view === 'my-trades') {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 bg-background/95 backdrop-blur border-b border-border p-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setView('main')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="font-semibold">My Trades</h1>
          <div className="w-16" />
        </header>
        <MyTrades onTradeSelect={(id) => {
          setSelectedTradeId(id);
          setView('trade-detail');
        }} />
      </div>
    );
  }

  // Create ad view
  if (view === 'create-ad') {
    return (
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 bg-background/95 backdrop-blur border-b border-border p-4 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setView('main')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <h1 className="font-semibold">Create Ad</h1>
          <div className="w-16" />
        </header>
        <CreateAd onAdCreated={() => setView('main')} />
      </div>
    );
  }

  // Main dashboard view
  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header */}
      <header className="sticky top-0 bg-background/95 backdrop-blur border-b border-border p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold">P2P Trading</h1>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setView('my-trades')}
            >
              <ClipboardList className="w-4 h-4" />
              {userStats.activeTrades > 0 && (
                <Badge className="ml-1 bg-yellow-500 text-black text-xs">
                  {userStats.activeTrades}
                </Badge>
              )}
            </Button>
          </div>
        </div>
      </header>

      <div className="p-4 space-y-4">
        {/* Balance Card */}
        <InternalBalanceCard
          key={balanceRefreshKey}
          onDeposit={() => setShowDepositModal(true)}
          onWithdraw={() => setShowWithdrawModal(true)}
        />

        {/* Quick Stats */}
        <div className="grid grid-cols-3 gap-2">
          <Card className="bg-card">
            <CardContent className="p-3 text-center">
              <Clock className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
              <p className="text-lg font-bold">{userStats.activeTrades}</p>
              <p className="text-[10px] text-muted-foreground">Active</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3 text-center">
              <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto mb-1" />
              <p className="text-lg font-bold">{userStats.completedTrades}</p>
              <p className="text-[10px] text-muted-foreground">Done</p>
            </CardContent>
          </Card>
          <Card className="bg-card">
            <CardContent className="p-3 text-center">
              <TrendingUp className="w-4 h-4 text-blue-400 mx-auto mb-1" />
              <p className="text-lg font-bold">${userStats.totalVolume > 1000 ? `${(userStats.totalVolume / 1000).toFixed(1)}K` : userStats.totalVolume}</p>
              <p className="text-[10px] text-muted-foreground">Volume</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-auto py-3 flex-col border-green-500/50 hover:bg-green-500/10"
            onClick={() => window.open('https://t.me/pezhezbuysel', '_blank')}
          >
            <Store className="w-4 h-4 mb-1 text-green-500" />
            <span className="text-xs text-green-500">Trusted Seller</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-auto py-3 flex-col border-blue-500/50 hover:bg-blue-500/10"
            onClick={() => window.open('https://t.me/pezhezbuysel', '_blank')}
          >
            <UserCheck className="w-4 h-4 mb-1 text-blue-500" />
            <span className="text-xs text-blue-500">Trusted Buyer</span>
          </Button>
          <Button
            size="sm"
            className="h-auto py-3 flex-col"
            onClick={() => setView('create-ad')}
          >
            <PlusCircle className="w-4 h-4 mb-1" />
            <span className="text-xs">Post Ad</span>
          </Button>
        </div>

        {/* Filter Bar */}
        <QuickFilterBar filters={filters} onFiltersChange={setFilters} />

        {/* Main Tabs */}
        <Tabs defaultValue="buy" className="w-full">
          <TabsList className="grid w-full grid-cols-4 h-auto">
            <TabsTrigger value="express" className="text-xs py-2">
              <Zap className="w-3 h-3 mr-1" />
              Express
            </TabsTrigger>
            <TabsTrigger value="buy" className="text-xs py-2">Buy</TabsTrigger>
            <TabsTrigger value="sell" className="text-xs py-2">Sell</TabsTrigger>
            <TabsTrigger value="otc" className="text-xs py-2">
              <Blocks className="w-3 h-3 mr-1" />
              OTC
            </TabsTrigger>
          </TabsList>

          <TabsContent value="express" className="mt-4">
            <ExpressMode onTradeStarted={handleTradeStarted} />
          </TabsContent>

          <TabsContent value="buy" className="mt-4">
            <AdList type="buy" filters={filters} />
          </TabsContent>

          <TabsContent value="sell" className="mt-4">
            <AdList type="sell" filters={filters} />
          </TabsContent>

          <TabsContent value="otc" className="mt-4">
            <BlockTrade />
          </TabsContent>
        </Tabs>
      </div>

      {/* Modals */}
      <DepositModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        onSuccess={handleBalanceUpdated}
      />
      <WithdrawModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        onSuccess={handleBalanceUpdated}
      />
    </div>
  );
}
