'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Search,
  TrendingUp,
  Package,
  BarChart3,
  ArrowRight,
  Target,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ExternalLink,
} from 'lucide-react'

function ResearchMethodCard({
  title,
  description,
  icon: Icon,
  features,
  status,
  href,
  color,
  onClick,
}: {
  title: string
  description: string
  icon: React.ElementType
  features: string[]
  status: 'available' | 'coming_soon' | 'beta'
  href: string
  color: string
  onClick?: () => void
}) {
  const statusBadge = {
    available: { text: 'Available', class: 'bg-green-100 text-green-700' },
    coming_soon: { text: 'Coming Soon', class: 'bg-gray-100 text-gray-600' },
    beta: { text: 'Beta', class: 'bg-purple-100 text-purple-700' },
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className={`h-12 w-12 rounded-xl ${color} flex items-center justify-center`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusBadge[status].class}`}>
          {statusBadge[status].text}
        </span>
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">{description}</p>
      <ul className="space-y-2 mb-6">
        {features.map((feature, index) => (
          <li key={index} className="flex items-center text-sm text-gray-600">
            <CheckCircle2 className="h-4 w-4 text-green-500 mr-2 flex-shrink-0" />
            {feature}
          </li>
        ))}
      </ul>
      {status === 'available' || status === 'beta' ? (
        onClick ? (
          <button
            onClick={onClick}
            className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Start Research
            <ArrowRight className="h-4 w-4 ml-2" />
          </button>
        ) : (
          <Link
            href={href}
            className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Start Research
            <ArrowRight className="h-4 w-4 ml-2" />
          </Link>
        )
      ) : (
        <button
          disabled
          className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-gray-100 text-gray-400 text-sm font-medium rounded-lg cursor-not-allowed"
        >
          Coming Soon
        </button>
      )}
    </div>
  )
}

function QuickSearchPanel({
  isOpen,
  onClose,
  searchType,
}: {
  isOpen: boolean
  onClose: () => void
  searchType: 'zik' | 'amazon'
}) {
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [error, setError] = useState('')

  const handleSearch = async () => {
    if (!query.trim()) return

    setLoading(true)
    setError('')
    setResults(null)

    try {
      if (searchType === 'zik') {
        const response = await fetch('/api/research/zik', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'search',
            filters: { query, minSold: 5, dateRange: '30' },
            maxResults: 20,
          }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Search failed')
        setResults(data)
      } else {
        const response = await fetch('/api/research/amazon', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'search',
            query,
            maxResults: 20,
          }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Search failed')
        setResults(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">
              {searchType === 'zik' ? 'eBay Demand Research' : 'Amazon Product Search'}
            </h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              ✕
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder={searchType === 'zik' ? 'Search eBay sold items...' : 'Search Amazon products...'}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {loading && (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-indigo-600 mx-auto mb-2" />
              <p className="text-gray-500">Searching...</p>
            </div>
          )}

          {results && !loading && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-gray-600">
                  Found <strong>{results.totalResults || results.found || 0}</strong> products
                </p>
                {results.tokensRemaining !== undefined && (
                  <p className="text-xs text-gray-400">Tokens: {results.tokensRemaining}</p>
                )}
              </div>

              <div className="space-y-3">
                {(results.products || []).slice(0, 10).map((product: any, index: number) => (
                  <div key={index} className="flex items-start p-3 bg-gray-50 rounded-lg">
                    {product.image && (
                      <img
                        src={product.image}
                        alt=""
                        className="w-16 h-16 object-cover rounded mr-3"
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {product.title}
                      </p>
                      <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                        {product.price && <span>${product.price}</span>}
                        {product.soldCount && <span>{product.soldCount} sold</span>}
                        {product.rating && <span>★ {product.rating}</span>}
                        {product.salesRank && <span>Rank: {product.salesRank.toLocaleString()}</span>}
                      </div>
                      {product.asin && (
                        <a
                          href={`https://amazon.com/dp/${product.asin}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-xs text-indigo-600 hover:text-indigo-700 mt-1"
                        >
                          View on Amazon <ExternalLink className="h-3 w-3 ml-1" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {(results.products || []).length === 0 && (
                <p className="text-center text-gray-500 py-8">No products found</p>
              )}
            </div>
          )}

          {!results && !loading && !error && (
            <div className="text-center py-8 text-gray-500">
              <Search className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p>Enter a search term to find products</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function RecentResearchCard() {
  const recentSearches = [
    { query: 'Wireless Earbuds', date: '2 hours ago', results: 45, profitable: 12 },
    { query: 'Phone Accessories', date: '1 day ago', results: 128, profitable: 34 },
    { query: 'Home Organization', date: '3 days ago', results: 89, profitable: 21 },
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Recent Research</h3>
        <Link href="/research/history" className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">
          View all
        </Link>
      </div>
      <div className="space-y-3">
        {recentSearches.map((search, index) => (
          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center">
              <Search className="h-5 w-5 text-gray-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-900">{search.query}</p>
                <p className="text-xs text-gray-500">{search.date}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">{search.results} products</p>
              <p className="text-xs text-green-600">{search.profitable} profitable</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function ResearchStatsCard() {
  const stats = [
    { label: 'Products Analyzed', value: '2,847', change: '+234 this week' },
    { label: 'Profitable Finds', value: '412', change: '+56 this week' },
    { label: 'Avg. Profit Margin', value: '32%', change: '+2% vs last month' },
    { label: 'Listed from Research', value: '89', change: '21% conversion' },
  ]

  return (
    <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-xl shadow-lg p-6 text-white">
      <h3 className="text-lg font-semibold mb-4">Research Stats</h3>
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat, index) => (
          <div key={index}>
            <p className="text-2xl font-bold">{stat.value}</p>
            <p className="text-sm text-indigo-200">{stat.label}</p>
            <p className="text-xs text-indigo-300 mt-1">{stat.change}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ResearchPage() {
  const [searchPanel, setSearchPanel] = useState<'zik' | 'amazon' | null>(null)

  const researchMethods = [
    {
      title: 'eBay Demand Research',
      description: 'Find products with proven eBay demand using ZIK Analytics data',
      icon: TrendingUp,
      features: [
        'Real-time eBay sales data',
        'Competition analysis',
        'Price optimization suggestions',
        'Trend detection',
      ],
      status: 'beta' as const,
      href: '/research/ebay',
      color: 'bg-gradient-to-br from-blue-500 to-blue-600',
      onClick: () => setSearchPanel('zik'),
    },
    {
      title: 'Amazon Sourcing',
      description: 'Source products from Amazon with automatic profit calculation',
      icon: Package,
      features: [
        'Price comparison',
        'Keepa price history',
        'Supplier reliability scores',
        'Profit margin calculator',
      ],
      status: 'beta' as const,
      href: '/research/amazon',
      color: 'bg-gradient-to-br from-orange-500 to-orange-600',
      onClick: () => setSearchPanel('amazon'),
    },
    {
      title: 'Category Explorer',
      description: 'Explore entire categories to find untapped niches',
      icon: BarChart3,
      features: [
        'Category trends',
        'Saturation analysis',
        'Seasonal patterns',
        'Growth opportunities',
      ],
      status: 'coming_soon' as const,
      href: '/research/categories',
      color: 'bg-gradient-to-br from-emerald-500 to-emerald-600',
    },
    {
      title: 'Manual Research',
      description: 'Add products manually and run them through our validation pipeline',
      icon: Target,
      features: [
        'Policy compliance check',
        'Profit calculation',
        'Competition check',
        'Listing optimization',
      ],
      status: 'available' as const,
      href: '/products/research',
      color: 'bg-gradient-to-br from-purple-500 to-purple-600',
    },
  ]

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Product Research</h1>
        <p className="text-gray-500 mt-1">Discover profitable products to sell on eBay</p>
      </div>

      {/* Info Banner */}
      <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-8 flex items-start">
        <CheckCircle2 className="h-5 w-5 text-indigo-600 mr-3 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-indigo-800">Research integrations now available</p>
          <p className="text-sm text-indigo-700 mt-1">
            ZIK Analytics and Amazon sourcing are now in beta. Click any research method to start finding profitable products.
          </p>
        </div>
      </div>

      {/* Research Methods Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {researchMethods.map((method) => (
          <ResearchMethodCard key={method.title} {...method} />
        ))}
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RecentResearchCard />
        <ResearchStatsCard />
      </div>

      {/* Search Panel Modal */}
      <QuickSearchPanel
        isOpen={searchPanel !== null}
        onClose={() => setSearchPanel(null)}
        searchType={searchPanel || 'zik'}
      />
    </div>
  )
}
