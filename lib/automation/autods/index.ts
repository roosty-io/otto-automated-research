/**
 * AutoDS Automation Module
 *
 * Complete integration with AutoDS for eBay dropshipping:
 * - Authentication and session management
 * - Product upload to eBay
 * - Draft management
 * - Active listing management
 * - Sales data sync
 */

// Authentication
export {
  type AutoDSCredentials,
  type AutoDSSession,
  type LoginResult,
  loginToAutoDS,
  getAutoDBSession,
  applySessionToPage,
  verifySession,
  refreshSession,
  invalidateAllSessions,
  getSessionStatus,
  AUTODS_URLS,
} from './auth'

// Navigation
export {
  type AutoDSStore,
  type NavigationResult,
  getAuthenticatedPage,
  navigateToDashboard,
  navigateToProducts,
  navigateToDrafts,
  navigateToOrders,
  getConnectedStores,
  selectStore,
  clickAddProduct,
  goToNextPage,
  getCurrentPage,
  waitForPageLoad,
  isOnLoginPage,
  takeDebugScreenshot,
} from './navigation'

// Product Upload
export {
  type ProductUploadData,
  type UploadResult,
  type BulkUploadResult,
  uploadProduct,
  uploadProductsBulk,
  uploadFromSKU,
} from './upload'

// Draft Management
export {
  type AutoDSDraft,
  type DraftListResult,
  type PublishResult,
  type BulkPublishResult,
  getDrafts,
  publishDraft,
  publishDraftsBulk,
  deleteDraft,
  editDraft,
} from './drafts'

// Listing Management
export {
  type AutoDSListing,
  type ListingsResult,
  type UpdateResult,
  getListings,
  updateListingPrice,
  updateListingQuantity,
  endListing,
  syncListingsToDatabase,
  bulkUpdatePrices,
  getListingCounts,
} from './listings'

// Sales Data
export {
  type AutoDSOrder,
  type SalesSyncResult,
  type SalesAnalytics,
  syncSalesData,
  getSalesAnalytics,
  getRecentOrders,
  getTopSellingProducts,
  getSalesByDateRange,
} from './sales'
