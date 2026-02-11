import Link from 'next/link'
import {
  Zap,
  Search,
  Package,
  BarChart3,
  Target,
  Clock,
  Settings,
  Play,
  Pause,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Activity,
} from 'lucide-react'

export const metadata = {
  title: 'Automation | OTTO Research Labs',
  description: 'Configure your automated workflows',
}

function AutomationCard({
  title,
  description,
  icon: Icon,
  status,
  lastRun,
  nextRun,
  stats,
  onToggle,
}: {
  title: string
  description: string
  icon: React.ElementType
  status: 'active' | 'paused' | 'scheduled' | 'disabled'
  lastRun?: string
  nextRun?: string
  stats?: { label: string; value: string }[]
  onToggle?: () => void
}) {
  const statusConfig = {
    active: { text: 'Active', color: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
    paused: { text: 'Paused', color: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' },
    scheduled: { text: 'Scheduled', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
    disabled: { text: 'Disabled', color: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  }

  const config = statusConfig[status]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-start">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
            <Icon className="h-6 w-6 text-white" />
          </div>
          <div className="ml-4">
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
            <p className="text-sm text-gray-500 mt-1">{description}</p>
          </div>
        </div>
        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${config.color}`}>
          <span className={`w-2 h-2 rounded-full mr-1.5 ${config.dot}`} />
          {config.text}
        </span>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
          {stats.map((stat, index) => (
            <div key={index}>
              <p className="text-lg font-semibold text-gray-900">{stat.value}</p>
              <p className="text-xs text-gray-500">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center space-x-4">
          {lastRun && (
            <span className="flex items-center text-gray-500">
              <Clock className="h-4 w-4 mr-1" />
              Last: {lastRun}
            </span>
          )}
          {nextRun && (
            <span className="flex items-center text-gray-500">
              <Calendar className="h-4 w-4 mr-1" />
              Next: {nextRun}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <button className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
            <Settings className="h-4 w-4" />
          </button>
          <button className={`p-2 rounded-lg transition-colors ${
            status === 'active'
              ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50'
              : 'text-green-500 hover:text-green-600 hover:bg-green-50'
          }`}>
            {status === 'active' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  )
}

function ScheduleCard() {
  const schedule = [
    { time: '6:00 AM', task: 'Research Scan', status: 'completed' },
    { time: '9:00 AM', task: 'Price Optimization', status: 'completed' },
    { time: '12:00 PM', task: 'Inventory Sync', status: 'running' },
    { time: '6:00 PM', task: 'Performance Check', status: 'scheduled' },
    { time: '11:00 PM', task: 'Pruning Analysis', status: 'scheduled' },
  ]

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />
      case 'running':
        return <Activity className="h-4 w-4 text-blue-500 animate-pulse" />
      case 'scheduled':
        return <Clock className="h-4 w-4 text-gray-400" />
      default:
        return <Clock className="h-4 w-4 text-gray-400" />
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Today&apos;s Schedule</h3>
        <Link href="/automation/schedule" className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">
          Edit
        </Link>
      </div>
      <div className="space-y-3">
        {schedule.map((item, index) => (
          <div key={index} className="flex items-center justify-between py-2">
            <div className="flex items-center">
              {getStatusIcon(item.status)}
              <span className="ml-3 text-sm font-medium text-gray-700">{item.task}</span>
            </div>
            <span className="text-sm text-gray-500">{item.time}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function AutomationLogCard() {
  const logs = [
    { time: '11:45 AM', message: 'Price updated for 12 products', type: 'success' },
    { time: '11:30 AM', message: 'Research scan completed: 45 new products found', type: 'success' },
    { time: '11:15 AM', message: 'Inventory sync warning: 2 items low stock', type: 'warning' },
    { time: '10:00 AM', message: 'Listed 3 new products to eBay', type: 'success' },
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Activity Log</h3>
        <Link href="/automation/logs" className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">
          View all
        </Link>
      </div>
      <div className="space-y-3">
        {logs.map((log, index) => (
          <div key={index} className="flex items-start">
            {log.type === 'success' ? (
              <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-amber-500 mr-3 flex-shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="text-sm text-gray-700">{log.message}</p>
              <p className="text-xs text-gray-400 mt-0.5">{log.time}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AutomationPage() {
  const automations = [
    {
      title: 'Product Research',
      description: 'Automatically discover new profitable products',
      icon: Search,
      status: 'active' as const,
      lastRun: '2 hours ago',
      nextRun: '4:00 PM',
      stats: [
        { label: 'Products Found', value: '234' },
        { label: 'This Week', value: '+89' },
        { label: 'Conversion', value: '12%' },
      ],
    },
    {
      title: 'Auto Listing',
      description: 'List approved products to your eBay store',
      icon: Package,
      status: 'paused' as const,
      lastRun: '1 day ago',
      nextRun: 'Paused',
      stats: [
        { label: 'Listed', value: '156' },
        { label: 'This Week', value: '+23' },
        { label: 'Success Rate', value: '98%' },
      ],
    },
    {
      title: 'Price Optimization',
      description: 'Adjust prices based on competition and demand',
      icon: BarChart3,
      status: 'scheduled' as const,
      lastRun: '6 hours ago',
      nextRun: '6:00 PM',
      stats: [
        { label: 'Optimized', value: '89' },
        { label: 'Avg Change', value: '-$2.50' },
        { label: 'Sales Lift', value: '+15%' },
      ],
    },
    {
      title: 'Auto Pruning',
      description: 'Remove underperforming products automatically',
      icon: Target,
      status: 'active' as const,
      lastRun: '12 hours ago',
      nextRun: '11:00 PM',
      stats: [
        { label: 'Reviewed', value: '450' },
        { label: 'Pruned', value: '12' },
        { label: 'Saved', value: '$340' },
      ],
    },
  ]

  return (
    <div className="p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Automation</h1>
            <p className="text-gray-500 mt-1">Configure your automated workflows</p>
          </div>
          <div className="flex items-center space-x-3">
            <button className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
              <Clock className="h-4 w-4 mr-2" />
              Schedule
            </button>
            <button className="inline-flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
              <Zap className="h-4 w-4 mr-2" />
              Run All Now
            </button>
          </div>
        </div>
      </div>

      {/* Status Banner */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl shadow-lg p-6 mb-8 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="h-12 w-12 rounded-xl bg-white/20 flex items-center justify-center">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div className="ml-4">
              <h2 className="text-xl font-bold">Automation Active</h2>
              <p className="text-indigo-200">3 of 4 automations running</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-8 text-center">
            <div>
              <p className="text-2xl font-bold">1,234</p>
              <p className="text-sm text-indigo-200">Tasks Today</p>
            </div>
            <div>
              <p className="text-2xl font-bold">98.5%</p>
              <p className="text-sm text-indigo-200">Success Rate</p>
            </div>
            <div>
              <p className="text-2xl font-bold">$456</p>
              <p className="text-sm text-indigo-200">Time Saved</p>
            </div>
          </div>
        </div>
      </div>

      {/* Automations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {automations.map((automation) => (
          <AutomationCard key={automation.title} {...automation} />
        ))}
      </div>

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ScheduleCard />
        <AutomationLogCard />
      </div>
    </div>
  )
}
