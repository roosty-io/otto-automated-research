/**
 * eBay Policy Compliance Analyzer
 *
 * Comprehensive policy compliance checking for listings to prevent
 * account suspensions, listing removals, and legal issues.
 *
 * Covers all major eBay policies including:
 * - Intellectual Property (VERO)
 * - Off-Platform Transaction Attempts
 * - Contact Information Sharing
 * - Medical Devices
 * - Firearms & Weapons
 * - Drugs & Drug Paraphernalia
 * - Hazardous Materials
 * - Adult Content
 * - Recalled Products
 * - Category-Specific Restrictions
 */

import {
  containsVeroBrand,
  containsBlacklistKeywords,
  containsContactInfo,
  CONTACT_INFO_PATTERNS,
  CATEGORY_RESTRICTIONS,
} from './vero-blacklist';

// Policy violation severity levels
export type ViolationSeverity = 'critical' | 'high' | 'medium' | 'low' | 'warning';

// Policy categories
export type PolicyCategory =
  | 'intellectual_property'
  | 'off_platform_sales'
  | 'contact_information'
  | 'medical_devices'
  | 'firearms_weapons'
  | 'drugs_controlled'
  | 'hazardous_materials'
  | 'adult_content'
  | 'recalled_products'
  | 'counterfeit_goods'
  | 'spam_manipulation'
  | 'misleading_claims'
  | 'category_specific'
  | 'price_manipulation'
  | 'shipping_violations'
  | 'return_policy'
  | 'item_condition'
  | 'location_misrepresentation';

// Policy violation details
export interface PolicyViolation {
  category: PolicyCategory;
  severity: ViolationSeverity;
  rule: string;
  description: string;
  matchedText?: string;
  recommendation: string;
  autoFixable: boolean;
  fixedText?: string;
}

// Compliance report
export interface ComplianceReport {
  isCompliant: boolean;
  overallRisk: ViolationSeverity | 'none';
  riskScore: number; // 0-100, higher is worse
  violations: PolicyViolation[];
  warnings: PolicyViolation[];
  summary: string;
  canAutoFix: boolean;
  autoFixedContent?: string;
}

// Policy rules with patterns and recommendations
interface PolicyRule {
  category: PolicyCategory;
  severity: ViolationSeverity;
  patterns: RegExp[];
  keywords: string[];
  description: string;
  recommendation: string;
  autoFixable: boolean;
  fixPattern?: (text: string, match: string) => string;
}

