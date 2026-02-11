# OTTO Research Labs - MVP Build Plan

**Target Launch:** April 15, 2026
**Current Date:** February 11, 2026
**Available Days:** ~63 days (9 weeks)

---

## Build Order Rationale

The flywheel has dependencies:
```
DISCOVER → VALIDATE → LIST → OPTIMIZE → ANALYZE → PRUNE
    ↑                                              |
    └──────────────────────────────────────────────┘
```

**Critical Path Analysis:**
1. **Puppeteer** is required for both ZIK (discover) and AutoDS (list) - build once, use twice
2. **Keepa API** is independent and easier (has real API) - can parallelize
3. **AutoDS automation** is the MVP gate - without this, no listings go live
4. **Pruning** needs live listings + sales data - build later but essential for April
5. **Price optimization** is valuable but can be Phase 2 post-launch

---

## Phase 1: Foundation (Days 1-5)

### Day 1: Puppeteer Infrastructure
- [ ] Install puppeteer, puppeteer-extra, puppeteer-extra-plugin-stealth
- [ ] Create `/lib/automation/browser.ts` - browser pool manager
- [ ] Create `/lib/automation/session.ts` - session/cookie persistence
- [ ] Set up proxy rotation support (for avoiding rate limits)
- [ ] Create base page interaction helpers (wait, click, type, screenshot)
- [ ] Test basic browser launch in serverless environment

### Day 2: Keepa API Integration
- [ ] Create `/lib/integrations/keepa.ts` - Keepa API client
- [ ] Implement product lookup by ASIN
- [ ] Implement category best sellers lookup
- [ ] Implement price history retrieval
- [ ] Parse Keepa response into `raw_products` format
- [ ] Create `/app/api/keepa/lookup/route.ts` endpoint
- [ ] Add KEEPA_API_KEY to environment

### Day 3: ZIK Analytics Scraper (Part 1)
- [ ] Create `/lib/automation/zik/auth.ts` - ZIK login handler
- [ ] Create `/lib/automation/zik/session.ts` - session cookie management
- [ ] Implement ZIK login flow with 2FA handling
- [ ] Store session cookies in database for reuse
- [ ] Test authenticated access to ZIK dashboard

### Day 4: ZIK Analytics Scraper (Part 2)
- [ ] Create `/lib/automation/zik/product-research.ts` - product search
- [ ] Implement eBay sold items search via ZIK
- [ ] Extract: title, price, sold count, seller, category
- [ ] Create `/lib/automation/zik/category-explorer.ts`
- [ ] Implement trending categories extraction
- [ ] Rate limiting and request throttling

### Day 5: Research Pipeline Integration
- [ ] Create `/app/api/research/zik/route.ts` - trigger ZIK research
- [ ] Create `/app/api/research/amazon/route.ts` - Keepa lookup
- [ ] Implement raw_products insertion from both sources
- [ ] Create background job queue for research tasks
- [ ] Update Research page UI to trigger actual scraping
- [ ] Test end-to-end: ZIK demand → Keepa source → raw_product

---

## Phase 2: Product Processing (Days 6-10)

### Day 6: Product Normalization with Claude
- [ ] Create `/lib/ai/normalize.ts` - Claude API integration
- [ ] Design normalization prompt (title, bullets, category mapping)
- [ ] Implement batch processing (10 products per API call)
- [ ] Create `/app/api/normalize/route.ts` endpoint
- [ ] Insert normalized products into `normalized_products` table
- [ ] Add ANTHROPIC_API_KEY to environment

### Day 7: Quality Scoring System
- [ ] Create `/lib/scoring/product-score.ts` - scoring algorithm
- [ ] Factors: demand (ZIK sold), margin, competition, policy risk
- [ ] Implement quality_score calculation (0-100)
- [ ] Create `/lib/scoring/demand-confidence.ts`
- [ ] Calculate demand_confidence from ZIK data
- [ ] Auto-update scores on product insertion

### Day 8: Pattern Detection
- [ ] Create `/lib/patterns/detector.ts` - pattern matching
- [ ] Analyze normalized products for profit patterns
- [ ] Extract: category, price_band, keywords, margin range
- [ ] Auto-create patterns from successful products
- [ ] Link patterns to normalized products
- [ ] Create pattern validation rules

### Day 9: SKU Generation Pipeline
- [ ] Create `/lib/pipeline/sku-generator.ts`
- [ ] Auto-generate SKUs from high-scoring normalized products
- [ ] Apply policy check before SKU creation
- [ ] Set initial pricing based on margin targets
- [ ] Create `/app/api/pipeline/generate-skus/route.ts`
- [ ] Batch processing with configurable limits

