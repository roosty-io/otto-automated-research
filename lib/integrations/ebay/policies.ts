/**
 * eBay Account API - Business Policies
 *
 * Manages seller business policies:
 * - Payment policies
 * - Return policies
 * - Fulfillment (shipping) policies
 */

import { EbayClient, getEbayClient } from './client'
import { EBAY_MARKETPLACES, type EbayMarketplace } from './config'

export interface PaymentPolicy {
  paymentPolicyId: string
  name: string
  description?: string
  marketplaceId: string
  categoryTypes: Array<{ name: string }>
  paymentMethods: Array<{
    paymentMethodType: string
    recipientAccountReference?: {
      referenceId: string
      referenceType: string
    }
  }>
  immediatePay: boolean
}

export interface ReturnPolicy {
  returnPolicyId: string
  name: string
  description?: string
  marketplaceId: string
  categoryTypes: Array<{ name: string }>
  returnsAccepted: boolean
  returnPeriod?: {
    value: number
    unit: 'DAY' | 'MONTH' | 'YEAR'
  }
  refundMethod?: string
  returnShippingCostPayer?: 'BUYER' | 'SELLER'
  restockingFeePercentage?: string
}

export interface FulfillmentPolicy {
  fulfillmentPolicyId: string
  name: string
  description?: string
  marketplaceId: string
  categoryTypes: Array<{ name: string }>
  handlingTime: {
    value: number
    unit: 'DAY' | 'BUSINESS_DAY'
  }
  shippingOptions: Array<{
    optionType: 'DOMESTIC' | 'INTERNATIONAL'
    costType: 'FLAT_RATE' | 'CALCULATED' | 'NOT_SPECIFIED'
    shippingServices: Array<{
      shippingServiceCode: string
      shippingCost?: { value: string; currency: string }
      additionalShippingCost?: { value: string; currency: string }
      freeShipping?: boolean
      shipToLocations?: {
        regionIncluded: Array<{ regionName: string }>
        regionExcluded?: Array<{ regionName: string }>
      }
    }>
  }>
  globalShipping: boolean
  pickupDropOff: boolean
  freightShipping: boolean
  localPickup: boolean
}

export interface CreatePolicyInput {
  name: string
  description?: string
  marketplaceId?: string
}

export interface CreatePaymentPolicyInput extends CreatePolicyInput {
  immediatePay?: boolean
}

export interface CreateReturnPolicyInput extends CreatePolicyInput {
  returnsAccepted: boolean
  returnPeriodDays?: number
  refundMethod?: 'MONEY_BACK' | 'MERCHANDISE_CREDIT'
  returnShippingCostPayer?: 'BUYER' | 'SELLER'
}

export interface CreateFulfillmentPolicyInput extends CreatePolicyInput {
  handlingTimeDays: number
  shippingServices: Array<{
    shippingServiceCode: string
    cost?: number
    additionalItemCost?: number
    freeShipping?: boolean
  }>
  globalShipping?: boolean
}

export class EbayPoliciesManager {
  private client: EbayClient
  private marketplace: EbayMarketplace

  constructor(storeId: string, marketplace: EbayMarketplace = 'US') {
    this.client = getEbayClient(storeId)
    this.marketplace = marketplace
  }

  // ================== PAYMENT POLICIES ==================

  /**
   * Get all payment policies
   */
  async getPaymentPolicies(): Promise<PaymentPolicy[]> {
    const response = await this.client.get<{ paymentPolicies: PaymentPolicy[] }>(
      '/sell/account/v1/payment_policy',
      { marketplace_id: EBAY_MARKETPLACES[this.marketplace] }
    )

    return response.success ? response.data?.paymentPolicies || [] : []
  }

  /**
   * Get a specific payment policy
   */
  async getPaymentPolicy(policyId: string): Promise<PaymentPolicy | null> {
    const response = await this.client.get<PaymentPolicy>(
      `/sell/account/v1/payment_policy/${policyId}`
    )

    return response.success ? response.data! : null
  }

