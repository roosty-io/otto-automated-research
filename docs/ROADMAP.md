# OTTO Research Labs - Product Roadmap

## Current Status: 70-75% MVP Complete
**Last Updated:** February 12, 2026

---

## Executive Summary

OTTO Research Labs is a dropshipping automation SaaS that uses Otto-pilot™ to handle product research, listing creation, optimization, and replacement automatically. The core system is 70-75% complete with 75+ managed stores ready for validation.

**Strategy:** Validate with managed stores for 30-60 days before releasing to external users.

---

## Phase 1: Stabilization & Testing (Weeks 1-2)
**Goal:** Ensure core systems are reliable before validation

### Tasks
| Task | Priority | Status |
|------|----------|--------|
| Test AutoDS scrapers against current UI | CRITICAL | Pending |
| Test ZIK Analytics scrapers | CRITICAL | Pending |
| Add Sentry error monitoring | HIGH | Pending |
| Add request validation (Zod) | HIGH | Pending |
| Create basic health check endpoints | HIGH | Pending |
| Document API endpoints | MEDIUM | Pending |

### Success Criteria
- [ ] AutoDS automation runs without errors
- [ ] ZIK research pipeline functions
- [ ] Errors are captured and alerted
- [ ] All API inputs are validated

---

## Phase 2: Validation Infrastructure (Weeks 3-4)
**Goal:** Build tools to measure system performance

### Tasks
| Task | Priority | Status |
|------|----------|--------|
| Build validation metrics dashboard | CRITICAL | Pending |
| Implement sell-through tracking | CRITICAL | Pending |
| Implement prune rate tracking | CRITICAL | Pending |
| Implement profit per listing tracking | CRITICAL | Pending |
| Create account health monitoring | HIGH | Pending |
| Wire admin dashboard to live data | HIGH | Pending |
| Build product quality scoring | MEDIUM | Pending |

### Metrics to Track
| Metric | Target | Why It Matters |
|--------|--------|----------------|
| Sell-through rate | >7% | Product research quality |
| Net profit/sale | >$5 | Pricing effectiveness |
| Monthly prune rate | <40% | Selection accuracy |
| Account health | 100% green | Risk management |
| Source availability | >90% | Supplier reliability |
| Days to first sale | <14 | Listing quality |
| Product overlap | <3 users | Uniqueness |

---

## Phase 3: Validation Period (Weeks 5-8)
**Goal:** 30+ days of real data from 75+ managed stores

### Weekly Activities
| Week | Focus |
|------|-------|
| Week 5 | Baseline metrics, identify outliers |
| Week 6 | Analyze underperformers, adjust research |
| Week 7 | Optimize repricing/pruning thresholds |
| Week 8 | Final metrics review, go/no-go decision |

### Key Questions to Answer
- [ ] What's the actual sell-through rate?
- [ ] What's the real prune rate after 30 days?
- [ ] Are any accounts getting restricted?
- [ ] What's average profit per listing per month?
- [ ] How long to ramp a store to target listings?
- [ ] What's the product overlap across stores?
- [ ] What categories perform best?
- [ ] What's the optimal listing age before pruning?

### Decision Point
**Week 8:** Review all metrics and decide:
- **Green:** Proceed to limited beta
- **Yellow:** Extend validation 30 more days
- **Red:** Major pivot needed

---

## Phase 4: Pre-Launch Preparation (Weeks 9-12)
**Goal:** Prepare for external users

### Tasks
| Task | Priority | Status |
|------|----------|--------|
| Build waitlist landing page | HIGH | Pending |
| Set up email capture (ConvertKit/Mailchimp) | HIGH | Pending |
| Create email nurture sequence | MEDIUM | Pending |
| Finalize subscription tiers in Stripe | HIGH | Pending |
| Implement billing enforcement | HIGH | Pending |
| Terms of Service / Privacy Policy | HIGH | Pending |
| Production security audit | HIGH | Pending |
| Create onboarding flow | MEDIUM | Pending |
| Build help documentation | MEDIUM | Pending |

### Waitlist Strategy
- Landing page with value proposition
- "Join 2,500+ sellers on the waitlist" counter
- Early bird pricing (first 500 get 20% off)
- Referral bonus (move up waitlist)
- Monthly progress updates via email

---

## Phase 5: Limited Beta (Weeks 13-16)
**Goal:** Onboard first 50 external users

### Rollout Plan
| Week | Users | Focus |
|------|-------|-------|
| Week 13 | 10 | Onboarding flow testing |
| Week 14 | 25 | Support load testing |
| Week 15 | 50 | Billing flow testing |
| Week 16 | 50 | Stability monitoring |

### Success Criteria
- [ ] <5% churn in first 30 days
- [ ] Avg time to first sale <14 days
- [ ] Support tickets <10% of users
- [ ] Zero account suspensions
- [ ] Positive NPS (>30)

---

## Phase 6: Public Launch (Week 17+)
**Goal:** Open to all waitlist subscribers

### Launch Activities
- Open registration from waitlist
- Honor early bird pricing
- Begin content marketing
- Launch referral program
- Scale support team

---

## Subscription Tiers (Final)

| Tier | Price | Listings | Profit Target | eBay Store |
|------|-------|----------|---------------|------------|
| **Lite** | $49/mo | 500 | "See how it works" | Basic |
| **Starter** | $149/mo | 2,000 | $500-$1,000 | Premium |
| **Growth** | $299/mo | 5,000 | $1,000-$3,000 | Premium |
| **Professional** | $499/mo | 10,000 | $2,500-$5,000 | Anchor |
| **Enterprise** | $999/mo | 20,000 | $5,000-$10,000 | Anchor |