### Day 10: Pipeline Automation
- [ ] Create `/app/api/cron/process-research/route.ts`
- [ ] Orchestrate: raw → normalized → scored → SKU
- [ ] Add to Vercel cron schedule
- [ ] Implement pipeline status tracking
- [ ] Create pipeline dashboard widget
- [ ] Test full discovery-to-SKU flow

---

## Phase 3: AutoDS Integration (Days 11-18)

### Day 11: AutoDS Authentication
- [ ] Create `/lib/automation/autods/auth.ts` - login handler
- [ ] Implement AutoDS login with email/password
- [ ] Handle 2FA if required
- [ ] Store and refresh session cookies
- [ ] Create session validation check
- [ ] Add AUTODS credentials to environment

### Day 12: AutoDS Navigation
- [ ] Map AutoDS dashboard structure
- [ ] Create `/lib/automation/autods/navigation.ts`
- [ ] Implement store selector (for 100 stores)
- [ ] Navigate to product upload section
- [ ] Navigate to drafts section
- [ ] Navigate to active listings section

### Day 13: AutoDS Product Upload (Part 1)
- [ ] Create `/lib/automation/autods/upload.ts`
- [ ] Implement single product upload flow
- [ ] Fill: title, description, price, images, category
- [ ] Handle image URL injection
- [ ] Handle category selection dropdown
- [ ] Save as draft functionality

### Day 14: AutoDS Product Upload (Part 2)
- [ ] Implement bulk upload via CSV
- [ ] Generate AutoDS-compatible CSV format
- [ ] Upload CSV through AutoDS interface
- [ ] Monitor upload progress
- [ ] Handle upload errors and retries
- [ ] Parse upload results

### Day 15: AutoDS Draft Management
- [ ] Create `/lib/automation/autods/drafts.ts`
- [ ] List all drafts for a store
- [ ] Publish draft to eBay
- [ ] Bulk publish drafts
- [ ] Delete failed drafts
- [ ] Track draft → active status

### Day 16: AutoDS Listing Management
- [ ] Create `/lib/automation/autods/listings.ts`
- [ ] Get active listing count per store
- [ ] End listing (for pruning)
- [ ] Update listing price
- [ ] Update listing quantity
- [ ] Sync listing status back to database

### Day 17: AutoDS Integration API
- [ ] Create `/app/api/autods/upload/route.ts`
- [ ] Create `/app/api/autods/publish/route.ts`
- [ ] Create `/app/api/autods/sync/route.ts`
- [ ] Implement job queue for AutoDS tasks
- [ ] Rate limiting (respect AutoDS limits)
- [ ] Error handling and retry logic

### Day 18: Listing Pipeline Integration
- [ ] Connect SKU assignments to AutoDS upload
- [ ] Create `/app/api/cron/process-listings/route.ts`
- [ ] Batch process pending assignments
- [ ] Update assignment status after upload
- [ ] Track AutoDS listing IDs in database
- [ ] Test end-to-end: SKU → Assignment → AutoDS → eBay

---

## Phase 4: Optimization & Pruning (Days 19-25)

### Day 19: Sales Data Sync
- [ ] Create `/lib/automation/autods/sales.ts`
- [ ] Scrape sales data from AutoDS dashboard
- [ ] Extract: order ID, SKU, price, date, profit
- [ ] Create `/app/api/autods/sync-sales/route.ts`
- [ ] Insert sales into `sales` table
- [ ] Update `last_sale_at` on assignments
- [ ] Schedule daily sales sync

### Day 20: Performance Analytics
- [ ] Create `/lib/analytics/performance.ts`
- [ ] Calculate per-SKU metrics: views, sales, conversion
- [ ] Calculate per-store metrics: revenue, profit, velocity
- [ ] Calculate per-pattern metrics: success rate, avg profit
- [ ] Create analytics API endpoints
- [ ] Update Analytics dashboard with real data

### Day 21: Pruning Engine (Part 1)
- [ ] Create `/lib/automation/pruning/detector.ts`
- [ ] Define pruning thresholds (configurable per tier)
- [ ] Identify candidates: no sale in X days
- [ ] Calculate pruning score (age, impressions, category avg)
- [ ] Create pruning recommendations queue

### Day 22: Pruning Engine (Part 2)
- [ ] Create `/lib/automation/pruning/executor.ts`
- [ ] End listing via AutoDS
- [ ] Update assignment status to 'pruned'
- [ ] Create enforcement action record
- [ ] Free up store listing slot
- [ ] Create `/app/api/cron/auto-prune/route.ts`
- [ ] Add to Vercel cron schedule

### Day 23: Replacement Pipeline
- [ ] Connect pruning to replenishment
- [ ] When listing pruned → trigger new SKU assignment
- [ ] Prioritize high-performing patterns for replacement
- [ ] Avoid re-listing same SKU to same store
- [ ] Track prune → replace cycle metrics

