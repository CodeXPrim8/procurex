'use client'

import { useState, useEffect } from 'react'
import { Package, CheckCircle } from 'lucide-react'
import Link from 'next/link'
import Badge from './ui/Badge'
import { formatPrice, getCurrencySymbol } from '@/lib/currency'
import { resolveMediaUrl, productImageList } from '@/lib/media'

interface ProductCardProps {
 product: {
 id: number
 name: string
 sku: string
 category: string
 price: number
 stock: number
 specifications?: Record<string, any>
 image_url?: string
 image_urls?: string[]
 available_vendors?: number
 }
}

export default function ProductCard({ product }: ProductCardProps) {
 const [formattedPrice, setFormattedPrice] = useState('')
 const [currencySymbol, setCurrencySymbol] = useState('$')
 const isInStock = product.stock > 0
 const coverImage = productImageList(product)[0]

 useEffect(() => {
 const loadPrice = async () => {
 const price = await formatPrice(product.price)
 const symbol = await getCurrencySymbol()
 setFormattedPrice(price)
 setCurrencySymbol(symbol)
 }
 loadPrice()
 }, [product.price])

 return (
 <Link href={`/products/${product.id}`} className="block h-full">
 <div className="group h-full flex flex-col rounded-2xl border border-[#2f2f2f] bg-[#2f2f2f] p-4 transition duration-200 hover:-translate-y-0.5 hover:border-[#3d3d3d] hover:bg-[#353535]">
 {coverImage ? (
 <img
 src={resolveMediaUrl(coverImage)}
 alt={product.name}
 className="w-full h-40 object-cover rounded-xl mb-4 bg-[#171717]"
 />
 ) : (
 <div className="w-full h-40 rounded-xl mb-4 flex items-center justify-center bg-[#171717]">
 <Package className="w-10 h-10 text-[#19C37D]" />
 </div>
 )}

 <div className="flex-1 flex flex-col">
 <div className="flex items-start justify-between gap-2 mb-2">
 <h4 className="font-semibold text-[#ececec] text-base line-clamp-2 group-hover:text-white transition-colors">
 {product.name}
 </h4>
 <Badge variant={isInStock ? 'success' : 'warning'} size="sm">
 {isInStock ? 'In Stock' : 'Out of Stock'}
 </Badge>
 </div>

 <p className="text-xs text-[#8e8e8e] mb-3">
 {product.sku} · {product.category}
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
 <div className="flex items-baseline gap-0.5 text-[#19C37D]">
 {currencySymbol === '₦' && <span className="text-lg font-bold">₦</span>}
 <span className="font-bold text-lg tracking-tight">{formattedPrice || '…'}</span>
 </div>
 {isInStock && (
 <div className="flex items-center gap-1 text-[#8e8e8e]">
 <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
 <span className="text-xs">{product.stock} available</span>
 </div>
 )}
 </div>
 {product.available_vendors && product.available_vendors > 1 && (
 <p className="text-xs text-[#8e8e8e] mt-1.5">
 From {product.available_vendors} vendors
 </p>
 )}
 </div>
 </div>
 </div>
 </Link>
 )
}
