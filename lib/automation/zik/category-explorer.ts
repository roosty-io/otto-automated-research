/**
 * ZIK Analytics Category Explorer
 *
 * Explores eBay categories to find trending niches
 * and high-demand product areas.
 */

import type { Page } from 'puppeteer-core'
import { getBrowserPool } from '../browser'
import { ensureZikSession, ZIK_BASE_URL } from './auth'
import {
  navigateTo,
  waitForSelector,
  safeClick,
  sleep,
  getElements,
  takeScreenshot,
} from '../helpers'

// ZIK Category URLs
const ZIK_CATEGORIES_URL = `${ZIK_BASE_URL}/categories`
const ZIK_TRENDING_URL = `${ZIK_BASE_URL}/trending`

// Selectors
const SELECTORS = {
  // Category list
  categoryList: '.category-list, [class*="categories"], ul.categories',
  categoryItem: '.category-item, [class*="category-item"], li.category',
  categoryName: '.category-name, [class*="name"], a',
  categoryCount: '.category-count, [class*="count"], .product-count',
  categoryTrend: '.trend-indicator, [class*="trend"], .growth',

  // Subcategories
  subcategoryToggle: '.expand, .toggle, [class*="expand"]',
  subcategoryList: '.subcategories, [class*="subcategory"], ul.children',

  // Trending section
  trendingList: '.trending-categories, [class*="trending"]',
  trendingItem: '.trending-item, [class*="trending-item"]',
  trendGrowth: '.growth-rate, [class*="growth"]',

  // Stats
  avgPrice: '.avg-price, [class*="avg-price"]',
  avgSold: '.avg-sold, [class*="avg-sold"]',
  competition: '.competition, [class*="competition"]',
}

export interface ZikCategory {
  id: string
  name: string
  productCount: number | null
  avgPrice: number | null
  avgSold: number | null
  trendDirection: 'up' | 'down' | 'stable' | null
  trendPercentage: number | null
  competitionLevel: 'low' | 'medium' | 'high' | null
  subcategories: ZikCategory[]
  parentId: string | null
}

export interface ZikTrendingCategory {
  categoryId: string
  categoryName: string
  growthRate: number
  productCount: number
  avgPrice: number
  topProducts: string[]
}

export interface CategoryExplorerResult {
  success: boolean
  categories: ZikCategory[]
  trending: ZikTrendingCategory[]
  error?: string
}

/**
 * Get all eBay categories from ZIK
 */