### Day 24: Price Optimization (Basic)
- [ ] Create `/lib/optimization/repricing.ts`
- [ ] Implement margin-based repricing rules
- [ ] If no sales in 7 days → reduce by 5%
- [ ] If high sales → increase by 3%
- [ ] Floor: maintain minimum margin
- [ ] Ceiling: don't exceed competitor avg

### Day 25: Price Optimization Integration
- [ ] Create `/app/api/cron/optimize-prices/route.ts`
- [ ] Connect to AutoDS price update
- [ ] Track price change history
- [ ] Create price optimization dashboard widget
- [ ] A/B test: optimized vs static pricing

---

## Phase 5: Production Hardening (Days 26-35)

### Day 26: Error Handling & Monitoring
- [ ] Implement structured logging (Axiom/Logtail)
- [ ] Create error tracking (Sentry integration)
- [ ] Set up uptime monitoring
- [ ] Create system health dashboard
- [ ] Alert on critical failures (Slack/Discord)

### Day 27: Rate Limiting & Throttling
- [ ] Implement per-service rate limits
- [ ] ZIK: max 100 requests/hour
- [ ] AutoDS: max 50 uploads/hour per store
- [ ] Keepa: respect API limits
- [ ] Queue overflow handling
- [ ] Backpressure mechanisms

### Day 28: Session Management
- [ ] Implement session health checks
- [ ] Auto-refresh expired sessions
- [ ] Handle captcha/bot detection
- [ ] Session rotation for large operations
- [ ] Credential vault (encrypted storage)

### Day 29: Job Queue Robustness
- [ ] Implement dead letter queue
- [ ] Retry with exponential backoff
- [ ] Job timeout handling
- [ ] Priority queue implementation
- [ ] Job cancellation support
- [ ] Queue metrics dashboard

### Day 30: Database Optimization
- [ ] Review and add missing indexes
- [ ] Implement connection pooling
- [ ] Add database query monitoring
- [ ] Optimize slow queries
- [ ] Set up database backups
- [ ] Test restore procedure

### Day 31: Cron Job Consolidation
- [ ] Audit all cron jobs
- [ ] Consolidate into master orchestrator
- [ ] Implement job dependencies
- [ ] Add job scheduling UI
- [ ] Create cron execution logs
- [ ] Handle overlapping executions

### Day 32: Scaling Preparation
- [ ] Test with 10 stores simultaneously
- [ ] Test with 1000 products/day
- [ ] Identify bottlenecks
- [ ] Implement horizontal scaling strategy
- [ ] Document resource requirements
- [ ] Cost projection per user

### Day 33: Security Audit
- [ ] Audit API authentication
- [ ] Review environment variable handling
- [ ] Check for SQL injection vulnerabilities
- [ ] Validate input sanitization
- [ ] Review CORS configuration
- [ ] Implement API rate limiting per user

### Day 34: Testing Suite
- [ ] Create integration tests for ZIK scraper
- [ ] Create integration tests for AutoDS
- [ ] Create API endpoint tests
- [ ] Create pipeline flow tests
- [ ] Set up CI/CD test runs
- [ ] Document test procedures

### Day 35: Documentation
- [ ] Document all API endpoints
- [ ] Document automation workflows
- [ ] Create operator runbook
- [ ] Document troubleshooting procedures
- [ ] Create architecture diagram
- [ ] Video walkthrough of system

---

## Phase 6: Multi-Tenant & Auth (Days 36-42)

### Day 36: Supabase Auth Setup
- [ ] Enable Supabase Auth
- [ ] Configure email/password auth
- [ ] Configure Google OAuth
- [ ] Set up email templates (branded)
- [ ] Implement password reset flow
- [ ] Configure redirect URLs for ottoresearch.io

### Day 37: User Management
- [ ] Create users table with profile data
- [ ] Link users to stores (1 store per user default)
- [ ] Implement user roles (user, admin)
- [ ] Create user settings storage
- [ ] Implement account deletion
- [ ] GDPR data export

### Day 38: Row Level Security
- [ ] Enable RLS on all tables
- [ ] Users can only see their own stores
- [ ] Users can only see their own SKUs
- [ ] Users can only see their own sales
- [ ] Admin bypass for support
- [ ] Test RLS policies thoroughly

### Day 39: Auth UI Components
- [ ] Create `/app/auth/login/page.tsx`
- [ ] Create `/app/auth/signup/page.tsx`
- [ ] Create `/app/auth/forgot-password/page.tsx`
- [ ] Create `/components/AuthGuard.tsx`
- [ ] Implement session management
- [ ] Redirect unauthenticated users

