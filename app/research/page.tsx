import Link from 'next/link'
import {
  Search,
  TrendingUp,
  Package,
  BarChart3,
  ArrowRight,
  Target,
  Zap,
  Clock,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'

export const metadata = {
  title: 'Research | OTTO Research Labs',
  description: 'Discover profitable products to sell on eBay',
}

function ResearchMethodCard({
  title,
  description,
  icon: Icon,
  features,
  status,
  href,
  color,
}: {
  title: string
  description: string
  icon: React.ElementType
  features: string[]
  status: 'available' | 'coming_soon' | 'beta'
  href: string
  color: string
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
      {status === 'available' ? (
        <Link
          href={href}
          className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
        >
          Start Research
          <ArrowRight className="h-4 w-4 ml-2" />
        </Link>
      ) : (
        <button
          disabled
          className="inline-flex items-center justify-center w-full px-4 py-2.5 bg-gray-100 text-gray-400 text-sm font-medium rounded-lg cursor-not-allowed"
        >
          {status === 'coming_soon' ? 'Coming Soon' : 'Try Beta'}
        </button>
      )}
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
      status: 'coming_soon' as const,
      href: '/research/ebay',
      color: 'bg-gradient-to-br from-blue-500 to-blue-600',
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
      status: 'coming_soon' as const,
      href: '/research/amazon',
      color: 'bg-gradient-to-br from-orange-500 to-orange-600',
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

      {/* Alert Banner */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-8 flex items-start">
        <AlertTriangle className="h-5 w-5 text-amber-500 mr-3 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-amber-800">Automated research coming soon</p>
          <p className="text-sm text-amber-700 mt-1">
            ZIK Analytics and Amazon sourcing integrations are under development.
            Use Manual Research to add and validate products now.
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
    </div>
  )
}
