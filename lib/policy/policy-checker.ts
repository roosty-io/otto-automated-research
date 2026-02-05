// Main Policy Checker - Combines all policy checks
// This is the primary interface for validating products before listing

import { checkForVeroBrands, VERO_BRANDS } from './vero-brands'
import { checkForBlacklistedWords, WORD_BLACKLIST } from './word-blacklist'
import { checkForRestrictedCategories, RESTRICTED_CATEGORIES } from './category-restrictions'

export interface PolicyFlag {
  type: 'vero_brand' | 'blacklisted_word' | 'restricted_category' | 'title_format' | 'price_issue'
  severity: 'block' | 'warn' | 'review'
  field: 'title' | 'description' | 'category' | 'price' | 'general'
  message: string
  matched: string
  details?: string
}

export interface PolicyCheckResult {
  passed: boolean
  score: number  // 0-100, higher is better
  decision: 'approved' | 'blocked' | 'review_required'
  flags: PolicyFlag[]
  summary: {
    blockers: number
    warnings: number
    reviews: number
  }
  recommendations: string[]
}

export interface PolicyCheckInput {
  title: string
  description?: string
  category?: string
  bulletPoints?: string[]
  costPrice?: number
  sellPrice?: number
}

// Title format checks
function checkTitleFormat(title: string): PolicyFlag[] {
  const flags: PolicyFlag[] = []

  // Check for ALL CAPS
  const capsRatio = (title.match(/[A-Z]/g) || []).length / title.replace(/[^a-zA-Z]/g, '').length
  if (capsRatio > 0.6 && title.length > 10) {
    flags.push({
      type: 'title_format',
      severity: 'warn',
      field: 'title',
      message: 'Title has excessive capitalization',
      matched: title,
      details: 'eBay penalizes ALL CAPS titles. Use title case instead.',
    })
  }

  // Check for excessive punctuation
  const excessivePunctuation = /[!?]{2,}|[*]{2,}|[.]{3,}/
  if (excessivePunctuation.test(title)) {
    flags.push({
      type: 'title_format',
      severity: 'warn',
      field: 'title',
      message: 'Title has excessive punctuation',
      matched: title.match(excessivePunctuation)?.[0] || '',
      details: 'Avoid multiple exclamation marks or special characters.',
    })
  }

  // Check for special character spam
  if (/[@#$%^&*]{2,}/.test(title)) {
    flags.push({
      type: 'title_format',
      severity: 'block',
      field: 'title',
      message: 'Title contains special character spam',
      matched: title,
      details: 'Special character combinations are prohibited.',
    })
  }

  // Check title length
  if (title.length > 80) {
    flags.push({
      type: 'title_format',
      severity: 'review',
      field: 'title',
      message: 'Title may be too long',
      matched: `${title.length} characters`,
      details: 'eBay title limit is 80 characters. Consider shortening.',
    })
  }

  if (title.length < 20) {
    flags.push({
      type: 'title_format',
      severity: 'review',
      field: 'title',
      message: 'Title may be too short',
      matched: `${title.length} characters`,
      details: 'Short titles may hurt visibility. Add relevant keywords.',
    })
  }

  return flags
}

// Price validation
function checkPricing(costPrice?: number, sellPrice?: number): PolicyFlag[] {
  const flags: PolicyFlag[] = []

  if (costPrice !== undefined && sellPrice !== undefined) {
    const margin = ((sellPrice - costPrice) / sellPrice) * 100

    if (margin < 15) {
      flags.push({
        type: 'price_issue',
        severity: 'warn',
        field: 'price',
        message: 'Profit margin too low',
        matched: `${margin.toFixed(1)}% margin`,
        details: 'After eBay fees (~13%), you may lose money. Recommend 25%+ margin.',
      })
    }

    if (sellPrice < 10) {
      flags.push({
        type: 'price_issue',
        severity: 'review',
        field: 'price',
        message: 'Low price point',
        matched: `$${sellPrice.toFixed(2)}`,
        details: 'Items under $10 often have thin margins after fees.',
      })
    }

    if (sellPrice > 500) {
      flags.push({
        type: 'price_issue',
        severity: 'review',
        field: 'price',
        message: 'High price point',
        matched: `$${sellPrice.toFixed(2)}`,
        details: 'High-priced items may have slower turnover.',
      })
    }

    // Check for price gouging (selling at 5x+ cost)
    if (sellPrice > costPrice * 5) {
      flags.push({
        type: 'price_issue',
        severity: 'warn',
        field: 'price',
        message: 'Potentially excessive markup',
        matched: `${(sellPrice / costPrice).toFixed(1)}x markup`,
        details: 'Extreme markups may trigger price gouging reviews.',
      })
    }
  }

  return flags
}

// Main policy check function
export function checkPolicy(input: PolicyCheckInput): PolicyCheckResult {
  const flags: PolicyFlag[] = []

  // Combine all text for comprehensive checking
  const allText = [
    input.title,
    input.description || '',
    input.category || '',
    ...(input.bulletPoints || []),
  ].join(' ')

  // 1. Check for VeRO brands
  const veroResult = checkForVeroBrands(allText)
  for (const match of veroResult.matches) {
    flags.push({
      type: 'vero_brand',
      severity: match.severity,
      field: 'general',
      message: `VeRO brand detected: ${match.brand}`,
      matched: match.brand,
      details: `${match.brand} is a protected brand in the ${match.category} category. Listing may be removed.`,
    })
  }

  // 2. Check for blacklisted words
  const wordResult = checkForBlacklistedWords(allText)
  for (const match of wordResult.matches) {
    flags.push({
      type: 'blacklisted_word',
      severity: match.severity,
      field: 'general',
      message: `Blacklisted term: "${match.word}"`,
      matched: match.word,
      details: match.reason,
    })
  }

  // 3. Check for restricted categories
  const categoryResult = checkForRestrictedCategories(allText)
  for (const match of categoryResult.matches) {
    flags.push({
      type: 'restricted_category',
      severity: match.status === 'prohibited' ? 'block' : match.status === 'restricted' ? 'warn' : 'review',
      field: 'category',
      message: `Restricted category: ${match.category}`,
      matched: match.category,
      details: match.reason,
    })
  }

  // 4. Check title format
  flags.push(...checkTitleFormat(input.title))

  // 5. Check pricing
  flags.push(...checkPricing(input.costPrice, input.sellPrice))

  // Calculate summary
  const summary = {
    blockers: flags.filter(f => f.severity === 'block').length,
    warnings: flags.filter(f => f.severity === 'warn').length,
    reviews: flags.filter(f => f.severity === 'review').length,
  }

  // Determine decision
  let decision: 'approved' | 'blocked' | 'review_required'
  if (summary.blockers > 0) {
    decision = 'blocked'
  } else if (summary.warnings > 2 || summary.reviews > 3) {
    decision = 'review_required'
  } else {
    decision = 'approved'
  }

  // Calculate score (100 = perfect, 0 = terrible)
  let score = 100
  score -= summary.blockers * 50  // Each blocker is -50
  score -= summary.warnings * 15  // Each warning is -15
  score -= summary.reviews * 5    // Each review flag is -5
  score = Math.max(0, Math.min(100, score))

  // Generate recommendations
  const recommendations: string[] = []

  if (summary.blockers > 0) {
    recommendations.push('Remove all blocked content before listing')
  }

  const brandFlags = flags.filter(f => f.type === 'vero_brand')
  if (brandFlags.length > 0) {
    recommendations.push(`Remove brand references: ${brandFlags.map(f => f.matched).join(', ')}`)
  }

  const wordFlags = flags.filter(f => f.type === 'blacklisted_word' && f.severity === 'block')
  if (wordFlags.length > 0) {
    recommendations.push(`Remove prohibited terms: ${wordFlags.map(f => f.matched).join(', ')}`)
  }

  if (flags.some(f => f.type === 'title_format' && f.message.includes('capitalization'))) {
    recommendations.push('Convert title to proper title case')
  }

  if (flags.some(f => f.type === 'price_issue' && f.message.includes('margin'))) {
    recommendations.push('Increase sell price to improve profit margin')
  }

  return {
    passed: decision === 'approved',
    score,
    decision,
    flags,
    summary,
    recommendations,
  }
}

// Quick check - returns just pass/fail for bulk processing
export function quickPolicyCheck(title: string, description?: string): boolean {
  const result = checkPolicy({ title, description })
  return result.passed
}

// Get policy check stats for reporting
export function getPolicyStats() {
  return {
    totalVeroBrands: Object.keys(VERO_BRANDS).length,
    totalBlacklistedWords: Object.keys(WORD_BLACKLIST).length,
    totalRestrictedCategories: Object.keys(RESTRICTED_CATEGORIES).length,
  }
}
