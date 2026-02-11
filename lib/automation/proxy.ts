import type { Page } from 'puppeteer-core'

// Proxy configuration
export interface ProxyConfig {
  host: string
  port: number
  username?: string
  password?: string
  protocol?: 'http' | 'https' | 'socks4' | 'socks5'
}

export interface ProxyPoolConfig {
  proxies: ProxyConfig[]
  rotationStrategy: 'round-robin' | 'random' | 'least-used'
  maxFailuresBeforeRemoval: number
  healthCheckUrl?: string
  healthCheckIntervalMs?: number
}

interface ProxyStats {
  proxy: ProxyConfig
  uses: number
  failures: number
  lastUsed: number
  lastFailure: number | null
  avgResponseTime: number
  isHealthy: boolean
}

const DEFAULT_POOL_CONFIG: Partial<ProxyPoolConfig> = {
  rotationStrategy: 'round-robin',
  maxFailuresBeforeRemoval: 3,
  healthCheckUrl: 'https://httpbin.org/ip',
  healthCheckIntervalMs: 5 * 60 * 1000, // 5 minutes
}

class ProxyPool {
  private proxyStats: Map<string, ProxyStats> = new Map()
  private config: ProxyPoolConfig
  private currentIndex = 0
  private healthCheckInterval: NodeJS.Timeout | null = null

  constructor(config: ProxyPoolConfig) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config } as ProxyPoolConfig
    this.initializeStats()
  }

  private initializeStats() {
    for (const proxy of this.config.proxies) {
      const key = this.getProxyKey(proxy)
      this.proxyStats.set(key, {
        proxy,
        uses: 0,
        failures: 0,
        lastUsed: 0,
        lastFailure: null,
        avgResponseTime: 0,
        isHealthy: true,
      })
    }
  }

  private getProxyKey(proxy: ProxyConfig): string {
    return `${proxy.protocol || 'http'}://${proxy.host}:${proxy.port}`
  }

  // Get proxy string for browser launch args
  getProxyString(proxy: ProxyConfig): string {
    const protocol = proxy.protocol || 'http'
    return `${protocol}://${proxy.host}:${proxy.port}`
  }

  // Get next proxy based on rotation strategy
  getNextProxy(): ProxyConfig | null {
    const healthyProxies = Array.from(this.proxyStats.values()).filter(
      (stats) => stats.isHealthy
    )

    if (healthyProxies.length === 0) {
      console.warn('[ProxyPool] No healthy proxies available')
      return null
    }

    let selected: ProxyStats

    switch (this.config.rotationStrategy) {
      case 'random':
        selected = healthyProxies[Math.floor(Math.random() * healthyProxies.length)]
        break

      case 'least-used':
        selected = healthyProxies.reduce((prev, curr) =>
          curr.uses < prev.uses ? curr : prev
        )
        break

      case 'round-robin':
      default:
        // Find next healthy proxy in rotation
        let attempts = 0
        while (attempts < this.config.proxies.length) {
          const proxy = this.config.proxies[this.currentIndex]
          this.currentIndex = (this.currentIndex + 1) % this.config.proxies.length
          const stats = this.proxyStats.get(this.getProxyKey(proxy))
          if (stats?.isHealthy) {
            selected = stats
            break
          }
          attempts++
        }
        selected = selected! || healthyProxies[0]
        break
    }

    // Update stats
    selected.uses++
    selected.lastUsed = Date.now()

    return selected.proxy
  }

  // Report proxy success
  reportSuccess(proxy: ProxyConfig, responseTimeMs: number) {
    const key = this.getProxyKey(proxy)
    const stats = this.proxyStats.get(key)
    if (stats) {
      // Update average response time
      const totalTime = stats.avgResponseTime * (stats.uses - 1) + responseTimeMs
      stats.avgResponseTime = totalTime / stats.uses
      stats.isHealthy = true
    }
  }

  // Report proxy failure
  reportFailure(proxy: ProxyConfig, error?: Error) {
    const key = this.getProxyKey(proxy)
    const stats = this.proxyStats.get(key)
    if (stats) {
      stats.failures++
      stats.lastFailure = Date.now()

      console.warn(
        `[ProxyPool] Proxy failure (${stats.failures}/${this.config.maxFailuresBeforeRemoval}):`,
        key,
        error?.message
      )

      // Mark as unhealthy if too many failures
      if (stats.failures >= this.config.maxFailuresBeforeRemoval) {
        stats.isHealthy = false
        console.warn(`[ProxyPool] Proxy marked unhealthy:`, key)
      }
    }
  }

  // Reset proxy failure count (e.g., after successful health check)
  resetFailures(proxy: ProxyConfig) {
    const key = this.getProxyKey(proxy)
    const stats = this.proxyStats.get(key)
    if (stats) {
      stats.failures = 0
      stats.isHealthy = true
    }
  }

  // Get pool statistics
  getStats(): {
    total: number
    healthy: number
    unhealthy: number
    proxies: Array<{
      proxy: string
      uses: number
      failures: number
      isHealthy: boolean
      avgResponseTime: number
    }>
  } {
    const statsArray = Array.from(this.proxyStats.values())
    return {
      total: statsArray.length,
      healthy: statsArray.filter((s) => s.isHealthy).length,
      unhealthy: statsArray.filter((s) => !s.isHealthy).length,
      proxies: statsArray.map((s) => ({
        proxy: this.getProxyKey(s.proxy),
        uses: s.uses,
        failures: s.failures,
        isHealthy: s.isHealthy,
        avgResponseTime: Math.round(s.avgResponseTime),
      })),
    }
  }

  // Add new proxy to pool
  addProxy(proxy: ProxyConfig) {
    const key = this.getProxyKey(proxy)
    if (!this.proxyStats.has(key)) {
      this.proxyStats.set(key, {
        proxy,
        uses: 0,
        failures: 0,
        lastUsed: 0,
        lastFailure: null,
        avgResponseTime: 0,
        isHealthy: true,
      })
      this.config.proxies.push(proxy)
    }
  }

  // Remove proxy from pool
  removeProxy(proxy: ProxyConfig) {
    const key = this.getProxyKey(proxy)
    this.proxyStats.delete(key)
    this.config.proxies = this.config.proxies.filter(
      (p) => this.getProxyKey(p) !== key
    )
  }
}

