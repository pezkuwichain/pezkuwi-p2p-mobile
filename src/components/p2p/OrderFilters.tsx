import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ChevronDown,
  Filter,
  RefreshCw,
  SlidersHorizontal,
  Star,
  Diamond,
  X,
  Check
} from 'lucide-react';

// Import types from separate file to avoid react-refresh warning
import { type P2PFilters, DEFAULT_FILTERS } from './types';

// Available fiat currencies
const FIAT_CURRENCIES = [
  { value: 'TRY', label: 'TRY - Turkish Lira' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'IQD', label: 'IQD - Iraqi Dinar' },
  { value: 'IRR', label: 'IRR - Iranian Rial' }
];

// Merchant tiers
const MERCHANT_TIERS = [
  { value: 'super', label: 'Super', icon: Star, color: 'text-yellow-500' },
  { value: 'diamond', label: 'Diamond', icon: Diamond, color: 'text-purple-500' }
];

interface OrderFiltersProps {
  filters: P2PFilters;
  onFiltersChange: (filters: P2PFilters) => void;
  variant?: 'inline' | 'sheet';
}

export function OrderFilters({
  filters,
  onFiltersChange,
  variant = 'inline'
}: OrderFiltersProps) {
  const [localFilters, setLocalFilters] = useState<P2PFilters>(filters);
  const [paymentMethods, setPaymentMethods] = useState<{ id: string; method_name: string }[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    currency: true,
    payment: false,
    merchant: false,
    amount: false
  });

  // Fetch payment methods
  useEffect(() => {
    const fetchPaymentMethods = async () => {
      const { data } = await supabase
        .from('payment_methods')
        .select('id, method_name')
        .eq('is_active', true);

      if (data) {
        setPaymentMethods(data);
      }
    };

    fetchPaymentMethods();
  }, []);

  // Update local filters
  const updateFilter = <K extends keyof P2PFilters>(key: K, value: P2PFilters[K]) => {
    setLocalFilters(prev => ({ ...prev, [key]: value }));
  };

  // Apply filters
  const applyFilters = () => {
    onFiltersChange(localFilters);
    setIsOpen(false);
  };

  // Reset filters
  const resetFilters = () => {
    setLocalFilters(DEFAULT_FILTERS);
    onFiltersChange(DEFAULT_FILTERS);
  };

  // Toggle section
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // Count active filters
  const activeFilterCount = () => {
    let count = 0;
    if (localFilters.token !== 'all') count++;
    if (localFilters.fiatCurrency !== 'all') count++;
    if (localFilters.paymentMethods.length > 0) count++;
    if (localFilters.minAmount !== null || localFilters.maxAmount !== null) count++;
    if (localFilters.merchantTiers.length > 0) count++;
    if (localFilters.minCompletionRate > 0) count++;
    if (localFilters.onlineOnly) count++;
    if (localFilters.verifiedOnly) count++;
    return count;
  };

  // Filter content
  const FilterContent = () => (
    <div className="space-y-4">
      {/* Token Selection */}
      <div className="space-y-2">
        <Label>Cryptocurrency</Label>
        <div className="flex gap-2">
          {['all', 'HEZ', 'PEZ'].map((token) => (
            <Button
              key={token}
              variant={localFilters.token === token ? 'default' : 'outline'}
              size="sm"
              onClick={() => updateFilter('token', token as P2PFilters['token'])}
              className={localFilters.token === token ? 'bg-kurdish-green hover:bg-kurdish-green-dark' : ''}
            >
              {token === 'all' ? 'All' : token}
            </Button>
          ))}
        </div>
      </div>

      {/* Fiat Currency */}
      <Collapsible open={expandedSections.currency} onOpenChange={() => toggleSection('currency')}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2">
          <Label className="cursor-pointer">Fiat Currency</Label>
          <ChevronDown className={`h-4 w-4 transition-transform ${expandedSections.currency ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <Select
            value={localFilters.fiatCurrency}
            onValueChange={(value) => updateFilter('fiatCurrency', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select currency" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Currencies</SelectItem>
              {FIAT_CURRENCIES.map((currency) => (
                <SelectItem key={currency.value} value={currency.value}>
                  {currency.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CollapsibleContent>
      </Collapsible>

      {/* Payment Methods */}
      <Collapsible open={expandedSections.payment} onOpenChange={() => toggleSection('payment')}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2">
          <Label className="cursor-pointer">Payment Methods</Label>
          <div className="flex items-center gap-2">
            {localFilters.paymentMethods.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {localFilters.paymentMethods.length}
              </Badge>
            )}
            <ChevronDown className={`h-4 w-4 transition-transform ${expandedSections.payment ? 'rotate-180' : ''}`} />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 space-y-2">
          {paymentMethods.map((method) => (
            <div key={method.id} className="flex items-center space-x-2">
              <Checkbox
                id={method.id}
                checked={localFilters.paymentMethods.includes(method.id)}
                onCheckedChange={(checked) => {
                  if (checked) {
                    updateFilter('paymentMethods', [...localFilters.paymentMethods, method.id]);
                  } else {
                    updateFilter('paymentMethods', localFilters.paymentMethods.filter(id => id !== method.id));
                  }
                }}
              />
              <label htmlFor={method.id} className="text-sm cursor-pointer">
                {method.method_name}
              </label>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      {/* Amount Range */}
      <Collapsible open={expandedSections.amount} onOpenChange={() => toggleSection('amount')}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2">
          <Label className="cursor-pointer">Amount Range</Label>
          <ChevronDown className={`h-4 w-4 transition-transform ${expandedSections.amount ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Min Amount</Label>
              <Input
                type="number"
                placeholder="0"
                value={localFilters.minAmount || ''}
                onChange={(e) => updateFilter('minAmount', e.target.value ? Number(e.target.value) : null)}
              />
            </div>
            <div>
              <Label className="text-xs">Max Amount</Label>
              <Input
                type="number"
                placeholder="No limit"
                value={localFilters.maxAmount || ''}
                onChange={(e) => updateFilter('maxAmount', e.target.value ? Number(e.target.value) : null)}
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Merchant Tier */}
      <Collapsible open={expandedSections.merchant} onOpenChange={() => toggleSection('merchant')}>
        <CollapsibleTrigger className="flex items-center justify-between w-full py-2">
          <Label className="cursor-pointer">Merchant Tier</Label>
          <ChevronDown className={`h-4 w-4 transition-transform ${expandedSections.merchant ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2 space-y-2">
          {MERCHANT_TIERS.map((tier) => {
            const Icon = tier.icon;
            return (
              <div key={tier.value} className="flex items-center space-x-2">
                <Checkbox
                  id={`tier-${tier.value}`}
                  checked={localFilters.merchantTiers.includes(tier.value as 'super' | 'diamond')}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      updateFilter('merchantTiers', [...localFilters.merchantTiers, tier.value as 'super' | 'diamond']);
                    } else {
                      updateFilter('merchantTiers', localFilters.merchantTiers.filter(t => t !== tier.value));
                    }
                  }}
                />
                <label htmlFor={`tier-${tier.value}`} className="flex items-center gap-1 text-sm cursor-pointer">
                  <Icon className={`h-4 w-4 ${tier.color}`} />
                  {tier.label}+ only
                </label>
              </div>
            );
          })}
        </CollapsibleContent>
      </Collapsible>

      {/* Completion Rate */}
      <div className="space-y-2">
        <Label>Min Completion Rate: {localFilters.minCompletionRate}%</Label>
        <Slider
          value={[localFilters.minCompletionRate]}
          onValueChange={([value]) => updateFilter('minCompletionRate', value)}
          max={100}
          step={5}
          className="py-2"
        />
      </div>

      {/* Toggle options */}
      <div className="space-y-2">
        <div className="flex items-center space-x-2">
          <Checkbox
            id="online-only"
            checked={localFilters.onlineOnly}
            onCheckedChange={(checked) => updateFilter('onlineOnly', !!checked)}
          />
          <label htmlFor="online-only" className="text-sm cursor-pointer">
            Online traders only
          </label>
        </div>

        <div className="flex items-center space-x-2">
          <Checkbox
            id="verified-only"
            checked={localFilters.verifiedOnly}
            onCheckedChange={(checked) => updateFilter('verifiedOnly', !!checked)}
          />
          <label htmlFor="verified-only" className="text-sm cursor-pointer">
            Verified merchants only
          </label>
        </div>
      </div>

      {/* Sort */}
      <div className="space-y-2">
        <Label>Sort By</Label>
        <div className="grid grid-cols-2 gap-2">
          <Select
            value={localFilters.sortBy}
            onValueChange={(value) => updateFilter('sortBy', value as P2PFilters['sortBy'])}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="price">Price</SelectItem>
              <SelectItem value="completion_rate">Completion Rate</SelectItem>
              <SelectItem value="trades">Trade Count</SelectItem>
              <SelectItem value="newest">Newest</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={localFilters.sortOrder}
            onValueChange={(value) => updateFilter('sortOrder', value as 'asc' | 'desc')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="asc">Low to High</SelectItem>
              <SelectItem value="desc">High to Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );

  // Sheet variant (mobile)
  if (variant === 'sheet') {
    return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilterCount() > 0 && (
              <Badge variant="secondary" className="ml-1">
                {activeFilterCount()}
              </Badge>
            )}
          </Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filter Orders
              </span>
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Reset
              </Button>
            </SheetTitle>
          </SheetHeader>
          <div className="py-4 overflow-y-auto max-h-[calc(100vh-200px)]">
            <FilterContent />
          </div>
          <SheetFooter className="absolute bottom-0 left-0 right-0 p-4 bg-background border-t">
            <Button variant="outline" onClick={() => setIsOpen(false)} className="flex-1">
              Cancel
            </Button>
            <Button onClick={applyFilters} className="flex-1 bg-kurdish-green hover:bg-kurdish-green-dark">
              <Check className="h-4 w-4 mr-1" />
              Apply Filters
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    );
  }

  // Inline variant (desktop)
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </h3>
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Reset
          </Button>
        </div>
        <FilterContent />
        <Button onClick={applyFilters} className="w-full mt-4 bg-kurdish-green hover:bg-kurdish-green-dark">
          <Check className="h-4 w-4 mr-1" />
          Apply Filters
        </Button>
      </CardContent>
    </Card>
  );
}

// Quick filter bar for top of listing
export function QuickFilterBar({
  filters,
  onFiltersChange
}: {
  filters: P2PFilters;
  onFiltersChange: (filters: P2PFilters) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Token quick select */}
      <div className="flex gap-1">
        {['all', 'HEZ', 'PEZ'].map((token) => (
          <Button
            key={token}
            variant={filters.token === token ? 'default' : 'outline'}
            size="sm"
            onClick={() => onFiltersChange({ ...filters, token: token as P2PFilters['token'] })}
            className={filters.token === token ? 'bg-kurdish-green hover:bg-kurdish-green-dark' : ''}
          >
            {token === 'all' ? 'All' : token}
          </Button>
        ))}
      </div>

      {/* Currency select */}
      <Select
        value={filters.fiatCurrency}
        onValueChange={(value) => onFiltersChange({ ...filters, fiatCurrency: value })}
      >
        <SelectTrigger className="w-[120px] h-9">
          <SelectValue placeholder="Currency" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          {FIAT_CURRENCIES.map((currency) => (
            <SelectItem key={currency.value} value={currency.value}>
              {currency.value}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Amount input */}
      <Input
        type="number"
        placeholder="I want to trade..."
        className="w-[150px] h-9"
        onChange={(e) => {
          const value = e.target.value ? Number(e.target.value) : null;
          onFiltersChange({ ...filters, minAmount: value, maxAmount: value ? value * 1.1 : null });
        }}
      />

      {/* Advanced filters sheet */}
      <OrderFilters
        filters={filters}
        onFiltersChange={onFiltersChange}
        variant="sheet"
      />

      {/* Active filter badges */}
      {filters.merchantTiers.length > 0 && (
        <Badge variant="secondary" className="gap-1">
          <Star className="h-3 w-3 text-yellow-500" />
          {filters.merchantTiers.join(', ')}+
          <button
            onClick={() => onFiltersChange({ ...filters, merchantTiers: [] })}
            className="ml-1 hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}

      {filters.minCompletionRate > 0 && (
        <Badge variant="secondary" className="gap-1">
          {filters.minCompletionRate}%+ rate
          <button
            onClick={() => onFiltersChange({ ...filters, minCompletionRate: 0 })}
            className="ml-1 hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}
    </div>
  );
}

export default OrderFilters;
