/**
 * eBay Inventory API
 *
 * Manages inventory items and offers using the eBay Inventory API.
 * This is the modern RESTful approach for listing management.
 */

import { EbayClient, getEbayClient } from './client'
import { EBAY_CONDITIONS, LISTING_DURATIONS, EBAY_MARKETPLACES, type EbayMarketplace } from './config'

// Inventory Item Types
export interface InventoryItem {
  sku: string
  locale?: string
  product: {
    title: string
    description: string
    aspects?: Record<string, string[]>
    brand?: string
    mpn?: string
    imageUrls: string[]
    upc?: string[]
    ean?: string[]
    isbn?: string[]
  }
  condition: keyof typeof EBAY_CONDITIONS
  conditionDescription?: string
  availability: {
    shipToLocationAvailability: {
      quantity: number
    }
  }
  packageWeightAndSize?: {
    dimensions?: {
      height: number
      length: number
      width: number
      unit: 'INCH' | 'CENTIMETER'
    }
    weight?: {
      value: number
      unit: 'POUND' | 'KILOGRAM' | 'OUNCE' | 'GRAM'
    }
  }
}

// Offer Types
export interface Offer {
  sku: string
  marketplaceId: string
  format: 'FIXED_PRICE' | 'AUCTION'
  availableQuantity: number
  categoryId: string
  listingDescription: string
  listingDuration?: keyof typeof LISTING_DURATIONS
  listingPolicies: {
    fulfillmentPolicyId: string
    paymentPolicyId: string
    returnPolicyId: string
  }
  pricingSummary: {
    price: {
      value: string
      currency: string
    }
    minimumAdvertisedPrice?: {
      value: string
      currency: string
    }
  }
  quantityLimitPerBuyer?: number
  tax?: {
    applyTax: boolean
    vatPercentage?: number
  }
  merchantLocationKey?: string
}

export interface PublishResult {
  listingId: string
  offerId: string
  sku: string
  success: boolean
  errors?: string[]
}

export interface ListingData {
  sku: string
  title: string
  description: string
  price: number
  quantity: number
  categoryId: string
  condition: keyof typeof EBAY_CONDITIONS
  images: string[]
  brand?: string
  mpn?: string
  upc?: string
  aspects?: Record<string, string[]>
  returnPolicyId: string
  paymentPolicyId: string
  fulfillmentPolicyId: string
}

export class EbayInventoryManager {
  private client: EbayClient

  constructor(storeId: string) {
    this.client = getEbayClient(storeId)
  }

  /**
   * Create or update an inventory item
   */
  async createOrUpdateInventoryItem(item: InventoryItem): Promise<{ success: boolean; error?: string }> {
    const response = await this.client.put<void>(
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(item.sku)}`,
      {
        product: item.product,
        condition: EBAY_CONDITIONS[item.condition],
        conditionDescription: item.conditionDescription,
        availability: item.availability,
        packageWeightAndSize: item.packageWeightAndSize,
      }
    )

    if (!response.success) {
      return {
        success: false,
        error: response.errors?.[0]?.message || 'Failed to create inventory item',
      }
    }

    return { success: true }
  }

  /**
   * Get an inventory item by SKU
   */
  async getInventoryItem(sku: string): Promise<InventoryItem | null> {
    const response = await this.client.get<InventoryItem>(
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`
    )

