'use client'

import { useState, useEffect, useRef } from 'react'
import { Search, Filter, X, Plus, Package, Edit, Trash2, Building2, CheckCircle, AlertCircle, Upload, Info, LogIn, UserPlus, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { productAPI, vendorsAPI, authAPI } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { showToast } from '@/lib/toast'
import ProductGrid from '@/components/ProductGrid'
import Input from '@/components/ui/Input'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'

export default function ProductsPage() {
 const router = useRouter()
 const { user, isAuthenticated, authReady } = useAuth()
 const isVendor = user?.role === 'vendor'
 
 const [products, setProducts] = useState<any[]>([])
 const [vendorProducts, setVendorProducts] = useState<any[]>([])
 const [vendor, setVendor] = useState<any>(null)
 const [loading, setLoading] = useState(true)
 const [searchQuery, setSearchQuery] = useState('')
 const [category, setCategory] = useState('')
 const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
 const [showFilters, setShowFilters] = useState(false)
 
 // Product creation state
 const [showAddProduct, setShowAddProduct] = useState(false)
 const [productMode, setProductMode] = useState<'search' | 'create'>('create')
 const [productSearch, setProductSearch] = useState('')
 const [searchResults, setSearchResults] = useState<any[]>([])
 const [createProductForm, setCreateProductForm] = useState({
 name: '',
 sku: '',
 category: '',
 description: '',
 specifications: '',
 image_url: '',
 stock_quantity: 0,
 price: 0,
 })
 const [createProductErrors, setCreateProductErrors] = useState<Record<string, string>>({})
 const [isCreatingProduct, setIsCreatingProduct] = useState(false)

 // Vendor registration state
 const [showRegisterForm, setShowRegisterForm] = useState(false)
 const [vendorFormData, setVendorFormData] = useState({
 companyName: '',
 businessRegistrationNumber: '',
 domain: '',
 phone: '',
 address: '',
 })
 const [vendorErrors, setVendorErrors] = useState<Record<string, string>>({})
 const [isRegistering, setIsRegistering] = useState(false)

 const categories = [
 'Laptop',
 'Desktop',
 'Tablet',
 'Phone',
 'Monitor',
 'Keyboard',
 'Mouse',
 'Accessories',
 ]

 useEffect(() => {
 if (!authReady) {
 const timeout = setTimeout(() => {
 if (isVendor) {
 loadVendorData()
 } else {
 loadProducts()
 }
 }, 3000)
 return () => clearTimeout(timeout)
 }
 
 if (isVendor) {
 loadVendorData()
 } else {
 loadProducts()
 }
 }, [authReady, isVendor, searchQuery, category])

 const loadVendorData = async () => {
 setLoading(true)
 try {
 const vendorData = await vendorsAPI.getMyVendor()
 setVendor(vendorData)
 const vendorProducts = await vendorsAPI.getMyProducts()
 setVendorProducts(vendorProducts || [])
 } catch (error: any) {
 if (error.response?.status === 404) {
 setVendor(null)
 setVendorProducts([])
 } else {
 console.error('Failed to load vendor data:', error)
 }
 } finally {
 setLoading(false)
 }
 }

 const loadProducts = async () => {
 setLoading(true)
 try {
 const results = await productAPI.search(searchQuery || 'all', category || undefined)
 setProducts(results || [])
 } catch (error: any) {
 console.error('Failed to load products:', error)
 if (products.length === 0) {
 setProducts([])
 } else {
 showToast(error.response?.data?.detail || 'Failed to load products', 'error')
 }
 } finally {
 setLoading(false)
 }
 }

 const handleVendorRegister = async () => {
 const newErrors: Record<string, string> = {}
 
 if (!vendorFormData.companyName.trim()) {
 newErrors.companyName = 'Company name is required'
 }
 
 setVendorErrors(newErrors)
 if (Object.keys(newErrors).length > 0) return

 if (!isAuthenticated) {
 showToast('Please login first to register as a vendor', 'warning')
 router.push('/login?redirect=/products')
 return
 }

 setIsRegistering(true)
 try {
 await vendorsAPI.register({
 company_name: vendorFormData.companyName,
 business_registration_number: vendorFormData.businessRegistrationNumber || undefined,
 domain: vendorFormData.domain || undefined,
 phone: vendorFormData.phone || undefined,
 address: vendorFormData.address || undefined,
 })
 showToast('Vendor account created successfully!', 'success')
 setShowRegisterForm(false)
 loadVendorData()
 } catch (error: any) {
 showToast(error.response?.data?.detail || 'Failed to register vendor', 'error')
 } finally {
 setIsRegistering(false)
 }
 }

 const handleSearchProducts = async () => {
 if (!productSearch.trim()) return
 try {
 const results = await productAPI.search(productSearch)
 setSearchResults(results)
 } catch (error) {
 showToast('Failed to search products', 'error')
 }
 }

 const handleCreateProduct = async () => {
 const errors: Record<string, string> = {}
 if (!createProductForm.name.trim()) {
 errors.name = 'Product name is required'
 }
 if (!createProductForm.sku.trim()) {
 errors.sku = 'SKU is required'
 }
 if (!createProductForm.category.trim()) {
 errors.category = 'Category is required'
 }
 if (createProductForm.price <= 0) {
 errors.price = 'Price must be greater than 0'
 }

 setCreateProductErrors(errors)
 if (Object.keys(errors).length > 0) {
 showToast('Please fix the errors in the form', 'error')
 return
 }

 setIsCreatingProduct(true)
 try {
 let specifications = null
 if (createProductForm.specifications.trim()) {
 try {
 specifications = JSON.parse(createProductForm.specifications)
 } catch {
 specifications = { notes: createProductForm.specifications }
 }
 }

 const productData = {
 name: createProductForm.name.trim(),
 sku: createProductForm.sku.trim(),
 category: createProductForm.category.trim(),
 description: createProductForm.description.trim() || null,
 specifications: specifications,
 image_url: createProductForm.image_url.trim() || null,
 }

 await vendorsAPI.createProduct(
 productData,
 createProductForm.stock_quantity,
 Math.round(createProductForm.price * 100)
 )
 showToast('Product uploaded successfully! It will now be searchable by ProcureX AI.', 'success')
 setShowAddProduct(false)
 setCreateProductForm({
 name: '',
 sku: '',
 category: '',
 description: '',
 specifications: '',
 image_url: '',
 stock_quantity: 0,
 price: 0,
 })
 setCreateProductErrors({})
 loadVendorData()
 } catch (error: any) {
 showToast(error.response?.data?.detail || 'Failed to create product', 'error')
 } finally {
 setIsCreatingProduct(false)
 }
 }

 const handleUpdateStock = async (vendorProductId: number, stock: number) => {
 try {
 await vendorsAPI.updateStock(vendorProductId, stock)
 showToast('Stock updated successfully', 'success')
 loadVendorData()
 } catch (error: any) {
 showToast(error.response?.data?.detail || 'Failed to update stock', 'error')
 }
 }

 const handleDeleteProduct = async (vendorProductId: number) => {
 if (!confirm('Are you sure you want to remove this product from your catalog? It will no longer be searchable by ProcureX AI.')) {
 return
 }
 try {
 await vendorsAPI.deleteProduct(vendorProductId)
 showToast('Product removed successfully', 'success')
 loadVendorData()
 } catch (error: any) {
 showToast(error.response?.data?.detail || 'Failed to remove product', 'error')
 }
 }

 const handleSearch = (e: React.FormEvent) => {
 e.preventDefault()
 loadProducts()
 }

 const clearFilters = () => {
 setSearchQuery('')
 setCategory('')
 }

 // Vendor Dashboard View
 if (isVendor) {
 // If vendor not registered yet, show registration form
 if (!vendor && !loading) {
 return (
 <div className="max-w-4xl mx-auto space-y-6">
 <div className="bg-primary-600 rounded-2xl p-8 text-white">
 <div className="flex items-center space-x-3 mb-4">
 <Building2 className="w-8 h-8" />
 <h1 className="text-3xl font-bold">Vendor Dashboard</h1>
 </div>
 <p className="text-lg mb-2">Register your business to start selling on ProcureX</p>
 <p className="text-primary-100">Your products will be searchable by our AI assistant and visible to buyers worldwide</p>
 </div>

 {!showRegisterForm ? (
 <div className="bg-[#2f2f2f] rounded-2xl border border-[#2f2f2f] p-8 text-center">
 <Building2 className="w-16 h-16 text-[#8e8e8e] mx-auto mb-4" />
 <h2 className="text-2xl font-bold mb-2">Get Started as a Vendor</h2>
 <p className="text-[#b4b4b4] mb-6">Register your business to upload products and manage your inventory</p>
 <Button onClick={() => setShowRegisterForm(true)} size="lg">
 <UserPlus className="w-5 h-5 mr-2" />
 Register as Vendor
 </Button>
 </div>
 ) : (
 <div className="bg-[#2f2f2f] rounded-2xl border border-[#2f2f2f] p-8">
 <h2 className="text-2xl font-bold mb-6">Vendor Registration</h2>
 <div className="space-y-4">
 <Input
 label="Company Name *"
 required
 value={vendorFormData.companyName}
 onChange={(e) => {
 setVendorFormData({ ...vendorFormData, companyName: e.target.value })
 if (vendorErrors.companyName) {
 setVendorErrors({ ...vendorErrors, companyName: '' })
 }
 }}
 error={vendorErrors.companyName}
 />
 <Input
 label="Business Registration Number"
 value={vendorFormData.businessRegistrationNumber}
 onChange={(e) => setVendorFormData({ ...vendorFormData, businessRegistrationNumber: e.target.value })}
 placeholder="Optional"
 />
 <Input
 label="Domain/Website"
 value={vendorFormData.domain}
 onChange={(e) => setVendorFormData({ ...vendorFormData, domain: e.target.value })}
 placeholder="Optional: yourcompany.com"
 />
 <Input
 label="Phone Number"
 type="tel"
 value={vendorFormData.phone}
 onChange={(e) => setVendorFormData({ ...vendorFormData, phone: e.target.value })}
 placeholder="Optional"
 />
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">Address</label>
 <textarea
 value={vendorFormData.address}
 onChange={(e) => setVendorFormData({ ...vendorFormData, address: e.target.value })}
 className="w-full px-4 py-2 border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
 rows={3}
 placeholder="Optional: Company address"
 />
 </div>
 <div className="flex space-x-3 pt-4">
 <Button variant="outline" onClick={() => setShowRegisterForm(false)}>
 Cancel
 </Button>
 <Button onClick={handleVendorRegister} isLoading={isRegistering}>
 Register
 </Button>
 </div>
 </div>
 </div>
 )}
 </div>
 )
 }

 // Full vendor dashboard
 return (
 <div className="space-y-6">
 {/* Header with AI Integration Notice */}
 <div className="bg-primary-600 rounded-2xl p-6 text-white">
 <div className="flex items-center justify-between">
 <div>
 <div className="flex items-center space-x-3 mb-2">
 <Building2 className="w-8 h-8" />
 <h1 className="text-3xl font-bold">Vendor Dashboard</h1>
 </div>
 <p className="text-primary-100 mb-2">Manage your product catalog and inventory</p>
 <div className="flex items-center space-x-2 text-sm">
 <Sparkles className="w-4 h-4" />
 <span>Your products are searchable by ProcureX AI assistant</span>
 </div>
 </div>
 <Button 
 onClick={() => setShowAddProduct(true)}
 className="bg-[#2f2f2f] text-blue-600 hover:bg-[#353535]"
 >
 <Plus className="w-5 h-5 mr-2" />
 Upload Product
 </Button>
 </div>
 </div>

 {/* Vendor Info & Verification Status */}
 {vendor && (
 <div className="bg-[#2f2f2f] rounded-2xl border border-[#2f2f2f] p-6">
 <div className="flex items-center justify-between mb-4">
 <h2 className="text-xl font-semibold text-[#ececec]">Vendor Information</h2>
 <Badge variant={
 vendor.verification_status === 'verified' ? 'success' :
 vendor.verification_status === 'pending' ? 'warning' : 'danger'
 }>
 {vendor.verification_status === 'verified' && <CheckCircle className="w-4 h-4 mr-1" />}
 {vendor.verification_status === 'pending' && <AlertCircle className="w-4 h-4 mr-1" />}
 {vendor.verification_status || 'Not Verified'}
 </Badge>
 </div>
 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
 <div>
 <p className="text-sm text-[#b4b4b4]">Company Name</p>
 <p className="font-medium text-[#ececec]">{vendor.company_name}</p>
 </div>
 {vendor.domain && (
 <div>
 <p className="text-sm text-[#b4b4b4]">Website</p>
 <p className="font-medium text-[#ececec]">{vendor.domain}</p>
 </div>
 )}
 {vendor.phone && (
 <div>
 <p className="text-sm text-[#b4b4b4]">Phone</p>
 <p className="font-medium text-[#ececec]">{vendor.phone}</p>
 </div>
 )}
 </div>
 </div>
 )}

 {/* Stats */}
 <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
 <div className="bg-[#2f2f2f] rounded-2xl border border-[#2f2f2f] p-6">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm text-[#b4b4b4]">Total Products</p>
 <p className="text-3xl font-bold text-[#ececec]">{vendorProducts.length}</p>
 </div>
 <Package className="w-12 h-12 text-primary-600" />
 </div>
 </div>
 <div className="bg-[#2f2f2f] rounded-2xl border border-[#2f2f2f] p-6">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm text-[#b4b4b4]">In Stock</p>
 <p className="text-3xl font-bold text-[#ececec]">
 {vendorProducts.filter(p => p.stock_quantity > 0).length}
 </p>
 </div>
 <CheckCircle className="w-12 h-12 text-green-600" />
 </div>
 </div>
 <div className="bg-[#2f2f2f] rounded-2xl border border-[#2f2f2f] p-6">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm text-[#b4b4b4]">Out of Stock</p>
 <p className="text-3xl font-bold text-[#ececec]">
 {vendorProducts.filter(p => p.stock_quantity === 0).length}
 </p>
 </div>
 <AlertCircle className="w-12 h-12 text-red-600" />
 </div>
 </div>
 <div className="bg-[#2f2f2f] rounded-2xl border border-[#2f2f2f] p-6">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm text-[#b4b4b4]">AI Searchable</p>
 <p className="text-3xl font-bold text-[#ececec]">
 {vendorProducts.filter(p => p.is_active && p.stock_quantity > 0).length}
 </p>
 </div>
 <Sparkles className="w-12 h-12 text-primary-600" />
 </div>
 </div>
 </div>

 {/* Info Banner */}
 <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
 <div className="flex items-start space-x-3">
 <Info className="w-5 h-5 text-blue-600 mt-0.5" />
 <div>
 <p className="text-sm font-medium text-blue-900 mb-1">How ProcureX AI Uses Your Products</p>
 <p className="text-sm text-blue-700">
 When users ask ProcureX AI about products, it searches through your catalog. Make sure your products have:
 detailed descriptions, accurate specifications, and correct stock levels. Only products with stock &gt; 0 are shown to buyers.
 </p>
 </div>
 </div>
 </div>

 {/* Products List */}
 {loading ? (
 <div className="text-center py-12">
 <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
 <p className="mt-4 text-[#b4b4b4]">Loading products...</p>
 </div>
 ) : vendorProducts.length === 0 ? (
 <div className="bg-[#2f2f2f] rounded-2xl border border-[#2f2f2f] p-12 text-center">
 <Package className="w-16 h-16 text-[#8e8e8e] mx-auto mb-4" />
 <h3 className="text-xl font-semibold text-[#ececec] mb-2">No products yet</h3>
 <p className="text-[#b4b4b4] mb-2">Start by uploading your first product</p>
 <p className="text-sm text-[#8e8e8e] mb-6">Your products will be searchable by ProcureX AI once uploaded</p>
 <Button onClick={() => setShowAddProduct(true)}>
 <Plus className="w-5 h-5 mr-2" />
 Upload Your First Product
 </Button>
 </div>
 ) : (
 <div className="bg-[#2f2f2f] rounded-2xl border border-[#2f2f2f] overflow-hidden">
 <div className="overflow-x-auto">
 <table className="min-w-full divide-y divide-[#2f2f2f]">
 <thead className="bg-[#212121]">
 <tr>
 <th className="px-6 py-3 text-left text-xs font-medium text-[#8e8e8e] uppercase tracking-wider">Product</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-[#8e8e8e] uppercase tracking-wider">Category</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-[#8e8e8e] uppercase tracking-wider">Price</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-[#8e8e8e] uppercase tracking-wider">Stock</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-[#8e8e8e] uppercase tracking-wider">Status</th>
 <th className="px-6 py-3 text-left text-xs font-medium text-[#8e8e8e] uppercase tracking-wider">Actions</th>
 </tr>
 </thead>
 <tbody className="bg-[#2f2f2f] divide-y divide-[#2f2f2f]">
 {vendorProducts.map((vp) => (
 <tr key={vp.id} className="hover:bg-[#212121]">
 <td className="px-6 py-4 whitespace-nowrap">
 <div className="text-sm font-medium text-[#ececec]">{vp.product?.name || 'Unknown Product'}</div>
 <div className="text-sm text-[#8e8e8e]">SKU: {vp.product?.sku || 'N/A'}</div>
 </td>
 <td className="px-6 py-4 whitespace-nowrap">
 <Badge variant="info">{vp.product?.category || 'N/A'}</Badge>
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm text-[#ececec]">
 ${(vp.price / 100).toFixed(2)}
 </td>
 <td className="px-6 py-4 whitespace-nowrap">
 <input
 type="number"
 min="0"
 defaultValue={vp.stock_quantity}
 onBlur={(e) => handleUpdateStock(vp.id, parseInt(e.target.value) || 0)}
 className="w-24 px-3 py-2 border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
 />
 </td>
 <td className="px-6 py-4 whitespace-nowrap">
 <Badge variant={vp.stock_quantity > 0 ? 'success' : 'warning'}>
 {vp.stock_quantity > 0 ? 'In Stock' : 'Out of Stock'}
 </Badge>
 </td>
 <td className="px-6 py-4 whitespace-nowrap text-sm">
 <button
 onClick={() => handleDeleteProduct(vp.id)}
 className="text-red-600 hover:text-red-800"
 title="Remove product"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </td>
 </tr>
 ))}
 </tbody>
 </table>
 </div>
 </div>
 )}

 {/* Add Product Modal */}
 <Modal
 isOpen={showAddProduct}
 onClose={() => {
 setShowAddProduct(false)
 setCreateProductForm({
 name: '',
 sku: '',
 category: '',
 description: '',
 specifications: '',
 image_url: '',
 stock_quantity: 0,
 price: 0,
 })
 setCreateProductErrors({})
 setProductMode('create')
 }}
 title="Upload Product to ProcureX"
 size="lg"
 footer={
 <div className="flex justify-end space-x-2">
 <Button variant="outline" onClick={() => setShowAddProduct(false)}>
 Cancel
 </Button>
 <Button onClick={handleCreateProduct} isLoading={isCreatingProduct}>
 <Upload className="w-4 h-4 mr-2" />
 Upload Product
 </Button>
 </div>
 }
 >
 <div className="space-y-4">
 <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
 <p className="text-sm text-blue-800">
 <Sparkles className="w-4 h-4 inline mr-1" />
 This product will be searchable by ProcureX AI once uploaded. Make sure all information is accurate.
 </p>
 </div>
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">
 Product Name *
 </label>
 <input
 type="text"
 required
 value={createProductForm.name}
 onChange={(e) => {
 setCreateProductForm({ ...createProductForm, name: e.target.value })
 if (createProductErrors.name) {
 setCreateProductErrors({ ...createProductErrors, name: '' })
 }
 }}
 className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-[#ececec] ${
 createProductErrors.name ? 'border-red-500' : 'border-[#3d3d3d]'
 }`}
 placeholder="e.g., Dell XPS 13 Laptop"
 />
 {createProductErrors.name && (
 <p className="mt-1 text-sm text-red-500">{createProductErrors.name}</p>
 )}
 </div>
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">
 SKU (Stock Keeping Unit) *
 </label>
 <input
 type="text"
 required
 value={createProductForm.sku}
 onChange={(e) => {
 setCreateProductForm({ ...createProductForm, sku: e.target.value.toUpperCase() })
 if (createProductErrors.sku) {
 setCreateProductErrors({ ...createProductErrors, sku: '' })
 }
 }}
 className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-[#ececec] ${
 createProductErrors.sku ? 'border-red-500' : 'border-[#3d3d3d]'
 }`}
 placeholder="e.g., DELL-XPS13-2024"
 />
 {createProductErrors.sku && (
 <p className="mt-1 text-sm text-red-500">{createProductErrors.sku}</p>
 )}
 </div>
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">
 Category *
 </label>
 <select
 value={createProductForm.category}
 onChange={(e) => {
 setCreateProductForm({ ...createProductForm, category: e.target.value })
 if (createProductErrors.category) {
 setCreateProductErrors({ ...createProductErrors, category: '' })
 }
 }}
 className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-[#ececec] ${
 createProductErrors.category ? 'border-red-500' : 'border-[#3d3d3d]'
 }`}
 required
 >
 <option value="">Select a category</option>
 {categories.map(cat => (
 <option key={cat} value={cat}>{cat}</option>
 ))}
 </select>
 {createProductErrors.category && (
 <p className="mt-1 text-sm text-red-500">{createProductErrors.category}</p>
 )}
 </div>
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">
 Description
 </label>
 <textarea
 value={createProductForm.description}
 onChange={(e) => setCreateProductForm({ ...createProductForm, description: e.target.value })}
 rows={3}
 className="w-full px-4 py-2 border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none text-[#ececec]"
 placeholder="Detailed product description (helps AI find your product)..."
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">
 Specifications (JSON format)
 </label>
 <textarea
 value={createProductForm.specifications}
 onChange={(e) => setCreateProductForm({ ...createProductForm, specifications: e.target.value })}
 rows={3}
 className="w-full px-4 py-2 border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none text-[#ececec]"
 placeholder='{"ram": "16GB", "storage": "512GB", "processor": "Intel i7"}'
 />
 <p className="mt-1 text-sm text-[#8e8e8e]">Optional: Enter specifications as JSON object (helps AI match user requirements)</p>
 </div>
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">
 Image URL
 </label>
 <input
 type="text"
 value={createProductForm.image_url}
 onChange={(e) => setCreateProductForm({ ...createProductForm, image_url: e.target.value })}
 className="w-full px-4 py-2 border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-[#ececec]"
 placeholder="https://example.com/image.jpg"
 />
 </div>
 <div className="grid grid-cols-2 gap-4 pt-4 border-t border-[#2f2f2f]">
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">
 Stock Quantity *
 </label>
 <input
 type="number"
 min="0"
 required
 value={createProductForm.stock_quantity}
 onChange={(e) =>
 setCreateProductForm({ ...createProductForm, stock_quantity: parseInt(e.target.value) || 0 })
 }
 className="w-full px-4 py-2 border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-[#ececec]"
 />
 <p className="mt-1 text-xs text-[#8e8e8e]">Products with stock &gt; 0 are shown to buyers</p>
 </div>
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">
 Price (USD) *
 </label>
 <input
 type="number"
 min="0"
 step="0.01"
 required
 value={createProductForm.price}
 onChange={(e) => {
 setCreateProductForm({ ...createProductForm, price: parseFloat(e.target.value) || 0 })
 if (createProductErrors.price) {
 setCreateProductErrors({ ...createProductErrors, price: '' })
 }
 }}
 className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-[#ececec] ${
 createProductErrors.price ? 'border-red-500' : 'border-[#3d3d3d]'
 }`}
 />
 {createProductErrors.price ? (
 <p className="mt-1 text-sm text-red-500">{createProductErrors.price}</p>
 ) : (
 <p className="mt-1 text-sm text-[#8e8e8e]">${createProductForm.price.toFixed(2)}</p>
 )}
 </div>
 </div>
 </div>
 </Modal>
 </div>
 )
 }

 // Regular Product Browsing View (for non-vendors)
 return (
 <div className="space-y-6">
 <div className="flex items-center justify-between">
 <h1 className="text-3xl font-bold text-[#ececec]">Products</h1>
 <Button
 variant="outline"
 onClick={() => setShowFilters(!showFilters)}
 className="md:hidden"
 >
 <Filter className="w-4 h-4 mr-2" />
 Filters
 </Button>
 </div>

 {/* Search and Filters */}
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

 {/* Filters */}
 <div className={`${showFilters ? 'block' : 'hidden'} md:block`}>
 <div className="space-y-4 pt-4 border-t border-[#2f2f2f]">
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-2">
 Category
 </label>
 <div className="flex flex-wrap gap-2">
 <button
 type="button"
 onClick={() => setCategory('')}
 className={`px-3 py-1 rounded-full text-sm ${
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
 className={`px-3 py-1 rounded-full text-sm ${
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

 {/* Products Grid */}
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
