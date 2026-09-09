'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, DollarSign, CheckCircle, Package, ShoppingCart } from 'lucide-react'
import { productAPI, quotationAPI } from '@/lib/api'
import { showToast } from '@/lib/toast'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { useRequireAuth } from '@/lib/auth'
import { formatPrice, getCurrencySymbol } from '@/lib/currency'
import { resolveMediaUrl, productImageList } from '@/lib/media'

// Helper component for alternative products
function AlternativeProductCard({ product, onSelect }: { product: any, onSelect: () => void }) {
 const [formattedPrice, setFormattedPrice] = useState('')
 
 useEffect(() => {
 const loadPrice = async () => {
 const price = await formatPrice(product.price || 0)
 setFormattedPrice(price)
 }
 loadPrice()
 }, [product.price])
 
 return (
 <div
 onClick={onSelect}
 className="border border-[#2f2f2f] rounded-lg p-4 hover:bg-[#353535] transition-shadow cursor-pointer"
 >
 <h4 className="font-semibold text-[#ececec] mb-2">{product.name}</h4>
 <p className="text-green-600 font-bold">{formattedPrice || '...'}</p>
 <p className="text-sm text-[#8e8e8e] mt-1">{product.stock} in stock</p>
 </div>
 )
}

export default function ProductDetailPage() {
 const params = useParams()
 const router = useRouter()
 const { user } = useRequireAuth()
 const [product, setProduct] = useState<any>(null)
 const [alternatives, setAlternatives] = useState<any[]>([])
 const [loading, setLoading] = useState(true)
 const [quantity, setQuantity] = useState(1)
 const [formattedPrice, setFormattedPrice] = useState('')
 const [currencySymbol, setCurrencySymbol] = useState('$')
 const [activeImage, setActiveImage] = useState(0)

 useEffect(() => {
 if (params.id) {
 loadProduct()
 }
 }, [params.id])

 const loadProduct = async () => {
 try {
 const productData = await productAPI.getProduct(Number(params.id))
 setProduct(productData)
 setActiveImage(0)
 
 // Format price based on location
 const price = await formatPrice(productData.price || 0)
 const symbol = await getCurrencySymbol()
 setFormattedPrice(price)
 setCurrencySymbol(symbol)
 
 // Load alternatives
 const altProducts = await productAPI.getAlternatives(Number(params.id))
 setAlternatives(altProducts)
 } catch (error: any) {
 showToast(error.response?.data?.detail || 'Failed to load product', 'error')
 router.push('/products')
 } finally {
 setLoading(false)
 }
 }

 const handleAddToQuotation = async () => {
 if (!product) return

 try {
 const quotationData = {
 customer_name: user?.full_name || 'Customer',
 customer_email: user?.email || '',
 items: [
 {
 product_id: product.id,
 vendor_product_id: product.vendor_product_id,
 quantity: quantity,
 unit_price: product.price / 100,
 specifications: product.specifications,
 },
 ],
 }

 const quotation = await quotationAPI.create(quotationData)
 showToast('Product added to quotation!', 'success')
 router.push(`/quotations/${quotation.id}`)
 } catch (error: any) {
 showToast(error.response?.data?.detail || 'Failed to create quotation', 'error')
 }
 }

 if (loading) {
 return (
 <div className="text-center py-12">
 <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
 <p className="mt-4 text-[#b4b4b4]">Loading product...</p>
 </div>
 )
 }

 if (!product) {
 return (
 <div className="text-center py-12">
 <p className="text-[#b4b4b4]">Product not found</p>
 <Button onClick={() => router.push('/products')} className="mt-4">
 Back to Products
 </Button>
 </div>
 )
 }

 const isInStock = product.stock > 0
 const photos = productImageList(product)
 const currentPhoto = photos[activeImage] || photos[0]

 return (
 <div className="space-y-6">
 <Button
 variant="ghost"
 onClick={() => router.back()}
 className="mb-4"
 >
 <ArrowLeft className="w-4 h-4 mr-2" />
 Back
 </Button>

 <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
 {/* Product Images */}
 <div>
 {currentPhoto ? (
 <img
 src={resolveMediaUrl(currentPhoto)}
 alt={product.name}
 className="w-full h-96 object-cover rounded-lg bg-[#171717]"
 />
 ) : (
 <div className="w-full h-96 bg-[#2f2f2f] rounded-lg flex items-center justify-center">
 <Package className="w-24 h-24 text-gray-400" />
 </div>
 )}
 {photos.length > 1 && (
 <div className="mt-3 grid grid-cols-5 gap-2">
 {photos.map((url, index) => (
 <button
 key={`${url}-${index}`}
 type="button"
 onClick={() => setActiveImage(index)}
 className={`h-16 rounded-md overflow-hidden border ${
 index === activeImage ? 'border-primary-500' : 'border-[#3d3d3d]'
 }`}
 >
 <img src={resolveMediaUrl(url)} alt="" className="w-full h-full object-cover" />
 </button>
 ))}
 </div>
 )}
 </div>

 {/* Product Info */}
 <div className="space-y-6">
 <div>
 <div className="flex items-start justify-between mb-2">
 <h1 className="text-3xl font-bold text-[#ececec]">{product.name}</h1>
 <Badge variant={isInStock ? 'success' : 'warning'}>
 {isInStock ? 'In Stock' : 'Out of Stock'}
 </Badge>
 </div>
 <p className="text-[#b4b4b4]">SKU: {product.sku}</p>
 <p className="text-[#b4b4b4]">Category: {product.category}</p>
 </div>

 <div className="flex items-center space-x-2">
 {currencySymbol === '₦' ? (
 <span className="text-4xl font-bold text-green-600">₦</span>
 ) : (
 <DollarSign className="w-6 h-6 text-green-600" />
 )}
 <span className="text-4xl font-bold text-[#ececec]">{formattedPrice || '...'}</span>
 </div>

 {product.description && (
 <div>
 <h3 className="font-semibold text-[#ececec] mb-2">Description</h3>
 <p className="text-[#b4b4b4]">{product.description}</p>
 </div>
 )}

 {product.specifications && Object.keys(product.specifications).length > 0 && (
 <div>
 <h3 className="font-semibold text-[#ececec] mb-2">Specifications</h3>
 <div className="bg-[#212121] rounded-lg p-4 space-y-2">
 {Object.entries(product.specifications).map(([key, value]) => (
 <div key={key} className="flex justify-between">
 <span className="font-medium text-[#b4b4b4]">{key}:</span>
 <span className="text-[#b4b4b4]">{String(value)}</span>
 </div>
 ))}
 </div>
 </div>
 )}

 <div className="border-t border-[#2f2f2f] pt-4">
 {isInStock && (
 <div className="space-y-4">
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-2">
 Quantity
 </label>
 <input
 type="number"
 min="1"
 max={product.stock}
 value={quantity}
 onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
 className="w-24 px-3 py-2 border border-[#3d3d3d] rounded-lg"
 />
 <p className="text-sm text-[#8e8e8e] mt-1">
 {product.stock} available in stock
 </p>
 </div>
 <Button
 onClick={handleAddToQuotation}
 className="w-full"
 size="lg"
 >
 <ShoppingCart className="w-5 h-5 mr-2" />
 Add to Quotation
 </Button>
 </div>
 )}
 </div>
 </div>
 </div>

 {/* Alternatives */}
 {alternatives.length > 0 && (
 <div className="mt-12">
 <h2 className="text-2xl font-bold text-[#ececec] mb-4">Alternative Products</h2>
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
 {alternatives.map((alt) => (
 <AlternativeProductCard
 key={alt.id}
 product={alt}
 onSelect={() => router.push(`/products/${alt.id}`)}
 />
 ))}
 </div>
 </div>
 )}
 </div>
 )
}


