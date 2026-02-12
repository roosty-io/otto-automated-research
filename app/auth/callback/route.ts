// OTTO Research Labs - Auth Callback Handler
// Handles OAuth redirects and email confirmation

import { createServerSupabaseClient, createUserProfile } from '@/lib/auth/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.user) {
      // Ensure user profile exists
      await createUserProfile(
        data.user.id,
        data.user.email || '',
        {
          full_name: data.user.user_metadata?.full_name,
          company: data.user.user_metadata?.company
        }
      )

      // Check if first time user (redirect to onboarding)
      const { data: profile } = await supabase
        .from('users')
        .select('onboarding_completed')
        .eq('id', data.user.id)
        .single()

      if (profile && !profile.onboarding_completed) {
        return NextResponse.redirect(`${origin}/onboarding`)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Return to login with error
  return NextResponse.redirect(`${origin}/login?error=auth_callback_error`)
}
