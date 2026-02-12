// Script to set up Stripe products and prices for OTTO Research Labs
// Run with: npx ts-node scripts/setup-stripe.ts

import Stripe from 'stripe'
import * as fs from 'fs'
import * as path from 'path'

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY

if (!STRIPE_SECRET_KEY) {
  console.error('Error: STRIPE_SECRET_KEY environment variable is required')
  console.error('Set it in your .env.local file or pass it as an environment variable')
  process.exit(1)
}

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
})

interface TierConfig {
  name: string
  description: string
  monthlyPrice: number
  features: string[]
}

const TIERS: Record<string, TierConfig> = {
  starter: {
    name: 'OTTO Starter',
    description: 'Perfect for getting started with dropshipping automation',
    monthlyPrice: 199,
    features: ['1 store', '500 listings', 'Basic analytics', 'Email support']
  },
  growth: {
    name: 'OTTO Growth',
    description: 'Scale your business with advanced features',
    monthlyPrice: 299,
    features: ['3 stores', '2,000 listings', 'Advanced analytics', 'Priority support', 'Auto-repricing']
  },
  professional: {
    name: 'OTTO Professional',
    description: 'Full-featured solution for serious sellers',
    monthlyPrice: 499,
    features: ['10 stores', '10,000 listings', 'Full analytics', '24/7 support', 'API access']
  },
  enterprise: {
    name: 'OTTO Enterprise',
    description: 'Custom solution for high-volume operations',
    monthlyPrice: 999,
    features: ['Unlimited stores', 'Unlimited listings', 'Custom integrations', 'Dedicated account manager']
  }
}

async function setupStripeProducts() {
  console.log('Setting up Stripe products and prices...\n')

  const priceIds: Record<string, string> = {}

  for (const [tierId, config] of Object.entries(TIERS)) {
    console.log(`Creating ${config.name}...`)

    // Check if product already exists
    const existingProducts = await stripe.products.search({
      query: `name:'${config.name}'`
    })

    let product: Stripe.Product

    if (existingProducts.data.length > 0) {
      product = existingProducts.data[0]
      console.log(`  Product already exists: ${product.id}`)
    } else {
      // Create product
      product = await stripe.products.create({
        name: config.name,
        description: config.description,
        metadata: {
          tier: tierId,
          features: JSON.stringify(config.features)
        }
      })
      console.log(`  Created product: ${product.id}`)
    }

    // Check if price already exists
    const existingPrices = await stripe.prices.list({
      product: product.id,
      active: true
    })

    let price: Stripe.Price

    const matchingPrice = existingPrices.data.find(
      p => p.unit_amount === config.monthlyPrice * 100 && p.recurring?.interval === 'month'
    )

    if (matchingPrice) {
      price = matchingPrice
      console.log(`  Price already exists: ${price.id}`)
    } else {
      // Create price
      price = await stripe.prices.create({
        product: product.id,
        unit_amount: config.monthlyPrice * 100, // Stripe uses cents
        currency: 'usd',
        recurring: {
          interval: 'month'
        },
        metadata: {
          tier: tierId
        }
      })
      console.log(`  Created price: ${price.id} ($${config.monthlyPrice}/month)`)
    }

    priceIds[tierId] = price.id
  }

  console.log('\n========================================')
  console.log('Stripe Setup Complete!')
  console.log('========================================\n')
  console.log('Add these to your .env.local file:\n')
  console.log(`STRIPE_STARTER_PRICE_ID=${priceIds.starter}`)
  console.log(`STRIPE_GROWTH_PRICE_ID=${priceIds.growth}`)
  console.log(`STRIPE_PROFESSIONAL_PRICE_ID=${priceIds.professional}`)
  console.log(`STRIPE_ENTERPRISE_PRICE_ID=${priceIds.enterprise}`)

  // Optionally update .env.local automatically
  const envPath = path.join(__dirname, '..', '.env.local')
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, 'utf-8')

    envContent = envContent.replace(/STRIPE_STARTER_PRICE_ID=.*/, `STRIPE_STARTER_PRICE_ID=${priceIds.starter}`)
    envContent = envContent.replace(/STRIPE_GROWTH_PRICE_ID=.*/, `STRIPE_GROWTH_PRICE_ID=${priceIds.growth}`)
    envContent = envContent.replace(/STRIPE_PROFESSIONAL_PRICE_ID=.*/, `STRIPE_PROFESSIONAL_PRICE_ID=${priceIds.professional}`)
    envContent = envContent.replace(/STRIPE_ENTERPRISE_PRICE_ID=.*/, `STRIPE_ENTERPRISE_PRICE_ID=${priceIds.enterprise}`)

    fs.writeFileSync(envPath, envContent)
    console.log('\n.env.local has been updated automatically!')
  }

  // Create a webhook endpoint for local development
  console.log('\n========================================')
  console.log('Webhook Setup')
  console.log('========================================')
  console.log('\nTo receive webhooks locally, run:')
  console.log('  stripe listen --forward-to localhost:3000/api/webhooks/stripe')
  console.log('\nThis will give you a webhook signing secret (whsec_...)')
  console.log('Add it to .env.local as STRIPE_WEBHOOK_SECRET')

  return priceIds
}

// Run the setup
setupStripeProducts()
  .then(() => {
    console.log('\nSetup complete!')
    process.exit(0)
  })
  .catch((error) => {
    console.error('Setup failed:', error)
    process.exit(1)
  })