// Comprehensive policy rules
const POLICY_RULES: PolicyRule[] = [
  // INTELLECTUAL PROPERTY - CRITICAL
  {
    category: 'intellectual_property',
    severity: 'critical',
    patterns: [
      /\b(replica|fake|counterfeit|knockoff|knock-off|imitation)\b/gi,
      /\b(inspired\s+by|style\s+of|look\s*-?\s*alike)\b/gi,
      /\b(1:1|aaa\s*quality|aaa\s*grade|mirror\s*quality)\b/gi,
      /\b(unauthorized|bootleg|pirated)\b/gi,
    ],
    keywords: [],
    description: 'Listing suggests counterfeit or unauthorized goods',
    recommendation: 'Remove all references to counterfeit goods. Use "compatible" or "fits" instead.',
    autoFixable: true,
    fixPattern: (text, match) => text.replace(new RegExp(match, 'gi'), 'compatible'),
  },

  // OFF-PLATFORM SALES - CRITICAL
  {
    category: 'off_platform_sales',
    severity: 'critical',
    patterns: [
      /\b(contact\s+me|call\s+me|text\s+me|email\s+me|dm\s+me|message\s+me\s+directly)\b/gi,
      /\b(buy\s+direct|direct\s+sale|off\s*-?\s*site|off\s+ebay|outside\s+ebay)\b/gi,
      /\b(pay\s+outside|pay\s+direct|paypal\s+direct|venmo|zelle|cash\s*app|wire\s+transfer)\b/gi,
      /\b(private\s+sale|contact\s+for\s+price|serious\s+buyers\s+only)\b/gi,
    ],
    keywords: ['whatsapp', 'telegram', 'signal', 'western union', 'moneygram'],
    description: 'Attempting to conduct transactions off eBay platform',
    recommendation: 'Remove all references to off-platform transactions. All sales must go through eBay.',
    autoFixable: true,
    fixPattern: (text, match) => text.replace(new RegExp(match, 'gi'), ''),
  },

  // CONTACT INFORMATION - CRITICAL
  {
    category: 'contact_information',
    severity: 'critical',
    patterns: [
      ...CONTACT_INFO_PATTERNS.phone,
      ...CONTACT_INFO_PATTERNS.email,
      ...CONTACT_INFO_PATTERNS.url,
      /\b(phone|tel|cell|mobile|fax|email|e-mail)\s*[:]\s*\S+/gi,
    ],
    keywords: [],
    description: 'Listing contains personal contact information',
    recommendation: 'Remove all phone numbers, email addresses, and URLs. eBay handles all communication.',
    autoFixable: true,
    fixPattern: (text) => {
      let result = text;
      for (const patterns of Object.values(CONTACT_INFO_PATTERNS)) {
        for (const pattern of patterns) {
          result = result.replace(pattern, '');
        }
      }
      return result.replace(/\s+/g, ' ').trim();
    },
  },

  // MEDICAL DEVICES - HIGH
  {
    category: 'medical_devices',
    severity: 'high',
    patterns: [
      /\b(fda\s+approved|fda\s+cleared|fda\s+registered)\b/gi,
      /\b(medical\s+grade|hospital\s+grade|clinical\s+grade)\b/gi,
      /\b(prescription|rx\s+only|prescription\s+required)\b/gi,
      /\b(treats|cures|heals|diagnoses|prevents\s+disease)\b/gi,
      /\b(medical\s+device|surgical|implant|prosthetic)\b/gi,
    ],
    keywords: [
      'insulin', 'glucose monitor', 'blood pressure monitor', 'oxygen concentrator',
      'cpap', 'bipap', 'nebulizer', 'defibrillator', 'pacemaker', 'hearing aid',
      'cochlear implant', 'contact lens', 'contact lenses',
    ],
    description: 'Listing may violate medical device regulations',
    recommendation: 'Remove medical claims. Do not sell prescription or FDA-regulated devices without authorization.',
    autoFixable: false,
  },

  // FIREARMS & WEAPONS - CRITICAL
  {
    category: 'firearms_weapons',
    severity: 'critical',
    patterns: [
      /\b(gun|firearm|pistol|revolver|rifle|shotgun|handgun)\b/gi,
      /\b(ammunition|ammo|bullets|cartridge|caliber)\b/gi,
      /\b(silencer|suppressor|bump\s+stock|high\s+capacity\s+magazine)\b/gi,
      /\b(assault\s+weapon|machine\s+gun|submachine|automatic\s+weapon)\b/gi,
      /\b(ar-?15|ak-?47|glock|sig\s+sauer|smith\s*&?\s*wesson|ruger|colt)\b/gi,
      /\b(hollow\s+point|armor\s+piercing|tracer|incendiary)\b/gi,
    ],
    keywords: ['concealed carry', 'ccw', 'open carry', 'extended magazine'],
    description: 'Listing contains prohibited firearms or weapons content',
    recommendation: 'Firearms and ammunition are prohibited on eBay. This listing cannot be posted.',
    autoFixable: false,
  },

  // DRUGS & CONTROLLED SUBSTANCES - CRITICAL
  {
    category: 'drugs_controlled',
    severity: 'critical',
    patterns: [
      /\b(marijuana|cannabis|weed|thc|cbd\s+oil|hemp\s+oil)\b/gi,
      /\b(kratom|kava|salvia|psilocybin|mushroom)\b/gi,
      /\b(cocaine|heroin|meth|methamphetamine|fentanyl)\b/gi,
      /\b(opioid|narcotic|controlled\s+substance|schedule\s+[i1]+)\b/gi,
      /\b(drug\s+paraphernalia|bong|pipe|grinder|dab\s+rig)\b/gi,
    ],
    keywords: ['rolling papers', 'vaporizer'],
    description: 'Listing contains prohibited drug-related content',
    recommendation: 'Drugs and drug paraphernalia are prohibited on eBay. This listing cannot be posted.',
    autoFixable: false,
  },

  // HAZARDOUS MATERIALS - HIGH
  {
    category: 'hazardous_materials',
    severity: 'high',
    patterns: [
      /\b(explosive|flammable|corrosive|radioactive|toxic)\b/gi,
      /\b(poison|hazmat|biohazard|asbestos|lead\s+paint)\b/gi,
      /\b(mercury|pesticide|herbicide|insecticide)\b/gi,
    ],
    keywords: [],
    description: 'Listing may contain hazardous materials',
    recommendation: 'Hazardous materials have shipping restrictions. Verify compliance with eBay and carrier policies.',
    autoFixable: false,
  },

  // ADULT CONTENT - HIGH
  {
    category: 'adult_content',
    severity: 'high',
    patterns: [
      /\b(xxx|adult\s+only|nsfw|explicit|erotic|pornographic)\b/gi,
      /\b(sexually\s+explicit|nude|naked)\b/gi,
    ],
    keywords: [],
    description: 'Listing contains adult content',
    recommendation: 'Adult content is only allowed in specific categories with age restrictions.',
    autoFixable: true,
    fixPattern: (text, match) => text.replace(new RegExp(match, 'gi'), ''),
  },

  // RECALLED PRODUCTS - HIGH
  {
    category: 'recalled_products',
    severity: 'high',
    patterns: [
      /\b(recalled|banned|illegal|prohibited)\b/gi,
    ],
    keywords: [],
    description: 'Listing may reference recalled or banned products',
    recommendation: 'Verify product is not subject to recall. Remove if recalled.',
    autoFixable: false,
  },

  // SPAM & MANIPULATION - MEDIUM
  {
    category: 'spam_manipulation',
    severity: 'medium',
    patterns: [
      /\b(l@@k|w0w|am[a@]zing|incred[i1]ble)\b/gi,
      /[!]{3,}|[?]{3,}|[*]{3,}|[#]{3,}|[$]{3,}/g,
      /\b(best\s+price|lowest\s+price|cheapest|must\s+see|must\s+have)\b/gi,
      /\b(buy\s+now|act\s+fast|limited\s+time|won't\s+last|hurry)\b/gi,
      /\b(desperate|motivated\s+seller)\b/gi,
    ],
    keywords: ['hot', 'sexy', 'cool', 'rare find', 'hard to find'],
    description: 'Listing contains spam keywords that hurt Cassini ranking',
    recommendation: 'Remove spam keywords. Use factual, descriptive language instead.',
    autoFixable: true,
    fixPattern: (text, match) => text.replace(new RegExp(match, 'gi'), ''),
  },

  // MISLEADING CLAIMS - MEDIUM
  {
    category: 'misleading_claims',
    severity: 'medium',
    patterns: [
      /\b(guaranteed\s+authentic|authenticity\s+guaranteed|100%\s+authentic)\b/gi,
      /\b(100%\s+genuine|100%\s+real|100%\s+original|certified\s+authentic)\b/gi,
      /\b(brand\s+new\s+sealed|factory\s+sealed)\b/gi,
    ],
    keywords: [],
    description: 'Listing contains potentially misleading authenticity claims',
    recommendation: 'Avoid absolute claims. Use "Condition: New" in item specifics instead.',
    autoFixable: true,
    fixPattern: (text, match) => text.replace(new RegExp(match, 'gi'), ''),
  },

  // PRICE MANIPULATION - MEDIUM
  {
    category: 'price_manipulation',
    severity: 'medium',
    patterns: [
      /\b(msrp|retail\s+value|compare\s+at|reg\s+price)\s*[:$]?\s*\$?\d+/gi,
      /\b(was\s+\$?\d+|now\s+only|save\s+\$?\d+|%\s+off)\b/gi,
    ],
    keywords: [],
    description: 'Listing contains price comparison claims',
    recommendation: 'Remove price comparisons. Let the listing price speak for itself.',
    autoFixable: true,
    fixPattern: (text, match) => text.replace(new RegExp(match, 'gi'), ''),
  },

  // SHIPPING VIOLATIONS - LOW
  {
    category: 'shipping_violations',
    severity: 'low',
    patterns: [
      /\b(free\s+shipping|fast\s+shipping|quick\s+ship|ships\s+fast|ships\s+today)\b/gi,
      /\b(same\s+day\s+shipping|next\s+day\s+shipping|overnight\s+shipping)\b/gi,
    ],
    keywords: [],
    description: 'Shipping claims should be in item specifics, not description',
    recommendation: 'Move shipping information to item specifics for better Cassini ranking.',
    autoFixable: true,
    fixPattern: (text, match) => text.replace(new RegExp(match, 'gi'), ''),
  },

  // ITEM CONDITION MISREPRESENTATION - MEDIUM
  {
    category: 'item_condition',
    severity: 'medium',
    patterns: [
      /\b(never\s+used|never\s+worn|never\s+opened|like\s+new|mint\s+condition)\b/gi,
      /\b(perfect\s+condition|flawless|pristine|immaculate)\b/gi,
    ],
    keywords: [],
    description: 'Condition claims should be accurate and use eBay condition terminology',
    recommendation: 'Use eBay\'s official condition options: New, Open Box, Refurbished, Used, etc.',
    autoFixable: false,
  },

  // LOCATION MISREPRESENTATION - HIGH
  {
    category: 'location_misrepresentation',
    severity: 'high',
    patterns: [
      /\b(ships\s+from\s+usa|usa\s+seller|american\s+seller|us\s+based)\b/gi,
      /\b(domestic\s+shipping\s+only|us\s+shipping\s+only)\b/gi,
    ],
    keywords: [],
    description: 'Location claims must be accurate',
    recommendation: 'Ensure shipping location matches actual item location. False claims result in defects.',
    autoFixable: false,
  },
];

/**
 * Analyze content for policy compliance
 */
export function analyzeCompliance(
  content: string,
  category?: string,
  options: {
    strictMode?: boolean;
    includeWarnings?: boolean;
  } = {}
): ComplianceReport {
  const { strictMode = false, includeWarnings = true } = options;
  const violations: PolicyViolation[] = [];
  const warnings: PolicyViolation[] = [];

  // Check against each policy rule
  for (const rule of POLICY_RULES) {
    // Check patterns
    for (const pattern of rule.patterns) {
      const matches = content.match(pattern);
      if (matches) {
        for (const match of matches) {
          const violation: PolicyViolation = {
            category: rule.category,
            severity: rule.severity,
            rule: rule.description,
            description: `Found prohibited content: "${match}"`,
            matchedText: match,
            recommendation: rule.recommendation,
            autoFixable: rule.autoFixable,
          };

          if (rule.autoFixable && rule.fixPattern) {
            violation.fixedText = rule.fixPattern(match, match);
          }

          if (rule.severity === 'warning' || (rule.severity === 'low' && !strictMode)) {
            if (includeWarnings) {
              warnings.push(violation);
            }
          } else {
            violations.push(violation);
          }
        }
      }
    }

    // Check keywords
    const lowerContent = content.toLowerCase();
    for (const keyword of rule.keywords) {
      if (lowerContent.includes(keyword.toLowerCase())) {
        const violation: PolicyViolation = {
          category: rule.category,
          severity: rule.severity,
          rule: rule.description,
          description: `Found prohibited keyword: "${keyword}"`,
          matchedText: keyword,
          recommendation: rule.recommendation,
          autoFixable: rule.autoFixable,
        };

        if (rule.severity === 'warning' || (rule.severity === 'low' && !strictMode)) {
          if (includeWarnings) {
            warnings.push(violation);
          }
        } else {
          violations.push(violation);
        }
      }
    }
  }

  // Check VERO brands
  const veroCheck = containsVeroBrand(content);
  if (veroCheck.found) {
    violations.push({
      category: 'intellectual_property',
      severity: veroCheck.riskLevel === 'high' ? 'critical' : 'high',
      rule: 'VERO brand detected',
      description: `VERO protected brands found: ${veroCheck.brands.join(', ')}`,
      matchedText: veroCheck.brands.join(', '),
      recommendation: 'Remove all VERO brand references unless you are an authorized seller.',
      autoFixable: true,
    });
  }

  // Check category-specific restrictions
  if (category && CATEGORY_RESTRICTIONS[category]) {
    const restrictions = CATEGORY_RESTRICTIONS[category];
    const lowerContent = content.toLowerCase();

    for (const keyword of restrictions) {
      if (lowerContent.includes(keyword)) {
        violations.push({
          category: 'category_specific',
          severity: 'high',
          rule: `Category-specific restriction for ${category}`,
          description: `Prohibited keyword for this category: "${keyword}"`,
          matchedText: keyword,
          recommendation: `This keyword is not allowed in the ${category} category.`,
          autoFixable: true,
        });
      }
    }
  }

  // Deduplicate violations
  const uniqueViolations = deduplicateViolations(violations);
  const uniqueWarnings = deduplicateViolations(warnings);

  // Calculate risk score (0-100)
  const riskScore = calculateRiskScore(uniqueViolations);

  // Determine overall risk level
  const overallRisk = determineOverallRisk(uniqueViolations);

  // Check if auto-fix is possible
  const canAutoFix = uniqueViolations.some(v => v.autoFixable);

  // Generate auto-fixed content if possible
  let autoFixedContent: string | undefined;
  if (canAutoFix) {
    autoFixedContent = autoFixContent(content, uniqueViolations);
  }

  // Generate summary
  const summary = generateComplianceSummary(uniqueViolations, uniqueWarnings, overallRisk);

  return {
    isCompliant: uniqueViolations.length === 0,
    overallRisk: uniqueViolations.length === 0 ? 'none' : overallRisk,
    riskScore,
    violations: uniqueViolations,
    warnings: uniqueWarnings,
    summary,
    canAutoFix,
    autoFixedContent,
  };
}

/**
 * Auto-fix content by removing/replacing violations
 */
export function autoFixContent(content: string, violations?: PolicyViolation[]): string {
  let result = content;

  // If violations provided, fix those specifically
  if (violations) {
    for (const violation of violations) {
      if (violation.autoFixable && violation.matchedText) {
        const pattern = new RegExp(escapeRegex(violation.matchedText), 'gi');
        result = result.replace(pattern, '');
      }
    }
  }

  // Apply all auto-fixable rules
  for (const rule of POLICY_RULES) {
    if (rule.autoFixable) {
      for (const pattern of rule.patterns) {
        const matches = result.match(pattern);
        if (matches && rule.fixPattern) {
          for (const match of matches) {
            result = rule.fixPattern(result, match);
          }
        } else if (matches) {
          result = result.replace(pattern, '');
        }
      }

      // Fix keywords
      for (const keyword of rule.keywords) {
        const pattern = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'gi');
        result = result.replace(pattern, '');
      }
    }
  }

  // Clean up spacing
  result = result
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/([.,!?])\s*([.,!?])/g, '$1')
    .trim();

  return result;
}

