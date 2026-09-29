'use client'

import { useState, useEffect } from 'react'
import { Package, CheckCircle, Phone } from 'lucide-react'
import Badge from './ui/Badge'
import { CONTACT_FOR_PRICE_LABEL } from './PriceText'
import { availabilityLabel } from './DeliveryModeToggle'
import { formatPrice } from '@/lib/currency'
import { isContactPriced } from '@/lib/productCategories'
import { resolveMediaUrl, productImageList } from '@/lib/media'

interface ProductCardProps {
 onSelect?: (product: ProductCardProps['product']) => void
 product: {
 id: number
 name: string
 sku: string
 category: string
 price: number | null
 price_mode?: string
 contact_for_price?: boolean
 vendor_name?: string | null
 vendor_phone?: string | null
 vendor_country?: string | null
 delivery_mode?: string | null
 stock: number
 specifications?: Record<string, any>
 image_url?: string
 image_urls?: string[]
 available_vendors?: number
 match_kind?: 'exact' | 'close' | 'related' | 'match'
 }
}

export default function ProductCard({ product, onSelect }: ProductCardProps) {
 const [formattedPrice, setFormattedPrice] = useState('')
 const isInStock = product.stock > 0
 const coverImage = productImageList(product)[0]
 const contactForPrice = isContactPriced(product)

 useEffect(() => {
 if (contactForPrice) return
 const loadPrice = async () => {
 const price = await formatPrice(product.price || 0)
 setFormattedPrice(price)
 }
 loadPrice()
 }, [product.price, contactForPrice])

 const clickable = Boolean(onSelect)

 return (
 <div
 role={clickable ? 'button' : undefined}
 tabIndex={clickable ? 0 : undefined}
 onClick={clickable ? () => onSelect?.(product) : undefined}
 onKeyDown={
 clickable
 ? (event) => {
 if (event.key === 'Enter' || event.key === ' ') {
 event.preventDefault()
 onSelect?.(product)
 }
 }
 : undefined
 }
 className={`group h-full flex flex-col rounded-2xl border border-[#2f2f2f] bg-[#2f2f2f] p-3 sm:p-4 transition duration-200 ${
 clickable
 ? 'cursor-pointer hover:-translate-y-0.5 hover:border-[#19C37D]/40 hover:bg-[#353535] focus:outline-none focus:ring-2 focus:ring-[#19C37D]/50'
 : 'hover:-translate-y-0.5 hover:border-[#3d3d3d] hover:bg-[#353535]'
 }`}
 >
 {coverImage ? (
 <img
 src={resolveMediaUrl(coverImage)}
 alt={product.name}
 loading="lazy"
 decoding="async"
 className="w-full h-36 sm:h-40 object-cover rounded-xl mb-3 sm:mb-4 bg-[#171717]"
 />
 ) : (
 <div className="w-full h-36 sm:h-40 rounded-xl mb-3 sm:mb-4 flex items-center justify-center bg-[#171717]">
 <Package className="w-10 h-10 text-[#19C37D]" />
 </div>
 )}

 <div className="flex-1 flex flex-col">
 <div className="flex items-start justify-between gap-2 mb-2">
 <h4 className="font-semibold text-[#ececec] text-base line-clamp-2 group-hover:text-white transition-colors">
 {product.name}
 </h4>
 <div className="flex flex-col items-end gap-1 shrink-0">
 {product.match_kind === 'exact' || product.match_kind === 'close' ? (
 <Badge variant="success" size="sm">Exact match</Badge>
 ) : product.match_kind === 'related' ? (
 <Badge variant="default" size="sm">Suggestion</Badge>
 ) : null}
 <Badge variant={isInStock ? 'success' : 'warning'} size="sm">
 {isInStock ? 'In Stock' : 'Out of Stock'}
 </Badge>
 </div>
 </div>

 <p className="text-xs text-[#8e8e8e] mb-1">
 {product.sku} · {product.category}
 </p>
 <p className="text-[11px] text-[#8e8e8e] mb-3">
 {availabilityLabel(product.category, product.delivery_mode, product.vendor_country)}
 </p>

 {product.specifications && Object.keys(product.specifications).length > 0 && (
 <div className="text-sm text-[#b4b4b4] mb-3 space-y-1">
 {Object.entries(product.specifications)
 .slice(0, 2)
 .map(([key, value]) => (
 <div key={key} className="flex gap-1">
 <span className="font-medium text-[#ececec]">{key}:</span>
 <span className="truncate">{String(value)}</span>
 </div>
 ))}
 </div>
 )}

 <div className="mt-auto pt-3 border-t border-[#3d3d3d]">
 <div className="flex items-center justify-between">
 {contactForPrice ? (
 <div className="flex items-center gap-1.5 text-[#19C37D] min-w-0">
 <Phone className="w-4 h-4 shrink-0" />
 <span className="font-semibold text-sm">{CONTACT_FOR_PRICE_LABEL}</span>
 </div>
 ) : (
 <div className="flex items-baseline gap-0.5 text-[#19C37D]">
 <span className="font-bold text-lg tracking-tight">{formattedPrice || '…'}</span>
 </div>
 )}
 {isInStock && (
 <div className="flex items-center gap-1 text-[#8e8e8e]">
 <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
 <span className="text-xs">{product.stock} available</span>
 </div>
 )}
 </div>
 {contactForPrice && product.vendor_phone ? (
 <p className="text-xs text-[#8e8e8e] mt-1.5 truncate">
 {product.vendor_name ? `${product.vendor_name} · ` : ''}{product.vendor_phone}
 </p>
 ) : null}
 {product.available_vendors && product.available_vendors > 1 && (
 <p className="text-xs text-[#8e8e8e] mt-1.5">
 From {product.available_vendors} vendors
 </p>
 )}
 </div>
 </div>
 </div>
 )
}
