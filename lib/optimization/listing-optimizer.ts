/**
 * Listing Optimizer
 *
 * Comprehensive title and description optimization for eBay listings.
 * Integrates Cassini algorithm optimization with policy compliance checking.
 *
 * Features:
 * - Title optimization (75-80 chars, front-loaded keywords, no spam)
 * - Description optimization (structured, keyword-rich, mobile-friendly)
 * - VERO brand filtering
 * - Policy compliance enforcement
 * - Auto-fix capabilities
 * - Tier-based optimization levels
 */

import {
  containsVeroBrand,
  removeVeroBrands,
  containsBlacklistKeywords,
  sanitizeBlacklistKeywords,
  containsContactInfo,
  removeContactInfo,
  fullComplianceScan,
  BLACKLIST_KEYWORDS,
} from './vero-blacklist';

import {
  analyzeCompliance,
  autoFixContent,
  ComplianceReport,
  PolicyViolation,
  ViolationSeverity,
} from './policy-compliance';

// Optimization tier levels
export type OptimizationTier = 'basic' | 'standard' | 'premium' | 'enterprise';

// Title optimization result
export interface TitleOptimizationResult {
  originalTitle: string;
  optimizedTitle: string;
  wasModified: boolean;
  cassiniScore: number; // 0-100
  complianceScore: number; // 0-100
  changes: TitleChange[];
  warnings: string[];
  blockers: string[]; // Critical issues that prevent listing
}

// Description optimization result
export interface DescriptionOptimizationResult {
  originalDescription: string;
  optimizedDescription: string;
  wasModified: boolean;
  complianceReport: ComplianceReport;
  structureScore: number; // 0-100
  readabilityScore: number; // 0-100
  changes: DescriptionChange[];
  warnings: string[];
  blockers: string[];
}

// Full listing optimization result
export interface ListingOptimizationResult {
  title: TitleOptimizationResult;
  description: DescriptionOptimizationResult;
  overallScore: number; // 0-100
  canList: boolean;
  blockers: string[];
  tierBenefits: string[]; // Benefits unlocked by current tier
  upgradeBenefits: string[]; // Benefits available at higher tiers
}

// Change tracking
interface TitleChange {
  type: 'removed_spam' | 'removed_vero' | 'removed_blacklist' | 'truncated' | 'reformatted' | 'keyword_reorder';
  original: string;
  replacement: string;
  reason: string;
}

interface DescriptionChange {
  type: 'removed_violation' | 'reformatted' | 'added_structure' | 'removed_contact' | 'cleaned_html';
  original: string;
  replacement: string;
  reason: string;
}

// Cassini title optimization constants
const CASSINI_TITLE_CONFIG = {
  minLength: 40,
  optimalLength: 75,
  maxLength: 80,
  absoluteMaxLength: 80, // eBay hard limit
  minWords: 5,
  optimalWords: 8,
};

// Spam terms that hurt Cassini ranking
const TITLE_SPAM_TERMS = [
  'l@@k', 'look', 'wow', 'amazing', 'awesome', 'incredible', 'rare',
  'must see', 'must have', 'hot', 'sexy', 'cool', 'best price',
  'lowest price', 'cheapest', 'hurry', 'limited time', 'act fast',
  'won\'t last', 'buy now', 'free shipping', 'fast shipping',
  'quick ship', 'ships fast', 'ships today', 'obo', 'make offer',
  'desperate', 'motivated seller', '!!!', '???', '***', '###', '$$$',
];

