// Browser pool management
export {
  getBrowserPool,
  withBrowser,
  withPage,
  BrowserPool,
  type BrowserPoolConfig,
} from './browser'

// Session management
export {
  getSessionManager,
  sessionManager,
  serializeCookies,
  deserializeCookies,
  areCookiesExpired,
  type StoredSession,
} from './session'

// Proxy rotation
export {
  getProxyPool,
  initProxyPool,
  parseProxyString,
  loadProxiesFromEnv,
  setupProxyAuth,
  ProxyPool,
  type ProxyConfig,
  type ProxyPoolConfig,
} from './proxy'

// Page helpers
export {
  waitForSelector,
  waitForAnySelector,
  waitForText,
  waitForUrl,
  safeClick,
  safeType,
  safeSelect,
  getText,
  getAttribute,
  getValue,
  elementExists,
  isVisible,
  takeScreenshot,
  navigateTo,
  sleep,
  randomDelay,
  scrollToBottom,
  scrollIntoView,
  getElements,
  extractFromElements,
  retry,
  blockResources,
  evaluate,
} from './helpers'
