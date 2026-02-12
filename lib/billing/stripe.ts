// OTTO Research Labs - Stripe Billing Integration
// Handles subscriptions, payments, and customer management

import Stripe from 'stripe'
import { createAdminClient } from '@/lib/auth/server'

// Lazy-initialized Stripe client
let stripeInstance: Stripe | null = null

function getStripe(): Stripe {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is required')
    }
    stripeInstance = new Stripe(key, {
      apiVersion: '2024-12-18.acacia',
    })
  }
  return stripeInstance
}

// ============================================================================
// SUBSCRIPTION TIERS
// ============================================================================

export const STRIPE_TIERS = {
  starter: {
    name: 'Starter',
    priceId: process.env.STRIPE_STARTER_PRICE_ID!,
    monthlyPrice: 199,
    features: ['1 store', '500 listings', 'Basic analytics', 'Email support']
  },
  growth: {
    name: 'Growth',
    priceId: process.env.STRIPE_GROWTH_PRICE_ID!,
    monthlyPrice: 299,
    features: ['3 stores', '2,000 listings', 'Advanced analytics', 'Priority support', 'Auto-repricing']
  },
  professional: {
    name: 'Professional',
    priceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID!,
    monthlyPrice: 499,
    features: ['10 stores', '10,000 listings', 'Full analytics', '24/7 support', 'API access']
  },
  enterprise: {
    name: 'Enterprise',
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID!,
    monthlyPrice: 999,
    features: ['Unlimited stores', 'Unlimited listings', 'Custom integrations', 'Dedicated account manager']
  }
}

export type TierKey = keyof typeof STRIPE_TIERS

// ============================================================================
// CUSTOMER MANAGEMENT
// ============================================================================

export async function createOrGetCustomer(userId: string, email: string, name?: string) {
  const adminClient = createAdminClient()

  // Check if customer exists
  const { data: subscription } = await adminClient
    .from('user_subscriptions')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .single()

  if (subscription?.stripe_customer_id) {
    return subscription.stripe_customer_id
  }

  // Create new Stripe customer
  const customer = await getStripe().customers.create({
    email,
    name: name || undefined,
    metadata: {
      userId
    }
  })

  // Store customer ID
  await adminClient
    .from('user_subscriptions')
    .upsert({
      user_id: userId,
      tier_id: 'free',
      status: 'incomplete',
      stripe_customer_id: customer.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    })

  return customer.id
}

export async function getCustomer(customerId: string) {
  try {
    const customer = await getStripe().customers.retrieve(customerId)
    return customer
  } catch (error) {
    console.error('[Stripe] Failed to get customer:', error)
    return null
  }
}

// ============================================================================
// CHECKOUT SESSION
// ============================================================================

export async function createCheckoutSession(
  userId: string,
  email: string,
  tier: TierKey,
  successUrl: string,
  cancelUrl: string
) {
  const customerId = await createOrGetCustomer(userId, email)
  const tierData = STRIPE_TIERS[tier]

  if (!tierData.priceId) {
    throw new Error(`Price ID not configured for tier: ${tier}`)
  }

  const session = await getStripe().checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: tierData.priceId,
        quantity: 1
      }
    ],
    success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: cancelUrl,
    subscription_data: {
      trial_period_days: 14,
      metadata: {
        userId,
        tier
      }
    },
    metadata: {
      userId,
      tier
    },
    allow_promotion_codes: true,
    billing_address_collection: 'required',
    customer_update: {
      address: 'auto',
      name: 'auto'
    }
  })

  return session
}

// ============================================================================
// BILLING PORTAL
// ============================================================================

export async function createBillingPortalSession(customerId: string, returnUrl: string) {
  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl
  })

  return session
}

// ============================================================================
// SUBSCRIPTION MANAGEMENT
// ============================================================================

export async function getSubscription(subscriptionId: string) {
  try {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId)
    return subscription
  } catch (error) {
    console.error('[Stripe] Failed to get subscription:', error)
    return null
  }
}

export async function updateSubscription(subscriptionId: string, newPriceId: string) {
  try {
    const subscription = await getStripe().subscriptions.retrieve(subscriptionId)
    const itemId = subscription.items.data[0]?.id

    if (!itemId) {
      throw new Error('No subscription item found')
    }

    const updated = await getStripe().subscriptions.update(subscriptionId, {
      items: [{
        id: itemId,
        price: newPriceId
      }],
      proration_behavior: 'create_prorations'
    })

    return updated
  } catch (error) {
    console.error('[Stripe] Failed to update subscription:', error)
    throw error
  }
}