// Description structure templates
const DESCRIPTION_TEMPLATES = {
  standard: `
<div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #333; border-bottom: 2px solid #e0e0e0; padding-bottom: 10px;">{{PRODUCT_NAME}}</h2>

  <div style="margin: 20px 0;">
    <h3 style="color: #555;">Product Details</h3>
    <p>{{MAIN_DESCRIPTION}}</p>
  </div>

  <div style="margin: 20px 0;">
    <h3 style="color: #555;">Features</h3>
    <ul style="line-height: 1.8;">
      {{FEATURES}}
    </ul>
  </div>

  <div style="margin: 20px 0;">
    <h3 style="color: #555;">Specifications</h3>
    {{SPECIFICATIONS}}
  </div>

  <div style="margin: 20px 0; padding: 15px; background: #f9f9f9; border-radius: 5px;">
    <h3 style="color: #555; margin-top: 0;">Shipping & Returns</h3>
    <p>{{SHIPPING_INFO}}</p>
  </div>
</div>
`.trim(),

  minimal: `
<div style="font-family: Arial, sans-serif; padding: 15px;">
  <p>{{MAIN_DESCRIPTION}}</p>
  {{FEATURES}}
</div>
`.trim(),

  premium: `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 900px; margin: 0 auto;">
  <header style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 10px 10px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">{{PRODUCT_NAME}}</h1>
  </header>

  <main style="padding: 30px; background: #fff; border: 1px solid #e0e0e0;">
    <section style="margin-bottom: 30px;">
      <h2 style="color: #333; font-size: 18px; border-left: 4px solid #667eea; padding-left: 15px;">About This Item</h2>
      <p style="color: #555; line-height: 1.8;">{{MAIN_DESCRIPTION}}</p>
    </section>

    <section style="margin-bottom: 30px;">
      <h2 style="color: #333; font-size: 18px; border-left: 4px solid #667eea; padding-left: 15px;">Key Features</h2>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px;">
        {{FEATURES_GRID}}
      </div>
    </section>

    <section style="margin-bottom: 30px;">
      <h2 style="color: #333; font-size: 18px; border-left: 4px solid #667eea; padding-left: 15px;">Specifications</h2>
      <table style="width: 100%; border-collapse: collapse;">
        {{SPECIFICATIONS_TABLE}}
      </table>
    </section>
  </main>

  <footer style="padding: 20px; background: #f8f9fa; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <p style="color: #666; font-size: 14px; margin: 0;">{{SHIPPING_INFO}}</p>
  </footer>
</div>
`.trim(),
};

/**
 * Main Listing Optimizer class
 */
export class ListingOptimizer {
  private tier: OptimizationTier;
  private category?: string;
  private strictMode: boolean;

  constructor(options: {
    tier?: OptimizationTier;
    category?: string;
    strictMode?: boolean;
  } = {}) {
    this.tier = options.tier || 'standard';
    this.category = options.category;
    this.strictMode = options.strictMode ?? true;
  }

  /**
   * Optimize a complete listing (title + description)
   */
  optimizeListing(
    title: string,
    description: string,
    options: {
      productName?: string;
      features?: string[];
      specifications?: Record<string, string>;
    } = {}
  ): ListingOptimizationResult {
    const titleResult = this.optimizeTitle(title);
    const descriptionResult = this.optimizeDescription(description, options);

    const allBlockers = [...titleResult.blockers, ...descriptionResult.blockers];
    const canList = allBlockers.length === 0;

    const overallScore = Math.round(
      (titleResult.cassiniScore * 0.4) +
      (titleResult.complianceScore * 0.2) +
      (descriptionResult.complianceReport.isCompliant ? 100 : 100 - descriptionResult.complianceReport.riskScore) * 0.2 +
      (descriptionResult.structureScore * 0.1) +
      (descriptionResult.readabilityScore * 0.1)
    );

    return {
      title: titleResult,
      description: descriptionResult,
      overallScore,
      canList,
      blockers: allBlockers,
      tierBenefits: this.getTierBenefits(),
      upgradeBenefits: this.getUpgradeBenefits(),
    };
  }

