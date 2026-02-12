/**
 * eBay API Configuration
 *
 * Supports both Sandbox and Production environments.
 * Uses OAuth 2.0 for authentication.
 */

export const EBAY_CONFIG = {
  production: {
    apiUrl: 'https://api.ebay.com',
    authUrl: 'https://auth.ebay.com/oauth2/authorize',
    tokenUrl: 'https://api.ebay.com/identity/v1/oauth2/token',
  },
  sandbox: {
    apiUrl: 'https://api.sandbox.ebay.com',
    authUrl: 'https://auth.sandbox.ebay.com/oauth2/authorize',
    tokenUrl: 'https://api.sandbox.ebay.com/identity/v1/oauth2/token',
  },
} as const

export type EbayEnvironment = keyof typeof EBAY_CONFIG

// eBay API Scopes needed for dropshipping operations
export const EBAY_SCOPES = [
  'https://api.ebay.com/oauth/api_scope',
  'https://api.ebay.com/oauth/api_scope/sell.inventory',
  'https://api.ebay.com/oauth/api_scope/sell.inventory.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.marketing',
  'https://api.ebay.com/oauth/api_scope/sell.account',
  'https://api.ebay.com/oauth/api_scope/sell.account.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
  'https://api.ebay.com/oauth/api_scope/sell.fulfillment.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.analytics.readonly',
  'https://api.ebay.com/oauth/api_scope/sell.finances',
  'https://api.ebay.com/oauth/api_scope/commerce.identity.readonly',
]

// eBay Marketplace IDs
export const EBAY_MARKETPLACES = {
  US: 'EBAY_US',
  UK: 'EBAY_GB',
  DE: 'EBAY_DE',
  AU: 'EBAY_AU',
  CA: 'EBAY_CA',
  FR: 'EBAY_FR',
  IT: 'EBAY_IT',
  ES: 'EBAY_ES',
} as const

export type EbayMarketplace = keyof typeof EBAY_MARKETPLACES

// eBay Category IDs for common dropshipping categories
export const EBAY_CATEGORIES = {
  ELECTRONICS: 293,
  HOME_GARDEN: 11700,
  SPORTING_GOODS: 888,
  TOYS_HOBBIES: 220,
  HEALTH_BEAUTY: 26395,
  CLOTHING: 11450,
  JEWELRY: 281,
  COLLECTIBLES: 1,
  BUSINESS_INDUSTRIAL: 12576,
  PET_SUPPLIES: 1281,
} as const

// Listing duration options
export const LISTING_DURATIONS = {
  DAYS_3: 'DAYS_3',
  DAYS_5: 'DAYS_5',
  DAYS_7: 'DAYS_7',
  DAYS_10: 'DAYS_10',
  DAYS_30: 'DAYS_30',
  GTC: 'GTC', // Good 'Til Cancelled
} as const

// Condition IDs
export const EBAY_CONDITIONS = {
  NEW: 1000,
  NEW_OTHER: 1500,
  NEW_WITH_DEFECTS: 1750,
  CERTIFIED_REFURBISHED: 2000,
  EXCELLENT_REFURBISHED: 2010,
  VERY_GOOD_REFURBISHED: 2020,
  GOOD_REFURBISHED: 2030,
  SELLER_REFURBISHED: 2500,
  LIKE_NEW: 3000,
  USED_EXCELLENT: 4000,
  USED_VERY_GOOD: 5000,
  USED_GOOD: 6000,
  USED_ACCEPTABLE: 7000,
  FOR_PARTS: 7000,
} as const

// Return policy options
export const RETURN_POLICIES = {
  NO_RETURNS: {
    returnsAccepted: false,
  },
  RETURNS_30_DAYS: {
    returnsAccepted: true,
    returnPeriod: { value: 30, unit: 'DAY' },
    refundMethod: 'MONEY_BACK',
    returnShippingCostPayer: 'BUYER',
  },
  RETURNS_60_DAYS: {
    returnsAccepted: true,
    returnPeriod: { value: 60, unit: 'DAY' },
    refundMethod: 'MONEY_BACK',
    returnShippingCostPayer: 'BUYER',
  },
  FREE_RETURNS_30_DAYS: {
    returnsAccepted: true,
    returnPeriod: { value: 30, unit: 'DAY' },
    refundMethod: 'MONEY_BACK',
    returnShippingCostPayer: 'SELLER',
  },
} as const

// Shipping options
export const SHIPPING_OPTIONS = {
  FREE_ECONOMY: {
    shippingCost: { value: '0.00', currency: 'USD' },
    shippingServiceCode: 'ShippingMethodStandard',
    shipToLocations: { regionIncluded: [{ regionName: 'WORLDWIDE' }] },
  },
  CALCULATED: {
    shippingCostType: 'CALCULATED',
  },
  FLAT_RATE: {
    shippingCostType: 'FLAT_RATE',
  },
} as const

export function getEbayConfig() {
  const environment = (process.env.EBAY_ENVIRONMENT || 'production') as EbayEnvironment
  return {
    ...EBAY_CONFIG[environment],
    environment,
    appId: process.env.EBAY_APP_ID || '',
    devId: process.env.EBAY_DEV_ID || '',
    certId: process.env.EBAY_CERT_ID || '',
    redirectUri: process.env.EBAY_REDIRECT_URI || '',
  }
}