  /**
   * Create a payment policy
   */
  async createPaymentPolicy(input: CreatePaymentPolicyInput): Promise<{
    policyId?: string
    success: boolean
    error?: string
  }> {
    const response = await this.client.post<{ paymentPolicyId: string }>(
      '/sell/account/v1/payment_policy',
      {
        name: input.name,
        description: input.description,
        marketplaceId: input.marketplaceId || EBAY_MARKETPLACES[this.marketplace],
        categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' }],
        paymentMethods: [{ paymentMethodType: 'PAYPAL' }],
        immediatePay: input.immediatePay ?? true,
      }
    )

    if (!response.success) {
      return {
        success: false,
        error: response.errors?.[0]?.message || 'Failed to create payment policy',
      }
    }

    return {
      success: true,
      policyId: response.data?.paymentPolicyId,
    }
  }

  // ================== RETURN POLICIES ==================

  /**
   * Get all return policies
   */
  async getReturnPolicies(): Promise<ReturnPolicy[]> {
    const response = await this.client.get<{ returnPolicies: ReturnPolicy[] }>(
      '/sell/account/v1/return_policy',
      { marketplace_id: EBAY_MARKETPLACES[this.marketplace] }
    )

    return response.success ? response.data?.returnPolicies || [] : []
  }

  /**
   * Get a specific return policy
   */
  async getReturnPolicy(policyId: string): Promise<ReturnPolicy | null> {
    const response = await this.client.get<ReturnPolicy>(
      `/sell/account/v1/return_policy/${policyId}`
    )

    return response.success ? response.data! : null
  }

  /**
   * Create a return policy
   */
  async createReturnPolicy(input: CreateReturnPolicyInput): Promise<{
    policyId?: string
    success: boolean
    error?: string
  }> {
    const body: any = {
      name: input.name,
      description: input.description,
      marketplaceId: input.marketplaceId || EBAY_MARKETPLACES[this.marketplace],
      categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' }],
      returnsAccepted: input.returnsAccepted,
    }

    if (input.returnsAccepted) {
      body.returnPeriod = {
        value: input.returnPeriodDays || 30,
        unit: 'DAY',
      }
      body.refundMethod = input.refundMethod || 'MONEY_BACK'
      body.returnShippingCostPayer = input.returnShippingCostPayer || 'BUYER'
    }

    const response = await this.client.post<{ returnPolicyId: string }>(
      '/sell/account/v1/return_policy',
      body
    )

    if (!response.success) {
      return {
        success: false,
        error: response.errors?.[0]?.message || 'Failed to create return policy',
      }
    }

    return {
      success: true,
      policyId: response.data?.returnPolicyId,
    }
  }

  // ================== FULFILLMENT POLICIES ==================

  /**
   * Get all fulfillment policies
   */
  async getFulfillmentPolicies(): Promise<FulfillmentPolicy[]> {
    const response = await this.client.get<{ fulfillmentPolicies: FulfillmentPolicy[] }>(
      '/sell/account/v1/fulfillment_policy',
      { marketplace_id: EBAY_MARKETPLACES[this.marketplace] }
    )

    return response.success ? response.data?.fulfillmentPolicies || [] : []
  }

  /**
   * Get a specific fulfillment policy
   */
  async getFulfillmentPolicy(policyId: string): Promise<FulfillmentPolicy | null> {
    const response = await this.client.get<FulfillmentPolicy>(
      `/sell/account/v1/fulfillment_policy/${policyId}`
    )

    return response.success ? response.data! : null
  }

