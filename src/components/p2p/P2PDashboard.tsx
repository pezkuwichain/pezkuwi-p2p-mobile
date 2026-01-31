import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PlusCircle, Home, ClipboardList, TrendingUp, CheckCircle2, Clock, Store, Zap, Blocks } from 'lucide-react';
import { AdList } from './AdList';
import { CreateAd } from './CreateAd';
import { NotificationBell } from './NotificationBell';
import { QuickFilterBar } from './OrderFilters';
import { InternalBalanceCard } from './InternalBalanceCard';
import { DepositModal } from './DepositModal';
import { WithdrawModal } from './WithdrawModal';
import { ExpressMode } from './ExpressMode';
import { BlockTrade } from './BlockTrade';
import { DEFAULT_FILTERS, type P2PFilters } from './types';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

interface UserStats {
  activeTrades: number;
  completedTrades: number;
  totalVolume: number;
}

export function P2PDashboard() {
  const [showCreateAd, setShowCreateAd] = useState(false);
  const [userStats, setUserStats] = useState<UserStats>({ activeTrades: 0, completedTrades: 0, totalVolume: 0 });
  const [filters, setFilters] = useState<P2PFilters>(DEFAULT_FILTERS);
  const [showDepositModal, setShowDepositModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleBalanceUpdated = () => {
    setBalanceRefreshKey(prev => prev + 1);
  };

  // Fetch user stats
  useEffect(() => {
    const fetchStats = async () => {
      if (!user) return;

      try {
        // Count active trades
        const { count: activeCount } = await supabase
          .from('p2p_fiat_trades')
          .select('*', { count: 'exact', head: true })
          .or(`seller_id.eq.${user.id},buyer_id.eq.${user.id}`)
          .in('status', ['pending', 'payment_sent']);

        // Count completed trades
        const { count: completedCount } = await supabase
          .from('p2p_fiat_trades')
          .select('*', { count: 'exact', head: true })
          .or(`seller_id.eq.${user.id},buyer_id.eq.${user.id}`)
          .eq('status', 'completed');

        // Calculate total volume
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
      } catch (error) {
        console.error('Fetch stats error:', error);
      }
    };

    fetchStats();
  }, [user]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-7xl">
      <div className="flex items-center justify-between mb-4">
        <Button
          variant="ghost"
          onClick={() => navigate('/')}
          className="text-gray-400 hover:text-white"
        >
          <Home className="w-4 h-4 mr-2" />
          Back to Home
        </Button>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <Button
            variant="outline"
            onClick={() => navigate('/p2p/merchant')}
            className="border-gray-700 hover:bg-gray-800"
          >
            <Store className="w-4 h-4 mr-2" />
            Merchant
          </Button>
          <Button
            variant="outline"
            onClick={() => navigate('/p2p/orders')}
            className="border-gray-700 hover:bg-gray-800"
          >
            <ClipboardList className="w-4 h-4 mr-2" />
            My Trades
            {userStats.activeTrades > 0 && (
              <Badge className="ml-2 bg-yellow-500 text-black">
                {userStats.activeTrades}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* Stats Cards and Balance Card */}
      {user && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
          {/* Internal Balance Card - Takes more space */}
          <div className="lg:col-span-1">
            <InternalBalanceCard
              key={balanceRefreshKey}
              onDeposit={() => setShowDepositModal(true)}
              onWithdraw={() => setShowWithdrawModal(true)}
            />
          </div>

          {/* Stats Cards */}
          <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="py-4 flex items-center gap-3">
                <div className="p-2 bg-yellow-500/20 rounded-lg">
                  <Clock className="w-5 h-5 text-yellow-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{userStats.activeTrades}</p>
                  <p className="text-sm text-gray-400">Active Trades</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="py-4 flex items-center gap-3">
                <div className="p-2 bg-green-500/20 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">{userStats.completedTrades}</p>
                  <p className="text-sm text-gray-400">Completed</p>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="py-4 flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <TrendingUp className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-white">${userStats.totalVolume.toLocaleString()}</p>
                  <p className="text-sm text-gray-400">Volume</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-4xl font-bold text-white">P2P Trading</h1>
          <p className="text-gray-400">Buy and sell crypto with your local currency.</p>
        </div>
        <Button onClick={() => setShowCreateAd(true)}>
          <PlusCircle className="w-4 h-4 mr-2" />
          Post a New Ad
        </Button>
      </div>

      {showCreateAd ? (
        <CreateAd onAdCreated={() => setShowCreateAd(false)} />
      ) : (
        <>
          {/* Quick Filter Bar */}
          <QuickFilterBar filters={filters} onFiltersChange={setFilters} />

          <Tabs defaultValue="buy">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="express" className="flex items-center gap-1">
                <Zap className="w-3 h-3" />
                Express
              </TabsTrigger>
              <TabsTrigger value="buy">Buy</TabsTrigger>
              <TabsTrigger value="sell">Sell</TabsTrigger>
              <TabsTrigger value="my-ads">My Ads</TabsTrigger>
              <TabsTrigger value="otc" className="flex items-center gap-1">
                <Blocks className="w-3 h-3" />
                OTC
              </TabsTrigger>
            </TabsList>
            <TabsContent value="express">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                <ExpressMode onTradeStarted={(id) => navigate(`/p2p/trade/${id}`)} />
                <div className="space-y-4">
                  <Card className="bg-gray-900 border-gray-800">
                    <CardContent className="pt-6">
                      <h3 className="text-lg font-semibold text-white mb-2">Why Express Mode?</h3>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                          Instant best-rate matching
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                          Verified merchants only
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                          Escrow protection
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-green-400" />
                          No manual offer selection
                        </li>
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="buy">
              <AdList type="buy" filters={filters} />
            </TabsContent>
            <TabsContent value="sell">
              <AdList type="sell" filters={filters} />
            </TabsContent>
            <TabsContent value="my-ads">
              <AdList type="my-ads" filters={filters} />
            </TabsContent>
            <TabsContent value="otc">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
                <BlockTrade />
                <div className="space-y-4">
                  <Card className="bg-gray-900 border-gray-800">
                    <CardContent className="pt-6">
                      <h3 className="text-lg font-semibold text-white mb-2">Block Trade Benefits</h3>
                      <ul className="space-y-2 text-sm text-gray-400">
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-purple-400" />
                          Custom pricing negotiation
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-purple-400" />
                          Dedicated OTC desk support
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-purple-400" />
                          Multi-tranche settlements
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-purple-400" />
                          Enhanced privacy
                        </li>
                        <li className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-purple-400" />
                          Flexible payment terms
                        </li>
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </>
      )}

      {/* Deposit Modal */}
      <DepositModal
        isOpen={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        onSuccess={handleBalanceUpdated}
      />

      {/* Withdraw Modal */}
      <WithdrawModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        onSuccess={handleBalanceUpdated}
      />
    </div>
  );
}
