import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Loader2, Shield, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { TradeModal } from './TradeModal';
import { MerchantTierBadge } from './MerchantTierBadge';
import { getUserReputation, type P2PFiatOffer, type P2PReputation } from '@/lib/p2p-fiat';
import { supabase } from '@/lib/supabase';
import type { P2PFilters } from './types';

interface AdListProps {
  type: 'buy' | 'sell' | 'my-ads';
  filters?: P2PFilters;
}

interface OfferWithReputation extends P2PFiatOffer {
  seller_reputation?: P2PReputation;
  payment_method_name?: string;
  merchant_tier?: 'lite' | 'super' | 'diamond';
}

export function AdList({ type, filters }: AdListProps) {
  const { user } = useAuth();
  const [offers, setOffers] = useState<OfferWithReputation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOffer, setSelectedOffer] = useState<OfferWithReputation | null>(null);

  useEffect(() => {
    fetchOffers();

    // Refresh data when user returns to the tab (visibility change)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchOffers();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, user, filters]);

  const fetchOffers = async () => {
    setLoading(true);
    try {
      let offersData: P2PFiatOffer[] = [];

      // For "my-ads", use Edge Function to bypass RLS (Telegram auth doesn't set auth.uid())
      if (type === 'my-ads') {
        const sessionToken = localStorage.getItem('p2p_session');
        if (!sessionToken) {
          setOffers([]);
          setLoading(false);
          return;
        }

        const { data, error } = await supabase.functions.invoke('get-my-offers', {
          body: { sessionToken }
        });

        if (error) {
          console.error('Get my offers error:', error);
          setOffers([]);
          setLoading(false);
          return;
        }

        offersData = data?.offers || [];
      } else {
        // Build base query for public offers
        let query = supabase.from('p2p_fiat_offers').select('*');

        if (type === 'buy') {
          // Buy tab = show SELL offers (user wants to buy from sellers)
          query = query.eq('ad_type', 'sell').eq('status', 'open').gt('remaining_amount', 0);
        } else if (type === 'sell') {
          // Sell tab = show BUY offers (user wants to sell to buyers)
          query = query.eq('ad_type', 'buy').eq('status', 'open').gt('remaining_amount', 0);
        }

        // Apply filters if provided
        if (filters) {
          // Token filter
          if (filters.token && filters.token !== 'all') {
            query = query.eq('token', filters.token);
          }

          // Fiat currency filter
          if (filters.fiatCurrency && filters.fiatCurrency !== 'all') {
            query = query.eq('fiat_currency', filters.fiatCurrency);
          }

          // Payment method filter
          if (filters.paymentMethods && filters.paymentMethods.length > 0) {
            query = query.in('payment_method_id', filters.paymentMethods);
          }

          // Amount range filter
          if (filters.minAmount !== null) {
            query = query.gte('remaining_amount', filters.minAmount);
          }
          if (filters.maxAmount !== null) {
            query = query.lte('remaining_amount', filters.maxAmount);
          }

          // Sort order
          const sortColumn = filters.sortBy === 'price' ? 'price_per_unit' :
                            filters.sortBy === 'completion_rate' ? 'created_at' :
                            filters.sortBy === 'trades' ? 'created_at' :
                            'created_at';
          query = query.order(sortColumn, { ascending: filters.sortOrder === 'asc' });
        } else {
          query = query.order('created_at', { ascending: false });
        }

        const { data } = await query;
        offersData = data || [];
      }

      // Enrich with reputation, payment method, and merchant tier
      const enrichedOffers = await Promise.all(
        offersData.map(async (offer) => {
          const [reputation, paymentMethod, merchantTier] = await Promise.all([
            getUserReputation(offer.seller_id),
            supabase
              .from('payment_methods')
              .select('method_name')
              .eq('id', offer.payment_method_id)
              .single(),
            supabase
              .from('p2p_merchant_tiers')
              .select('tier')
              .eq('user_id', offer.seller_id)
              .single()
          ]);

          return {
            ...offer,
            seller_reputation: reputation || undefined,
            payment_method_name: paymentMethod.data?.method_name,
            merchant_tier: merchantTier.data?.tier as 'lite' | 'super' | 'diamond' | undefined
          };
        })
      );

      // Apply client-side filters (completion rate, merchant tier)
      let filteredOffers = enrichedOffers;

      if (filters) {
        // Completion rate filter (needs reputation data)
        if (filters.minCompletionRate > 0) {
          filteredOffers = filteredOffers.filter(offer => {
            if (!offer.seller_reputation) return false;
            const rate = (offer.seller_reputation.completed_trades / (offer.seller_reputation.total_trades || 1)) * 100;
            return rate >= filters.minCompletionRate;
          });
        }

        // Merchant tier filter
        if (filters.merchantTiers && filters.merchantTiers.length > 0) {
          filteredOffers = filteredOffers.filter(offer => {
            if (!offer.merchant_tier) return false;
            // If super is selected, include super and diamond
            // If diamond is selected, include only diamond
            if (filters.merchantTiers.includes('diamond')) {
              return offer.merchant_tier === 'diamond';
            }
            if (filters.merchantTiers.includes('super')) {
              return offer.merchant_tier === 'super' || offer.merchant_tier === 'diamond';
            }
            return filters.merchantTiers.includes(offer.merchant_tier);
          });
        }

        // Verified only filter
        if (filters.verifiedOnly) {
          filteredOffers = filteredOffers.filter(offer => offer.seller_reputation?.verified_merchant);
        }
      }

      setOffers(filteredOffers);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Fetch offers error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-green-500" />
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">
          {type === 'my-ads' ? 'You have no active offers' : 'No offers available'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {offers.map(offer => (
        <Card key={offer.id} className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors">
          <CardContent className="p-3">
            <div className="flex items-center justify-between gap-3">
              {/* Seller Info - Compact */}
              <div className="flex items-center gap-2 min-w-0 flex-shrink-0">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-green-500/20 text-green-400 text-xs">
                    {(offer.seller_wallet || 'XX').slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-medium text-white truncate">
                      {(offer.seller_wallet || '').slice(0, 4)}...{(offer.seller_wallet || '').slice(-3)}
                    </p>
                    {offer.seller_reputation?.verified_merchant && (
                      <Shield className="w-3 h-3 text-blue-400 flex-shrink-0" />
                    )}
                  </div>
                  {offer.seller_reputation && (
                    <p className="text-xs text-gray-500">
                      {offer.seller_reputation.completed_trades} trades
                    </p>
                  )}
                </div>
              </div>

              {/* Price & Amount - Inline */}
              <div className="flex items-center gap-4 flex-1 justify-center">
                <div className="text-center">
                  <p className="text-sm font-bold text-green-400">
                    {offer.price_per_unit?.toFixed(2) || '0.00'} {offer.fiat_currency}
                  </p>
                  <p className="text-xs text-gray-500">price</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-semibold text-white">
                    {offer.remaining_amount} {offer.token}
                  </p>
                  <p className="text-xs text-gray-500">available</p>
                </div>
                <div className="text-center hidden sm:block">
                  <Badge variant="outline" className="text-xs">
                    {offer.payment_method_name || 'N/A'}
                  </Badge>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex-shrink-0">
                {type === 'my-ads' ? (
                  <Badge variant={offer.status === 'open' ? 'default' : 'secondary'} className="text-xs">
                    {offer.status?.toUpperCase()}
                  </Badge>
                ) : offer.seller_id === user?.id ? (
                  <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/30">
                    Your Ad
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => setSelectedOffer(offer)}
                    className={type === 'buy' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                  >
                    {type === 'buy' ? 'Buy' : 'Sell'}
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {selectedOffer && (
        <TradeModal
          offer={selectedOffer}
          onClose={() => {
            setSelectedOffer(null);
            fetchOffers(); // Refresh list
     
          }}
        />
      )}
    </div>
  );
}
