/**
 * Identity and Reputation Library
 * Handles KYC, badges, roles, and reputation for P2P trading
 */

// Badge types for user achievements
export interface Badge {
  id: string;
  name: string;
  description: string;
  icon: string;
  earnedAt?: Date;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
}

// User roles in the P2P system
export interface Role {
  id: string;
  name: string;
  permissions: string[];
  level: number;
}

// KYC verification data
export interface KYCData {
  fullName?: string;
  dateOfBirth?: string;
  nationality?: string;
  documentType?: 'passport' | 'national_id' | 'driving_license';
  documentNumber?: string;
  documentImage?: string;
  selfieImage?: string;
  addressProof?: string;
}

// Privacy settings for profile data
export interface PrivacySettings {
  showRealName: boolean;
  showEmail: boolean;
  showCountry: boolean;
  useZKProof: boolean;
}

// Verification level
export type VerificationLevel = 'none' | 'basic' | 'verified' | 'premium';
export type KYCStatus = 'none' | 'pending' | 'approved' | 'rejected';

// Full identity profile
export interface IdentityProfile {
  address: string;
  verificationLevel: VerificationLevel;
  kycStatus: KYCStatus;
  verificationDate?: Date;
  reputationScore: number;
  badges: Badge[];
  roles: Role[];
  privacySettings: PrivacySettings;
}

// Default badges available in the system
export const DEFAULT_BADGES: Badge[] = [
  {
    id: 'first_trade',
    name: 'İlk İşlem',
    description: 'İlk P2P işlemini tamamladın',
    icon: '🎉',
    tier: 'bronze',
  },
  {
    id: 'trusted_trader',
    name: 'Güvenilir Tüccar',
    description: '10 başarılı işlem tamamladın',
    icon: '⭐',
    tier: 'silver',
  },
  {
    id: 'verified_identity',
    name: 'Doğrulanmış Kimlik',
    description: 'KYC doğrulaması tamamlandı',
    icon: '✅',
    tier: 'gold',
  },
];

// System roles
export const ROLES: Record<string, Role> = {
  user: {
    id: 'user',
    name: 'Kullanıcı',
    permissions: ['trade', 'view_offers'],
    level: 1,
  },
  verified_user: {
    id: 'verified_user',
    name: 'Doğrulanmış Kullanıcı',
    permissions: ['trade', 'view_offers', 'create_offers'],
    level: 2,
  },
  merchant: {
    id: 'merchant',
    name: 'Tüccar',
    permissions: ['trade', 'view_offers', 'create_offers', 'bulk_trade'],
    level: 3,
  },
  arbitrator: {
    id: 'arbitrator',
    name: 'Hakem',
    permissions: ['trade', 'view_offers', 'resolve_disputes'],
    level: 4,
  },
};

/**
 * Calculate reputation score based on trading history
 */
export function calculateReputationScore(
  _trades: unknown[],
  verificationLevel: VerificationLevel,
  badges: Badge[]
): number {
  let score = 0;

  // Base score from verification level
  switch (verificationLevel) {
    case 'premium':
      score += 40;
      break;
    case 'verified':
      score += 30;
      break;
    case 'basic':
      score += 15;
      break;
    default:
      score += 0;
  }

  // Bonus from badges
  score += badges.length * 5;

  // Cap at 100
  return Math.min(score, 100);
}

/**
 * Generate a zero-knowledge proof for privacy-preserving verification
 * This is a placeholder - real implementation would use ZK libraries
 */
export async function generateZKProof(data: KYCData): Promise<string> {
  // Placeholder implementation
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(data))
  );
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
