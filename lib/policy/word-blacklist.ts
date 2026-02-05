// Word Blacklist for eBay Policy Compliance
// These words/phrases trigger policy violations or indicate problematic products

export interface BlacklistEntry {
  severity: 'block' | 'warn' | 'review'
  category: string
  reason: string
}

export const WORD_BLACKLIST: Record<string, BlacklistEntry> = {
  // ============================================
  // COUNTERFEIT / FAKE INDICATORS - BLOCK
  // ============================================
  'replica': { severity: 'block', category: 'counterfeit', reason: 'Indicates fake/counterfeit product' },
  'replicas': { severity: 'block', category: 'counterfeit', reason: 'Indicates fake/counterfeit product' },
  'counterfeit': { severity: 'block', category: 'counterfeit', reason: 'Explicit counterfeit indication' },
  'fake': { severity: 'block', category: 'counterfeit', reason: 'Indicates non-authentic product' },
  'knockoff': { severity: 'block', category: 'counterfeit', reason: 'Indicates counterfeit product' },
  'knock-off': { severity: 'block', category: 'counterfeit', reason: 'Indicates counterfeit product' },
  'knock off': { severity: 'block', category: 'counterfeit', reason: 'Indicates counterfeit product' },
  'imitation': { severity: 'block', category: 'counterfeit', reason: 'Indicates non-authentic product' },
  'bootleg': { severity: 'block', category: 'counterfeit', reason: 'Indicates unauthorized copy' },
  'pirated': { severity: 'block', category: 'counterfeit', reason: 'Indicates unauthorized copy' },
  'pirate': { severity: 'block', category: 'counterfeit', reason: 'Indicates unauthorized copy' },
  'unauthorized': { severity: 'block', category: 'counterfeit', reason: 'Indicates lack of authorization' },
  'unlicensed': { severity: 'block', category: 'counterfeit', reason: 'Indicates lack of license' },
  'copy of': { severity: 'block', category: 'counterfeit', reason: 'Indicates copying of original' },
  'copied from': { severity: 'block', category: 'counterfeit', reason: 'Indicates copying of original' },

  // ============================================
  // COMPARISON / "LIKE" PHRASES - BLOCK
  // ============================================
  'inspired by': { severity: 'block', category: 'comparison', reason: 'Trademark comparison violation' },
  'style of': { severity: 'block', category: 'comparison', reason: 'Trademark comparison violation' },
  'similar to': { severity: 'warn', category: 'comparison', reason: 'May imply brand comparison' },
  'looks like': { severity: 'warn', category: 'comparison', reason: 'May imply brand comparison' },
  'alternative to': { severity: 'warn', category: 'comparison', reason: 'May imply brand comparison' },
  'compare to': { severity: 'warn', category: 'comparison', reason: 'Brand comparison violation' },
  'comparable to': { severity: 'warn', category: 'comparison', reason: 'Brand comparison violation' },
  'like the': { severity: 'review', category: 'comparison', reason: 'Context-dependent brand comparison' },
  'version of': { severity: 'warn', category: 'comparison', reason: 'May imply knock-off' },
  'type': { severity: 'review', category: 'comparison', reason: 'Context check: "Nike type" is violation' },

  // ============================================
  // OEM / GENERIC INDICATORS - WARN
  // ============================================
  'oem': { severity: 'warn', category: 'oem', reason: 'May indicate unauthorized OEM parts' },
  'aftermarket': { severity: 'review', category: 'oem', reason: 'Acceptable in some contexts' },
  'third party': { severity: 'review', category: 'oem', reason: 'Context-dependent' },
  'third-party': { severity: 'review', category: 'oem', reason: 'Context-dependent' },
  'generic': { severity: 'review', category: 'oem', reason: 'May need brand clarification' },
  'unbranded': { severity: 'review', category: 'oem', reason: 'Verify authenticity claims' },
  'no brand': { severity: 'review', category: 'oem', reason: 'Verify product legitimacy' },
  'compatible with': { severity: 'review', category: 'oem', reason: 'Check brand name usage' },
  'fits': { severity: 'review', category: 'oem', reason: 'Check brand name usage in context' },
  'for': { severity: 'review', category: 'oem', reason: 'Check: "for iPhone" may be violation' },
  'replacement for': { severity: 'review', category: 'oem', reason: 'Check brand name usage' },

  // ============================================
  // BULK / WHOLESALE - WARN (Often Restricted)
  // ============================================
  'wholesale lot': { severity: 'warn', category: 'bulk', reason: 'May indicate gray market goods' },
  'bulk lot': { severity: 'warn', category: 'bulk', reason: 'May indicate gray market goods' },
  'liquidation': { severity: 'warn', category: 'bulk', reason: 'Source verification needed' },
  'overstock': { severity: 'review', category: 'bulk', reason: 'Verify source legitimacy' },
  'closeout': { severity: 'review', category: 'bulk', reason: 'Verify source legitimacy' },
  'pallet': { severity: 'warn', category: 'bulk', reason: 'Wholesale indicator' },
  'mixed lot': { severity: 'review', category: 'bulk', reason: 'Verify contents' },

  // ============================================
  // SAFETY / HAZMAT - BLOCK
  // ============================================
  'not for children': { severity: 'block', category: 'safety', reason: 'Safety warning required' },
  'choking hazard': { severity: 'block', category: 'safety', reason: 'Requires age restriction' },
  'small parts': { severity: 'warn', category: 'safety', reason: 'May need safety warning' },
  'ages 14+': { severity: 'review', category: 'safety', reason: 'Verify safety compliance' },
  'ages 18+': { severity: 'review', category: 'safety', reason: 'Age restriction needed' },
  'adult only': { severity: 'block', category: 'safety', reason: 'Adult content restrictions' },
  'flammable': { severity: 'block', category: 'hazmat', reason: 'Hazmat shipping restrictions' },
  'combustible': { severity: 'block', category: 'hazmat', reason: 'Hazmat shipping restrictions' },
  'explosive': { severity: 'block', category: 'hazmat', reason: 'Prohibited item' },
  'corrosive': { severity: 'block', category: 'hazmat', reason: 'Hazmat shipping restrictions' },
  'toxic': { severity: 'block', category: 'hazmat', reason: 'Hazmat shipping restrictions' },
  'poison': { severity: 'block', category: 'hazmat', reason: 'Prohibited item' },
  'radioactive': { severity: 'block', category: 'hazmat', reason: 'Prohibited item' },
  'lithium battery': { severity: 'warn', category: 'hazmat', reason: 'Shipping restrictions apply' },
  'li-ion': { severity: 'warn', category: 'hazmat', reason: 'Shipping restrictions apply' },
  'lithium ion': { severity: 'warn', category: 'hazmat', reason: 'Shipping restrictions apply' },
  'aerosol': { severity: 'warn', category: 'hazmat', reason: 'Shipping restrictions apply' },
  'pressurized': { severity: 'warn', category: 'hazmat', reason: 'Shipping restrictions apply' },

  // ============================================
  // PROHIBITED ITEMS - BLOCK
  // ============================================
  'weapon': { severity: 'block', category: 'prohibited', reason: 'Weapons prohibited' },
  'weapons': { severity: 'block', category: 'prohibited', reason: 'Weapons prohibited' },
  'gun': { severity: 'block', category: 'prohibited', reason: 'Firearms prohibited' },
  'firearm': { severity: 'block', category: 'prohibited', reason: 'Firearms prohibited' },
  'ammunition': { severity: 'block', category: 'prohibited', reason: 'Ammunition prohibited' },
  'ammo': { severity: 'block', category: 'prohibited', reason: 'Ammunition prohibited' },
  'knife': { severity: 'warn', category: 'prohibited', reason: 'Restricted in some jurisdictions' },
  'switchblade': { severity: 'block', category: 'prohibited', reason: 'Prohibited weapon' },
  'brass knuckles': { severity: 'block', category: 'prohibited', reason: 'Prohibited weapon' },
  'taser': { severity: 'block', category: 'prohibited', reason: 'Restricted weapon' },
  'stun gun': { severity: 'block', category: 'prohibited', reason: 'Restricted weapon' },
  'pepper spray': { severity: 'warn', category: 'prohibited', reason: 'Restricted in some states' },
  'mace': { severity: 'warn', category: 'prohibited', reason: 'Restricted in some states' },
  'drug': { severity: 'block', category: 'prohibited', reason: 'Drugs prohibited' },
  'drugs': { severity: 'block', category: 'prohibited', reason: 'Drugs prohibited' },
  'narcotic': { severity: 'block', category: 'prohibited', reason: 'Narcotics prohibited' },
  'cannabis': { severity: 'block', category: 'prohibited', reason: 'Cannabis prohibited' },
  'marijuana': { severity: 'block', category: 'prohibited', reason: 'Marijuana prohibited' },
  'weed': { severity: 'block', category: 'prohibited', reason: 'Cannabis prohibited' },
  'thc': { severity: 'block', category: 'prohibited', reason: 'THC products prohibited' },
  'cbd': { severity: 'warn', category: 'prohibited', reason: 'CBD restrictions vary' },
  'tobacco': { severity: 'block', category: 'prohibited', reason: 'Tobacco prohibited' },
  'cigarette': { severity: 'block', category: 'prohibited', reason: 'Tobacco prohibited' },
  'vape': { severity: 'block', category: 'prohibited', reason: 'Vaping products restricted' },
  'e-cigarette': { severity: 'block', category: 'prohibited', reason: 'E-cigarettes prohibited' },
  'alcohol': { severity: 'block', category: 'prohibited', reason: 'Alcohol prohibited' },
  'wine': { severity: 'block', category: 'prohibited', reason: 'Alcohol prohibited' },
  'beer': { severity: 'block', category: 'prohibited', reason: 'Alcohol prohibited' },
  'liquor': { severity: 'block', category: 'prohibited', reason: 'Alcohol prohibited' },
  'prescription': { severity: 'block', category: 'prohibited', reason: 'Prescription items prohibited' },

  // ============================================
  // RECALLED / BANNED - BLOCK
  // ============================================
  'recalled': { severity: 'block', category: 'recalled', reason: 'Recalled products prohibited' },
  'recall': { severity: 'block', category: 'recalled', reason: 'Recalled products prohibited' },
  'banned': { severity: 'block', category: 'recalled', reason: 'Banned products prohibited' },
  'illegal': { severity: 'block', category: 'recalled', reason: 'Illegal items prohibited' },
  'outlawed': { severity: 'block', category: 'recalled', reason: 'Outlawed items prohibited' },
  'not fda approved': { severity: 'block', category: 'recalled', reason: 'FDA compliance required' },
  'not approved': { severity: 'warn', category: 'recalled', reason: 'Verify regulatory compliance' },

  // ============================================
  // TITLE POLICY VIOLATIONS - WARN
  // ============================================
  'free shipping': { severity: 'review', category: 'title_policy', reason: 'Put in item specifics, not title' },
  'fast shipping': { severity: 'review', category: 'title_policy', reason: 'Put in item specifics, not title' },
  'fast free shipping': { severity: 'review', category: 'title_policy', reason: 'Put in item specifics, not title' },
  'wow': { severity: 'warn', category: 'title_policy', reason: 'Keyword stuffing' },
  'look': { severity: 'warn', category: 'title_policy', reason: 'Keyword stuffing' },
  'l@@k': { severity: 'block', category: 'title_policy', reason: 'Symbol spam prohibited' },
  '!!!': { severity: 'warn', category: 'title_policy', reason: 'Excessive punctuation' },
  '???': { severity: 'warn', category: 'title_policy', reason: 'Excessive punctuation' },
  '***': { severity: 'warn', category: 'title_policy', reason: 'Symbol spam' },
  'must see': { severity: 'warn', category: 'title_policy', reason: 'Keyword stuffing' },
  'rare': { severity: 'review', category: 'title_policy', reason: 'Verify claim accuracy' },
  'htf': { severity: 'review', category: 'title_policy', reason: 'Hard to find - verify claim' },
  'hard to find': { severity: 'review', category: 'title_policy', reason: 'Verify claim accuracy' },
  'best price': { severity: 'warn', category: 'title_policy', reason: 'Price claims discouraged' },
  'lowest price': { severity: 'warn', category: 'title_policy', reason: 'Price claims discouraged' },
  'cheap': { severity: 'warn', category: 'title_policy', reason: 'Avoid negative value language' },
  'bargain': { severity: 'review', category: 'title_policy', reason: 'Value claims' },

  // ============================================
  // CONTACT / EXTERNAL LINKS - BLOCK
  // ============================================
  'contact me': { severity: 'block', category: 'external', reason: 'No off-eBay contact' },
  'call me': { severity: 'block', category: 'external', reason: 'No off-eBay contact' },
  'email me': { severity: 'block', category: 'external', reason: 'No off-eBay contact' },
  'text me': { severity: 'block', category: 'external', reason: 'No off-eBay contact' },
  'visit my website': { severity: 'block', category: 'external', reason: 'No external links' },
  'visit our website': { severity: 'block', category: 'external', reason: 'No external links' },
  'www.': { severity: 'block', category: 'external', reason: 'No external URLs' },
  'http://': { severity: 'block', category: 'external', reason: 'No external URLs' },
  'https://': { severity: 'block', category: 'external', reason: 'No external URLs' },
  '.com': { severity: 'review', category: 'external', reason: 'Check for URL in context' },
  '@gmail': { severity: 'block', category: 'external', reason: 'No email addresses' },
  '@yahoo': { severity: 'block', category: 'external', reason: 'No email addresses' },
  '@hotmail': { severity: 'block', category: 'external', reason: 'No email addresses' },

  // ============================================
  // MEDICAL / HEALTH CLAIMS - WARN
  // ============================================
  'cure': { severity: 'warn', category: 'medical', reason: 'Medical claims restricted' },
  'cures': { severity: 'warn', category: 'medical', reason: 'Medical claims restricted' },
  'treat': { severity: 'review', category: 'medical', reason: 'Context check for medical claims' },
  'treatment': { severity: 'review', category: 'medical', reason: 'Context check for medical claims' },
  'heal': { severity: 'review', category: 'medical', reason: 'Medical claims restricted' },
  'healing': { severity: 'review', category: 'medical', reason: 'Medical claims restricted' },
  'miracle': { severity: 'warn', category: 'medical', reason: 'Unsubstantiated claims' },
  'guaranteed results': { severity: 'warn', category: 'medical', reason: 'Unsubstantiated claims' },
  'clinically proven': { severity: 'warn', category: 'medical', reason: 'Requires verification' },
  'fda approved': { severity: 'warn', category: 'medical', reason: 'Requires verification' },
  'weight loss': { severity: 'review', category: 'medical', reason: 'Health claims restricted' },
  'diet pill': { severity: 'warn', category: 'medical', reason: 'Diet products restricted' },

  // ============================================
  // ADULT CONTENT - BLOCK
  // ============================================
  'adult': { severity: 'review', category: 'adult', reason: 'Context check for adult content' },
  'xxx': { severity: 'block', category: 'adult', reason: 'Adult content prohibited' },
  'porn': { severity: 'block', category: 'adult', reason: 'Adult content prohibited' },
  'nude': { severity: 'block', category: 'adult', reason: 'Adult content prohibited' },
  'naked': { severity: 'block', category: 'adult', reason: 'Adult content prohibited' },
  'sex toy': { severity: 'block', category: 'adult', reason: 'Adult items restricted' },
  'erotic': { severity: 'block', category: 'adult', reason: 'Adult content prohibited' },
  'fetish': { severity: 'block', category: 'adult', reason: 'Adult content prohibited' },
}

