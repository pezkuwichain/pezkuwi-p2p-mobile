import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { MerchantTierBadge, type MerchantTier } from './MerchantTierBadge';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Crown,
  Diamond,
  Info,
  Loader2,
  Lock,
  Shield,
  Star,
  TrendingUp
} from 'lucide-react';

// Tier requirements interface
interface TierRequirements {
  tier: MerchantTier;
  min_trades: number;
  min_completion_rate: number;
  min_volume_30d: number;
  deposit_required: number;
  deposit_token: string;
  max_pending_orders: number;
  max_order_amount: number;
  featured_ads_allowed: number;
  description: string;
}

// User stats interface
interface UserStats {
  completed_trades: number;
  completion_rate: number;
  volume_30d: number;
}

// Current tier info
interface CurrentTierInfo {
  tier: MerchantTier;
  application_status: string | null;
  applied_for_tier: string | null;
}

// Default tier requirements
const DEFAULT_REQUIREMENTS: TierRequirements[] = [
  {
    tier: 'lite',
    min_trades: 0,
    min_completion_rate: 0,
    min_volume_30d: 0,
    deposit_required: 0,
    deposit_token: 'HEZ',
    max_pending_orders: 5,
    max_order_amount: 10000,
    featured_ads_allowed: 0,
    description: 'Basic tier for all verified users'
  },
  {
    tier: 'super',
    min_trades: 20,
    min_completion_rate: 90,
    min_volume_30d: 5000,
    deposit_required: 10000,
    deposit_token: 'HEZ',
    max_pending_orders: 20,
    max_order_amount: 100000,
    featured_ads_allowed: 3,
    description: 'Professional trader tier with higher limits'
  },
  {
    tier: 'diamond',
    min_trades: 100,
    min_completion_rate: 95,
    min_volume_30d: 25000,
    deposit_required: 50000,
    deposit_token: 'HEZ',
    max_pending_orders: 50,
    max_order_amount: 150000,
    featured_ads_allowed: 10,
    description: 'Elite merchant tier with maximum privileges'
  }
];

// Tier icon mapping
const TIER_ICONS = {
  lite: Shield,
  super: Star,
  diamond: Diamond
};

// Tier colors
const TIER_COLORS = {
  lite: 'text-gray-400',
  super: 'text-yellow-500',
  diamond: 'text-purple-500'
};

