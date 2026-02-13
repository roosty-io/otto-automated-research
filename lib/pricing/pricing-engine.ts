/**
 * Pricing Engine
 *
 * Simple, clear pricing rules:
 * 1. Minimum profit after all fees: $2
 * 2. Minimum buy price: $11 (AutoDS returns limitation)
 * 3. High-volume exception: Products <$11 with 50+/month sales and $2+ margin qualify
 *
 * AutoDS handles price and stock monitoring - we focus on initial pricing
 * and repricing decisions only.
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface PricingConfig {
  // Minimum profit after all fees and expenses
  minProfitDollars: number;

  // Minimum buy price (AutoDS returns limitation)
  minBuyPrice: number;

  // High-volume exception threshold
  highVolumeMinSalesPerMonth: number;

  // Fee structure
  fees: {
    ebayFinalValue: number;      // 13% typical
    ebayPaymentProcessing: number; // 2.9% + $0.30
    autodsServiceFee: number;     // Per-order fee if any
  };

  // Default markup targets (before minimum profit check)
  defaultMarkupPercent: number;

  // Rounding
  roundTo: number; // e.g., 0.99 for psychological pricing
}

// Default configuration
export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  minProfitDollars: 2.00,
  minBuyPrice: 11.00,
  highVolumeMinSalesPerMonth: 50,

  fees: {
    ebayFinalValue: 0.13,          // 13%
    ebayPaymentProcessing: 0.029,  // 2.9%
    autodsServiceFee: 0,           // Included in subscription
  },

  defaultMarkupPercent: 0.35,      // 35% default markup
  roundTo: 0.99,
};

// Payment processing fixed fee
const PAYMENT_FIXED_FEE = 0.30; // $0.30 per transaction

// =============================================================================
// TYPES
// =============================================================================

export interface PricingInput {
  costPrice: number;           // What we pay (Amazon/supplier price)
  salesPerMonth?: number;      // Historical sales volume
  competitorLowestPrice?: number;
  competitorAveragePrice?: number;
  currentSellPrice?: number;   // For repricing scenarios
  category?: string;           // For category-specific fees
}

export interface PricingResult {
  sellPrice: number;
  costPrice: number;
  grossProfit: number;
  totalFees: number;
  netProfit: number;
  margin: number;              // As decimal (0.25 = 25%)
  meetsMinProfit: boolean;
  breakdown: {
    ebayFinalValueFee: number;
    paymentProcessingFee: number;
    otherFees: number;
  };
}

export interface QualificationResult {
  qualified: boolean;
  reason?: string;
  exception?: 'high_volume';
  warnings: string[];
}

export interface RepricingDecision {
  shouldReprice: boolean;
  newPrice?: number;
  reason: string;
  currentProfit: number;
  newProfit?: number;
}

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Calculate all fees for a given sell price
 */
export function calculateFees(
  sellPrice: number,
  config: PricingConfig = DEFAULT_PRICING_CONFIG
): { total: number; breakdown: PricingResult['breakdown'] } {
  const ebayFinalValueFee = sellPrice * config.fees.ebayFinalValue;
  const paymentProcessingFee = (sellPrice * config.fees.ebayPaymentProcessing) + PAYMENT_FIXED_FEE;
  const otherFees = config.fees.autodsServiceFee;

  return {
    total: ebayFinalValueFee + paymentProcessingFee + otherFees,
    breakdown: {
      ebayFinalValueFee,
      paymentProcessingFee,
      otherFees,
    },
  };
}

/**
 * Calculate net profit for a given sell price and cost
 */
export function calculateNetProfit(
  sellPrice: number,
  costPrice: number,
  config: PricingConfig = DEFAULT_PRICING_CONFIG
): number {
  const { total: fees } = calculateFees(sellPrice, config);
  return sellPrice - costPrice - fees;
}

/**
 * Calculate minimum sell price to achieve target profit
 */
export function calculateMinSellPrice(
  costPrice: number,
  targetProfit: number = DEFAULT_PRICING_CONFIG.minProfitDollars,
  config: PricingConfig = DEFAULT_PRICING_CONFIG
): number {
  // Solve for sellPrice:
  // netProfit = sellPrice - costPrice - fees
  // targetProfit = sellPrice - costPrice - (sellPrice * feeRate + fixedFee)
  // targetProfit = sellPrice * (1 - feeRate) - costPrice - fixedFee
  // sellPrice = (targetProfit + costPrice + fixedFee) / (1 - feeRate)

  const feeRate = config.fees.ebayFinalValue + config.fees.ebayPaymentProcessing;
  const fixedFee = PAYMENT_FIXED_FEE + config.fees.autodsServiceFee;

  const minPrice = (targetProfit + costPrice + fixedFee) / (1 - feeRate);

  return minPrice;
}

/**
 * Calculate optimal sell price
 */