    return response.success ? response.data! : null
  }

  /**
   * Delete an inventory item
   */
  async deleteInventoryItem(sku: string): Promise<boolean> {
    const response = await this.client.delete<void>(
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`
    )

    return response.success
  }

  /**
   * Get all inventory items (paginated)
   */
  async getInventoryItems(options: {
    limit?: number
    offset?: number
  } = {}): Promise<{ items: InventoryItem[]; total: number }> {
    const { limit = 100, offset = 0 } = options

    const response = await this.client.get<{
      inventoryItems: InventoryItem[]
      total: number
    }>('/sell/inventory/v1/inventory_item', {
      limit: limit.toString(),
      offset: offset.toString(),
    })

    if (!response.success) {
      return { items: [], total: 0 }
    }

    return {
      items: response.data?.inventoryItems || [],
      total: response.data?.total || 0,
    }
  }

  /**
   * Create an offer for an inventory item
   */
  async createOffer(offer: Offer): Promise<{ offerId?: string; success: boolean; error?: string }> {
    const response = await this.client.post<{ offerId: string }>(
      '/sell/inventory/v1/offer',
      {
        sku: offer.sku,
        marketplaceId: offer.marketplaceId,
        format: offer.format,
        availableQuantity: offer.availableQuantity,
        categoryId: offer.categoryId,
        listingDescription: offer.listingDescription,
        listingDuration: offer.listingDuration || 'GTC',
        listingPolicies: offer.listingPolicies,
        pricingSummary: offer.pricingSummary,
        quantityLimitPerBuyer: offer.quantityLimitPerBuyer,
        tax: offer.tax,
        merchantLocationKey: offer.merchantLocationKey,
      }
    )

    if (!response.success) {
      return {
        success: false,
        error: response.errors?.[0]?.message || 'Failed to create offer',
      }
    }

    return {
      success: true,
      offerId: response.data?.offerId,
    }
  }

  /**
   * Publish an offer (make it live)
   */
  async publishOffer(offerId: string): Promise<{ listingId?: string; success: boolean; error?: string }> {
    const response = await this.client.post<{ listingId: string }>(
      `/sell/inventory/v1/offer/${offerId}/publish`,
      {}
    )

    if (!response.success) {
      return {
        success: false,
        error: response.errors?.[0]?.message || 'Failed to publish offer',
      }
    }

    return {
      success: true,
      listingId: response.data?.listingId,
    }
  }

  /**
   * Withdraw an offer (end listing)
   */
  async withdrawOffer(offerId: string): Promise<boolean> {
    const response = await this.client.post<void>(
      `/sell/inventory/v1/offer/${offerId}/withdraw`,
      {}
    )

    return response.success
  }

  /**
   * Update offer price
   */
  async updateOfferPrice(offerId: string, newPrice: number, currency: string = 'USD'): Promise<boolean> {
    const response = await this.client.put<void>(
      `/sell/inventory/v1/offer/${offerId}`,
      {
        pricingSummary: {
          price: {
            value: newPrice.toFixed(2),
            currency,
          },
        },
      }
    )

    return response.success
  }

  /**
   * Update inventory quantity
   */
  async updateQuantity(sku: string, quantity: number): Promise<boolean> {
    const response = await this.client.put<void>(
      `/sell/inventory/v1/inventory_item/${encodeURIComponent(sku)}`,
      {
        availability: {
          shipToLocationAvailability: {
            quantity,
          },
        },
      }
    )

    return response.success
  }

  /**
   * Full listing flow: Create inventory item + offer + publish
   */
  async createListing(data: ListingData, marketplace: EbayMarketplace = 'US'): Promise<PublishResult> {
    // Step 1: Create inventory item
    const inventoryResult = await this.createOrUpdateInventoryItem({
      sku: data.sku,
      product: {
        title: data.title,
        description: data.description,
        imageUrls: data.images,
        brand: data.brand,
        mpn: data.mpn,
        upc: data.upc ? [data.upc] : undefined,
        aspects: data.aspects,
      },
      condition: data.condition,
      availability: {
        shipToLocationAvailability: {
          quantity: data.quantity,
        },
      },
    })

    if (!inventoryResult.success) {
      return {
        listingId: '',
        offerId: '',
        sku: data.sku,
        success: false,
        errors: [inventoryResult.error || 'Failed to create inventory item'],
      }
    }

    // Step 2: Create offer
    const offerResult = await this.createOffer({
      sku: data.sku,
      marketplaceId: EBAY_MARKETPLACES[marketplace],
      format: 'FIXED_PRICE',
      availableQuantity: data.quantity,
      categoryId: data.categoryId,
      listingDescription: data.description,
      listingPolicies: {
        fulfillmentPolicyId: data.fulfillmentPolicyId,
        paymentPolicyId: data.paymentPolicyId,
        returnPolicyId: data.returnPolicyId,
      },
      pricingSummary: {
        price: {
          value: data.price.toFixed(2),
          currency: 'USD',
        },
      },
    })

    if (!offerResult.success || !offerResult.offerId) {
      return {
        listingId: '',
        offerId: '',
        sku: data.sku,
        success: false,
        errors: [offerResult.error || 'Failed to create offer'],
      }
    }

    // Step 3: Publish offer
    const publishResult = await this.publishOffer(offerResult.offerId)

    if (!publishResult.success) {
      return {
        listingId: '',
        offerId: offerResult.offerId,
        sku: data.sku,
        success: false,
        errors: [publishResult.error || 'Failed to publish listing'],
      }
    }

    return {
      listingId: publishResult.listingId!,
      offerId: offerResult.offerId,
      sku: data.sku,
      success: true,
    }
  }

  /**
   * Bulk create listings
   */
  async createListingsBulk(
    listings: ListingData[],
    options: {
      marketplace?: EbayMarketplace
      delayBetween?: number
      onProgress?: (completed: number, total: number) => void
    } = {}
  ): Promise<{ results: PublishResult[]; successful: number; failed: number }> {
    const { marketplace = 'US', delayBetween = 1000, onProgress } = options
    const results: PublishResult[] = []
    let successful = 0
    let failed = 0

    for (let i = 0; i < listings.length; i++) {
      const listing = listings[i]

      try {
        const result = await this.createListing(listing, marketplace)
        results.push(result)

        if (result.success) {
          successful++
        } else {
          failed++
        }
      } catch (error) {
        results.push({
          listingId: '',
          offerId: '',
          sku: listing.sku,
          success: false,
          errors: [error instanceof Error ? error.message : 'Unknown error'],
        })
        failed++
      }

      onProgress?.(i + 1, listings.length)

      // Delay between listings to avoid rate limits
      if (i < listings.length - 1 && delayBetween > 0) {
        await new Promise(resolve => setTimeout(resolve, delayBetween))
      }
    }

    return { results, successful, failed }
  }
}

/**
 * Get inventory manager for a store
 */
export function getInventoryManager(storeId: string): EbayInventoryManager {
  return new EbayInventoryManager(storeId)
}
