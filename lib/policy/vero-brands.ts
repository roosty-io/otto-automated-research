// VeRO (Verified Rights Owner) Brand Database
// These brands actively enforce their IP on eBay and will file takedown notices
// Listings with these brands are HIGH RISK for account suspension

export const VERO_BRANDS: Record<string, { severity: 'block' | 'warn'; category: string; notes?: string }> = {
  // ============================================
  // BLOCK - DO NOT LIST UNDER ANY CIRCUMSTANCES
  // ============================================

  // Athletic & Sportswear (Very Aggressive Enforcement)
  'nike': { severity: 'block', category: 'athletic', notes: 'Extremely aggressive VeRO enforcement' },
  'jordan': { severity: 'block', category: 'athletic', notes: 'Nike subsidiary' },
  'air jordan': { severity: 'block', category: 'athletic', notes: 'Nike subsidiary' },
  'adidas': { severity: 'block', category: 'athletic' },
  'yeezy': { severity: 'block', category: 'athletic', notes: 'Adidas line' },
  'puma': { severity: 'block', category: 'athletic' },
  'reebok': { severity: 'block', category: 'athletic' },
  'under armour': { severity: 'block', category: 'athletic' },
  'new balance': { severity: 'block', category: 'athletic' },
  'converse': { severity: 'block', category: 'athletic', notes: 'Nike subsidiary' },
  'vans': { severity: 'block', category: 'athletic' },
  'asics': { severity: 'block', category: 'athletic' },
  'fila': { severity: 'block', category: 'athletic' },
  'champion': { severity: 'block', category: 'athletic' },
  'lululemon': { severity: 'block', category: 'athletic' },
  'athleta': { severity: 'block', category: 'athletic' },

  // Luxury Fashion (Extremely Aggressive)
  'louis vuitton': { severity: 'block', category: 'luxury', notes: 'LVMH - Very aggressive' },
  'lv': { severity: 'block', category: 'luxury', notes: 'Louis Vuitton abbreviation' },
  'gucci': { severity: 'block', category: 'luxury' },
  'chanel': { severity: 'block', category: 'luxury' },
  'hermes': { severity: 'block', category: 'luxury' },
  'hermès': { severity: 'block', category: 'luxury' },
  'prada': { severity: 'block', category: 'luxury' },
  'burberry': { severity: 'block', category: 'luxury' },
  'dior': { severity: 'block', category: 'luxury' },
  'christian dior': { severity: 'block', category: 'luxury' },
  'fendi': { severity: 'block', category: 'luxury' },
  'versace': { severity: 'block', category: 'luxury' },
  'balenciaga': { severity: 'block', category: 'luxury' },
  'givenchy': { severity: 'block', category: 'luxury' },
  'valentino': { severity: 'block', category: 'luxury' },
  'bottega veneta': { severity: 'block', category: 'luxury' },
  'saint laurent': { severity: 'block', category: 'luxury' },
  'ysl': { severity: 'block', category: 'luxury' },
  'celine': { severity: 'block', category: 'luxury' },
  'loewe': { severity: 'block', category: 'luxury' },
  'cartier': { severity: 'block', category: 'luxury' },
  'tiffany': { severity: 'block', category: 'luxury' },
  'bulgari': { severity: 'block', category: 'luxury' },
  'bvlgari': { severity: 'block', category: 'luxury' },
  'van cleef': { severity: 'block', category: 'luxury' },

  // Technology (Very Aggressive)
  'apple': { severity: 'block', category: 'tech', notes: 'Extremely aggressive on accessories' },
  'iphone': { severity: 'block', category: 'tech', notes: 'Apple trademark' },
  'ipad': { severity: 'block', category: 'tech', notes: 'Apple trademark' },
  'macbook': { severity: 'block', category: 'tech', notes: 'Apple trademark' },
  'airpods': { severity: 'block', category: 'tech', notes: 'Apple trademark' },
  'magsafe': { severity: 'block', category: 'tech', notes: 'Apple trademark' },
  'samsung': { severity: 'block', category: 'tech' },
  'galaxy': { severity: 'block', category: 'tech', notes: 'Samsung trademark' },
  'microsoft': { severity: 'block', category: 'tech' },
  'xbox': { severity: 'block', category: 'tech' },
  'surface': { severity: 'block', category: 'tech' },
  'sony': { severity: 'block', category: 'tech' },
  'playstation': { severity: 'block', category: 'tech' },
  'ps5': { severity: 'block', category: 'tech' },
  'ps4': { severity: 'block', category: 'tech' },
  'nintendo': { severity: 'block', category: 'tech' },
  'switch': { severity: 'block', category: 'tech', notes: 'Nintendo context' },
  'google': { severity: 'block', category: 'tech' },
  'pixel': { severity: 'block', category: 'tech' },
  'chromebook': { severity: 'block', category: 'tech' },
  'bose': { severity: 'block', category: 'tech' },
  'beats': { severity: 'block', category: 'tech', notes: 'Apple subsidiary' },
  'jbl': { severity: 'block', category: 'tech' },
  'sonos': { severity: 'block', category: 'tech' },
  'dyson': { severity: 'block', category: 'tech' },
  'dell': { severity: 'block', category: 'tech' },
  'hp': { severity: 'block', category: 'tech' },
  'lenovo': { severity: 'block', category: 'tech' },
  'asus': { severity: 'block', category: 'tech' },
  'acer': { severity: 'block', category: 'tech' },
  'lg': { severity: 'block', category: 'tech' },
  'panasonic': { severity: 'block', category: 'tech' },
  'canon': { severity: 'block', category: 'tech' },
  'nikon': { severity: 'block', category: 'tech' },
  'gopro': { severity: 'block', category: 'tech' },
  'dji': { severity: 'block', category: 'tech' },
  'fitbit': { severity: 'block', category: 'tech' },
  'garmin': { severity: 'block', category: 'tech' },
  'logitech': { severity: 'block', category: 'tech' },
  'razer': { severity: 'block', category: 'tech' },

  // Entertainment & Media (Very Aggressive)
  'disney': { severity: 'block', category: 'entertainment', notes: 'Extremely aggressive' },
  'marvel': { severity: 'block', category: 'entertainment', notes: 'Disney subsidiary' },
  'star wars': { severity: 'block', category: 'entertainment', notes: 'Disney subsidiary' },
  'lucasfilm': { severity: 'block', category: 'entertainment', notes: 'Disney subsidiary' },
  'pixar': { severity: 'block', category: 'entertainment', notes: 'Disney subsidiary' },
  'mickey mouse': { severity: 'block', category: 'entertainment' },
  'frozen': { severity: 'block', category: 'entertainment' },
  'avengers': { severity: 'block', category: 'entertainment' },
  'spider-man': { severity: 'block', category: 'entertainment' },
  'spiderman': { severity: 'block', category: 'entertainment' },
  'pokemon': { severity: 'block', category: 'entertainment' },
  'pikachu': { severity: 'block', category: 'entertainment' },
  'hello kitty': { severity: 'block', category: 'entertainment' },
  'sanrio': { severity: 'block', category: 'entertainment' },
  'warner bros': { severity: 'block', category: 'entertainment' },
  'dc comics': { severity: 'block', category: 'entertainment' },
  'batman': { severity: 'block', category: 'entertainment' },
  'superman': { severity: 'block', category: 'entertainment' },
  'harry potter': { severity: 'block', category: 'entertainment' },
  'hogwarts': { severity: 'block', category: 'entertainment' },
  'nfl': { severity: 'block', category: 'entertainment' },
  'nba': { severity: 'block', category: 'entertainment' },
  'mlb': { severity: 'block', category: 'entertainment' },
  'nhl': { severity: 'block', category: 'entertainment' },
  'fifa': { severity: 'block', category: 'entertainment' },
  'olympics': { severity: 'block', category: 'entertainment' },
  'world cup': { severity: 'block', category: 'entertainment' },

  // Eyewear (Aggressive - Luxottica owns most)
  'ray-ban': { severity: 'block', category: 'eyewear' },
  'rayban': { severity: 'block', category: 'eyewear' },
  'oakley': { severity: 'block', category: 'eyewear' },
  'persol': { severity: 'block', category: 'eyewear' },
  'oliver peoples': { severity: 'block', category: 'eyewear' },
  'costa del mar': { severity: 'block', category: 'eyewear' },
  'maui jim': { severity: 'block', category: 'eyewear' },

  // Outdoor & Sporting Goods
  'north face': { severity: 'block', category: 'outdoor' },
  'the north face': { severity: 'block', category: 'outdoor' },
  'patagonia': { severity: 'block', category: 'outdoor' },
  'columbia': { severity: 'block', category: 'outdoor' },
  'canada goose': { severity: 'block', category: 'outdoor' },
  'moncler': { severity: 'block', category: 'outdoor' },
  'arc\'teryx': { severity: 'block', category: 'outdoor' },
  'arcteryx': { severity: 'block', category: 'outdoor' },
  'yeti': { severity: 'block', category: 'outdoor' },
  'hydroflask': { severity: 'block', category: 'outdoor' },
  'hydro flask': { severity: 'block', category: 'outdoor' },
  'stanley': { severity: 'block', category: 'outdoor', notes: 'The tumbler brand' },
  'osprey': { severity: 'block', category: 'outdoor' },

  // Watches (Very Aggressive)
  'rolex': { severity: 'block', category: 'watches' },
  'omega': { severity: 'block', category: 'watches' },
  'tag heuer': { severity: 'block', category: 'watches' },
  'breitling': { severity: 'block', category: 'watches' },
  'patek philippe': { severity: 'block', category: 'watches' },
  'audemars piguet': { severity: 'block', category: 'watches' },
  'iwc': { severity: 'block', category: 'watches' },
  'panerai': { severity: 'block', category: 'watches' },
  'hublot': { severity: 'block', category: 'watches' },
  'tudor': { severity: 'block', category: 'watches' },
  'seiko': { severity: 'block', category: 'watches' },
  'citizen': { severity: 'block', category: 'watches' },
  'casio': { severity: 'block', category: 'watches' },
  'g-shock': { severity: 'block', category: 'watches' },
  'fossil': { severity: 'block', category: 'watches' },

  // Automotive
  'bmw': { severity: 'block', category: 'automotive' },
  'mercedes': { severity: 'block', category: 'automotive' },
  'mercedes-benz': { severity: 'block', category: 'automotive' },
  'audi': { severity: 'block', category: 'automotive' },
  'porsche': { severity: 'block', category: 'automotive' },
  'ferrari': { severity: 'block', category: 'automotive' },
  'lamborghini': { severity: 'block', category: 'automotive' },
  'tesla': { severity: 'block', category: 'automotive' },
  'ford': { severity: 'block', category: 'automotive' },
  'chevrolet': { severity: 'block', category: 'automotive' },
  'jeep': { severity: 'block', category: 'automotive' },
  'harley-davidson': { severity: 'block', category: 'automotive' },
  'harley davidson': { severity: 'block', category: 'automotive' },

  // Cosmetics & Beauty
  'mac cosmetics': { severity: 'block', category: 'beauty' },
  'estee lauder': { severity: 'block', category: 'beauty' },
  'clinique': { severity: 'block', category: 'beauty' },
  'lancome': { severity: 'block', category: 'beauty' },
  'urban decay': { severity: 'block', category: 'beauty' },
  'nars': { severity: 'block', category: 'beauty' },
  'too faced': { severity: 'block', category: 'beauty' },
  'benefit': { severity: 'block', category: 'beauty' },
  'sephora': { severity: 'block', category: 'beauty' },
  'kylie cosmetics': { severity: 'block', category: 'beauty' },
  'charlotte tilbury': { severity: 'block', category: 'beauty' },
  'olaplex': { severity: 'block', category: 'beauty' },

  // Home & Appliances
  'kitchenaid': { severity: 'block', category: 'home' },
  'cuisinart': { severity: 'block', category: 'home' },
  'vitamix': { severity: 'block', category: 'home' },
  'ninja': { severity: 'block', category: 'home' },
  'instant pot': { severity: 'block', category: 'home' },
  'keurig': { severity: 'block', category: 'home' },
  'nespresso': { severity: 'block', category: 'home' },
  'roomba': { severity: 'block', category: 'home' },
  'irobot': { severity: 'block', category: 'home' },
  'shark': { severity: 'block', category: 'home' },
  'bissell': { severity: 'block', category: 'home' },

  // Fashion Brands
  'ralph lauren': { severity: 'block', category: 'fashion' },
  'polo': { severity: 'block', category: 'fashion', notes: 'Ralph Lauren context' },
  'tommy hilfiger': { severity: 'block', category: 'fashion' },
  'calvin klein': { severity: 'block', category: 'fashion' },
  'michael kors': { severity: 'block', category: 'fashion' },
  'coach': { severity: 'block', category: 'fashion' },
  'kate spade': { severity: 'block', category: 'fashion' },
  'tory burch': { severity: 'block', category: 'fashion' },
  'marc jacobs': { severity: 'block', category: 'fashion' },
  'ted baker': { severity: 'block', category: 'fashion' },
  'hugo boss': { severity: 'block', category: 'fashion' },
  'armani': { severity: 'block', category: 'fashion' },
  'dolce gabbana': { severity: 'block', category: 'fashion' },
  'd&g': { severity: 'block', category: 'fashion' },
  'lacoste': { severity: 'block', category: 'fashion' },
  'supreme': { severity: 'block', category: 'fashion' },
  'off-white': { severity: 'block', category: 'fashion' },
  'bape': { severity: 'block', category: 'fashion' },
  'stussy': { severity: 'block', category: 'fashion' },
  'carhartt': { severity: 'block', category: 'fashion' },

  // Baby & Kids
  'fisher-price': { severity: 'block', category: 'kids' },
  'fisher price': { severity: 'block', category: 'kids' },
  'little tikes': { severity: 'block', category: 'kids' },
  'lego': { severity: 'block', category: 'kids', notes: 'Very aggressive on fakes' },
  'hasbro': { severity: 'block', category: 'kids' },
  'mattel': { severity: 'block', category: 'kids' },
  'barbie': { severity: 'block', category: 'kids' },
  'hot wheels': { severity: 'block', category: 'kids' },
  'nerf': { severity: 'block', category: 'kids' },

  // Tools & Hardware
  'dewalt': { severity: 'block', category: 'tools' },
  'milwaukee': { severity: 'block', category: 'tools' },
  'makita': { severity: 'block', category: 'tools' },
  'bosch': { severity: 'block', category: 'tools' },
  'ryobi': { severity: 'block', category: 'tools' },
  'craftsman': { severity: 'block', category: 'tools' },
  'snap-on': { severity: 'block', category: 'tools' },
  'stanley': { severity: 'block', category: 'tools', notes: 'Tools brand' },
  'black & decker': { severity: 'block', category: 'tools' },
  'klein tools': { severity: 'block', category: 'tools' },

  // ============================================
  // WARN - HIGH RISK, MANUAL REVIEW REQUIRED
  // ============================================

  'crocs': { severity: 'warn', category: 'footwear', notes: 'Active enforcement on knockoffs' },
  'birkenstock': { severity: 'warn', category: 'footwear' },
  'ugg': { severity: 'warn', category: 'footwear' },
  'dr martens': { severity: 'warn', category: 'footwear' },
  'timberland': { severity: 'warn', category: 'footwear' },
  'skechers': { severity: 'warn', category: 'footwear' },
  'clarks': { severity: 'warn', category: 'footwear' },
  'keen': { severity: 'warn', category: 'footwear' },
  'merrell': { severity: 'warn', category: 'footwear' },
  'brooks': { severity: 'warn', category: 'footwear' },
  'hoka': { severity: 'warn', category: 'footwear' },
  'on running': { severity: 'warn', category: 'footwear' },
  'allbirds': { severity: 'warn', category: 'footwear' },
}

// Export flat array of brand names for quick lookup
export const VERO_BRAND_NAMES = Object.keys(VERO_BRANDS)

// Get all blocked brands
export const BLOCKED_BRANDS = Object.entries(VERO_BRANDS)
  .filter(([_, info]) => info.severity === 'block')
  .map(([brand]) => brand)

// Get all warn brands
export const WARN_BRANDS = Object.entries(VERO_BRANDS)
  .filter(([_, info]) => info.severity === 'warn')
  .map(([brand]) => brand)

// Check if text contains any VeRO brand
export function checkForVeroBrands(text: string): {
  found: boolean
  matches: Array<{ brand: string; severity: 'block' | 'warn'; category: string }>
} {
  const normalizedText = text.toLowerCase()
  const matches: Array<{ brand: string; severity: 'block' | 'warn'; category: string }> = []

  for (const [brand, info] of Object.entries(VERO_BRANDS)) {
    // Word boundary check to avoid false positives
    const regex = new RegExp(`\\b${brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (regex.test(normalizedText)) {
      matches.push({
        brand,
        severity: info.severity,
        category: info.category,
      })
    }
  }

  return {
    found: matches.length > 0,
    matches,
  }
}