  /**
   * Optimize title for Cassini and compliance
   */
  optimizeTitle(title: string): TitleOptimizationResult {
    const changes: TitleChange[] = [];
    const warnings: string[] = [];
    const blockers: string[] = [];
    let optimized = title.trim();

    // Step 1: Check for VERO brands (CRITICAL)
    const veroCheck = containsVeroBrand(optimized);
    if (veroCheck.found) {
      if (veroCheck.riskLevel === 'high') {
        blockers.push(`VERO high-risk brands detected: ${veroCheck.brands.join(', ')}`);
      }
      const beforeVero = optimized;
      optimized = removeVeroBrands(optimized);
      if (beforeVero !== optimized) {
        changes.push({
          type: 'removed_vero',
          original: veroCheck.brands.join(', '),
          replacement: '',
          reason: 'VERO protected brands removed to prevent IP violations',
        });
      }
    }

    // Step 2: Check for blacklist keywords
    const blacklistCheck = containsBlacklistKeywords(optimized);
    if (blacklistCheck.found) {
      const critical = blacklistCheck.violations.filter(v => v.severity === 'critical');
      if (critical.length > 0) {
        blockers.push(`Critical policy violations: ${critical.map(v => v.keyword).join(', ')}`);
      }
      const beforeBlacklist = optimized;
      optimized = sanitizeBlacklistKeywords(optimized);
      if (beforeBlacklist !== optimized) {
        changes.push({
          type: 'removed_blacklist',
          original: blacklistCheck.violations.map(v => v.keyword).join(', '),
          replacement: '',
          reason: 'Blacklisted keywords removed for policy compliance',
        });
      }
    }

    // Step 3: Remove spam terms (Cassini penalty)
    for (const spam of TITLE_SPAM_TERMS) {
      const regex = new RegExp(`\\b${escapeRegex(spam)}\\b`, 'gi');
      if (regex.test(optimized)) {
        const before = optimized;
        optimized = optimized.replace(regex, '');
        if (before !== optimized) {
          changes.push({
            type: 'removed_spam',
            original: spam,
            replacement: '',
            reason: 'Spam keyword hurts Cassini ranking',
          });
        }
      }
    }

    // Step 4: Clean formatting
    const beforeFormat = optimized;
    optimized = optimized
      .replace(/[!]{2,}/g, '!') // Multiple ! to single
      .replace(/[?]{2,}/g, '?') // Multiple ? to single
      .replace(/[.]{2,}/g, '.') // Multiple . to single
      .replace(/[-]{2,}/g, '-') // Multiple - to single
      .replace(/\s+/g, ' ') // Multiple spaces to single
      .replace(/\s+([.,!?-])/g, '$1') // Remove space before punctuation
      .replace(/^[-\s]+|[-\s]+$/g, '') // Trim dashes and spaces
      .trim();

    if (beforeFormat !== optimized) {
      changes.push({
        type: 'reformatted',
        original: 'formatting',
        replacement: 'cleaned',
        reason: 'Cleaned excessive punctuation and formatting',
      });
    }

    // Step 5: Truncate to Cassini optimal length (75-80 chars)
    if (optimized.length > CASSINI_TITLE_CONFIG.absoluteMaxLength) {
      const beforeTrunc = optimized;
      // Try to truncate at word boundary
      optimized = truncateAtWordBoundary(optimized, CASSINI_TITLE_CONFIG.optimalLength);
      changes.push({
        type: 'truncated',
        original: `${beforeTrunc.length} chars`,
        replacement: `${optimized.length} chars`,
        reason: `Truncated to Cassini optimal length (${CASSINI_TITLE_CONFIG.optimalLength} chars)`,
      });
    }

    // Step 6: Validate minimum requirements
    if (optimized.length < CASSINI_TITLE_CONFIG.minLength) {
      warnings.push(`Title is short (${optimized.length} chars). Optimal is ${CASSINI_TITLE_CONFIG.optimalLength}+ chars.`);
    }

    const wordCount = optimized.split(/\s+/).length;
    if (wordCount < CASSINI_TITLE_CONFIG.minWords) {
      warnings.push(`Title has few words (${wordCount}). Optimal is ${CASSINI_TITLE_CONFIG.optimalWords}+ words.`);
    }

    // Calculate scores
    const cassiniScore = this.calculateCassiniTitleScore(optimized);
    const complianceScore = this.calculateTitleComplianceScore(optimized);

    return {
      originalTitle: title,
      optimizedTitle: optimized,
      wasModified: title !== optimized,
      cassiniScore,
      complianceScore,
      changes,
      warnings,
      blockers,
    };
  }