export function calculateSellPrice(
  input: PricingInput,
  config: PricingConfig = DEFAULT_PRICING_CONFIG
): PricingResult {
  const { costPrice } = input;

  // Start with default markup
  let targetPrice = costPrice * (1 + config.defaultMarkupPercent);

  // Calculate minimum price for $2 profit
  const minPriceForProfit = calculateMinSellPrice(costPrice, config.minProfitDollars, config);

  // Use whichever is higher
  let sellPrice = Math.max(targetPrice, minPriceForProfit);

  // Consider competitor pricing if available
  if (input.competitorLowestPrice && input.competitorAveragePrice) {
    // Try to be competitive but maintain minimum profit
    const competitivePrice = input.competitorLowestPrice * 0.98; // 2% below lowest

    if (competitivePrice >= minPriceForProfit) {
      sellPrice = competitivePrice;
    }
    // Otherwise stick with minimum profitable price
  }

  // Round to psychological pricing (X.99)
  sellPrice = roundToNearest(sellPrice, config.roundTo);

  // Ensure minimum profit after rounding
  const netProfit = calculateNetProfit(sellPrice, costPrice, config);
  if (netProfit < config.minProfitDollars) {
    // Bump up to next dollar
    sellPrice = Math.ceil(sellPrice) + config.roundTo - 1;
  }

  // Calculate final metrics
  const { total: totalFees, breakdown } = calculateFees(sellPrice, config);
  const grossProfit = sellPrice - costPrice;
  const finalNetProfit = sellPrice - costPrice - totalFees;
  const margin = grossProfit / sellPrice;

  return {
    sellPrice,
    costPrice,
    grossProfit,
    totalFees,
    netProfit: finalNetProfit,
    margin,
    meetsMinProfit: finalNetProfit >= config.minProfitDollars,
    breakdown,
  };
}

/**
 * Check if a product qualifies based on buy price rules
 */
export function checkProductQualification(
  input: PricingInput,
  config: PricingConfig = DEFAULT_PRICING_CONFIG
): QualificationResult {
  const warnings: string[] = [];
  const { costPrice, salesPerMonth } = input;

  // Rule 1: Minimum buy price of $11
  if (costPrice < config.minBuyPrice) {
    // Check for high-volume exception
    if (salesPerMonth && salesPerMonth >= config.highVolumeMinSalesPerMonth) {
      // Check if still profitable
      const pricing = calculateSellPrice(input, config);

      if (pricing.meetsMinProfit) {
        warnings.push(
          `Product below $${config.minBuyPrice} minimum but qualifies via high-volume exception ` +
          `(${salesPerMonth} sales/month, $${pricing.netProfit.toFixed(2)} profit)`
        );

        return {
          qualified: true,
          exception: 'high_volume',
          warnings,
        };
      } else {
        return {
          qualified: false,
          reason: `High volume (${salesPerMonth}/month) but insufficient margin ($${pricing.netProfit.toFixed(2)} profit)`,
          warnings,
        };
      }
    }

    return {
      qualified: false,
      reason: `Buy price $${costPrice.toFixed(2)} is below minimum $${config.minBuyPrice} (AutoDS returns limitation)`,
      warnings,
    };
  }

  // Rule 2: Must achieve minimum profit
  const pricing = calculateSellPrice(input, config);

  if (!pricing.meetsMinProfit) {
    return {
      qualified: false,
      reason: `Cannot achieve minimum $${config.minProfitDollars} profit (best: $${pricing.netProfit.toFixed(2)})`,
      warnings,
    };
  }

  // Check for tight margins
  if (pricing.netProfit < config.minProfitDollars * 1.5) {
    warnings.push(`Tight margin: only $${pricing.netProfit.toFixed(2)} profit`);
  }

  return {
    qualified: true,
    warnings,
  };
}

/**
 * Make a repricing decision
 */
