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
] as const

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number]

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
}

export function specFieldsFor(category: string): SpecField[] {
  return CATEGORY_SPEC_FIELDS[category] || []
}
