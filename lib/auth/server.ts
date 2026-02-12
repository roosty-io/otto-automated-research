// OTTO Research Labs - Supabase Auth Utilities
// Server and client authentication helpers for Next.js App Router

import { createServerClient as createSupabaseServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from './database.types'

// ============================================================================
// SERVER-SIDE AUTH (for Server Components and API Routes)
// ============================================================================

export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // Handle read-only cookies in Server Components
          }
        },
      },
    }
  )
}

// Admin client with service role (bypasses RLS)
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
}

// ============================================================================
// SESSION HELPERS
// ============================================================================

export async function getSession() {
  const supabase = await createServerSupabaseClient()
  const { data: { session }, error } = await supabase.auth.getSession()

  if (error) {
    console.error('[Auth] Session error:', error.message)
    return null
  }

  return session
}

export async function getUser() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error) {
    console.error('[Auth] User error:', error.message)
    return null
  }

  return user
}

export async function getUserProfile() {
  const user = await getUser()
  if (!user) return null

  const supabase = await createServerSupabaseClient()
  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single()

  return profile
}

export async function getUserWithSubscription() {
  const user = await getUser()
  if (!user) return null

  const adminClient = createAdminClient()

  const { data: profile } = await adminClient
    .from('users')
    .select(`
      *,
      user_subscriptions (
        id,
        tier_id,
        status,
        stripe_customer_id,
        stripe_subscription_id,
        current_period_start,
        current_period_end
      )
    `)
    .eq('id', user.id)
    .single()

  return {
    ...user,
    profile,
    subscription: profile?.user_subscriptions?.[0] || null
  }
}

// ============================================================================
// AUTH ACTIONS
// ============================================================================

export async function signUp(email: string, password: string, metadata?: {
  full_name?: string
  company?: string
}) {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
      data: metadata
    }
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, user: data.user }
}

export async function signIn(email: string, password: string) {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, user: data.user, session: data.session }
}

export async function signInWithOAuth(provider: 'google' | 'github') {
  const supabase = await createServerSupabaseClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`
    }
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, url: data.url }
}

export async function signOut() {
  const supabase = await createServerSupabaseClient()
  const { error } = await supabase.auth.signOut()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function resetPassword(email: string) {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/reset-password`
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

export async function updatePassword(newPassword: string) {
  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.auth.updateUser({
    password: newPassword
  })

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}

// ============================================================================
// MIDDLEWARE HELPER
// ============================================================================

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser()

  return { supabaseResponse, user }
}

// ============================================================================
// PROFILE MANAGEMENT
// ============================================================================

export async function updateUserProfile(userId: string, updates: {
  full_name?: string
  company?: string
  avatar_url?: string
  onboarding_completed?: boolean
  onboarding_step?: number
}) {
  const adminClient = createAdminClient()

  const { data, error } = await adminClient
    .from('users')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId)
    .select()
    .single()

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true, profile: data }
}

export async function createUserProfile(userId: string, email: string, metadata?: {
  full_name?: string
  company?: string
}) {
  const adminClient = createAdminClient()

  // Check if profile exists
  const { data: existing } = await adminClient
    .from('users')
    .select('id')
    .eq('id', userId)
    .single()

  if (existing) {
    return { success: true, profile: existing }
  }

  // Create new profile
  const { data, error } = await adminClient
    .from('users')
    .insert({
      id: userId,
      email,
      full_name: metadata?.full_name || '',
      company: metadata?.company || '',
      role: 'user',
      onboarding_completed: false,
      onboarding_step: 0
    })
    .select()
    .single()

  if (error) {
    console.error('[Auth] Profile creation error:', error)
    return { success: false, error: error.message }
  }

  return { success: true, profile: data }
}
