// OTTO Research Labs - Billing API
// Handles subscription management, checkout, and billing portal

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/auth/server'
import {
  createCheckoutSession,
  createBillingPortalSession,
  createOrGetCustomer,
  cancelSubscription,
  reactivateSubscription,
  STRIPE_TIERS,
  TierKey
} from '@/lib/billing/stripe'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const body = await request.json()
    const { action, ...data } = body
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_APP_URL

    // ========================================
    // CREATE CHECKOUT SESSION
    // ========================================
    if (action === 'create-checkout') {
      const { tier } = data as { tier: TierKey }

      if (!tier || !STRIPE_TIERS[tier]) {
        return NextResponse.json({
          success: false,
          error: 'Invalid tier'
        }, { status: 400 })
      }

      const session = await createCheckoutSession(
        user.id,
        user.email!,
        tier,
        `${origin}/settings/billing?success=true`,
        `${origin}/settings/billing?canceled=true`
      )

      return NextResponse.json({
        success: true,
        url: session.url
      })
    }

    // ========================================
    // CREATE BILLING PORTAL SESSION
    // ========================================
    if (action === 'billing-portal') {
      const customerId = await createOrGetCustomer(user.id, user.email!)

      const session = await createBillingPortalSession(
        customerId,
        `${origin}/settings/billing`
      )

      return NextResponse.json({
        success: true,
        url: session.url
      })
    }

    // ========================================
    // CANCEL SUBSCRIPTION
    // ========================================
    if (action === 'cancel') {
      const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select('stripe_subscription_id')
        .eq('user_id', user.id)
        .single()

      if (!subscription?.stripe_subscription_id) {
        return NextResponse.json({
          success: false,
          error: 'No active subscription'
        }, { status: 400 })
      }

      await cancelSubscription(subscription.stripe_subscription_id)

      return NextResponse.json({
        success: true,
        message: 'Subscription will cancel at end of billing period'
      })
    }

    // ========================================
    // REACTIVATE SUBSCRIPTION
    // ========================================
    if (action === 'reactivate') {
      const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select('stripe_subscription_id')
        .eq('user_id', user.id)
        .single()

      if (!subscription?.stripe_subscription_id) {
        return NextResponse.json({
          success: false,
          error: 'No subscription to reactivate'
        }, { status: 400 })
      }

      await reactivateSubscription(subscription.stripe_subscription_id)

      return NextResponse.json({
        success: true,
        message: 'Subscription reactivated'
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })

  } catch (error) {
    console.error('[Billing API] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Internal server error'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'Not authenticated'
      }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    // ========================================
    // GET SUBSCRIPTION STATUS
    // ========================================
    if (action === 'status' || !action) {
      const { data: subscription } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('user_id', user.id)
        .single()

      const tier = subscription?.tier_id
        ? STRIPE_TIERS[subscription.tier_id as TierKey]
        : null

      return NextResponse.json({
        success: true,
        subscription: subscription || null,
        tier: tier || null,
        tiers: STRIPE_TIERS
      })
    }

    // ========================================
    // GET AVAILABLE TIERS
    // ========================================
    if (action === 'tiers') {
      return NextResponse.json({
        success: true,
        tiers: STRIPE_TIERS
      })
    }

    return NextResponse.json({
      success: false,
      error: 'Invalid action'
    }, { status: 400 })

  } catch (error) {
    console.error('[Billing API] GET Error:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error'
    }, { status: 500 })
  }
}
