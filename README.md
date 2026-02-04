# PPME - Product Pattern Manufacturing Engine

Fully automated dropshipping intelligence system for managing 100+ eBay stores.

## Project Structure

```
ppme/
├── database/                    # SQL migrations for Supabase
│   ├── 000_combined_migration.sql  # Single file for initial deployment
│   ├── 001_schema.sql           # Core tables
│   ├── 002_store_maturity.sql   # Maturity system
│   ├── 004_dynamic_ceiling.sql  # Fee-aware ceilings
│   └── 005_listing_jobs.sql     # Job queue
├── admin-dashboard/             # Next.js admin dashboard
│   ├── app/                     # App router pages
│   ├── components/              # React components
│   └── lib/                     # Utilities and types
└── server.js                    # ZikAnalytics scraper (existing)
```

## Quick Start

### 1. Deploy Database to Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to SQL Editor in your Supabase dashboard
3. Copy the contents of `database/000_combined_migration.sql`
4. Paste and run in the SQL Editor
5. Verify by running:
   ```sql
   SELECT tier_name, target_monthly_profit, min_active_listings, max_total_listings
   FROM store_tiers ORDER BY target_monthly_profit;
   ```

### 2. Set Up Admin Dashboard

```bash
cd admin-dashboard
npm install
```

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Get these values from your Supabase project:
- Go to Project Settings > API
- Copy the Project URL, anon key, and service_role key

### 3. Run the Dashboard

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Features

### Dashboard
- Overview of all stores by tier
- Key metrics (total listings, active stores)
- Quick actions

### Store Management
- Add new stores with tier selection
- View store details and progress
- Edit store configuration
- Delete stores

### Tier Configuration
- Bronze: 5,000 floor, 10,000 ceiling, $3,000/mo target
- Silver: 10,000 floor, 25,000 ceiling, $5,000/mo target
- Gold: 15,000 floor, 30,000 ceiling, $8,000/mo target
- Platinum: 20,000 floor, 40,000 ceiling, $10,000/mo target

### Maturity System
Stores progress through maturity levels:
- **New** (0-14 days): 40% velocity
- **Establishing** (15-30 days): 60% velocity
- **Growing** (31-60 days): 80% velocity
- **Mature** (61-90 days): 95% velocity
- **Seasoned** (91+ days): 100% velocity

## Database Schema

Key tables:
- `store_tiers` - Tier configuration
- `stores` - eBay stores
- `store_maturity_tiers` - Maturity level configuration
- `listing_jobs` - Job queue for listing operations
- `raw_products` - Layer 0: Ingested products
- `normalized_products` - Layer 1: AI-cleaned products
- `patterns` - Layer 2: Learned profit patterns
- `skus` - Layer 3: Manufactured SKUs
- `store_sku_assignments` - Layer 4: Distribution
- `sales` - Order data with financials

## Deployment

### Vercel (Recommended for Dashboard)

1. Push to GitHub
2. Import project in Vercel
3. Set environment variables
4. Deploy

### Supabase Edge Functions (Coming Soon)

Edge functions for:
- Product ingestion (Keepa API)
- Product normalization (Claude API)
- SKU manufacturing
- Distribution engine

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# APIs (for Edge Functions)
ANTHROPIC_API_KEY=xxx
KEEPA_API_KEY=xxx
```
