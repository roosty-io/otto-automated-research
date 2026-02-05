// Category Restrictions for eBay Policy Compliance
// These categories are either prohibited or require special handling

export interface CategoryRestriction {
  status: 'prohibited' | 'restricted' | 'requires_approval'
  reason: string
  notes?: string
}

export const RESTRICTED_CATEGORIES: Record<string, CategoryRestriction> = {
  // ============================================
  // PROHIBITED - NEVER LIST
  // ============================================

  // Weapons & Violence
  'weapons': { status: 'prohibited', reason: 'Weapons are prohibited on eBay' },
  'firearms': { status: 'prohibited', reason: 'Firearms and parts prohibited' },
  'guns': { status: 'prohibited', reason: 'Firearms and parts prohibited' },
  'ammunition': { status: 'prohibited', reason: 'Ammunition prohibited' },
  'explosives': { status: 'prohibited', reason: 'Explosives prohibited' },
  'fireworks': { status: 'prohibited', reason: 'Fireworks prohibited in most categories' },

  // Drugs & Controlled Substances
  'drugs': { status: 'prohibited', reason: 'Drugs and drug paraphernalia prohibited' },
  'controlled substances': { status: 'prohibited', reason: 'Controlled substances prohibited' },
  'narcotics': { status: 'prohibited', reason: 'Narcotics prohibited' },
  'cannabis': { status: 'prohibited', reason: 'Cannabis products prohibited' },
  'marijuana': { status: 'prohibited', reason: 'Marijuana products prohibited' },
  'drug paraphernalia': { status: 'prohibited', reason: 'Drug paraphernalia prohibited' },

  // Tobacco & Vaping
  'tobacco': { status: 'prohibited', reason: 'Tobacco products prohibited' },
  'cigarettes': { status: 'prohibited', reason: 'Cigarettes prohibited' },
  'cigars': { status: 'prohibited', reason: 'Cigars prohibited' },
  'vaping': { status: 'prohibited', reason: 'Vaping products prohibited' },
  'e-cigarettes': { status: 'prohibited', reason: 'E-cigarettes prohibited' },
  'vape juice': { status: 'prohibited', reason: 'Vape liquids prohibited' },

  // Alcohol
  'alcohol': { status: 'prohibited', reason: 'Alcohol prohibited (except collectibles)' },
  'wine': { status: 'prohibited', reason: 'Wine prohibited (except collectibles)' },
  'beer': { status: 'prohibited', reason: 'Beer prohibited' },
  'spirits': { status: 'prohibited', reason: 'Spirits prohibited' },
  'liquor': { status: 'prohibited', reason: 'Liquor prohibited' },

  // Adult Content
  'adult': { status: 'prohibited', reason: 'Adult content prohibited for dropshipping' },
  'pornography': { status: 'prohibited', reason: 'Pornography prohibited' },
  'sex toys': { status: 'prohibited', reason: 'Sex toys prohibited' },
  'adult toys': { status: 'prohibited', reason: 'Adult toys prohibited' },
  'erotica': { status: 'prohibited', reason: 'Erotic content prohibited' },

  // Hazardous Materials
  'hazmat': { status: 'prohibited', reason: 'Hazardous materials prohibited' },
  'hazardous materials': { status: 'prohibited', reason: 'Hazardous materials prohibited' },
  'radioactive': { status: 'prohibited', reason: 'Radioactive materials prohibited' },
  'biohazard': { status: 'prohibited', reason: 'Biohazardous materials prohibited' },
  'chemicals': { status: 'restricted', reason: 'Many chemicals restricted', notes: 'Verify specific product' },

  // Recalled & Dangerous
  'recalled products': { status: 'prohibited', reason: 'Recalled products prohibited' },
  'banned items': { status: 'prohibited', reason: 'Banned items prohibited' },

  // Financial & Legal
  'currency': { status: 'prohibited', reason: 'Currency and cash equivalents prohibited' },
  'stocks': { status: 'prohibited', reason: 'Financial instruments prohibited' },
  'bonds': { status: 'prohibited', reason: 'Financial instruments prohibited' },
  'lottery tickets': { status: 'prohibited', reason: 'Lottery tickets prohibited' },
  'gambling': { status: 'prohibited', reason: 'Gambling items restricted' },

  // Human Parts & Remains
  'human parts': { status: 'prohibited', reason: 'Human body parts prohibited' },
  'human remains': { status: 'prohibited', reason: 'Human remains prohibited' },
  'organs': { status: 'prohibited', reason: 'Human organs prohibited' },

  // ============================================
  // RESTRICTED - SPECIAL HANDLING REQUIRED
  // ============================================

  // Electronics with Batteries
  'lithium batteries': {
    status: 'restricted',
    reason: 'Lithium batteries have shipping restrictions',
    notes: 'Requires proper packaging and labeling'
  },
  'power banks': {
    status: 'restricted',
    reason: 'Power banks contain lithium batteries',
    notes: 'Check watt-hour rating'
  },
  'drone batteries': {
    status: 'restricted',
    reason: 'Drone batteries are high-capacity lithium',
    notes: 'May require ground shipping'
  },

  // Food & Consumables
  'food': {
    status: 'restricted',
    reason: 'Food items have expiration and safety requirements',
    notes: 'Must comply with FDA regulations'
  },
  'supplements': {
    status: 'restricted',
    reason: 'Dietary supplements heavily regulated',
    notes: 'No medical claims allowed'
  },
  'vitamins': {
    status: 'restricted',
    reason: 'Vitamins subject to FDA regulations',
    notes: 'Verify compliance'
  },
  'pet food': {
    status: 'restricted',
    reason: 'Pet food has safety requirements',
    notes: 'Must meet AAFCO standards'
  },

  // Medical & Health
  'medical devices': {
    status: 'restricted',
    reason: 'Medical devices require FDA compliance',
    notes: 'Many require approval'
  },
  'prescription items': { status: 'prohibited', reason: 'Prescription items prohibited' },
  'contact lenses': {
    status: 'restricted',
    reason: 'Contact lenses require prescription verification',
    notes: 'Cosmetic lenses may be allowed'
  },
  'hearing aids': {
    status: 'restricted',
    reason: 'Hearing aids are medical devices',
    notes: 'OTC hearing aids may be allowed'
  },

  // Children's Products
  'baby products': {
    status: 'restricted',
    reason: 'Baby products have strict safety requirements',
    notes: 'Must meet CPSC standards'
  },
  'car seats': {
    status: 'restricted',
    reason: 'Car seats have safety and expiration requirements',
    notes: 'Check manufacture date'
  },
  'cribs': {
    status: 'restricted',
    reason: 'Cribs have strict safety standards',
    notes: 'Must meet current CPSC standards'
  },
  'toys': {
    status: 'restricted',
    reason: 'Toys must meet safety standards',
    notes: 'Check for small parts, age ratings'
  },

  // Cosmetics & Personal Care
  'cosmetics': {
    status: 'restricted',
    reason: 'Cosmetics have FDA requirements',
    notes: 'No opened or used items'
  },
  'skincare': {
    status: 'restricted',
    reason: 'Skincare products have regulations',
    notes: 'Check ingredients list'
  },
  'perfume': {
    status: 'restricted',
    reason: 'Perfume contains alcohol - shipping restrictions',
    notes: 'May require ground shipping'
  },

  // Automotive
  'airbags': {
    status: 'restricted',
    reason: 'Airbags are safety-critical components',
    notes: 'Counterfeit airbags are illegal'
  },
  'seat belts': {
    status: 'restricted',
    reason: 'Seat belts are safety components',
    notes: 'Must be OEM or certified'
  },
  'brake parts': {
    status: 'restricted',
    reason: 'Brake parts are safety-critical',
    notes: 'Verify authenticity'
  },

  // Animals
  'live animals': { status: 'prohibited', reason: 'Live animals prohibited' },
  'animal parts': {
    status: 'restricted',
    reason: 'Some animal parts prohibited (ivory, etc.)',
    notes: 'Check CITES restrictions'
  },
  'ivory': { status: 'prohibited', reason: 'Ivory prohibited' },
  'fur': {
    status: 'restricted',
    reason: 'Some fur prohibited',
    notes: 'Check species restrictions'
  },

  // ============================================
  // REQUIRES APPROVAL - CAN LIST WITH VERIFICATION
  // ============================================

  'jewelry': {
    status: 'requires_approval',
    reason: 'Jewelry may contain precious metals/stones',
    notes: 'Must accurately describe materials'
  },
  'watches': {
    status: 'requires_approval',
    reason: 'Watch authenticity critical',
    notes: 'High counterfeiting risk'
  },
  'electronics': {
    status: 'requires_approval',
    reason: 'Electronics need proper certifications',
    notes: 'Check FCC compliance'
  },
  'safety equipment': {
    status: 'requires_approval',
    reason: 'Safety equipment must meet standards',
    notes: 'Verify certifications'
  },
}

// Get all prohibited categories
export const PROHIBITED_CATEGORIES = Object.entries(RESTRICTED_CATEGORIES)
  .filter(([_, info]) => info.status === 'prohibited')
  .map(([category]) => category)

// Get all restricted categories
export const RESTRICTED_ONLY_CATEGORIES = Object.entries(RESTRICTED_CATEGORIES)
  .filter(([_, info]) => info.status === 'restricted')
  .map(([category]) => category)

// Check if text mentions restricted categories
export function checkForRestrictedCategories(text: string): {
  found: boolean
  matches: Array<{ category: string; status: 'prohibited' | 'restricted' | 'requires_approval'; reason: string }>
} {
  const normalizedText = text.toLowerCase()
  const matches: Array<{ category: string; status: 'prohibited' | 'restricted' | 'requires_approval'; reason: string }> = []

  for (const [category, info] of Object.entries(RESTRICTED_CATEGORIES)) {
    const regex = new RegExp(`\\b${category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (regex.test(normalizedText)) {
      matches.push({
        category,
        status: info.status,
        reason: info.reason,
      })
    }
  }

  return {
    found: matches.length > 0,
    matches,
  }
}