### Day 40: Onboarding Flow
- [ ] Create `/app/onboarding/page.tsx`
- [ ] Step 1: Connect eBay store (via AutoDS)
- [ ] Step 2: Set profit goals
- [ ] Step 3: Choose categories of interest
- [ ] Step 4: Start first research
- [ ] Welcome email sequence trigger

### Day 41: User Dashboard Personalization
- [ ] Show user's store data only
- [ ] Personalized metrics
- [ ] User-specific goals
- [ ] Activity history
- [ ] Notification center

### Day 42: Team Support (Future)
- [ ] Design team/organization model
- [ ] Implement invite system (stub)
- [ ] Role-based permissions (stub)
- [ ] Shared store access (stub)
- [ ] Document for Phase 2

---

## Phase 7: Billing & Launch (Days 43-50)

### Day 43: Stripe Integration Setup
- [ ] Create Stripe account (if not exists)
- [ ] Install @stripe/stripe-js
- [ ] Create `/lib/billing/stripe.ts`
- [ ] Configure products (Lite, Pro, Max, Ultra)
- [ ] Configure pricing (monthly + annual)
- [ ] Set up webhook endpoint

### Day 44: Subscription Management
- [ ] Create `/app/api/billing/create-checkout/route.ts`
- [ ] Create `/app/api/billing/portal/route.ts`
- [ ] Handle subscription.created webhook
- [ ] Handle subscription.updated webhook
- [ ] Handle subscription.deleted webhook
- [ ] Update user tier on subscription change

### Day 45: Billing UI
- [ ] Create `/app/pricing/page.tsx` (public)
- [ ] Create `/app/settings/billing/page.tsx`
- [ ] Show current plan
- [ ] Upgrade/downgrade options
- [ ] Payment method management
- [ ] Invoice history

### Day 46: Usage Limits Enforcement
- [ ] Track active listings per user
- [ ] Enforce tier listing limits
- [ ] Show usage meter in dashboard
- [ ] Warning at 80% usage
- [ ] Block at 100% (or allow overage)
- [ ] Upgrade prompts

### Day 47: Trial & Onboarding
- [ ] 14-day free trial implementation
- [ ] Trial limits (50 listings)
- [ ] Trial expiration handling
- [ ] Convert trial to paid
- [ ] Trial extension (support action)

### Day 48: Landing Page
- [ ] Create `/app/(marketing)/page.tsx`
- [ ] Hero section with value prop
- [ ] Feature showcase
- [ ] Pricing section
- [ ] Testimonials (placeholder)
- [ ] CTA to signup

### Day 49: Pre-Launch Testing
- [ ] Full user journey test
- [ ] Signup → Trial → Research → List → Sell → Upgrade
- [ ] Test all edge cases
- [ ] Load testing
- [ ] Mobile responsiveness
- [ ] Cross-browser testing

### Day 50: Launch Prep
- [ ] DNS configuration for ottoresearch.io
- [ ] SSL certificate verification
- [ ] Production environment variables
- [ ] Monitoring dashboards live
- [ ] Support email configured
- [ ] Launch announcement prepared

---

## Post-Launch Phase (Days 51-63)

### Week 8: Beta Users
- [ ] Invite 10 beta users
- [ ] Daily check-ins
- [ ] Bug fixes
- [ ] Feature feedback collection
- [ ] Performance monitoring
- [ ] Iterate on UX issues

### Week 9: Soft Launch
- [ ] Open to 50 users
- [ ] Monitor system stability
- [ ] Customer support setup
- [ ] Documentation updates
- [ ] Marketing website refinements
- [ ] Prepare for scale

---

## Daily Time Allocation

| Block | Hours | Focus |
|-------|-------|-------|
| Morning | 4h | Core development |
| Afternoon | 3h | Testing & integration |
| Evening | 1h | Documentation & planning |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| ZIK blocks scraping | Proxy rotation, stealth plugins, rate limiting |
| AutoDS changes UI | Selector versioning, visual regression tests |
| Keepa API limits | Caching, batch requests, upgrade plan if needed |
| Session expiration | Auto-refresh, health checks, re-auth flow |
| Scaling issues | Load testing early, horizontal scaling design |

---

## Success Metrics for MVP

- [ ] 100+ products researched per day
- [ ] 50+ listings created per day
- [ ] 5 stores operating simultaneously
- [ ] < 1% listing failure rate
- [ ] Auto-pruning active
- [ ] 1 paying customer

---

## Phase 2 (Post-MVP) Backlog

1. Advanced price optimization with competitor monitoring
2. Yabelle integration
3. Multiple stores per user
4. Team/organization accounts
5. API access for power users
6. Mobile app
7. Advanced analytics with forecasting
8. Inventory management
9. Supplier diversification (beyond Amazon)
10. White-label reseller program
