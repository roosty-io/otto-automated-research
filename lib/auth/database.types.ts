// Database types for Supabase Auth - extends main database types

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string | null
          company: string | null
          avatar_url: string | null
          role: 'admin' | 'user'
          onboarding_completed: boolean
          onboarding_step: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          company?: string | null
          avatar_url?: string | null
          role?: 'admin' | 'user'
          onboarding_completed?: boolean
          onboarding_step?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          company?: string | null
          avatar_url?: string | null
          role?: 'admin' | 'user'
          onboarding_completed?: boolean
          onboarding_step?: number
          updated_at?: string
        }
      }
      user_subscriptions: {
        Row: {
          id: string
          user_id: string
          tier_id: string
          status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete'
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          stripe_price_id: string | null
          current_period_start: string | null
          current_period_end: string | null
          cancel_at_period_end: boolean
          canceled_at: string | null
          trial_start: string | null
          trial_end: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          tier_id: string
          status?: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete'
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          trial_start?: string | null
          trial_end?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          tier_id?: string
          status?: 'active' | 'canceled' | 'past_due' | 'trialing' | 'incomplete'
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          stripe_price_id?: string | null
          current_period_start?: string | null
          current_period_end?: string | null
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          trial_start?: string | null
          trial_end?: string | null
          updated_at?: string
        }
      }
      stores: {
        Row: {
          id: string
          user_id: string
          store_name: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          store_name: string
          is_active?: boolean
        }
        Update: {
          store_name?: string
          is_active?: boolean
          updated_at?: string
        }
      }
      skus: {
        Row: {
          id: string
          user_id: string
          title: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          status?: string
        }
        Update: {
          title?: string
          status?: string
          updated_at?: string
        }
      }
      orders: {
        Row: {
          id: string
          store_id: string
          order_date: string
          total_amount: number
          profit: number
          status: string
        }
        Insert: {
          id?: string
          store_id: string
          order_date?: string
          total_amount: number
          profit?: number
          status?: string
        }
        Update: {
          total_amount?: number
          profit?: number
          status?: string
        }
      }
    }
    Views: {}
    Functions: {}
    Enums: {}
  }
}