**All tiers include:**
- Otto-pilot™ full automation
- Policy compliance scanning
- 14-day free trial (50 listings)
- 1 store per subscription

---

## Future Feature Roadmap

### Q2 2026 - Expansion
| Feature | Description | Priority |
|---------|-------------|----------|
| **Walmart Marketplace** | Expand beyond eBay | HIGH |
| **Additional Suppliers** | CJ Dropshipping, AliExpress | HIGH |
| **Advanced Analytics** | Predictive forecasting | MEDIUM |
| **Team Accounts** | Multiple users per account | MEDIUM |

### Q3 2026 - International
| Feature | Description | Priority |
|---------|-------------|----------|
| **UK Market** | eBay UK + Amazon UK sourcing | HIGH |
| **EU Markets** | Germany, France, Italy, Spain | MEDIUM |
| **Currency Handling** | Multi-currency pricing | HIGH |
| **VAT Compliance** | EU tax handling | HIGH |

### Q4 2026 - Platform
| Feature | Description | Priority |
|---------|-------------|----------|
| **API Access** | Programmatic access for power users | MEDIUM |
| **Mobile App** | iOS/Android for monitoring | LOW |
| **White Label** | Reseller/agency offering | MEDIUM |
| **Inventory Sync** | Real-time inventory management | HIGH |

### 2027 - Scale
| Feature | Description | Priority |
|---------|-------------|----------|
| **Amazon Seller** | List on Amazon (not just source) | HIGH |
| **Etsy Integration** | Handmade/vintage expansion | MEDIUM |
| **Shopify Integration** | Direct store integration | MEDIUM |
| **Wholesale Sourcing** | Beyond arbitrage | HIGH |
| **AI Product Creation** | Generate unique bundles | MEDIUM |

---

## Marketplace Expansion Roadmap

### Phase 1: eBay Dominance (Current)
```
Source: Amazon US
Sell: eBay US
```

### Phase 2: Multi-Marketplace US
```
Source: Amazon US, CJ Dropshipping, AliExpress
Sell: eBay US, Walmart US
```

### Phase 3: International
```
Source: Amazon US/UK/DE, CJ, AliExpress
Sell: eBay US/UK/DE/AU, Walmart US
```

### Phase 4: Full Platform
```
Source: Amazon (all), Wholesale, CJ, AliExpress, Direct suppliers
Sell: eBay (all), Walmart, Amazon, Shopify, Etsy
```

---

## Supplier Integration Roadmap

| Supplier | Timeline | Complexity | Value |
|----------|----------|------------|-------|
| **Amazon US** | ✅ Complete | - | Core |
| **CJ Dropshipping** | Q2 2026 | Medium | Margin improvement |
| **AliExpress** | Q2 2026 | Medium | Product variety |
| **Amazon UK** | Q3 2026 | Low | UK market |
| **Amazon DE** | Q3 2026 | Medium | EU market |
| **Wholesale directories** | Q4 2026 | High | Margin improvement |
| **Direct suppliers** | 2027 | High | Best margins |

---

## Geographic Expansion Roadmap

| Market | Timeline | Requirements |
|--------|----------|--------------|
| **US** | ✅ Live | - |
| **UK** | Q3 2026 | eBay UK API, Amazon UK, GBP pricing |
| **Australia** | Q3 2026 | eBay AU API, AUD pricing |
| **Germany** | Q4 2026 | eBay DE API, VAT, EUR pricing |
| **Canada** | Q4 2026 | eBay CA API, CAD pricing |
| **France** | 2027 | eBay FR API, VAT, EUR pricing |

---

## Technical Debt to Address

| Item | Impact | Timeline |
|------|--------|----------|
| Add test coverage | CRITICAL | Phase 1 |
| Replace CSS selectors with APIs | HIGH | Phase 2 |
| Add proper logging/monitoring | HIGH | Phase 1 |
| Implement circuit breakers | MEDIUM | Phase 3 |
| Database query optimization | MEDIUM | Phase 4 |
| Frontend performance | LOW | Phase 5 |

---

## Key Milestones

| Milestone | Target Date | Status |
|-----------|-------------|--------|
| Core system complete | Feb 2026 | ✅ 75% |
| Validation infrastructure | Mar 2026 | Pending |
| 30-day validation complete | Apr 2026 | Pending |
| Waitlist launch | Apr 2026 | Pending |
| Limited beta (50 users) | May 2026 | Pending |
| Public launch | Jun 2026 | Pending |
| 500 paying users | Aug 2026 | Pending |
| 1,000 paying users | Oct 2026 | Pending |
| 5,000 paying users | Sep 2027 | Pending |
| AutoDS acquisition target | 2027-2028 | Pending |

---

## Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| AutoDS changes UI | HIGH | HIGH | Build API alternative, monitor for changes |
| eBay policy changes | MEDIUM | HIGH | Conservative compliance, quick response |
| Product research fails | MEDIUM | CRITICAL | Validate before launch, pivot if needed |
| Competitor enters market | MEDIUM | MEDIUM | Move fast, build moat with quality |
| Scale issues | LOW | HIGH | Load test, optimize early |
| Account suspensions | MEDIUM | HIGH | Conservative policy, user education |

---

## Success Metrics (North Stars)

| Metric | 6 Month | 12 Month | 18 Month |
|--------|---------|----------|----------|
| MRR | $50K | $250K | $1M |
| Users | 500 | 2,000 | 5,000 |
| Churn | <10% | <7% | <5% |
| NPS | >30 | >40 | >50 |
| Support tickets/user | <2/mo | <1/mo | <0.5/mo |

---

*This roadmap is a living document and will be updated based on validation results and market feedback.*