export function MerchantApplication() {
  const [loading, setLoading] = useState(true);
  const [requirements, setRequirements] = useState<TierRequirements[]>(DEFAULT_REQUIREMENTS);
  const [userStats, setUserStats] = useState<UserStats>({ completed_trades: 0, completion_rate: 0, volume_30d: 0 });
  const [currentTier, setCurrentTier] = useState<CurrentTierInfo>({ tier: 'lite', application_status: null, applied_for_tier: null });
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<MerchantTier | null>(null);
  const [applying, setApplying] = useState(false);

  // Fetch data
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch tier requirements
      const { data: reqData } = await supabase
        .from('p2p_tier_requirements')
        .select('*')
        .order('min_trades', { ascending: true });

      if (reqData && reqData.length > 0) {
        setRequirements(reqData as TierRequirements[]);
      }

      // Fetch user reputation
      const { data: repData } = await supabase
        .from('p2p_reputation')
        .select('completed_trades')
        .eq('user_id', user.id)
        .single();

      // Fetch merchant stats
      const { data: statsData } = await supabase
        .from('p2p_merchant_stats')
        .select('completion_rate_30d, total_volume_30d')
        .eq('user_id', user.id)
        .single();

      // Fetch current tier
      const { data: tierData } = await supabase
        .from('p2p_merchant_tiers')
        .select('tier, application_status, applied_for_tier')
        .eq('user_id', user.id)
        .single();

      setUserStats({
        completed_trades: repData?.completed_trades || 0,
        completion_rate: statsData?.completion_rate_30d || 0,
        volume_30d: statsData?.total_volume_30d || 0
      });

      if (tierData) {
        setCurrentTier(tierData as CurrentTierInfo);
      }
    } catch (error) {
      console.error('Error fetching merchant data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate progress for a requirement
  const calculateProgress = (current: number, required: number): number => {
    if (required === 0) return 100;
    return Math.min((current / required) * 100, 100);
  };

  // Check if tier is unlocked
  const isTierUnlocked = (tier: TierRequirements): boolean => {
    return (
      userStats.completed_trades >= tier.min_trades &&
      userStats.completion_rate >= tier.min_completion_rate &&
      userStats.volume_30d >= tier.min_volume_30d
    );
  };

  // Get tier index for comparison
  const getTierIndex = (tier: MerchantTier): number => {
    return requirements.findIndex(r => r.tier === tier);
  };

  // Check if can apply for tier
  const canApplyForTier = (tier: TierRequirements): boolean => {
    if (!isTierUnlocked(tier)) return false;
    if (getTierIndex(currentTier.tier) >= getTierIndex(tier.tier)) return false;
    if (currentTier.application_status === 'pending') return false;
    return true;
  };

  // Apply for tier
  const applyForTier = async () => {
    if (!selectedTier) return;

    setApplying(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.rpc('apply_for_tier_upgrade', {
        p_user_id: user.id,
        p_target_tier: selectedTier
      });

      if (error) throw error;

      if (data && data[0]) {
        if (data[0].success) {
          toast.success('Application submitted successfully!');
          setApplyModalOpen(false);
          fetchData();
        } else {
          toast.error(data[0].message || 'Application failed');
        }
      }
    } catch (error) {
      console.error('Error applying for tier:', error);
      toast.error('Failed to submit application');
    } finally {
      setApplying(false);
    }
  };

  // Open apply modal
  const openApplyModal = (tier: MerchantTier) => {
    setSelectedTier(tier);
    setApplyModalOpen(true);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Current Tier Card */}
      <Card className="bg-gradient-to-br from-kurdish-green/10 to-transparent border-kurdish-green/30">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-kurdish-green" />
                Your Merchant Status
              </CardTitle>
              <CardDescription>Current tier and application status</CardDescription>
            </div>
            <MerchantTierBadge tier={currentTier.tier} size="lg" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-background/50 rounded-lg">
              <p className="text-2xl font-bold">{userStats.completed_trades}</p>
              <p className="text-sm text-muted-foreground">Completed Trades</p>
            </div>
            <div className="text-center p-4 bg-background/50 rounded-lg">
              <p className="text-2xl font-bold">{userStats.completion_rate.toFixed(1)}%</p>
              <p className="text-sm text-muted-foreground">Completion Rate</p>
            </div>
            <div className="text-center p-4 bg-background/50 rounded-lg">
              <p className="text-2xl font-bold">${userStats.volume_30d.toLocaleString()}</p>
              <p className="text-sm text-muted-foreground">30-Day Volume</p>
            </div>
          </div>

          {currentTier.application_status === 'pending' && (
            <Alert className="mt-4 bg-yellow-500/10 border-yellow-500/30">
              <Clock className="h-4 w-4 text-yellow-500" />
              <AlertDescription className="text-yellow-500">
                Your application for {currentTier.applied_for_tier?.toUpperCase()} tier is pending review.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Tier Progression */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {requirements.map((tier) => {
          const TierIcon = TIER_ICONS[tier.tier];
          const isCurrentTier = tier.tier === currentTier.tier;
          const isUnlocked = isTierUnlocked(tier);
          const canApply = canApplyForTier(tier);
          const isPastTier = getTierIndex(tier.tier) < getTierIndex(currentTier.tier);

          return (
            <Card
              key={tier.tier}
              className={`relative overflow-hidden transition-all ${
                isCurrentTier
                  ? 'border-kurdish-green bg-kurdish-green/5'
                  : isPastTier
                  ? 'border-green-500/30 bg-green-500/5'
                  : isUnlocked
                  ? 'border-yellow-500/30 hover:border-yellow-500/50'
                  : 'opacity-75'
              }`}
            >
              {/* Current tier indicator */}
              {isCurrentTier && (
                <div className="absolute top-0 right-0 bg-kurdish-green text-white text-xs px-2 py-0.5 rounded-bl">
                  Current
                </div>
              )}
              {isPastTier && (
                <div className="absolute top-0 right-0 bg-green-500 text-white text-xs px-2 py-0.5 rounded-bl">
                  <Check className="h-3 w-3" />
                </div>
              )}

              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <div className={`p-2 rounded-full bg-background ${TIER_COLORS[tier.tier]}`}>
                    <TierIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <CardTitle className="text-lg capitalize">{tier.tier}</CardTitle>
                    <CardDescription className="text-xs">{tier.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Requirements */}
                <div className="space-y-3">
                  {/* Trades */}
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Completed Trades</span>
                      <span>{userStats.completed_trades} / {tier.min_trades}</span>
                    </div>
                    <Progress
                      value={calculateProgress(userStats.completed_trades, tier.min_trades)}
                      className="h-1.5"
                    />
                  </div>

                  {/* Completion Rate */}
                  {tier.min_completion_rate > 0 && (
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>Completion Rate</span>
                        <span>{userStats.completion_rate.toFixed(1)}% / {tier.min_completion_rate}%</span>
                      </div>
                      <Progress
                        value={calculateProgress(userStats.completion_rate, tier.min_completion_rate)}
                        className="h-1.5"
                      />
                    </div>
                  )}

                  {/* Volume */}
                  {tier.min_volume_30d > 0 && (
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span>30-Day Volume</span>
                        <span>${userStats.volume_30d.toLocaleString()} / ${tier.min_volume_30d.toLocaleString()}</span>
                      </div>
                      <Progress
                        value={calculateProgress(userStats.volume_30d, tier.min_volume_30d)}
                        className="h-1.5"
                      />
                    </div>
                  )}
                </div>

                {/* Benefits */}
                <div className="pt-2 border-t border-border/50">
                  <p className="text-xs text-muted-foreground mb-2">Benefits:</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-kurdish-green" />
                      <span>Up to {tier.max_pending_orders} pending orders</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="h-3 w-3 text-kurdish-green" />
                      <span>Max ${tier.max_order_amount.toLocaleString()} per trade</span>
                    </div>
                    {tier.featured_ads_allowed > 0 && (
                      <div className="flex items-center gap-1">
                        <CheckCircle2 className="h-3 w-3 text-kurdish-green" />
                        <span>{tier.featured_ads_allowed} featured ads</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Deposit requirement */}
                {tier.deposit_required > 0 && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" />
                    <span>Requires {tier.deposit_required.toLocaleString()} {tier.deposit_token} deposit</span>
                  </div>
                )}

                {/* Action button */}
                {canApply && (
                  <Button
                    className="w-full mt-2 bg-kurdish-green hover:bg-kurdish-green-dark"
                    size="sm"
                    onClick={() => openApplyModal(tier.tier)}
                  >
                    Apply for Upgrade
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Apply Modal */}
      <Dialog open={applyModalOpen} onOpenChange={setApplyModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-kurdish-green" />
              Apply for {selectedTier?.toUpperCase()} Tier
            </DialogTitle>
            <DialogDescription>
              Submit your application for tier upgrade. Our team will review it shortly.
            </DialogDescription>
          </DialogHeader>

          {selectedTier && (
            <div className="space-y-4">
              {/* Requirements check */}
              <div className="bg-muted p-4 rounded-lg space-y-2">
                <p className="font-medium text-sm">Requirements Met:</p>
                {requirements.find(r => r.tier === selectedTier) && (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>Completed trades requirement</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>Completion rate requirement</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>30-day volume requirement</span>
                    </div>
                  </>
                )}
              </div>

              {/* Deposit info */}
              {(requirements.find(r => r.tier === selectedTier)?.deposit_required ?? 0) > 0 && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertDescription>
                    This tier requires a deposit of{' '}
                    <strong>
                      {requirements.find(r => r.tier === selectedTier)?.deposit_required.toLocaleString()}{' '}
                      {requirements.find(r => r.tier === selectedTier)?.deposit_token}
                    </strong>
                    . You will be prompted to complete the deposit after approval.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setApplyModalOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-kurdish-green hover:bg-kurdish-green-dark"
              onClick={applyForTier}
              disabled={applying}
            >
              {applying ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              Submit Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MerchantApplication;
