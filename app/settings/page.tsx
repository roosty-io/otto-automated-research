import { supabase } from '@/lib/supabase'
import { Settings, Database, Bell, Shield } from 'lucide-react'

export const dynamic = 'force-dynamic'

async function getTiers() {
  const { data } = await supabase
    .from('store_tiers')
    .select('*')
    .order('target_monthly_profit')
  return data || []
}

async function getMaturityTiers() {
  const { data } = await supabase
    .from('store_maturity_tiers')
    .select('*')
    .order('min_days')
  return data || []
}

export default async function SettingsPage() {
  const [tiers, maturityTiers] = await Promise.all([
    getTiers(),
    getMaturityTiers(),
  ])

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500 mt-1">System configuration and tier management</p>
      </div>

      {/* Store Tiers */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center">
            <Database className="h-5 w-5 text-gray-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Store Tiers</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Configure listing floors, ceilings, and profit targets for each tier
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tier</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Subscription</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Target Profit</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Floor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ceiling</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days to Floor</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Overage</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {tiers.map((tier) => (
                <tr key={tier.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-medium text-gray-900">{tier.tier_name}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {tier.subscription_type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${tier.target_monthly_profit.toLocaleString()}/mo
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {tier.min_active_listings.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {tier.max_total_listings.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {tier.days_to_floor} days
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {tier.overage_enabled ? (
                      <span className="text-orange-600">${tier.overage_fee}/listing</span>
                    ) : (
                      <span className="text-gray-400">Disabled</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Maturity Tiers */}
      <div className="bg-white rounded-lg shadow mb-8">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center">
            <Shield className="h-5 w-5 text-gray-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">Store Maturity Levels</h2>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Velocity scaling based on store age and experience
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Level</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Days</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Velocity</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Daily Cap</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monthly Cap</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Profit Target %</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {maturityTiers.map((tier) => (
                <tr key={tier.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-medium text-gray-900 capitalize">{tier.maturity_level}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {tier.min_days} - {tier.max_days || '∞'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {Math.round(tier.velocity_multiplier * 100)}%
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {tier.daily_cap.toLocaleString()}/day
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {tier.monthly_cap.toLocaleString()}/mo
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {Math.round(tier.profit_target_percentage * 100)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* System Info */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center">
            <Settings className="h-5 w-5 text-gray-500 mr-2" />
            <h2 className="text-lg font-semibold text-gray-900">System Information</h2>
          </div>
        </div>
        <div className="p-6">
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <dt className="text-sm font-medium text-gray-500">Database</dt>
              <dd className="text-lg font-semibold text-gray-900 mt-1">Supabase PostgreSQL</dd>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <dt className="text-sm font-medium text-gray-500">Framework</dt>
              <dd className="text-lg font-semibold text-gray-900 mt-1">Next.js 14</dd>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <dt className="text-sm font-medium text-gray-500">Max Stores per SKU</dt>
              <dd className="text-lg font-semibold text-gray-900 mt-1">3 (enforced by trigger)</dd>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <dt className="text-sm font-medium text-gray-500">Prune Threshold</dt>
              <dd className="text-lg font-semibold text-gray-900 mt-1">14 days without sale</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
