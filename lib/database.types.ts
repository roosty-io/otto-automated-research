// Database types for PPME

export type StoreTier = {
  id: string
  tier_name: string
  subscription_type: string
  target_monthly_profit: number
  min_active_listings: number
  days_to_floor: number
  fee_free_listings: number
  subscription_listing_limit: number
  max_total_listings: number
  overage_fee: number
  overage_enabled: boolean
  created_at: string
  updated_at: string
}

export type StoreMaturity = 'new' | 'establishing' | 'growing' | 'mature' | 'seasoned'

export type Store = {
  id: string
  store_name: string
  ebay_username: string
  tier_id: string
  is_active: boolean
  ebay_registration_date: string | null
  onboarding_date: string
  current_active_listings: number
  current_soft_ceiling: number | null
  client_id: string | null
  notes: string | null
  maturity: StoreMaturity
  maturity_updated_at: string | null
  calculated_soft_ceiling: number | null
  ceiling_last_calculated: string | null
  created_at: string
  updated_at: string
}

export type StoreWithTier = Store & {
  store_tiers: StoreTier
}

export type StoreHealth = {
  store_id: string
  store_name: string
  ebay_username: string
  tier_name: string
  maturity: StoreMaturity
  is_active: boolean
  current_active_listings: number
  tier_floor: number
  tier_ceiling: number
  tier_profit_target: number
  velocity_multiplier: number
  effective_floor: number
  effective_ceiling: number
  daily_cap: number
  effective_profit_target: number
  floor_percentage: number
  mtd_profit: number
  mtd_sales: number
  onboarding_date: string
  days_active: number
  days_to_floor_remaining: number
}

export type StoreCapacity = {
  store_id: string
  store_name: string
  ebay_username: string
  tier_name: string
  maturity: StoreMaturity
  current_active_listings: number
  soft_ceiling: number | null
  fee_free_ceiling: number
  hard_ceiling: number
  overage_enabled: boolean
  overage_fee: number
  capacity_status: 'normal' | 'at_soft_ceiling' | 'at_hard_ceiling' | 'in_overage'
  available_free_slots: number
  total_available_slots: number
  current_monthly_overage_cost: number
}

export type ListingJobType =
  | 'managed_onboarding'
  | 'self_service_onboarding'
  | 'managed_replenishment'
  | 'self_service_topup'
  | 'bulk_import'
  | 'escalation'
  | 'pruning'

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'

export type ListingJob = {
  id: string
  store_id: string
  job_type: ListingJobType
  job_name: string
  target_listing_count: number
  completed_count: number
  failed_count: number
  status: JobStatus
  priority: number
  scheduled_for: string | null
  started_at: string | null
  completed_at: string | null
  last_error: string | null
  retry_count: number
  max_retries: number
  config: Record<string, unknown>
  results: Record<string, unknown>
  created_by: string
  created_at: string
  updated_at: string
}

export type ListingJobDashboard = ListingJob & {
  store_name: string
  ebay_username: string
  tier_name: string
  remaining: number
  progress_pct: number
  duration_seconds: number | null
}

export type Database = {
  public: {
    Tables: {
      store_tiers: {
        Row: StoreTier
        Insert: Omit<StoreTier, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<StoreTier, 'id' | 'created_at' | 'updated_at'>>
      }
      stores: {
        Row: Store
        Insert: Omit<Store, 'id' | 'created_at' | 'updated_at' | 'current_active_listings' | 'maturity' | 'maturity_updated_at' | 'calculated_soft_ceiling' | 'ceiling_last_calculated'>
        Update: Partial<Omit<Store, 'id' | 'created_at' | 'updated_at'>>
      }
      listing_jobs: {
        Row: ListingJob
        Insert: Omit<ListingJob, 'id' | 'created_at' | 'updated_at' | 'completed_count' | 'failed_count' | 'status' | 'retry_count'>
        Update: Partial<Omit<ListingJob, 'id' | 'created_at' | 'updated_at'>>
      }
    }
    Views: {
      mv_store_health: {
        Row: StoreHealth
      }
      v_store_capacity: {
        Row: StoreCapacity
      }
      v_listing_jobs_dashboard: {
        Row: ListingJobDashboard
      }
    }
  }
}
