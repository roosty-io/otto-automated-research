/**
 * VERO (Verified Rights Owner Program) Brands and Blacklist Keywords
 *
 * This database contains brands enrolled in eBay's VERO program and keywords
 * that should be avoided in titles and descriptions to prevent policy violations.
 *
 * VERO brands have given eBay the authority to remove listings that infringe
 * on their intellectual property rights.
 */

// High-risk VERO brands that frequently enforce on eBay
// These brands actively monitor and report listings
export const VERO_HIGH_RISK_BRANDS = new Set([
  // Luxury Fashion
  'louis vuitton', 'lv', 'gucci', 'chanel', 'hermes', 'hermès', 'prada',
  'burberry', 'fendi', 'dior', 'christian dior', 'yves saint laurent', 'ysl',
  'balenciaga', 'bottega veneta', 'versace', 'givenchy', 'valentino',
  'salvatore ferragamo', 'ferragamo', 'cartier', 'tiffany', 'tiffany & co',
  'rolex', 'omega', 'patek philippe', 'audemars piguet', 'breitling',

  // Sports & Athletic
  'nike', 'air jordan', 'jordan', 'adidas', 'yeezy', 'under armour',
  'new balance', 'puma', 'reebok', 'converse', 'vans',

  // Tech & Electronics
  'apple', 'iphone', 'ipad', 'macbook', 'airpods', 'samsung', 'sony',
  'bose', 'beats', 'beats by dre', 'dyson', 'gopro', 'nintendo',
  'playstation', 'xbox', 'microsoft',

  // Designer Eyewear
  'ray-ban', 'rayban', 'oakley', 'maui jim', 'persol',

  // Cosmetics & Beauty
  'mac cosmetics', 'urban decay', 'nars', 'too faced', 'benefit',
  'kylie cosmetics', 'fenty beauty', 'charlotte tilbury', 'la mer',

  // Fashion Brands
  'supreme', 'off-white', 'bape', 'a bathing ape', 'stone island',
  'moncler', 'canada goose', 'north face', 'patagonia',

  // Automotive
  'harley-davidson', 'harley davidson', 'ford', 'chevrolet', 'chevy',
  'bmw', 'mercedes', 'mercedes-benz', 'porsche', 'ferrari', 'lamborghini',

  // Entertainment & Media
  'disney', 'marvel', 'star wars', 'dc comics', 'warner bros',
  'nfl', 'nba', 'mlb', 'nhl', 'fifa', 'ufc',

  // Other High-Enforcement
  'crocs', 'ugg', 'birkenstock', 'pandora', 'swarovski',
  'lego', 'mattel', 'hasbro', 'nerf', 'transformers',
]);

// Medium-risk VERO brands (enforce but less frequently)
export const VERO_MEDIUM_RISK_BRANDS = new Set([
  'coach', 'kate spade', 'michael kors', 'fossil', 'tommy hilfiger',
  'calvin klein', 'ralph lauren', 'polo', 'lacoste', 'hugo boss',
  'armani', 'dolce gabbana', 'd&g', 'guess', 'diesel',
  'timberland', 'clarks', 'dr martens', 'doc martens', 'skechers',
  'columbia', 'eddie bauer', 'carhartt', 'dickies',
  'kitchenaid', 'cuisinart', 'ninja', 'instant pot', 'vitamix',
  'dewalt', 'milwaukee', 'makita', 'bosch', 'ryobi', 'craftsman',
  'john deere', 'caterpillar', 'cat',
]);

