// OTTO Research Labs - Auth API Routes
// Handles registration, login, logout, and profile management

import { NextRequest, NextResponse } from 'next/server'
import {
  createServerSupabaseClient,
  createAdminClient,
  signUp,
  signIn,
  signOut,
  resetPassword,
  updatePassword,
  createUserProfile,
  updateUserProfile
} from '@/lib/auth/server'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, ...data } = body

    // ========================================
    // SIGN UP
    // ========================================
    if (action === 'signup') {
      const { email, password, full_name, company } = data

      if (!email || !password) {
        return NextResponse.json({
          success: false,
          error: 'Email and password are required'
        }, { status: 400 })
      }

      if (password.length < 8) {
        return NextResponse.json({
          success: false,
          error: 'Password must be at least 8 characters'
        }, { status: 400 })
      }

      const result = await signUp(email, password, { full_name, company })

      if (!result.success) {
        return NextResponse.json({
          success: false,
          error: result.error
        }, { status: 400 })
      }

      // Create user profile
      if (result.user) {
        await createUserProfile(result.user.id, email, { full_name, company })
      }

      return NextResponse.json({
        success: true,
        message: 'Check your email to confirm your account',
        user: result.user
      })
    }

    // ========================================
    // SIGN IN
    // ========================================
    if (action === 'signin') {
      const { email, password } = data

      if (!email || !password) {
        return NextResponse.json({
          success: false,
          error: 'Email and password are required'
        }, { status: 400 })
      }

      const result = await signIn(email, password)

      if (!result.success) {
        return NextResponse.json({
          success: false,
          error: result.error
        }, { status: 401 })
      }

      // Update last login
      if (result.user) {
        const adminClient = createAdminClient()
        await adminClient
          .from('users')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', result.user.id)
      }

      const response = NextResponse.json({
        success: true,
        user: result.user
      })

      return response
    }

    // ========================================
    // SIGN OUT
    // ========================================
    if (action === 'signout') {
      const result = await signOut()

      if (!result.success) {
        return NextResponse.json({
          success: false,
          error: result.error
        }, { status: 400 })
      }

      return NextResponse.json({ success: true })
    }

    // ========================================
    // RESET PASSWORD
    // ========================================
    if (action === 'reset-password') {
      const { email } = data

      if (!email) {
        return NextResponse.json({
          success: false,
          error: 'Email is required'
        }, { status: 400 })
      }

      const result = await resetPassword(email)

      if (!result.success) {
        return NextResponse.json({
          success: false,
          error: result.error
        }, { status: 400 })
      }

      return NextResponse.json({
        success: true,
        message: 'Check your email for password reset instructions'
      })
    }

    // ========================================
    // UPDATE PASSWORD
    // ========================================
    if (action === 'update-password') {
      const { password } = data

      if (!password || password.length < 8) {
        return NextResponse.json({
          success: false,
          error: 'Password must be at least 8 characters'
        }, { status: 400 })
      }

      const result = await updatePassword(password)

      if (!result.success) {
        return NextResponse.json({
          success: false,
          error: result.error
        }, { status: 400 })
      }

      return NextResponse.json({
        success: true,
        message: 'Password updated successfully'
      })
    }

    // ========================================
    // UPDATE PROFILE
    // ========================================
    if (action === 'update-profile') {
      const supabase = await createServerSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        return NextResponse.json({
          success: false,
          error: 'Not authenticated'
        }, { status: 401 })
      }

      const { full_name, company, avatar_url } = data
      const result = await updateUserProfile(user.id, { full_name, company, avatar_url })

      if (!result.success) {
        return NextResponse.json({
          success: false,
          error: result.error
        }, { status: 400 })
      }

      return NextResponse.json({
        success: true,
        profile: result.profile
      })
    }

    // ========================================
    // COMPLETE ONBOARDING STEP
    // ========================================
    if (action === 'complete-onboarding-step') {
      const supabase = await createServerSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        return NextResponse.json({
          success: false,
          error: 'Not authenticated'
        }, { status: 401 })
      }

      const { step, completed } = data
      const updates: any = { onboarding_step: step }

      if (completed) {
        updates.onboarding_completed = true
      }

      const result = await updateUserProfile(user.id, updates)

      return NextResponse.json({
        success: result.success,
        profile: result.profile
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })

  } catch (error) {
    console.error('[Auth API] Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // ========================================
    // GET CURRENT USER
    // ========================================
    if (action === 'user' || !action) {
      const supabase = await createServerSupabaseClient()
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error || !user) {
        return NextResponse.json({
          success: false,
          user: null
        })
      }

      // Get profile
      const { data: profile } = await supabase
        .from('users')
        .select('*')
        .eq('id', user.id)
        .single()

      // Get subscription
      const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .single()

      return NextResponse.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          ...profile
        },
        subscription
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })

  } catch (error) {
    console.error('[Auth API] GET Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
