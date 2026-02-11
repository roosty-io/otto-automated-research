'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Search,
  Package,
  Store,
  TrendingUp,
  Settings,
  Zap,
  Shield,
  HelpCircle,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Research', href: '/research', icon: Search },
  { name: 'Products', href: '/products', icon: Package },
  { name: 'My Store', href: '/store', icon: Store },
  { name: 'Analytics', href: '/analytics', icon: TrendingUp },
  { name: 'Automation', href: '/automation', icon: Zap },
  { name: 'Policy Check', href: '/policy', icon: Shield },
  { name: 'Settings', href: '/settings', icon: Settings },
]

const secondaryNav = [
  { name: 'Help & Support', href: '/help', icon: HelpCircle },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex flex-col w-64 bg-slate-900">
      {/* Logo */}
      <div className="flex items-center h-16 flex-shrink-0 px-4 bg-slate-800">
        <Link href="/" className="flex items-center">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-lg">O</span>
          </div>
          <div className="ml-3">
            <span className="text-white font-bold text-lg tracking-tight">OTTO</span>
            <span className="text-slate-400 text-xs block -mt-1">Research Labs</span>
          </div>
        </Link>
      </div>

      {/* Main Navigation */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`
                  group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all
                  ${isActive
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }
                `}
              >
                <item.icon
                  className={`mr-3 h-5 w-5 flex-shrink-0 ${
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'
                  }`}
                />
                {item.name}
              </Link>
            )
          })}
        </nav>

        {/* Secondary Navigation */}
        <div className="px-3 pb-2">
          <div className="border-t border-slate-700 pt-4">
            {secondaryNav.map((item) => {
              const isActive = pathname === item.href
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`
                    group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-all
                    ${isActive
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }
                  `}
                >
                  <item.icon className="mr-3 h-4 w-4 flex-shrink-0" />
                  {item.name}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* User Section */}
      <div className="flex-shrink-0 border-t border-slate-700 p-4">
        <div className="flex items-center">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center">
            <span className="text-white text-sm font-semibold">U</span>
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-white">User</p>
            <p className="text-xs text-slate-400">Pro Plan</p>
          </div>
          <Link
            href="/settings/account"
            className="text-slate-400 hover:text-white transition-colors"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </div>
  )
}
