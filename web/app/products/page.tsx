'use client'

import { useState, useEffect } from 'react'
import { Search, Filter, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { productAPI } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { showToast } from '@/lib/toast'
import ProductGrid from '@/components/ProductGrid'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { PRODUCT_CATEGORIES } from '@/lib/productCategories'

export default function ProductsPage() {
 const router = useRouter()
 const { user, authReady } = useAuth()
 const isVendor = user?.role === 'vendor'

 const [products, setProducts] = useState<any[]>([])
 const [loading, setLoading] = useState(true)
 const [searchQuery, setSearchQuery] = useState('')
 const [category, setCategory] = useState('')
 const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
 const [showFilters, setShowFilters] = useState(false)

 const categories = PRODUCT_CATEGORIES

 const loadProducts = async () => {
 setLoading(true)
 try {
 const results = await productAPI.search(searchQuery || 'all', category || undefined)
 setProducts(results || [])
 } catch (error: any) {
 console.error('Failed to load products:', error)
 setProducts([])
 showToast(error.response?.data?.detail || 'Failed to load products', 'error')
 } finally {
 setLoading(false)
 }
 }

 useEffect(() => {
 if (!authReady) {
 const timeout = setTimeout(() => {
 if (!isVendor) loadProducts()
 }, 3000)
 return () => clearTimeout(timeout)
 }

 if (isVendor) {
 router.replace('/vendor')
 return
 }

 loadProducts()
 }, [authReady, isVendor, searchQuery, category, router])

 const handleSearch = (e: React.FormEvent) => {
 e.preventDefault()
 loadProducts()
 }

 const clearFilters = () => {
 setSearchQuery('')
 setCategory('')
 }

 if (isVendor) {
 return (
 <div className="min-h-screen flex items-center justify-center">
 <div className="text-center">
 <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
 <p className="mt-4 text-[#b4b4b4]">Opening your vendor dashboard...</p>
 </div>
 </div>
 )
 }

 return (
 <div className="space-y-6">
 <div className="flex items-center justify-between">
 <h1 className="text-2xl sm:text-3xl font-bold text-[#ececec]">Products</h1>
 <Button
 variant="outline"
 onClick={() => setShowFilters(!showFilters)}
 className="md:hidden"
 >
 <Filter className="w-4 h-4 mr-2" />
 Filters
 </Button>
 </div>

 <div className="bg-[#2f2f2f] rounded-2xl border border-[#2f2f2f] p-4 md:p-6">
 <form onSubmit={handleSearch} className="space-y-4">
 <div className="flex flex-col md:flex-row gap-4">
 <div className="flex-1">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#8e8e8e] w-5 h-5" />
 <Input
 placeholder="Search products..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="pl-10"
 />
 </div>
 </div>
 <Button type="submit" isLoading={loading}>
 Search
 </Button>
 </div>

 <div className={`${showFilters ? 'block' : 'hidden'} md:block`}>
 <div className="space-y-4 pt-4 border-t border-[#2f2f2f]">
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-2">
 Category
 </label>
 <div className="flex flex-wrap gap-2 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
 <button
 type="button"
 onClick={() => setCategory('')}
 className={`min-h-11 px-3 py-1.5 rounded-full text-sm ${
 category === ''
 ? 'bg-primary-600 text-white'
 : 'bg-[#2f2f2f] text-[#b4b4b4] hover:bg-[#3d3d3d]'
 }`}
 >
 All
 </button>
 {categories.map((cat) => (
 <button
 key={cat}
 type="button"
 onClick={() => setCategory(cat)}
 className={`min-h-11 px-3 py-1.5 rounded-full text-sm ${
 category === cat
 ? 'bg-primary-600 text-white'
 : 'bg-[#2f2f2f] text-[#b4b4b4] hover:bg-[#3d3d3d]'
 }`}
 >
 {cat}
 </button>
 ))}
 </div>
 </div>

 {(searchQuery || category) && (
 <div className="flex items-center space-x-2">
 <span className="text-sm text-[#b4b4b4]">Active filters:</span>
 {searchQuery && (
 <Badge variant="info">
 Search: {searchQuery}
 <button
 onClick={() => setSearchQuery('')}
 className="ml-2 hover:text-[#ececec]"
 >
 <X className="w-3 h-3" />
 </button>
 </Badge>
 )}
 {category && (
 <Badge variant="info">
 Category: {category}
 <button
 onClick={() => setCategory('')}
 className="ml-2 hover:text-[#ececec]"
 >
 <X className="w-3 h-3" />
 </button>
 </Badge>
 )}
 <Button variant="ghost" size="sm" onClick={clearFilters}>
 Clear all
 </Button>
 </div>
 )}
 </div>
 </div>
 </form>
 </div>

 {loading ? (
 <div className="text-center py-12">
 <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
 <p className="mt-4 text-[#b4b4b4]">Loading products...</p>
 </div>
 ) : (
 <ProductGrid
 products={products}
 viewMode={viewMode}
 onViewModeChange={setViewMode}
 />
 )}
 </div>
 )
}
