'use client'

import { Grid, List } from 'lucide-react'
import ProductCard from './ProductCard'
import Button from './ui/Button'

interface ProductGridProps {
 products: any[]
 viewMode: 'grid' | 'list'
 onViewModeChange: (mode: 'grid' | 'list') => void
}

export default function ProductGrid({ products, viewMode, onViewModeChange }: ProductGridProps) {
 if (products.length === 0) {
 return (
 <div className="text-center py-12">
 <p className="text-[#8e8e8e] text-lg">No products found</p>
 <p className="text-gray-400 text-sm mt-2">Try adjusting your search or filters</p>
 </div>
 )
 }

 return (
 <div>
 <div className="flex items-center justify-between mb-4">
 <p className="text-sm text-[#b4b4b4]">
 Showing {products.length} product{products.length !== 1 ? 's' : ''}
 </p>
 <div className="flex items-center space-x-2">
 <Button
 variant={viewMode === 'grid' ? 'primary' : 'outline'}
 size="sm"
 onClick={() => onViewModeChange('grid')}
 >
 <Grid className="w-4 h-4" />
 </Button>
 <Button
 variant={viewMode === 'list' ? 'primary' : 'outline'}
 size="sm"
 onClick={() => onViewModeChange('list')}
 >
 <List className="w-4 h-4" />
 </Button>
 </div>
 </div>

 {viewMode === 'grid' ? (
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
 {products.map((product) => (
 <ProductCard key={product.id} product={product} />
 ))}
 </div>
 ) : (
 <div className="space-y-4">
 {products.map((product) => (
 <div key={product.id} className="bg-[#2f2f2f] border border-[#2f2f2f] rounded-lg p-4">
 <ProductCard product={product} />
 </div>
 ))}
 </div>
 )}
 </div>
 )
}