// Export flat list of blacklisted words
export const BLACKLISTED_WORDS = Object.keys(WORD_BLACKLIST)

// Get words by severity
export const BLOCKED_WORDS = Object.entries(WORD_BLACKLIST)
  .filter(([_, info]) => info.severity === 'block')
  .map(([word]) => word)

export const WARN_WORDS = Object.entries(WORD_BLACKLIST)
  .filter(([_, info]) => info.severity === 'warn')
  .map(([word]) => word)

export const REVIEW_WORDS = Object.entries(WORD_BLACKLIST)
  .filter(([_, info]) => info.severity === 'review')
  .map(([word]) => word)

// Check text for blacklisted words
export function checkForBlacklistedWords(text: string): {
  found: boolean
  matches: Array<{ word: string; severity: 'block' | 'warn' | 'review'; category: string; reason: string }>
} {
  const normalizedText = text.toLowerCase()
  const matches: Array<{ word: string; severity: 'block' | 'warn' | 'review'; category: string; reason: string }> = []

  for (const [word, info] of Object.entries(WORD_BLACKLIST)) {
    // Use word boundary for single words, exact match for phrases
    const isPhrase = word.includes(' ')
    const pattern = isPhrase
      ? word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      : `\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`

    const regex = new RegExp(pattern, 'i')
    if (regex.test(normalizedText)) {
      matches.push({
        word,
        severity: info.severity,
        category: info.category,
        reason: info.reason,
      })
    }
  }

  return {
    found: matches.length > 0,
    matches,
  }
}