// Singleton instance
let proxyPoolInstance: ProxyPool | null = null

export function getProxyPool(config?: ProxyPoolConfig): ProxyPool | null {
  if (config && !proxyPoolInstance) {
    proxyPoolInstance = new ProxyPool(config)
  }
  return proxyPoolInstance
}

export function initProxyPool(config: ProxyPoolConfig): ProxyPool {
  proxyPoolInstance = new ProxyPool(config)
  return proxyPoolInstance
}

// Parse proxy string into ProxyConfig
export function parseProxyString(proxyString: string): ProxyConfig | null {
  try {
    // Handle formats:
    // - http://host:port
    // - http://user:pass@host:port
    // - host:port
    // - host:port:user:pass

    let protocol: ProxyConfig['protocol'] = 'http'
    let host: string
    let port: number
    let username: string | undefined
    let password: string | undefined

    // Check if it has protocol
    if (proxyString.includes('://')) {
      const url = new URL(proxyString)
      protocol = url.protocol.replace(':', '') as ProxyConfig['protocol']
      host = url.hostname
      port = parseInt(url.port, 10)
      username = url.username || undefined
      password = url.password || undefined
    } else {
      // Parse host:port or host:port:user:pass format
      const parts = proxyString.split(':')
      if (parts.length === 2) {
        host = parts[0]
        port = parseInt(parts[1], 10)
      } else if (parts.length === 4) {
        host = parts[0]
        port = parseInt(parts[1], 10)
        username = parts[2]
        password = parts[3]
      } else {
        return null
      }
    }

    return { host, port, username, password, protocol }
  } catch {
    return null
  }
}

// Load proxies from environment variable
export function loadProxiesFromEnv(): ProxyConfig[] {
  const proxyList = process.env.PROXY_LIST
  if (!proxyList) {
    return []
  }

  const proxies: ProxyConfig[] = []
  const lines = proxyList.split(',').map((s) => s.trim()).filter(Boolean)

  for (const line of lines) {
    const proxy = parseProxyString(line)
    if (proxy) {
      proxies.push(proxy)
    }
  }

  return proxies
}

// Set up proxy authentication on page
export async function setupProxyAuth(
  page: Page,
  proxy: ProxyConfig
): Promise<void> {
  if (proxy.username && proxy.password) {
    await page.authenticate({
      username: proxy.username,
      password: proxy.password,
    })
  }
}

export { ProxyPool }
