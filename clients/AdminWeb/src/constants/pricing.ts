export const PRICING_PLANS = {
  BASIC: {
    id: 'basic',
    name: 'Basic',
    price: 29,
    description: 'Perfect for small teams'
  },
  STANDARD: {
    id: 'standard',
    name: 'Standard',
    price: 99,
    description: 'Ideal for growing businesses'
  },
  PREMIUM: {
    id: 'premium',
    name: 'Premium',
    price: 299,
    description: 'For large organizations'
  }
} as const;

export const TIER_COLORS = {
  basic: 'default',
  standard: 'primary',
  advanced: 'primary',
  premium: 'secondary'
} as const;

export const STATUS_COLORS = {
  complete: 'success',
  active: 'success',
  success: 'success',
  failed: 'error',
  error: 'error',
  inactive: 'error',
  in_progress: 'warning',
  'in progress': 'warning',
  pending: 'warning',
  processing: 'warning'
} as const;