// Blacklist keywords that trigger policy violations or suspensions
export const BLACKLIST_KEYWORDS = {
  // Replica/Counterfeit indicators - INSTANT REMOVAL
  counterfeit: [
    'replica', 'fake', 'counterfeit', 'knockoff', 'knock-off', 'knock off',
    'imitation', 'copy', 'dupe', 'inspired by', 'style of', 'like',
    'lookalike', 'look alike', 'look-alike', 'bootleg', 'unauthorized',
    'not authentic', 'non authentic', 'unbranded version',
    'aaa quality', 'aaa grade', '1:1', 'mirror quality',
  ],

  // Off-eBay transaction attempts - ACCOUNT SUSPENSION RISK
  offPlatform: [
    'contact me', 'call me', 'text me', 'email me', 'dm me',
    'message me directly', 'whatsapp', 'telegram', 'signal',
    'pay outside', 'pay off ebay', 'paypal direct', 'venmo', 'zelle',
    'cash app', 'cashapp', 'wire transfer', 'western union', 'moneygram',
    'buy direct', 'direct sale', 'off site', 'off-site', 'offsite',
    'private sale', 'contact for price', 'serious buyers only',
    '@gmail', '@yahoo', '@hotmail', '@outlook', '@aol',
    'facebook.com', 'instagram.com', 'twitter.com', 'tiktok.com',
  ],

  // Contact information patterns
  contactInfo: [
    'phone:', 'tel:', 'cell:', 'mobile:', 'fax:',
    'email:', 'e-mail:', 'mail:', 'address:',
    '(xxx)', 'xxx-xxx-xxxx', // Phone number patterns handled separately
  ],

  // Medical device violations
  medicalDevice: [
    'fda approved', 'fda cleared', 'medical grade', 'hospital grade',
    'prescription', 'rx only', 'prescription only', 'prescription required',
    'treats', 'cures', 'heals', 'diagnoses', 'prevents disease',
    'medical device', 'surgical', 'implant', 'prosthetic',
    'insulin', 'glucose monitor', 'blood pressure', 'oxygen concentrator',
    'cpap', 'bipap', 'nebulizer', 'defibrillator', 'pacemaker',
    'hearing aid', 'cochlear', 'contact lens', 'contact lenses',
  ],

  // Firearms and weapons policy
  firearms: [
    'gun', 'firearm', 'pistol', 'revolver', 'rifle', 'shotgun',
    'assault weapon', 'machine gun', 'submachine', 'automatic weapon',
    'semi-automatic', 'semi automatic', 'handgun', 'ammunition', 'ammo',
    'bullets', 'cartridge', 'caliber', 'silencer', 'suppressor',
    'bump stock', 'high capacity magazine', 'extended magazine',
    'ar-15', 'ar15', 'ak-47', 'ak47', 'glock', 'sig sauer',
    'smith & wesson', 'smith and wesson', 'ruger', 'colt',
    'hollow point', 'armor piercing', 'tracer', 'incendiary',
    'concealed carry', 'ccw', 'open carry',
  ],

  // Drugs and controlled substances
  drugs: [
    'marijuana', 'cannabis', 'weed', 'thc', 'cbd oil', 'hemp oil',
    'kratom', 'kava', 'salvia', 'mushroom', 'psilocybin',
    'cocaine', 'heroin', 'meth', 'methamphetamine', 'fentanyl',
    'opioid', 'narcotic', 'controlled substance', 'schedule i',
    'schedule ii', 'drug paraphernalia', 'bong', 'pipe', 'grinder',
    'rolling papers', 'vaporizer', 'dab rig',
  ],

  // Hazardous materials
  hazardous: [
    'explosive', 'flammable', 'corrosive', 'radioactive', 'toxic',
    'poison', 'hazmat', 'biohazard', 'asbestos', 'lead paint',
    'mercury', 'pesticide', 'herbicide', 'insecticide',
  ],

  // Adult content (not allowed in most categories)
  adult: [
    'xxx', 'adult only', 'nsfw', 'explicit', 'erotic', 'pornographic',
    'sexually explicit', 'nude', 'naked',
  ],

  // Spam/manipulation keywords (Cassini penalties)
  spam: [
    'l@@k', 'look', 'wow', 'amazing', 'awesome', 'incredible',
    'best price', 'lowest price', 'cheapest', 'must see', 'must have',
    'hot', 'sexy', 'cool', 'rare find', 'hard to find',
    '!!!', '???', '***', '###', '$$$', '@@@',
    'free shipping', // Should be in item specifics, not title
    'fast shipping', 'quick ship', 'ships fast', 'ships today',
    'buy now', 'act fast', 'limited time', 'won\'t last', 'hurry',
    'desperate', 'motivated seller', 'make offer', 'obo',
  ],

  // Misleading claims
  misleading: [
    'guaranteed authentic', 'authenticity guaranteed', '100% authentic',
    '100% genuine', '100% real', '100% original', 'certified authentic',
    'factory sealed', 'brand new sealed', // Often misused
    'never used', 'never worn', 'never opened', // When not true
    'vintage', 'antique', 'rare', 'limited edition', // Without verification
  ],

  // Recalled/banned products
  recalled: [
    'recalled', 'banned', 'illegal', 'prohibited', 'restricted',
  ],
};

// Phone number and email regex patterns
export const CONTACT_INFO_PATTERNS = {
  phone: [
    /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, // US phone: 123-456-7890
    /\b\(\d{3}\)\s*\d{3}[-.\s]?\d{4}\b/g, // (123) 456-7890
    /\b\d{10,11}\b/g, // 10-11 digit numbers
    /\+\d{1,3}[-.\s]?\d{3,14}/g, // International: +1 123-456-7890
  ],
  email: [
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  ],
  url: [
    /https?:\/\/[^\s]+/gi,
    /www\.[^\s]+/gi,
    /[a-zA-Z0-9.-]+\.(com|net|org|io|co|shop|store|site|online)[^\s]*/gi,
  ],
  socialMedia: [
    /@[a-zA-Z0-9_]{2,}/g, // @username patterns
    /#[a-zA-Z0-9_]+/g, // Hashtags that might be social handles
  ],
};

