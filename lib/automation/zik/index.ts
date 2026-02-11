// ZIK Analytics Authentication
export {
  loginToZik,
  logoutFromZik,
  hasValidZikSession,
  restoreZikSession,
  ensureZikSession,
  ZIK_BASE_URL,
  ZIK_LOGIN_URL,
  ZIK_DASHBOARD_URL,
  type ZikAuthResult,
  type ZikCredentials,
} from './auth'

// Product Research
export {
  searchZikProducts,
  getTrendingProducts,
  analyzeSeller,
  type ZikSearchFilters,
  type ZikProductResult,
  type ZikSearchResult,
} from './product-research'

// Category Explorer
export {
  getCategories,
  findProfitableNiches,
  type ZikCategory,
  type ZikTrendingCategory,
  type CategoryExplorerResult,
} from './category-explorer'
