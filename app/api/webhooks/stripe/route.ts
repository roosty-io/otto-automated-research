// OTTO Research Labs - Stripe Webhook Handler
// Processes Stripe events for subscription management

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import {
  constructWebhookEvent,
  handleSubscriptionCreated,
  handleSubscriptionUpdated,
  handleSubscriptionDeleted,
  handleInvoicePaid,
  handleInvoicePaymentFailed
} from '@/lib/billing/stripe'

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({
      success: false,
      error: 'Missing stripe-signature header'
    }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = await constructWebhookEvent(body, signature)
  } catch (error) {
    console.error('[Webhook] Invalid signature:', error)
    return NextResponse.json({
      success: false,
      error: 'Invalid signature'
    }, { status: 400 })
  }

  console.log(`[Webhook] Received event: ${event.type}`)

  try {
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object as Stripe.Subscription)
        break

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription)
        break

      case 'invoice.paid':
        await handleInvoicePaid(event.data.object as Stripe.Invoice)
        break

      case 'invoice.payment_failed':
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
        break

      case 'checkout.session.completed':
        // Checkout completed - subscription handling is done by subscription.created
        console.log('[Webhook] Checkout completed:', (event.data.object as Stripe.Checkout.Session).id)
        break

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`)
    }

    return NextResponse.json({ success: true, received: true })
  } catch (error) {
    console.error('[Webhook] Error processing event:', error)
    return NextResponse.json({
      success: false,
      error: 'Webhook processing failed'
    }, { status: 500 })
  }
}
