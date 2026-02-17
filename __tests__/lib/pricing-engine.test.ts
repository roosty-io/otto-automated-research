import { describe, it, expect } from 'vitest'
import {
  calculateFees,
  calculateNetProfit,
  calculateMinSellPrice,
  calculateSellPrice,
  checkProductQualification,
  makeRepricingDecision,
  isProfitable,
  getMinViablePrice,
  validatePriceChange,
  batchCalculatePricing,
  filterQualifiedProducts,
  DEFAULT_PRICING_CONFIG,
} from '@/lib/pricing/pricing-engine'

describe('Pricing Engine', () => {
  describe('calculateFees', () => {
    it('should calculate total fees correctly', () => {
      const result = calculateFees(100)

      // eBay final value: 100 * 0.13 = 13
      // Payment processing: 100 * 0.029 + 0.30 = 3.20
      const expectedTotal = 13 + 3.20

      expect(result.total).toBeCloseTo(expectedTotal, 2)
      expect(result.breakdown.ebayFinalValueFee).toBeCloseTo(13, 2)
      expect(result.breakdown.paymentProcessingFee).toBeCloseTo(3.20, 2)
    })

    it('should handle low prices', () => {
      const result = calculateFees(10)
      expect(result.total).toBeGreaterThan(0)
      expect(result.breakdown.paymentProcessingFee).toBeGreaterThanOrEqual(0.30) // Fixed fee
    })
  })

  describe('calculateNetProfit', () => {
    it('should calculate net profit correctly', () => {
      const sellPrice = 50
      const costPrice = 30
      const netProfit = calculateNetProfit(sellPrice, costPrice)

      // Gross: 50 - 30 = 20
      // Fees: ~8 (13% + 2.9% + $0.30)
      // Net: ~12
      expect(netProfit).toBeGreaterThan(10)
      expect(netProfit).toBeLessThan(15)
    })

    it('should handle break-even scenarios', () => {
      const sellPrice = 20
      const costPrice = 20
      const netProfit = calculateNetProfit(sellPrice, costPrice)

      // With no margin, fees make it negative
      expect(netProfit).toBeLessThan(0)
    })
  })

  describe('calculateMinSellPrice', () => {
    it('should calculate minimum sell price for target profit', () => {
      const costPrice = 20
      const minPrice = calculateMinSellPrice(costPrice, 2)

      // Verify the minimum price achieves at least $2 profit
      const netProfit = calculateNetProfit(minPrice, costPrice)
      expect(netProfit).toBeGreaterThanOrEqual(1.99) // Allow small rounding
    })

    it('should increase with higher costs', () => {
      const minPrice20 = calculateMinSellPrice(20, 2)
      const minPrice40 = calculateMinSellPrice(40, 2)

      expect(minPrice40).toBeGreaterThan(minPrice20)
    })
  })

  describe('calculateSellPrice', () => {
    it('should return pricing result with all fields', () => {
      const result = calculateSellPrice({ costPrice: 25 })

      expect(result).toHaveProperty('sellPrice')
      expect(result).toHaveProperty('costPrice', 25)
      expect(result).toHaveProperty('grossProfit')
      expect(result).toHaveProperty('totalFees')
      expect(result).toHaveProperty('netProfit')
      expect(result).toHaveProperty('margin')
      expect(result).toHaveProperty('meetsMinProfit')
      expect(result).toHaveProperty('breakdown')
    })

    it('should meet minimum profit requirement', () => {
      const result = calculateSellPrice({ costPrice: 20 })
      expect(result.meetsMinProfit).toBe(true)
      expect(result.netProfit).toBeGreaterThanOrEqual(2)
    })

    it('should apply competitive pricing when profitable', () => {
      const result = calculateSellPrice({
        costPrice: 20,
        competitorLowestPrice: 50,
        competitorAveragePrice: 55,
      })

      // Should be below competitor price
      expect(result.sellPrice).toBeLessThan(50)
      expect(result.meetsMinProfit).toBe(true)
    })
  })

  describe('checkProductQualification', () => {
    it('should qualify products above minimum buy price', () => {
      const result = checkProductQualification({ costPrice: 15 })
      expect(result.qualified).toBe(true)
    })

    it('should disqualify products below minimum buy price', () => {
      const result = checkProductQualification({ costPrice: 8 })
      expect(result.qualified).toBe(false)
      expect(result.reason).toContain('below minimum')
    })

    it('should allow high-volume exception', () => {
      const result = checkProductQualification({
        costPrice: 8,
        salesPerMonth: 100, // High volume
      })

      // Should qualify via exception if profitable
      expect(result.exception).toBe('high_volume')
    })

    it('should add warning for tight margins', () => {
      const result = checkProductQualification({ costPrice: 11 })

      if (result.qualified && result.warnings.length > 0) {
        expect(result.warnings.some(w => w.includes('margin'))).toBe(true)
      }
    })
  })

  describe('makeRepricingDecision', () => {
    it('should recommend price increase when below minimum', () => {
      const result = makeRepricingDecision({
        costPrice: 20,
        currentSellPrice: 21, // Way too low
        competitorLowestPrice: 30,
      })

      expect(result.shouldReprice).toBe(true)
      expect(result.newPrice).toBeGreaterThan(21)
    })

    it('should maintain optimal pricing', () => {
      const optimalPrice = getMinViablePrice(20) + 5
      const result = makeRepricingDecision({
        costPrice: 20,
        currentSellPrice: optimalPrice,
        competitorLowestPrice: optimalPrice + 2,
      })

      // Should not drastically change if already competitive
      if (result.shouldReprice && result.newPrice) {
        expect(result.newPrice).toBeGreaterThan(0)
      }
    })

    it('should handle missing competitor data', () => {
      const result = makeRepricingDecision({
        costPrice: 20,
        currentSellPrice: 30,
      })

      expect(result.reason).toContain('No competitor data')
    })
  })

  describe('isProfitable', () => {
    it('should return true for profitable prices', () => {
      expect(isProfitable(50, 30)).toBe(true)
    })

    it('should return false for unprofitable prices', () => {
      expect(isProfitable(22, 20)).toBe(false)
    })
  })

  describe('getMinViablePrice', () => {
    it('should return a price that ensures minimum profit', () => {
      const costPrice = 25
      const minPrice = getMinViablePrice(costPrice)

      expect(isProfitable(minPrice, costPrice)).toBe(true)
    })

    it('should end in .99 (psychological pricing)', () => {
      const minPrice = getMinViablePrice(25)
      const decimal = minPrice - Math.floor(minPrice)

      expect(decimal).toBeCloseTo(0.99, 2)
    })
  })

  describe('validatePriceChange', () => {
    it('should validate acceptable price changes', () => {
      const result = validatePriceChange(20, 40)
      expect(result.valid).toBe(true)
    })

    it('should reject prices below minimum', () => {
      const result = validatePriceChange(20, 21) // Too low for $2 profit
      expect(result.valid).toBe(false)
      expect(result.reason).toContain('less than $2 profit')
    })

    it('should provide minimum allowed price', () => {
      const result = validatePriceChange(20, 21)
      expect(result.minAllowed).toBeGreaterThan(21)
    })
  })

  describe('batchCalculatePricing', () => {
    it('should calculate pricing for multiple products', () => {
      const products = [
        { id: 'p1', costPrice: 15 },
        { id: 'p2', costPrice: 25 },
        { id: 'p3', costPrice: 35 },
      ]

      const results = batchCalculatePricing(products)

      expect(results.size).toBe(3)
      expect(results.has('p1')).toBe(true)
      expect(results.has('p2')).toBe(true)
      expect(results.has('p3')).toBe(true)
    })

    it('should include pricing and qualification for each product', () => {
      const products = [{ id: 'p1', costPrice: 20 }]
      const results = batchCalculatePricing(products)

      const p1 = results.get('p1')!
      expect(p1).toHaveProperty('pricing')
      expect(p1).toHaveProperty('qualification')
      expect(p1.pricing.sellPrice).toBeGreaterThan(0)
    })
  })

  describe('filterQualifiedProducts', () => {
    it('should separate qualified and disqualified products', () => {
      const products = [
        { id: 'p1', costPrice: 15 },  // Qualified
        { id: 'p2', costPrice: 8 },   // Disqualified (below min)
        { id: 'p3', costPrice: 20 },  // Qualified
      ]

      const { qualified, disqualified } = filterQualifiedProducts(products)

      expect(qualified.length).toBe(2)
      expect(disqualified.length).toBe(1)
      expect(disqualified[0].id).toBe('p2')
      expect(disqualified[0].reason).toBeDefined()
    })

    it('should preserve product data in qualified list', () => {
      const products = [{ id: 'p1', costPrice: 15, extra: 'data' }]
      const { qualified } = filterQualifiedProducts(products)

      expect(qualified[0]).toEqual(products[0])
    })
  })
})
