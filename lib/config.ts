// App Configuration
// Central place for all app-wide configuration values

export const siteConfig = {
  name: 'OTTO Research Labs',
  shortName: 'OTTO',
  description: 'Automated eBay dropshipping product research and listing optimization',
  url: process.env.NEXT_PUBLIC_APP_URL || 'https://ottoresearch.io',

  // Company info
  company: {
    name: 'OTTO Research Labs',
    email: 'support@ottoresearch.io',
    twitter: '@ottoresearch',
  },

  // Links
  links: {
    docs: 'https://docs.ottoresearch.io',
    support: 'https://ottoresearch.io/support',
    privacy: 'https://ottoresearch.io/privacy',
    terms: 'https://ottoresearch.io/terms',
  },

  // Pricing tiers
  pricing: {
    lite: {
      name: 'Lite',
      price: 149,
      yearlyPrice: 1490, // 2 months free
      maxListings: 500,
      features: [
        'Up to 500 active listings',
        'Basic product research',
        'Manual listing creation',
        'Email support',
      ],
    },
    pro: {
      name: 'Pro',
      price: 349,
      yearlyPrice: 3490,
      maxListings: 2000,
      features: [
        'Up to 2,000 active listings',
        'Advanced product research',
        'Auto-listing automation',
        'Price optimization',
        'Priority support',
      ],
    },
    max: {
      name: 'Max',
      price: 599,
      yearlyPrice: 5990,
      maxListings: 5000,
      features: [
        'Up to 5,000 active listings',
        'Full automation suite',
        'Advanced analytics',
        'Auto-pruning',
        'Dedicated support',
      ],
    },
    ultra: {
      name: 'Ultra',
      price: 999,
      yearlyPrice: 9990,
      maxListings: 10000,
      features: [
        'Up to 10,000 active listings',
        'Enterprise automation',
        'Custom integrations',
        'White-glove onboarding',
        'Account manager',
      ],
    },
  },

  // Feature flags
  features: {
    billing: process.env.NEXT_PUBLIC_ENABLE_BILLING === 'true',
    analytics: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS !== 'false',
  },
} as const

export type PricingTier = keyof typeof siteConfig.pricing
