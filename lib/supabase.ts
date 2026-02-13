import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { Database } from './database.types'

function getSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  }
  return url
}

function getSupabaseKey(): string {
  // Use service role key on server if available, otherwise anon key
  if (typeof window === 'undefined' && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return process.env.SUPABASE_SERVICE_ROLE_KEY
  }
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required')
  }
  return key
}

// Sync proxy fetch setup using undici
function createProxyFetchSync(): typeof fetch | undefined {
  const proxyUrl = process.env.GLOBAL_AGENT_HTTP_PROXY ||
    process.env.https_proxy ||
    process.env.HTTPS_PROXY

  if (!proxyUrl || typeof window !== 'undefined') {
    return undefined
  }

  try {
    // Dynamic require for undici (sync)
    const { ProxyAgent, fetch: undiciFetch } = require('undici')
    const proxyAgent = new ProxyAgent(proxyUrl)

    console.log('[Supabase] Using proxy:', proxyUrl.substring(0, 50) + '...')

    return ((input: RequestInfo | URL, init?: RequestInit) => {
      return undiciFetch(input as any, {
        ...init,
        dispatcher: proxyAgent,
      } as any)
    }) as typeof fetch
  } catch (e) {
    console.warn('[Supabase] Failed to create proxy fetch:', e)
    return undefined
  }
}

// Create the client with proxy support
function createSupabaseClient(): SupabaseClient<Database> {
  const customFetch = createProxyFetchSync()

  const options = customFetch ? { global: { fetch: customFetch } } : undefined

  return createClient<Database>(getSupabaseUrl(), getSupabaseKey(), options)
}

// Lazy-loaded singleton
let supabaseInstance: SupabaseClient<Database> | null = null

export const supabase: SupabaseClient<Database> = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    if (!supabaseInstance) {
      supabaseInstance = createSupabaseClient()
    }
    return (supabaseInstance as any)[prop]
  },
})

// Server-side client with service role key
export function createServerClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for server operations')
  }

  const customFetch = createProxyFetchSync()
  const options = customFetch ? { global: { fetch: customFetch } } : undefined

  return createClient<Database>(getSupabaseUrl(), serviceRoleKey, options)
}
