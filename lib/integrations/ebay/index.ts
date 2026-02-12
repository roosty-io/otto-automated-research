/**
 * eBay Integration Module
 *
 * Comprehensive eBay API integration for:
 * - OAuth authentication
 * - Inventory management
 * - Order fulfillment
 * - Business policies
 */

// Configuration
export * from './config'

// Authentication
export {
  getAuthorizationUrl,
  exchangeCodeForTokens,
  refreshAccessToken,
  getApplicationToken,
  saveUserTokens,
  getValidAccessToken,
  hasValidAuthorization,
  revokeAuthorization,
  type EbayTokens,
  type EbayUserToken,
} from './auth'

// API Client
export {
  EbayClient,
  getEbayClient,
  type EbayApiError,
  type EbayApiResponse,
} from './client'

// Inventory Management
export {
  EbayInventoryManager,
  getInventoryManager,
  type InventoryItem,
  type Offer,
  type PublishResult,
  type ListingData,
} from './inventory'

// Order Fulfillment
export {
  EbayFulfillmentManager,
  getFulfillmentManager,
  SHIPPING_CARRIERS,
  type EbayOrder,
  type ShipmentInfo,
  type OrderSearchParams,
} from './fulfillment'

// Business Policies
export {
  EbayPoliciesManager,
  getPoliciesManager,
  type PaymentPolicy,
  type ReturnPolicy,
  type FulfillmentPolicy,
  type CreatePaymentPolicyInput,
  type CreateReturnPolicyInput,
  type CreateFulfillmentPolicyInput,
} from './policies'