  /**
   * Create a fulfillment policy
   */
  async createFulfillmentPolicy(input: CreateFulfillmentPolicyInput): Promise<{
    policyId?: string
    success: boolean
    error?: string
  }> {
    const shippingOptions = [{
      optionType: 'DOMESTIC',
      costType: input.shippingServices.some(s => s.freeShipping) ? 'FLAT_RATE' : 'CALCULATED',
      shippingServices: input.shippingServices.map(service => ({
        shippingServiceCode: service.shippingServiceCode,
        shippingCost: service.cost !== undefined
          ? { value: service.cost.toFixed(2), currency: 'USD' }
          : undefined,
        additionalShippingCost: service.additionalItemCost !== undefined
          ? { value: service.additionalItemCost.toFixed(2), currency: 'USD' }
          : undefined,
        freeShipping: service.freeShipping,
        shipToLocations: {
          regionIncluded: [{ regionName: 'WORLDWIDE' }],
        },
      })),
    }]

    const response = await this.client.post<{ fulfillmentPolicyId: string }>(
      '/sell/account/v1/fulfillment_policy',
      {
        name: input.name,
        description: input.description,
        marketplaceId: input.marketplaceId || EBAY_MARKETPLACES[this.marketplace],
        categoryTypes: [{ name: 'ALL_EXCLUDING_MOTORS_VEHICLES' }],
        handlingTime: {
          value: input.handlingTimeDays,
          unit: 'DAY',
        },
        shippingOptions,
        globalShipping: input.globalShipping ?? false,
        pickupDropOff: false,
        freightShipping: false,
        localPickup: false,
      }
    )

    if (!response.success) {
      return {
        success: false,
        error: response.errors?.[0]?.message || 'Failed to create fulfillment policy',
      }
    }

    return {
      success: true,
      policyId: response.data?.fulfillmentPolicyId,
    }
  }

  // ================== HELPER METHODS ==================

  /**
   * Get all policies (payment, return, fulfillment)
   */
  async getAllPolicies(): Promise<{
    payment: PaymentPolicy[]
    return: ReturnPolicy[]
    fulfillment: FulfillmentPolicy[]
  }> {
    const [payment, returnPolicies, fulfillment] = await Promise.all([
      this.getPaymentPolicies(),
      this.getReturnPolicies(),
      this.getFulfillmentPolicies(),
    ])

    return {
      payment,
      return: returnPolicies,
      fulfillment,
    }
  }

  /**
   * Create default dropshipping policies if they don't exist
   */
  async ensureDefaultPolicies(): Promise<{
    paymentPolicyId: string
    returnPolicyId: string
    fulfillmentPolicyId: string
  }> {
    const existing = await this.getAllPolicies()

    // Find or create payment policy
    let paymentPolicyId = existing.payment.find(p => p.name === 'OTTO Default Payment')?.paymentPolicyId
    if (!paymentPolicyId) {
      const result = await this.createPaymentPolicy({
        name: 'OTTO Default Payment',
        description: 'Default payment policy for OTTO listings',
        immediatePay: true,
      })
      if (result.success && result.policyId) {
        paymentPolicyId = result.policyId
      } else {
        // Use first available
        paymentPolicyId = existing.payment[0]?.paymentPolicyId || ''
      }
    }

    // Find or create return policy
    let returnPolicyId = existing.return.find(p => p.name === 'OTTO 30-Day Returns')?.returnPolicyId
    if (!returnPolicyId) {
      const result = await this.createReturnPolicy({
        name: 'OTTO 30-Day Returns',
        description: 'Standard 30-day return policy',
        returnsAccepted: true,
        returnPeriodDays: 30,
        refundMethod: 'MONEY_BACK',
        returnShippingCostPayer: 'BUYER',
      })
      if (result.success && result.policyId) {
        returnPolicyId = result.policyId
      } else {
        returnPolicyId = existing.return[0]?.returnPolicyId || ''
      }
    }

    // Find or create fulfillment policy
    let fulfillmentPolicyId = existing.fulfillment.find(p => p.name === 'OTTO Free Shipping')?.fulfillmentPolicyId
    if (!fulfillmentPolicyId) {
      const result = await this.createFulfillmentPolicy({
        name: 'OTTO Free Shipping',
        description: 'Free standard shipping, 3-day handling',
        handlingTimeDays: 3,
        shippingServices: [{
          shippingServiceCode: 'ShippingMethodStandard',
          freeShipping: true,
        }],
      })
      if (result.success && result.policyId) {
        fulfillmentPolicyId = result.policyId
      } else {
        fulfillmentPolicyId = existing.fulfillment[0]?.fulfillmentPolicyId || ''
      }
    }

    return {
      paymentPolicyId,
      returnPolicyId,
      fulfillmentPolicyId,
    }
  }
}

/**
 * Get policies manager for a store
 */
export function getPoliciesManager(storeId: string, marketplace?: EbayMarketplace): EbayPoliciesManager {
  return new EbayPoliciesManager(storeId, marketplace)
}