// Category-specific restrictions
export const CATEGORY_RESTRICTIONS: Record<string, string[]> = {
  'health_beauty': [
    'prescription', 'rx', 'fda', 'medical', 'drug', 'pharmaceutical',
    'controlled', 'schedule', 'narcotic', 'steroid', 'hormone',
  ],
  'electronics': [
    'jailbroken', 'jailbreak', 'unlocked', 'rooted', 'modded', 'hacked',
    'bypass', 'crack', 'pirated', 'bootleg',
  ],
  'automotive': [
    'odometer', 'rollback', 'salvage', 'flood damage', 'rebuilt title',
  ],
  'collectibles': [
    'reprint', 'reproduction', 'fantasy', 'tribute', 'commemorative',
  ],
  'clothing': [
    'factory reject', 'factory second', 'irregular', 'sample',
    'wholesale lot', 'liquidation',
  ],
};

// Approved replacement terms for common violations
export const SAFE_ALTERNATIVES: Record<string, string> = {
  'replica': 'compatible',
  'fake': 'alternative',
  'knockoff': 'compatible',
  'copy': 'compatible',
  'dupe': 'similar style',
  'inspired by': 'compatible with',
  'style of': 'fits',
  'like': 'similar to',
  'authentic': '', // Remove claim entirely
  'genuine': '', // Remove claim entirely
  'original': '', // Remove claim entirely
  'oem': 'compatible',
  'guaranteed': '',
  '100%': '',
  'brand new': 'new',
  'factory sealed': 'sealed',
  'free shipping': '', // Move to item specifics
  'fast shipping': '', // Move to item specifics
};

/**
 * Check if text contains any VERO brand names
 */
export function containsVeroBrand(text: string): { found: boolean; brands: string[]; riskLevel: 'high' | 'medium' | 'none' } {
  const lowerText = text.toLowerCase();
  const foundBrands: string[] = [];
  let riskLevel: 'high' | 'medium' | 'none' = 'none';

  // Check high-risk brands
  for (const brand of VERO_HIGH_RISK_BRANDS) {
    // Use word boundary matching to avoid false positives
    const regex = new RegExp(`\\b${escapeRegex(brand)}\\b`, 'i');
    if (regex.test(lowerText)) {
      foundBrands.push(brand);
      riskLevel = 'high';
    }
  }

  // Check medium-risk brands if no high-risk found
  if (riskLevel !== 'high') {
    for (const brand of VERO_MEDIUM_RISK_BRANDS) {
      const regex = new RegExp(`\\b${escapeRegex(brand)}\\b`, 'i');
      if (regex.test(lowerText)) {
        foundBrands.push(brand);
        riskLevel = 'medium';
      }
    }
  }

  return {
    found: foundBrands.length > 0,
    brands: [...new Set(foundBrands)],
    riskLevel,
  };
}

/**
 * Check if text contains blacklist keywords
 */
export function containsBlacklistKeywords(text: string): {
  found: boolean;
  violations: Array<{ category: string; keyword: string; severity: 'critical' | 'high' | 'medium' | 'low' }>;
} {
  const lowerText = text.toLowerCase();
  const violations: Array<{ category: string; keyword: string; severity: 'critical' | 'high' | 'medium' | 'low' }> = [];

  const severityMap: Record<string, 'critical' | 'high' | 'medium' | 'low'> = {
    counterfeit: 'critical',
    offPlatform: 'critical',
    contactInfo: 'critical',
    firearms: 'critical',
    drugs: 'critical',
    medicalDevice: 'high',
    hazardous: 'high',
    adult: 'high',
    recalled: 'high',
    spam: 'medium',
    misleading: 'low',
  };

  for (const [category, keywords] of Object.entries(BLACKLIST_KEYWORDS)) {
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
      if (regex.test(lowerText)) {
        violations.push({
          category,
          keyword,
          severity: severityMap[category] || 'medium',
        });
      }
    }
  }

  return {
    found: violations.length > 0,
    violations,
  };
}

/**
 * Check for contact information in text
 */
export function containsContactInfo(text: string): {
  found: boolean;
  matches: Array<{ type: string; value: string }>;
} {
  const matches: Array<{ type: string; value: string }> = [];

  for (const [type, patterns] of Object.entries(CONTACT_INFO_PATTERNS)) {
    for (const pattern of patterns) {
      const found = text.match(pattern);
      if (found) {
        for (const match of found) {
          matches.push({ type, value: match });
        }
      }
    }
  }

  return {
    found: matches.length > 0,
    matches: [...new Map(matches.map(m => [m.value, m])).values()], // Dedupe
  };
}