/**
 * Calculate risk score from violations
 */
function calculateRiskScore(violations: PolicyViolation[]): number {
  if (violations.length === 0) return 0;

  const severityWeights: Record<ViolationSeverity, number> = {
    critical: 40,
    high: 25,
    medium: 15,
    low: 8,
    warning: 3,
  };

  let score = 0;
  for (const violation of violations) {
    score += severityWeights[violation.severity];
  }

  return Math.min(100, score);
}

/**
 * Determine overall risk level
 */
function determineOverallRisk(violations: PolicyViolation[]): ViolationSeverity {
  if (violations.some(v => v.severity === 'critical')) return 'critical';
  if (violations.some(v => v.severity === 'high')) return 'high';
  if (violations.some(v => v.severity === 'medium')) return 'medium';
  if (violations.some(v => v.severity === 'low')) return 'low';
  return 'warning';
}

/**
 * Generate compliance summary
 */
function generateComplianceSummary(
  violations: PolicyViolation[],
  warnings: PolicyViolation[],
  overallRisk: ViolationSeverity | 'none'
): string {
  if (violations.length === 0 && warnings.length === 0) {
    return 'Content is fully compliant with eBay policies.';
  }

  const parts: string[] = [];

  if (violations.length > 0) {
    const criticalCount = violations.filter(v => v.severity === 'critical').length;
    const highCount = violations.filter(v => v.severity === 'high').length;
    const mediumCount = violations.filter(v => v.severity === 'medium').length;
    const lowCount = violations.filter(v => v.severity === 'low').length;

    parts.push(`Found ${violations.length} policy violation(s):`);
    if (criticalCount > 0) parts.push(`${criticalCount} critical`);
    if (highCount > 0) parts.push(`${highCount} high`);
    if (mediumCount > 0) parts.push(`${mediumCount} medium`);
    if (lowCount > 0) parts.push(`${lowCount} low`);
  }

  if (warnings.length > 0) {
    parts.push(`${warnings.length} warning(s)`);
  }

  const categories = [...new Set(violations.map(v => v.category))];
  if (categories.length > 0) {
    parts.push(`Categories affected: ${categories.join(', ')}`);
  }

  return parts.join(' | ');
}

