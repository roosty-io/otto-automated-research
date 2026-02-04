'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  Store,
  Package,
  ListChecks,
  Settings,
  BarChart3,
  Activity,
  DollarSign,
} from 'lucide-react'

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Stores', href: '/stores', icon: Store },
  { name: 'Jobs', href: '/jobs', icon: ListChecks },
  { name: 'Health', href: '/health', icon: Activity },
  { name: 'Products', href: '/products', icon: Package },
  { name: 'Sales', href: '/sales', icon: DollarSign },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <div className="flex flex-col w-64 bg-gray-900">
      <div className="flex items-center h-16 flex-shrink-0 px-4 bg-gray-800">
        <div className="flex items-center">
          <div className="h-8 w-8 rounded bg-blue-600 flex items-center justify-center">
            <span className="text-white font-bold text-sm">PM</span>
          </div>
          <span className="ml-3 text-white font-semibold text-lg">PPME</span>
        </div>
      </div>
      <div className="flex-1 flex flex-col overflow-y-auto">
        <nav className="flex-1 px-2 py-4 space-y-1">
          {navigation.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href))
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`
                  group flex items-center px-2 py-2 text-sm font-medium rounded-md
                  ${isActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                  }
                `}
              >
                <item.icon
                  className={`mr-3 h-5 w-5 flex-shrink-0 ${
                    isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'
                  }`}
                />
                {item.name}
              </Link>
            )
          })}
        </nav>
      </div>
      <div className="flex-shrink-0 flex border-t border-gray-800 p-4">
        <div className="flex items-center">
          <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
            <span className="text-gray-300 text-sm font-medium">A</span>
          </div>
          <div className="ml-3">
            <p className="text-sm font-medium text-white">Admin</p>
            <p className="text-xs text-gray-400">Manage</p>
          </div>
        </div>
      </div>
    </div>
  )
}
