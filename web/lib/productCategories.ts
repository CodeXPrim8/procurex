export const PRODUCT_CATEGORIES = [
  'Laptop',
  'Desktop',
  'Tablet',
  'Phone',
  'Monitor',
  'Keyboard',
  'Mouse',
  'Printer',
  'Server',
  'Networking',
  'Storage',
  'Accessories',
  'Software',
  'Service',
] as const

export const GOODS_CATEGORIES = PRODUCT_CATEGORIES.filter(
  (category) => category !== 'Software' && category !== 'Service'
)

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

export const DIGITAL_CATEGORIES = ['Software', 'Service'] as const

export function isDigitalCategory(category: string) {
  return category === 'Software' || category === 'Service'
}

export type PriceMode = 'fixed' | 'contact'

/** Software and service vendors may hide their price and ask buyers to get in touch. */
export function allowsContactForPrice(category: string) {
  return isDigitalCategory(category)
}

export function isContactPriced(listing?: { price_mode?: string | null; contact_for_price?: boolean } | null) {
  return Boolean(listing && (listing.contact_for_price || listing.price_mode === 'contact'))
}

export function listingKind(category: string): 'goods' | 'software' | 'service' | '' {
  if (category === 'Software') return 'software'
  if (category === 'Service') return 'service'
  if (category) return 'goods'
  return ''
}

export type SpecField = {
  key: string
  label: string
  placeholder: string
  required?: boolean
}

export const CATEGORY_SPEC_FIELDS: Record<string, SpecField[]> = {
  Laptop: [
    { key: 'ram', label: 'RAM', placeholder: 'e.g., 16GB', required: true },
    { key: 'storage', label: 'Storage', placeholder: 'e.g., 512GB SSD', required: true },
    { key: 'processor', label: 'Processor', placeholder: 'e.g., Intel Core i7', required: true },
    { key: 'screen_size', label: 'Screen size', placeholder: 'e.g., 15.6 inch' },
  ],
  Desktop: [
    { key: 'ram', label: 'RAM', placeholder: 'e.g., 32GB', required: true },
    { key: 'storage', label: 'Storage', placeholder: 'e.g., 1TB SSD', required: true },
    { key: 'processor', label: 'Processor', placeholder: 'e.g., AMD Ryzen 7', required: true },
  ],
  Tablet: [
    { key: 'storage', label: 'Storage', placeholder: 'e.g., 256GB', required: true },
    { key: 'ram', label: 'RAM', placeholder: 'e.g., 8GB', required: true },
    { key: 'screen_size', label: 'Screen size', placeholder: 'e.g., 11 inch' },
  ],
  Phone: [
    { key: 'storage', label: 'Storage', placeholder: 'e.g., 256GB', required: true },
    { key: 'ram', label: 'RAM', placeholder: 'e.g., 8GB' },
  ],
  Monitor: [
    { key: 'screen_size', label: 'Screen size', placeholder: 'e.g., 27 inch', required: true },
    { key: 'resolution', label: 'Resolution', placeholder: 'e.g., 2560x1440', required: true },
  ],
  Keyboard: [
    { key: 'connectivity', label: 'Connectivity', placeholder: 'e.g., Wireless / USB' },
    { key: 'layout', label: 'Layout', placeholder: 'e.g., Full size' },
  ],
  Mouse: [
    { key: 'connectivity', label: 'Connectivity', placeholder: 'e.g., Wireless' },
    { key: 'dpi', label: 'DPI', placeholder: 'e.g., 16000' },
  ],
  Printer: [
    { key: 'type', label: 'Type', placeholder: 'e.g., Laser' },
    { key: 'color', label: 'Color', placeholder: 'e.g., Color / Mono' },
  ],
  Server: [
    { key: 'ram', label: 'RAM', placeholder: 'e.g., 64GB', required: true },
    { key: 'storage', label: 'Storage', placeholder: 'e.g., 2TB SSD', required: true },
    { key: 'processor', label: 'Processor', placeholder: 'e.g., Xeon Silver', required: true },
  ],
  Networking: [
    { key: 'type', label: 'Type', placeholder: 'e.g., Switch / Router' },
    { key: 'speed', label: 'Speed', placeholder: 'e.g., 1Gbps' },
  ],
  Storage: [
    { key: 'capacity', label: 'Capacity', placeholder: 'e.g., 2TB', required: true },
    { key: 'type', label: 'Type', placeholder: 'e.g., NVMe SSD' },
  ],
  Accessories: [
    { key: 'compatibility', label: 'Compatible with', placeholder: 'e.g., USB-C laptops' },
  ],
  Software: [
    { key: 'solves', label: 'Problem it solves', placeholder: 'e.g., Inventory, payroll, invoicing', required: true },
    { key: 'platform', label: 'Platform', placeholder: 'e.g., Web, Windows, Android, iOS', required: true },
    { key: 'license', label: 'License / delivery', placeholder: 'e.g., SaaS subscription, one-time license' },
    { key: 'deployment', label: 'Deployment', placeholder: 'e.g., Cloud / on-premise' },
  ],
  Service: [
    { key: 'service_type', label: 'Service type', placeholder: 'e.g., Website, mobile app, custom software', required: true },
    { key: 'deliverable', label: 'What the buyer gets', placeholder: 'e.g., 8-page company site, iOS + Android app', required: true },
    { key: 'timeline', label: 'Typical timeline', placeholder: 'e.g., 2–6 weeks' },
    { key: 'includes', label: 'What’s included', placeholder: 'e.g., Design, development, 30-day support' },
  ],
}

export function specFieldsFor(category: string): SpecField[] {
  return CATEGORY_SPEC_FIELDS[category] || []
}

const CATEGORY_SKU_CODES: Record<string, string> = {
  Laptop: 'LT',
  Desktop: 'DT',
  Tablet: 'TB',
  Phone: 'PH',
  Monitor: 'MN',
  Keyboard: 'KB',
  Mouse: 'MS',
  Printer: 'PR',
  Server: 'SR',
  Networking: 'NT',
  Storage: 'ST',
  Accessories: 'AC',
  Software: 'SW',
  Service: 'SV',
}

function skuSlug(value: string) {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter(Boolean)
    .slice(0, 4)
    .join('-')
}

export function generateProductSku(name: string, category: string) {
  const code = CATEGORY_SKU_CODES[category] || skuSlug(category).slice(0, 3) || 'GN'
  const slug = skuSlug(name)
  if (!slug) return ''
  return `PX-${code}-${slug}`.slice(0, 40)
}
