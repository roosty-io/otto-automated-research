import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from './database.types'

// Lazy-loaded Supabase client to avoid build-time errors
let supabaseInstance: SupabaseClient<Database> | null = null

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  }
  return url
}

function getSupabaseAnonKey(): string {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required')
  }
  return key
}

// Getter for supabase client - initializes lazily
export const supabase: SupabaseClient<Database> = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    if (!supabaseInstance) {
      supabaseInstance = createClient<Database>(getSupabaseUrl(), getSupabaseAnonKey())
    }
    return (supabaseInstance as any)[prop]
  },
})

// Server-side client with service role key (for API routes)
export function createServerClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server operations')
  }
  return createClient<Database>(getSupabaseUrl(), serviceRoleKey)
}