export function makeRepricingDecision(
  input: PricingInput & { currentSellPrice: number },
  config: PricingConfig = DEFAULT_PRICING_CONFIG
): RepricingDecision {
  const { costPrice, currentSellPrice, competitorLowestPrice, competitorAveragePrice } = input;

  // Calculate current profit
  const currentProfit = calculateNetProfit(currentSellPrice, costPrice, config);

  // Calculate minimum price
  const minPrice = calculateMinSellPrice(costPrice, config.minProfitDollars, config);

  // If current price is below minimum, must increase
  if (currentSellPrice < minPrice) {
    const newPrice = roundToNearest(minPrice, config.roundTo);
    const newProfit = calculateNetProfit(newPrice, costPrice, config);

    return {
      shouldReprice: true,
      newPrice,
      reason: `Price below minimum profit threshold. Raising to $${newPrice.toFixed(2)}`,
      currentProfit,
      newProfit,
    };
  }

  // If no competitor data, maintain current price
  if (!competitorLowestPrice) {
    return {
      shouldReprice: false,
      reason: 'No competitor data available',
      currentProfit,
    };
  }

  // Competitive repricing logic
  const targetCompetitivePrice = competitorLowestPrice * 0.98; // 2% below lowest

  // Can we be competitive while maintaining minimum profit?
  if (targetCompetitivePrice >= minPrice) {
    // We're currently priced too high
    if (currentSellPrice > competitorLowestPrice * 1.05) {
      const newPrice = roundToNearest(targetCompetitivePrice, config.roundTo);
      const newProfit = calculateNetProfit(newPrice, costPrice, config);

      return {
        shouldReprice: true,
        newPrice,
        reason: `Lowering price to be competitive (was $${currentSellPrice.toFixed(2)}, competitors at $${competitorLowestPrice.toFixed(2)})`,
        currentProfit,
        newProfit,
      };
    }
  }

  // We're the lowest and making good profit - consider raising
  if (currentSellPrice < competitorLowestPrice && currentProfit > config.minProfitDollars * 2) {
    // Room to raise price
    const newPrice = roundToNearest(
      Math.min(currentSellPrice * 1.05, competitorLowestPrice * 0.98),
      config.roundTo
    );
    const newProfit = calculateNetProfit(newPrice, costPrice, config);

    if (newProfit >= config.minProfitDollars) {
      return {
        shouldReprice: true,
        newPrice,
        reason: `Raising price - we're lowest with good margin`,
        currentProfit,
        newProfit,
      };
    }
  }

  return {
    shouldReprice: false,
    reason: 'Current pricing is optimal',
    currentProfit,
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Round price to psychological pricing (X.99)
 */
function roundToNearest(price: number, target: number): number {
  const wholePart = Math.floor(price);
  const decimal = target;
  return wholePart + decimal;
}

/**
 * Quick profit check - returns true if profitable
 */
export function isProfitable(
  sellPrice: number,
  costPrice: number,
  config: PricingConfig = DEFAULT_PRICING_CONFIG
): boolean {
  return calculateNetProfit(sellPrice, costPrice, config) >= config.minProfitDollars;
}

/**
 * Get minimum viable sell price for a cost
 */
export function getMinViablePrice(
  costPrice: number,
  config: PricingConfig = DEFAULT_PRICING_CONFIG
): number {
  const minPrice = calculateMinSellPrice(costPrice, config.minProfitDollars, config);
  return roundToNearest(minPrice, config.roundTo);
}

/**
 * Calculate fee percentage for reporting
 */
export function getTotalFeePercentage(config: PricingConfig = DEFAULT_PRICING_CONFIG): number {
  return config.fees.ebayFinalValue + config.fees.ebayPaymentProcessing;
}

/**
 * Validate a proposed price change
 */
export function validatePriceChange(
  costPrice: number,
  proposedPrice: number,
  config: PricingConfig = DEFAULT_PRICING_CONFIG
): { valid: boolean; reason?: string; minAllowed: number } {
  const minPrice = calculateMinSellPrice(costPrice, config.minProfitDollars, config);

  if (proposedPrice < minPrice) {
    return {
      valid: false,
      reason: `Price $${proposedPrice.toFixed(2)} would result in less than $${config.minProfitDollars} profit`,
      minAllowed: roundToNearest(minPrice, config.roundTo),
    };
  }

  return {
    valid: true,
    minAllowed: roundToNearest(minPrice, config.roundTo),
  };
}

// =============================================================================
// BATCH OPERATIONS
// =============================================================================

/**
 * Price multiple products efficiently
 */
export function batchCalculatePricing(
  products: Array<{ id: string; costPrice: number; salesPerMonth?: number }>,
  config: PricingConfig = DEFAULT_PRICING_CONFIG
): Map<string, { pricing: PricingResult; qualification: QualificationResult }> {
  const results = new Map();

  for (const product of products) {
    const input: PricingInput = {
      costPrice: product.costPrice,
      salesPerMonth: product.salesPerMonth,
    };

    const qualification = checkProductQualification(input, config);
    const pricing = calculateSellPrice(input, config);

    results.set(product.id, { pricing, qualification });
  }

  return results;
}

/**
 * Filter products that meet pricing criteria
 */
export function filterQualifiedProducts<T extends { costPrice: number; salesPerMonth?: number }>(
  products: T[],
  config: PricingConfig = DEFAULT_PRICING_CONFIG
): { qualified: T[]; disqualified: Array<T & { reason: string }> } {
  const qualified: T[] = [];
  const disqualified: Array<T & { reason: string }> = [];

  for (const product of products) {
    const result = checkProductQualification(
      { costPrice: product.costPrice, salesPerMonth: product.salesPerMonth },
      config
    );

    if (result.qualified) {
      qualified.push(product);
    } else {
      disqualified.push({ ...product, reason: result.reason || 'Unknown' });
    }
  }

  return { qualified, disqualified };
}