/**
 * Deduplicate violations by matched text
 */
function deduplicateViolations(violations: PolicyViolation[]): PolicyViolation[] {
  const seen = new Set<string>();
  const unique: PolicyViolation[] = [];

  for (const violation of violations) {
    const key = `${violation.category}:${violation.matchedText}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(violation);
    }
  }

  return unique;
}

/**
 * Escape regex special characters
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Quick compliance check (returns boolean)
 */
export function isCompliant(content: string, category?: string): boolean {
  const report = analyzeCompliance(content, category, { includeWarnings: false });
  return report.isCompliant;
}

/**
 * Get compliance score (0-100, higher is better)
 */
export function getComplianceScore(content: string, category?: string): number {
  const report = analyzeCompliance(content, category);
  return 100 - report.riskScore;
}

/**
 * Check if content has critical violations
 */
export function hasCriticalViolations(content: string, category?: string): boolean {
  const report = analyzeCompliance(content, category, { includeWarnings: false });
  return report.violations.some(v => v.severity === 'critical');
}

/**
 * Get human-readable violation report
 */
export function getViolationReport(content: string, category?: string): string {
  const report = analyzeCompliance(content, category);

  if (report.isCompliant) {
    return '✓ Content is compliant with eBay policies.';
  }

  const lines: string[] = [
    `⚠ Policy Compliance Report`,
    `Risk Level: ${report.overallRisk.toUpperCase()}`,
    `Risk Score: ${report.riskScore}/100`,
    '',
    'Violations:',
  ];

  for (const violation of report.violations) {
    lines.push(`  [${violation.severity.toUpperCase()}] ${violation.category}`);
    lines.push(`    ${violation.description}`);
    lines.push(`    Recommendation: ${violation.recommendation}`);
    if (violation.autoFixable) {
      lines.push(`    ✓ Auto-fixable`);
    }
    lines.push('');
  }

  if (report.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of report.warnings) {
      lines.push(`  [WARNING] ${warning.description}`);
    }
  }

  return lines.join('\n');
}