/**
 * Remove VERO brands from text
 */
export function removeVeroBrands(text: string): string {
  let result = text;

  // Remove high-risk brands
  for (const brand of VERO_HIGH_RISK_BRANDS) {
    const regex = new RegExp(`\\b${escapeRegex(brand)}\\b`, 'gi');
    result = result.replace(regex, '');
  }

  // Remove medium-risk brands
  for (const brand of VERO_MEDIUM_RISK_BRANDS) {
    const regex = new RegExp(`\\b${escapeRegex(brand)}\\b`, 'gi');
    result = result.replace(regex, '');
  }

  // Clean up extra spaces
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * Remove blacklist keywords from text with safe alternatives
 */
export function sanitizeBlacklistKeywords(text: string): string {
  let result = text;

  // Apply safe alternatives
  for (const [keyword, replacement] of Object.entries(SAFE_ALTERNATIVES)) {
    const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'gi');
    result = result.replace(regex, replacement);
  }

  // Remove remaining blacklist keywords
  for (const keywords of Object.values(BLACKLIST_KEYWORDS)) {
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'gi');
      result = result.replace(regex, '');
    }
  }

  // Clean up
  result = result.replace(/\s+/g, ' ').trim();

  return result;
}

/**
 * Remove contact information from text
 */
export function removeContactInfo(text: string): string {
  let result = text;

  for (const patterns of Object.values(CONTACT_INFO_PATTERNS)) {
    for (const pattern of patterns) {
      result = result.replace(pattern, '[REMOVED]');
    }
  }

  // Remove the [REMOVED] placeholders and clean up
  result = result.replace(/\[REMOVED\]/g, '').replace(/\s+/g, ' ').trim();

  return result;
}

// Helper function to escape regex special characters
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Full compliance scan of text
 */
export function fullComplianceScan(text: string, category?: string): {
  isCompliant: boolean;
  overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'none';
  issues: Array<{
    type: 'vero' | 'blacklist' | 'contact' | 'category';
    severity: 'critical' | 'high' | 'medium' | 'low';
    details: string;
  }>;
  sanitizedText: string;
} {
  const issues: Array<{
    type: 'vero' | 'blacklist' | 'contact' | 'category';
    severity: 'critical' | 'high' | 'medium' | 'low';
    details: string;
  }> = [];

  // Check VERO brands
  const veroCheck = containsVeroBrand(text);
  if (veroCheck.found) {
    issues.push({
      type: 'vero',
      severity: veroCheck.riskLevel === 'high' ? 'critical' : 'high',
      details: `VERO brands found: ${veroCheck.brands.join(', ')}`,
    });
  }

  // Check blacklist keywords
  const blacklistCheck = containsBlacklistKeywords(text);
  if (blacklistCheck.found) {
    for (const violation of blacklistCheck.violations) {
      issues.push({
        type: 'blacklist',
        severity: violation.severity,
        details: `${violation.category}: "${violation.keyword}"`,
      });
    }
  }

  // Check contact info
  const contactCheck = containsContactInfo(text);
  if (contactCheck.found) {
    issues.push({
      type: 'contact',
      severity: 'critical',
      details: `Contact info found: ${contactCheck.matches.map(m => m.type).join(', ')}`,
    });
  }

  // Check category-specific restrictions
  if (category && CATEGORY_RESTRICTIONS[category]) {
    const restrictions = CATEGORY_RESTRICTIONS[category];
    const lowerText = text.toLowerCase();
    for (const keyword of restrictions) {
      if (lowerText.includes(keyword)) {
        issues.push({
          type: 'category',
          severity: 'high',
          details: `Category restriction (${category}): "${keyword}"`,
        });
      }
    }
  }

  // Determine overall risk
  let overallRisk: 'critical' | 'high' | 'medium' | 'low' | 'none' = 'none';
  if (issues.some(i => i.severity === 'critical')) {
    overallRisk = 'critical';
  } else if (issues.some(i => i.severity === 'high')) {
    overallRisk = 'high';
  } else if (issues.some(i => i.severity === 'medium')) {
    overallRisk = 'medium';
  } else if (issues.some(i => i.severity === 'low')) {
    overallRisk = 'low';
  }

  // Create sanitized text
  let sanitizedText = text;
  sanitizedText = removeVeroBrands(sanitizedText);
  sanitizedText = sanitizeBlacklistKeywords(sanitizedText);
  sanitizedText = removeContactInfo(sanitizedText);

  return {
    isCompliant: issues.length === 0,
    overallRisk,
    issues,
    sanitizedText,
  };
}
