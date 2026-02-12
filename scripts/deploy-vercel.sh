#!/bin/bash
# OTTO Research Labs - Vercel Deployment Script
# Run this script locally to deploy to Vercel

set -e

echo "=========================================="
echo "OTTO Research Labs - Vercel Deployment"
echo "=========================================="

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for Vercel CLI
if ! command -v vercel &> /dev/null; then
    echo -e "${YELLOW}Installing Vercel CLI...${NC}"
    npm install -g vercel
fi

# Check for required environment variables
echo ""
echo -e "${YELLOW}Step 1: Checking environment variables...${NC}"

if [ -f .env.local ]; then
    source <(grep -v '^#' .env.local | sed 's/^/export /')
    echo -e "${GREEN}✓ Loaded .env.local${NC}"
else
    echo -e "${RED}✗ .env.local not found. Please create it first.${NC}"
    exit 1
fi

# Required vars check
REQUIRED_VARS=(
    "NEXT_PUBLIC_SUPABASE_URL"
    "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    "SUPABASE_SERVICE_ROLE_KEY"
    "STRIPE_SECRET_KEY"
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "${RED}✗ Missing required environment variables:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo "  - $var"
    done
    exit 1
fi
echo -e "${GREEN}✓ All required environment variables present${NC}"

# Step 2: Setup Stripe products if needed
echo ""
echo -e "${YELLOW}Step 2: Setting up Stripe products...${NC}"

if [ -z "$STRIPE_STARTER_PRICE_ID" ] || [ "$STRIPE_STARTER_PRICE_ID" == "" ]; then
    echo "Creating Stripe products and prices..."
    npx tsx scripts/setup-stripe.ts

    # Reload env to get new price IDs
    source <(grep -v '^#' .env.local | sed 's/^/export /')
    echo -e "${GREEN}✓ Stripe products created${NC}"
else
    echo -e "${GREEN}✓ Stripe products already configured${NC}"
fi

# Step 3: Deploy to Vercel
echo ""
echo -e "${YELLOW}Step 3: Deploying to Vercel...${NC}"

# Check if project is linked
if [ ! -d ".vercel" ]; then
    echo "Linking project to Vercel..."
    vercel link --yes
fi

# Set environment variables
echo "Setting environment variables..."
vercel env rm NEXT_PUBLIC_SUPABASE_URL production --yes 2>/dev/null || true
vercel env rm NEXT_PUBLIC_SUPABASE_ANON_KEY production --yes 2>/dev/null || true
vercel env rm SUPABASE_SERVICE_ROLE_KEY production --yes 2>/dev/null || true
vercel env rm NEXT_PUBLIC_APP_URL production --yes 2>/dev/null || true
vercel env rm STRIPE_SECRET_KEY production --yes 2>/dev/null || true
vercel env rm NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production --yes 2>/dev/null || true
vercel env rm STRIPE_STARTER_PRICE_ID production --yes 2>/dev/null || true
vercel env rm STRIPE_GROWTH_PRICE_ID production --yes 2>/dev/null || true
vercel env rm STRIPE_PROFESSIONAL_PRICE_ID production --yes 2>/dev/null || true
vercel env rm STRIPE_ENTERPRISE_PRICE_ID production --yes 2>/dev/null || true
vercel env rm AUTODS_EMAIL production --yes 2>/dev/null || true
vercel env rm AUTODS_PASSWORD production --yes 2>/dev/null || true
vercel env rm KEEPA_API_KEY production --yes 2>/dev/null || true
vercel env rm SENDGRID_API_KEY production --yes 2>/dev/null || true
vercel env rm EMAIL_FROM production --yes 2>/dev/null || true
vercel env rm CRON_SECRET production --yes 2>/dev/null || true
vercel env rm NEXT_PUBLIC_ENABLE_BILLING production --yes 2>/dev/null || true
vercel env rm NEXT_PUBLIC_ENABLE_ANALYTICS production --yes 2>/dev/null || true
vercel env rm EBAY_APP_ID production --yes 2>/dev/null || true
vercel env rm EBAY_DEV_ID production --yes 2>/dev/null || true
vercel env rm EBAY_CERT_ID production --yes 2>/dev/null || true
vercel env rm EBAY_ENVIRONMENT production --yes 2>/dev/null || true
vercel env rm EBAY_REDIRECT_URI production --yes 2>/dev/null || true
vercel env rm ZIK_EMAIL production --yes 2>/dev/null || true
vercel env rm ZIK_PASSWORD production --yes 2>/dev/null || true

echo "$NEXT_PUBLIC_SUPABASE_URL" | vercel env add NEXT_PUBLIC_SUPABASE_URL production
echo "$NEXT_PUBLIC_SUPABASE_ANON_KEY" | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
echo "$SUPABASE_SERVICE_ROLE_KEY" | vercel env add SUPABASE_SERVICE_ROLE_KEY production
echo "$STRIPE_SECRET_KEY" | vercel env add STRIPE_SECRET_KEY production
echo "$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" | vercel env add NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY production
echo "$STRIPE_STARTER_PRICE_ID" | vercel env add STRIPE_STARTER_PRICE_ID production
echo "$STRIPE_GROWTH_PRICE_ID" | vercel env add STRIPE_GROWTH_PRICE_ID production
echo "$STRIPE_PROFESSIONAL_PRICE_ID" | vercel env add STRIPE_PROFESSIONAL_PRICE_ID production
echo "$STRIPE_ENTERPRISE_PRICE_ID" | vercel env add STRIPE_ENTERPRISE_PRICE_ID production
echo "$AUTODS_EMAIL" | vercel env add AUTODS_EMAIL production
echo "$AUTODS_PASSWORD" | vercel env add AUTODS_PASSWORD production
echo "$KEEPA_API_KEY" | vercel env add KEEPA_API_KEY production
echo "$SENDGRID_API_KEY" | vercel env add SENDGRID_API_KEY production
echo "$EMAIL_FROM" | vercel env add EMAIL_FROM production
echo "$CRON_SECRET" | vercel env add CRON_SECRET production
echo "true" | vercel env add NEXT_PUBLIC_ENABLE_BILLING production
echo "true" | vercel env add NEXT_PUBLIC_ENABLE_ANALYTICS production
[ -n "$EBAY_APP_ID" ] && echo "$EBAY_APP_ID" | vercel env add EBAY_APP_ID production
[ -n "$EBAY_DEV_ID" ] && echo "$EBAY_DEV_ID" | vercel env add EBAY_DEV_ID production
[ -n "$EBAY_CERT_ID" ] && echo "$EBAY_CERT_ID" | vercel env add EBAY_CERT_ID production
[ -n "$EBAY_ENVIRONMENT" ] && echo "$EBAY_ENVIRONMENT" | vercel env add EBAY_ENVIRONMENT production
[ -n "$EBAY_REDIRECT_URI" ] && echo "$EBAY_REDIRECT_URI" | vercel env add EBAY_REDIRECT_URI production
[ -n "$ZIK_EMAIL" ] && echo "$ZIK_EMAIL" | vercel env add ZIK_EMAIL production
[ -n "$ZIK_PASSWORD" ] && echo "$ZIK_PASSWORD" | vercel env add ZIK_PASSWORD production

echo -e "${GREEN}✓ Environment variables configured${NC}"

# Deploy
echo ""
echo "Deploying to production..."
DEPLOYMENT_URL=$(vercel --prod --yes)

echo ""
echo -e "${GREEN}=========================================="
echo "Deployment Complete!"
echo "==========================================${NC}"
echo ""
echo -e "Production URL: ${GREEN}$DEPLOYMENT_URL${NC}"
echo ""

# Update APP_URL with the deployment URL
echo "$DEPLOYMENT_URL" | vercel env add NEXT_PUBLIC_APP_URL production 2>/dev/null || true

# Step 4: Configure Stripe Webhook
echo -e "${YELLOW}Step 4: Stripe Webhook Setup${NC}"
echo ""
echo "Create a webhook in Stripe Dashboard:"
echo "  1. Go to https://dashboard.stripe.com/test/webhooks"
echo "  2. Click 'Add endpoint'"
echo "  3. Endpoint URL: ${DEPLOYMENT_URL}/api/webhooks/stripe"
echo "  4. Select events:"
echo "     - customer.subscription.created"
echo "     - customer.subscription.updated"
echo "     - customer.subscription.deleted"
echo "     - invoice.payment_succeeded"
echo "     - invoice.payment_failed"
echo "  5. Copy the signing secret (whsec_...)"
echo ""
echo "Then run:"
echo "  echo 'whsec_YOUR_SECRET' | vercel env add STRIPE_WEBHOOK_SECRET production"
echo "  vercel --prod"
echo ""

# Step 5: Configure Supabase
echo -e "${YELLOW}Step 5: Supabase Auth Configuration${NC}"
echo ""
echo "Update Supabase Auth settings:"
echo "  1. Go to your Supabase project → Authentication → URL Configuration"
echo "  2. Site URL: $DEPLOYMENT_URL"
echo "  3. Add to Redirect URLs: ${DEPLOYMENT_URL}/auth/callback"
echo ""

echo -e "${GREEN}Deployment script complete!${NC}"