export async function cancelSubscription(subscriptionId: string, immediately = false) {
  try {
    if (immediately) {
      const deleted = await getStripe().subscriptions.cancel(subscriptionId)
      return deleted
    }

    const updated = await getStripe().subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    })

    return updated
  } catch (error) {
    console.error('[Stripe] Failed to cancel subscription:', error)
    throw error
  }
}

export async function reactivateSubscription(subscriptionId: string) {
  try {
    const updated = await getStripe().subscriptions.update(subscriptionId, {
      cancel_at_period_end: false
    })

    return updated
  } catch (error) {
    console.error('[Stripe] Failed to reactivate subscription:', error)
    throw error
  }
}

// ============================================================================
// WEBHOOK HANDLING
// ============================================================================

export async function constructWebhookEvent(payload: string, signature: string) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET!

  try {
    const event = getStripe().webhooks.constructEvent(payload, signature, webhookSecret)
    return event
  } catch (error) {
    console.error('[Stripe] Webhook signature verification failed:', error)
    throw error
  }
}

export async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const adminClient = createAdminClient()
  const userId = subscription.metadata.userId
  const tier = subscription.metadata.tier || 'starter'

  if (!userId) {
    console.error('[Stripe] No userId in subscription metadata')
    return
  }

  await adminClient
    .from('user_subscriptions')
    .upsert({
      user_id: userId,
      tier_id: tier,
      status: subscription.status as any,
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer as string,
      stripe_price_id: subscription.items.data[0]?.price.id,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      trial_start: subscription.trial_start
        ? new Date(subscription.trial_start * 1000).toISOString()
        : null,
      trial_end: subscription.trial_end
        ? new Date(subscription.trial_end * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    })

  console.log(`[Stripe] Subscription created for user ${userId}: ${subscription.id}`)
}

export async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const adminClient = createAdminClient()

  // Find user by customer ID
  const { data: existingSub } = await adminClient
    .from('user_subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', subscription.id)
    .single()

  if (!existingSub) {
    console.error('[Stripe] No subscription found for:', subscription.id)
    return
  }

  // Determine tier from price
  let tier = 'starter'
  const priceId = subscription.items.data[0]?.price.id
  for (const [key, value] of Object.entries(STRIPE_TIERS)) {
    if (value.priceId === priceId) {
      tier = key
      break
    }
  }

  await adminClient
    .from('user_subscriptions')
    .update({
      tier_id: tier,
      status: subscription.status as any,
      stripe_price_id: priceId,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
      canceled_at: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString()
    })
    .eq('stripe_subscription_id', subscription.id)

  console.log(`[Stripe] Subscription updated: ${subscription.id} -> ${subscription.status}`)
}

export async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const adminClient = createAdminClient()

  await adminClient
    .from('user_subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('stripe_subscription_id', subscription.id)

  console.log(`[Stripe] Subscription deleted: ${subscription.id}`)
}

export async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const adminClient = createAdminClient()

  if (invoice.subscription) {
    await adminClient
      .from('user_subscriptions')
      .update({
        status: 'active',
        updated_at: new Date().toISOString()
      })
      .eq('stripe_subscription_id', invoice.subscription)
  }

  console.log(`[Stripe] Invoice paid: ${invoice.id}`)
}

export async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const adminClient = createAdminClient()

  if (invoice.subscription) {
    await adminClient
      .from('user_subscriptions')
      .update({
        status: 'past_due',
        updated_at: new Date().toISOString()
      })
      .eq('stripe_subscription_id', invoice.subscription)
  }

  console.log(`[Stripe] Invoice payment failed: ${invoice.id}`)
}

// ============================================================================
// USAGE REPORTING (for metered billing)
// ============================================================================

export async function reportUsage(subscriptionItemId: string, quantity: number) {
  try {
    const usageRecord = await getStripe().subscriptionItems.createUsageRecord(
      subscriptionItemId,
      {
        quantity,
        timestamp: Math.floor(Date.now() / 1000),
        action: 'increment'
      }
    )

    return usageRecord
  } catch (error) {
    console.error('[Stripe] Failed to report usage:', error)
    throw error
  }
}
