const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export const MAX_PRODUCT_IMAGES = 8

export function resolveMediaUrl(url?: string | null): string {
  if (!url) return ''
  if (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  if (url.startsWith('/')) {
    return `${API_URL}${url}`
  }
  return url
}

export function productImageList(product?: {
  image_url?: string | null
  image_urls?: string[] | null
} | null): string[] {
  const cover = product?.image_url?.trim() || ''
  const extras = (product?.image_urls || []).map((url) => String(url || '').trim()).filter(Boolean)
  const urls: string[] = []
  if (cover) urls.push(cover)
  for (const url of extras) {
    if (!urls.includes(url)) urls.push(url)
  }
  return urls
}
