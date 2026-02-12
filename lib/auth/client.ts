// OTTO Research Labs - Client-side Auth Utilities
// Browser-side authentication for React components

import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

// ============================================================================
// CLIENT-SIDE SUPABASE
// ============================================================================

export function createClientSupabaseClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// Singleton for client components
let browserClient: ReturnType<typeof createClientSupabaseClient> | null = null

export function getSupabaseClient() {
  if (!browserClient) {
    browserClient = createClientSupabaseClient()
  }
  return browserClient
}

// ============================================================================
// CLIENT AUTH ACTIONS
// ============================================================================

export async function clientSignUp(email: string, password: string, metadata?: {
  full_name?: string
  company?: string
}) {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/auth/callback`,
      data: metadata
    }
  })

  return { data, error }
}

export async function clientSignIn(email: string, password: string) {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  return { data, error }
}

export async function clientSignInWithOAuth(provider: 'google' | 'github') {
  const supabase = getSupabaseClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${window.location.origin}/auth/callback`
    }
  })

  return { data, error }
}

export async function clientSignOut() {
  const supabase = getSupabaseClient()
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function clientResetPassword(email: string) {
  const supabase = getSupabaseClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/auth/reset-password`
  })

  return { error }
}

export async function clientUpdatePassword(newPassword: string) {
  const supabase = getSupabaseClient()

  const { error } = await supabase.auth.updateUser({
    password: newPassword
  })

  return { error }
}

export async function clientGetSession() {
  const supabase = getSupabaseClient()
  const { data: { session }, error } = await supabase.auth.getSession()
  return { session, error }
}

export async function clientGetUser() {
  const supabase = getSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  return { user, error }
}

// ============================================================================
// AUTH STATE LISTENER
// ============================================================================

export function onAuthStateChange(callback: (event: string, session: any) => void) {
  const supabase = getSupabaseClient()

  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session)
  })

  return subscription
}