  /**
   * Optimize description for compliance and structure
   */
  optimizeDescription(
    description: string,
    options: {
      productName?: string;
      features?: string[];
      specifications?: Record<string, string>;
    } = {}
  ): DescriptionOptimizationResult {
    const changes: DescriptionChange[] = [];
    const warnings: string[] = [];
    const blockers: string[] = [];
    let optimized = description;

    // Step 1: Run compliance check
    const complianceReport = analyzeCompliance(optimized, this.category, {
      strictMode: this.strictMode,
      includeWarnings: true,
    });

    // Step 2: Check for critical violations
    const criticalViolations = complianceReport.violations.filter(v => v.severity === 'critical');
    if (criticalViolations.length > 0) {
      for (const violation of criticalViolations) {
        blockers.push(`${violation.category}: ${violation.description}`);
      }
    }

    // Step 3: Auto-fix violations
    if (complianceReport.canAutoFix) {
      const beforeFix = optimized;
      optimized = autoFixContent(optimized, complianceReport.violations);
      if (beforeFix !== optimized) {
        changes.push({
          type: 'removed_violation',
          original: 'policy violations',
          replacement: 'compliant content',
          reason: `Auto-fixed ${complianceReport.violations.filter(v => v.autoFixable).length} violations`,
        });
      }
    }

    // Step 4: Remove contact information
    const contactCheck = containsContactInfo(optimized);
    if (contactCheck.found) {
      const beforeContact = optimized;
      optimized = removeContactInfo(optimized);
      if (beforeContact !== optimized) {
        changes.push({
          type: 'removed_contact',
          original: contactCheck.matches.map(m => m.type).join(', '),
          replacement: '',
          reason: 'Removed contact information (eBay policy)',
        });
        blockers.push('Contact information was found and removed. Review listing before posting.');
      }
    }

    // Step 5: Clean HTML (tier-dependent)
    if (this.tier === 'premium' || this.tier === 'enterprise') {
      const beforeHtml = optimized;
      optimized = this.cleanAndStructureHtml(optimized, options);
      if (beforeHtml !== optimized) {
        changes.push({
          type: 'cleaned_html',
          original: 'raw HTML',
          replacement: 'structured HTML',
          reason: 'Applied premium HTML template',
        });
      }
    } else if (this.tier === 'standard') {
      const beforeHtml = optimized;
      optimized = this.cleanBasicHtml(optimized);
      if (beforeHtml !== optimized) {
        changes.push({
          type: 'cleaned_html',
          original: 'raw HTML',
          replacement: 'cleaned HTML',
          reason: 'Cleaned HTML formatting',
        });
      }
    }

    // Step 6: Check minimum length
    const textContent = stripHtml(optimized);
    const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;

    if (wordCount < 50) {
      warnings.push(`Description is short (${wordCount} words). Optimal is 200+ words for Cassini.`);
    }

    // Calculate scores
    const structureScore = this.calculateStructureScore(optimized);
    const readabilityScore = this.calculateReadabilityScore(textContent);

    // Re-run compliance on fixed content
    const finalComplianceReport = analyzeCompliance(optimized, this.category, {
      strictMode: this.strictMode,
      includeWarnings: true,
    });

    return {
      originalDescription: description,
      optimizedDescription: optimized,
      wasModified: description !== optimized,
      complianceReport: finalComplianceReport,
      structureScore,
      readabilityScore,
      changes,
      warnings,
      blockers,
    };
  }

