// P2P Filter types and defaults - separate file to avoid react-refresh warning

export interface P2PFilters {
  // Token
  token: 'HEZ' | 'PEZ' | 'all';

  // Fiat currency
  fiatCurrency: string | 'all';

  // Payment methods
  paymentMethods: string[];

  // Amount range
  minAmount: number | null;
  maxAmount: number | null;

  // Merchant tier
  merchantTiers: ('lite' | 'super' | 'diamond')[];

  // Completion rate
  minCompletionRate: number;

  // Online status
  onlineOnly: boolean;

  // Verified only
  verifiedOnly: boolean;

  // Sort
  sortBy: 'price' | 'completion_rate' | 'trades' | 'newest';
  sortOrder: 'asc' | 'desc';
}

export const DEFAULT_FILTERS: P2PFilters = {
  token: 'all',
  fiatCurrency: 'all',
  paymentMethods: [],
  minAmount: null,
  maxAmount: null,
  merchantTiers: [],
  minCompletionRate: 0,
  onlineOnly: false,
  verifiedOnly: false,
  sortBy: 'price',
  sortOrder: 'asc'
};