export async function getCategories(
  options: {
    includeSubcategories?: boolean
    maxDepth?: number
  } = {}
): Promise<CategoryExplorerResult> {
  const { includeSubcategories = true, maxDepth = 2 } = options
  const pool = getBrowserPool()
  const { page } = await pool.getPage()

  try {
    console.log('[ZIK Categories] Loading categories...')

    // Ensure we're logged in
    const sessionOk = await ensureZikSession(page)
    if (!sessionOk) {
      return {
        success: false,
        categories: [],
        trending: [],
        error: 'Failed to authenticate with ZIK',
      }
    }

    // Navigate to categories page
    await navigateTo(page, ZIK_CATEGORIES_URL)
    await waitForSelector(page, SELECTORS.categoryList, { timeout: 15000 })
    await sleep(1000)

    // Scrape categories
    const categories = await scrapeCategories(page, includeSubcategories, maxDepth)

    // Also get trending categories
    const trending = await getTrendingCategories(page)

    console.log(`[ZIK Categories] Found ${categories.length} categories`)

    return {
      success: true,
      categories,
      trending,
    }
  } catch (error) {
    console.error('[ZIK Categories] Error:', error)
    await takeScreenshot(page, 'zik_categories_error')

    return {
      success: false,
      categories: [],
      trending: [],
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  } finally {
    await page.close()
  }
}

/**
 * Scrape categories from page
 */
async function scrapeCategories(
  page: Page,
  includeSubcategories: boolean,
  maxDepth: number,
  parentId: string | null = null,
  currentDepth: number = 0
): Promise<ZikCategory[]> {
  const categoryElements = await getElements(page, SELECTORS.categoryItem)
  const categories: ZikCategory[] = []

  for (const element of categoryElements) {
    try {
      const category = await extractCategory(element, parentId)

      // Get subcategories if requested
      if (includeSubcategories && currentDepth < maxDepth) {
        const expandBtn = await element.$(SELECTORS.subcategoryToggle)
        if (expandBtn) {
          await expandBtn.click()
          await sleep(500)

          const subcatContainer = await element.$(SELECTORS.subcategoryList)
          if (subcatContainer) {
            // Recursively get subcategories
            category.subcategories = await scrapeSubcategories(
              subcatContainer,
              category.id,
              currentDepth + 1,
              maxDepth
            )
          }
        }
      }

      categories.push(category)
    } catch (error) {
      console.warn('[ZIK Categories] Error extracting category:', error)
    }
  }

  return categories
}

/**
 * Extract category data from element
 */
async function extractCategory(
  element: any,
  parentId: string | null
): Promise<ZikCategory> {
  const getText = async (selector: string): Promise<string | null> => {
    try {
      const el = await element.$(selector)
      if (!el) return null
      return await el.evaluate((e: Element) => e.textContent?.trim() || null)
    } catch {
      return null
    }
  }

  const name = await getText(SELECTORS.categoryName) || 'Unknown'
  const countText = await getText(SELECTORS.categoryCount)
  const trendText = await getText(SELECTORS.categoryTrend)
  const avgPriceText = await getText(SELECTORS.avgPrice)
  const avgSoldText = await getText(SELECTORS.avgSold)
  const competitionText = await getText(SELECTORS.competition)

  // Generate ID from name
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  // Parse trend
  let trendDirection: ZikCategory['trendDirection'] = null
  let trendPercentage: number | null = null
  if (trendText) {
    if (trendText.includes('+') || trendText.includes('↑')) {
      trendDirection = 'up'
    } else if (trendText.includes('-') || trendText.includes('↓')) {
      trendDirection = 'down'
    } else {
      trendDirection = 'stable'
    }
    const percentMatch = trendText.match(/(\d+(?:\.\d+)?)\s*%/)
    trendPercentage = percentMatch ? parseFloat(percentMatch[1]) : null
  }

  // Parse competition level
  let competitionLevel: ZikCategory['competitionLevel'] = null
  if (competitionText) {
    const lower = competitionText.toLowerCase()
    if (lower.includes('low')) competitionLevel = 'low'
    else if (lower.includes('high')) competitionLevel = 'high'
    else competitionLevel = 'medium'
  }

  return {
    id,
    name,
    productCount: countText ? parseInt(countText.replace(/[^\d]/g, ''), 10) || null : null,
    avgPrice: avgPriceText ? parseFloat(avgPriceText.replace(/[^0-9.]/g, '')) || null : null,
    avgSold: avgSoldText ? parseInt(avgSoldText.replace(/[^\d]/g, ''), 10) || null : null,
    trendDirection,
    trendPercentage,
    competitionLevel,
    subcategories: [],
    parentId,
  }
}

/**
 * Scrape subcategories from container
 */
async function scrapeSubcategories(
  container: any,
  parentId: string,
  currentDepth: number,
  maxDepth: number
): Promise<ZikCategory[]> {
  const items = await container.$$('li, .subcategory-item')
  const subcategories: ZikCategory[] = []

  for (const item of items) {
    try {
      const subcat = await extractCategory(item, parentId)
      subcategories.push(subcat)
    } catch (error) {
      console.warn('[ZIK Categories] Error extracting subcategory:', error)
    }
  }

  return subcategories
}

/**
 * Get trending categories
 */
async function getTrendingCategories(page: Page): Promise<ZikTrendingCategory[]> {
  try {
    // Try to find trending section on current page
    let trendingContainer = await page.$(SELECTORS.trendingList)

    if (!trendingContainer) {
      // Navigate to trending page
      await navigateTo(page, ZIK_TRENDING_URL)
      await sleep(1000)
      trendingContainer = await page.$(SELECTORS.trendingList)
    }

    if (!trendingContainer) {
      return []
    }

    const trendingItems = await trendingContainer.$$(SELECTORS.trendingItem)
    const trending: ZikTrendingCategory[] = []

    for (const item of trendingItems) {
      try {
        const name = await item.$eval(
          SELECTORS.categoryName,
          (el: Element) => el.textContent?.trim() || ''
        ).catch(() => '')

        const growthText = await item.$eval(
          SELECTORS.trendGrowth,
          (el: Element) => el.textContent?.trim() || ''
        ).catch(() => '')

        const countText = await item.$eval(
          SELECTORS.categoryCount,
          (el: Element) => el.textContent?.trim() || ''
        ).catch(() => '')

        const priceText = await item.$eval(
          SELECTORS.avgPrice,
          (el: Element) => el.textContent?.trim() || ''
        ).catch(() => '')

        if (name) {
          trending.push({
            categoryId: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            categoryName: name,
            growthRate: parseFloat(growthText.replace(/[^0-9.-]/g, '')) || 0,
            productCount: parseInt(countText.replace(/[^\d]/g, ''), 10) || 0,
            avgPrice: parseFloat(priceText.replace(/[^0-9.]/g, '')) || 0,
            topProducts: [], // Would need additional scraping
          })
        }
      } catch (error) {
        console.warn('[ZIK Categories] Error extracting trending item:', error)
      }
    }

    return trending
  } catch (error) {
    console.warn('[ZIK Categories] Error getting trending categories:', error)
    return []
  }
}

/**
 * Find profitable niches based on criteria
 */
export async function findProfitableNiches(
  criteria: {
    minGrowth?: number
    maxCompetition?: 'low' | 'medium' | 'high'
    minAvgPrice?: number
    maxAvgPrice?: number
    minProductCount?: number
  } = {}
): Promise<ZikCategory[]> {
  const result = await getCategories({ includeSubcategories: true, maxDepth: 2 })

  if (!result.success) {
    return []
  }

  const flatCategories = flattenCategories(result.categories)

  return flatCategories.filter((cat) => {
    if (criteria.minGrowth && (cat.trendPercentage || 0) < criteria.minGrowth) {
      return false
    }

    if (criteria.maxCompetition) {
      const competitionOrder = { low: 1, medium: 2, high: 3 }
      const catLevel = competitionOrder[cat.competitionLevel || 'high']
      const maxLevel = competitionOrder[criteria.maxCompetition]
      if (catLevel > maxLevel) return false
    }

    if (criteria.minAvgPrice && (cat.avgPrice || 0) < criteria.minAvgPrice) {
      return false
    }

    if (criteria.maxAvgPrice && (cat.avgPrice || Infinity) > criteria.maxAvgPrice) {
      return false
    }

    if (criteria.minProductCount && (cat.productCount || 0) < criteria.minProductCount) {
      return false
    }

    return true
  })
}

/**
 * Flatten nested categories into a single array
 */
function flattenCategories(categories: ZikCategory[]): ZikCategory[] {
  const result: ZikCategory[] = []

  for (const cat of categories) {
    result.push(cat)
    if (cat.subcategories.length > 0) {
      result.push(...flattenCategories(cat.subcategories))
    }
  }

  return result
}