  /**
   * Calculate Cassini title score
   */
  private calculateCassiniTitleScore(title: string): number {
    let score = 100;

    // Length scoring
    const length = title.length;
    if (length < CASSINI_TITLE_CONFIG.minLength) {
      score -= (CASSINI_TITLE_CONFIG.minLength - length) * 2;
    } else if (length > CASSINI_TITLE_CONFIG.maxLength) {
      score -= (length - CASSINI_TITLE_CONFIG.maxLength) * 3;
    } else if (length >= CASSINI_TITLE_CONFIG.optimalLength) {
      score += 5; // Bonus for optimal length
    }

    // Word count scoring
    const words = title.split(/\s+/).length;
    if (words < CASSINI_TITLE_CONFIG.minWords) {
      score -= (CASSINI_TITLE_CONFIG.minWords - words) * 5;
    }

    // Check for remaining spam terms
    const lowerTitle = title.toLowerCase();
    for (const spam of TITLE_SPAM_TERMS) {
      if (lowerTitle.includes(spam.toLowerCase())) {
        score -= 15;
      }
    }

    // Check for excessive punctuation
    const punctuationCount = (title.match(/[!?*#$@]/g) || []).length;
    if (punctuationCount > 2) {
      score -= punctuationCount * 5;
    }

    // Check for ALL CAPS words
    const allCapsWords = title.split(/\s+/).filter(w => w.length > 3 && w === w.toUpperCase()).length;
    if (allCapsWords > 1) {
      score -= allCapsWords * 10;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate title compliance score
   */
  private calculateTitleComplianceScore(title: string): number {
    let score = 100;

    // VERO check
    const veroCheck = containsVeroBrand(title);
    if (veroCheck.found) {
      score -= veroCheck.riskLevel === 'high' ? 50 : 25;
    }

    // Blacklist check
    const blacklistCheck = containsBlacklistKeywords(title);
    for (const violation of blacklistCheck.violations) {
      switch (violation.severity) {
        case 'critical': score -= 30; break;
        case 'high': score -= 20; break;
        case 'medium': score -= 10; break;
        case 'low': score -= 5; break;
      }
    }

    // Contact info check
    const contactCheck = containsContactInfo(title);
    if (contactCheck.found) {
      score -= 40;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Calculate description structure score
   */
  private calculateStructureScore(description: string): number {
    let score = 50; // Base score

    // Check for HTML structure
    if (/<div|<p|<ul|<ol|<h[1-6]>/i.test(description)) {
      score += 15;
    }

    // Check for sections
    if (/<h[2-4]/i.test(description)) {
      score += 10;
    }

    // Check for lists
    if (/<li>/i.test(description)) {
      score += 10;
    }

    // Check for styling
    if (/style\s*=/i.test(description)) {
      score += 5;
    }

    // Check for mobile-friendly width
    if (/max-width|width:\s*100%/i.test(description)) {
      score += 10;
    }

    return Math.min(100, score);
  }

  /**
   * Calculate readability score
   */
  private calculateReadabilityScore(text: string): number {
    if (!text || text.trim().length === 0) return 0;

    const words = text.split(/\s+/).filter(w => w.length > 0);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

    if (words.length === 0 || sentences.length === 0) return 0;

    // Average words per sentence
    const avgWordsPerSentence = words.length / sentences.length;

    // Average word length
    const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / words.length;

    // Simple readability formula (lower is easier to read)
    const readabilityIndex = (avgWordsPerSentence * 0.5) + (avgWordLength * 3);

    // Convert to 0-100 score (optimal readability index is around 10-15)
    if (readabilityIndex < 10) return 90;
    if (readabilityIndex < 15) return 100;
    if (readabilityIndex < 20) return 85;
    if (readabilityIndex < 25) return 70;
    if (readabilityIndex < 30) return 55;
    return 40;
  }

  /**
   * Clean and structure HTML with template
   */
  private cleanAndStructureHtml(
    description: string,
    options: {
      productName?: string;
      features?: string[];
      specifications?: Record<string, string>;
    }
  ): string {
    const template = this.tier === 'enterprise'
      ? DESCRIPTION_TEMPLATES.premium
      : DESCRIPTION_TEMPLATES.standard;

    // Extract text content
    const textContent = stripHtml(description);

    // Build structured description
    let structured = template
      .replace('{{PRODUCT_NAME}}', options.productName || 'Product Details')
      .replace('{{MAIN_DESCRIPTION}}', textContent.substring(0, 500))
      .replace('{{SHIPPING_INFO}}', 'Ships from authorized location. Please see shipping details above.');

    // Add features
    if (options.features && options.features.length > 0) {
      const featuresList = options.features
        .map(f => `<li>${escapeHtml(f)}</li>`)
        .join('\n');
      structured = structured.replace('{{FEATURES}}', featuresList);

      // For premium template
      const featuresGrid = options.features
        .map(f => `<div style="padding: 10px; background: #f8f9fa; border-radius: 5px;">${escapeHtml(f)}</div>`)
        .join('\n');
      structured = structured.replace('{{FEATURES_GRID}}', featuresGrid);
    } else {
      structured = structured.replace('{{FEATURES}}', '<li>See description for details</li>');
      structured = structured.replace('{{FEATURES_GRID}}', '');
    }

    // Add specifications
    if (options.specifications && Object.keys(options.specifications).length > 0) {
      const specsList = Object.entries(options.specifications)
        .map(([key, value]) => `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${escapeHtml(key)}</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHtml(value)}</td></tr>`)
        .join('\n');
      structured = structured.replace('{{SPECIFICATIONS}}', `<table style="width: 100%;">${specsList}</table>`);
      structured = structured.replace('{{SPECIFICATIONS_TABLE}}', specsList);
    } else {
      structured = structured.replace('{{SPECIFICATIONS}}', '<p>Please refer to item specifics above.</p>');
      structured = structured.replace('{{SPECIFICATIONS_TABLE}}', '');
    }

    return structured;
  }

  /**
   * Basic HTML cleaning
   */
  private cleanBasicHtml(description: string): string {
    return description
      // Remove script and style tags
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      // Remove onclick and other event handlers
      .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
      // Remove javascript: URLs
      .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, '')
      // Clean excessive whitespace
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Get benefits for current tier
   */
  private getTierBenefits(): string[] {
    const benefits: Record<OptimizationTier, string[]> = {
      basic: [
        'VERO brand filtering',
        'Basic blacklist keyword removal',
        'Title length optimization',
      ],
      standard: [
        'Full VERO brand database',
        'Comprehensive blacklist filtering',
        'Cassini title optimization',
        'Basic HTML cleaning',
        'Policy compliance checking',
      ],
      premium: [
        'All Standard features',
        'Premium HTML templates',
        'Advanced compliance analysis',
        'Description restructuring',
        'Readability optimization',
        'Category-specific rules',
      ],
      enterprise: [
        'All Premium features',
        'Custom templates',
        'Real-time compliance monitoring',
        'Bulk optimization',
        'API access',
        'Priority support',
      ],
    };

    return benefits[this.tier];
  }

  /**
   * Get benefits available at higher tiers
   */
  private getUpgradeBenefits(): string[] {
    const allTiers: OptimizationTier[] = ['basic', 'standard', 'premium', 'enterprise'];
    const currentIndex = allTiers.indexOf(this.tier);

    if (currentIndex >= allTiers.length - 1) {
      return ['You have the highest tier'];
    }

    const nextTier = allTiers[currentIndex + 1];
    const upgradeMap: Record<OptimizationTier, string[]> = {
      basic: ['Upgrade to Standard for full compliance checking and Cassini optimization'],
      standard: ['Upgrade to Premium for advanced templates and description restructuring'],
      premium: ['Upgrade to Enterprise for custom templates and API access'],
      enterprise: [],
    };

    return upgradeMap[this.tier];
  }
}

// Helper functions
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateAtWordBoundary(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const truncated = text.substring(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');

  if (lastSpace > maxLength * 0.7) {
    return truncated.substring(0, lastSpace);
  }

  return truncated;
}

// Convenience functions
export function optimizeTitle(title: string, tier: OptimizationTier = 'standard'): TitleOptimizationResult {
  const optimizer = new ListingOptimizer({ tier });
  return optimizer.optimizeTitle(title);
}

export function optimizeDescription(description: string, tier: OptimizationTier = 'standard'): DescriptionOptimizationResult {
  const optimizer = new ListingOptimizer({ tier });
  return optimizer.optimizeDescription(description);
}

export function optimizeListing(
  title: string,
  description: string,
  tier: OptimizationTier = 'standard'
): ListingOptimizationResult {
  const optimizer = new ListingOptimizer({ tier });
  return optimizer.optimizeListing(title, description);
}

// Quick compliance check
export function quickComplianceCheck(content: string, category?: string): {
  isCompliant: boolean;
  hasVeroRisk: boolean;
  hasBlacklistHits: boolean;
  hasContactInfo: boolean;
  riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical';
} {
  const veroCheck = containsVeroBrand(content);
  const blacklistCheck = containsBlacklistKeywords(content);
  const contactCheck = containsContactInfo(content);

  let riskLevel: 'none' | 'low' | 'medium' | 'high' | 'critical' = 'none';

  if (contactCheck.found || blacklistCheck.violations.some(v => v.severity === 'critical')) {
    riskLevel = 'critical';
  } else if (veroCheck.riskLevel === 'high' || blacklistCheck.violations.some(v => v.severity === 'high')) {
    riskLevel = 'high';
  } else if (veroCheck.found || blacklistCheck.violations.some(v => v.severity === 'medium')) {
    riskLevel = 'medium';
  } else if (blacklistCheck.found) {
    riskLevel = 'low';
  }

  return {
    isCompliant: !veroCheck.found && !blacklistCheck.found && !contactCheck.found,
    hasVeroRisk: veroCheck.found,
    hasBlacklistHits: blacklistCheck.found,
    hasContactInfo: contactCheck.found,
    riskLevel,
  };
}
