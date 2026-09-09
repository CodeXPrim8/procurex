'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { vendorsAPI, productAPI } from '@/lib/api'
import { useRequireAuth } from '@/lib/auth'
import { showToast } from '@/lib/toast'
import { runBackendDiagnostics } from '@/lib/backendTest'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import { 
 Package, Plus, Edit, Trash2, CheckCircle, AlertCircle, Building2, 
 Upload, Search, DollarSign, Box, TrendingUp, X, Image as ImageIcon,
 BarChart3, Settings, FileText, Eye, EyeOff, Save, Copy, MoreVertical,
 Grid3x3, List, Filter, Download, Share2, Info
} from 'lucide-react'
import Image from 'next/image'

type ProductFormMode = 'create' | 'search' | null
type ViewMode = 'grid' | 'list'

export default function VendorDashboard() {
 const { user } = useRequireAuth()
 const [vendor, setVendor] = useState<any>(null)
 const [products, setProducts] = useState<any[]>([])
 const [loading, setLoading] = useState(true)
 const [showProductModal, setShowProductModal] = useState(false)
 const [productFormMode, setProductFormMode] = useState<ProductFormMode>(null)
 const [editingProduct, setEditingProduct] = useState<any>(null)
 const [viewMode, setViewMode] = useState<ViewMode>('grid')
 const [searchFilter, setSearchFilter] = useState('')
 const [activeTab, setActiveTab] = useState<'products' | 'info' | 'analytics'>('products')
 
 // Product search state
 const [productSearch, setProductSearch] = useState('')
 const [searchResults, setSearchResults] = useState<any[]>([])
 const [searching, setSearching] = useState(false)
 
 // New product form state
 const [newProduct, setNewProduct] = useState({
 name: '',
 sku: '',
 category: '',
 description: '',
 specifications: {} as Record<string, any>,
 stock_quantity: 0,
 price: 0,
 image_url: '',
 })
 
 // Vendor registration state
 const [vendorFormData, setVendorFormData] = useState({
 companyName: '',
 businessRegistrationNumber: '',
 domain: '',
 phone: '',
 address: '',
 })
 const [vendorErrors, setVendorErrors] = useState<Record<string, string>>({})
 const [isRegistering, setIsRegistering] = useState(false)
 const [showRegisterForm, setShowRegisterForm] = useState(false)
 const [isEditingVendor, setIsEditingVendor] = useState(false)

 // Prevent multiple simultaneous loads
 const loadingRef = useRef(false)
 const fileInputRef = useRef<HTMLInputElement>(null)

 const checkPendingRegistration = useCallback(async () => {
 const pendingVendorData = localStorage.getItem('pending_vendor_registration')
 if (pendingVendorData) {
 try {
 const vendorData = JSON.parse(pendingVendorData)
 setVendorFormData({
 companyName: vendorData.company_name || '',
 businessRegistrationNumber: vendorData.business_registration_number || '',
 domain: vendorData.domain || '',
 phone: vendorData.phone || '',
 address: vendorData.address || '',
 })
 setShowRegisterForm(true)
 showToast('Complete your vendor registration below', 'info')
 } catch (error) {
 console.error('Error parsing pending vendor data:', error)
 localStorage.removeItem('pending_vendor_registration')
 }
 }
 }, [])

 const loadVendorData = useCallback(async () => {
 if (loadingRef.current) return
 
 loadingRef.current = true
 setLoading(true)
 
 try {
 const vendorData = await vendorsAPI.getMyVendor()
 setVendor(vendorData)
 localStorage.removeItem('pending_vendor_registration')
 
 const vendorProducts = await vendorsAPI.getMyProducts()
 setProducts(vendorProducts || [])
 } catch (error: any) {
 console.error('Error loading vendor data:', error)
 if (error.response?.status === 404) {
 setVendor(null)
 setProducts([])
 }
 } finally {
 setLoading(false)
 loadingRef.current = false
 }
 }, [])

 useEffect(() => {
 if (user) {
 loadVendorData()
 checkPendingRegistration()
 }
 }, [user, loadVendorData, checkPendingRegistration])

 const handleSearchProducts = async () => {
 if (!productSearch.trim()) {
 showToast('Please enter a search term', 'error')
 return
 }
 setSearching(true)
 try {
 const results = await productAPI.search(productSearch)
 setSearchResults(results)
 if (results.length === 0) {
 showToast('No products found. You can create a new product instead.', 'info')
 }
 } catch (error) {
 showToast('Failed to search products', 'error')
 } finally {
 setSearching(false)
 }
 }

 const handleCreateProduct = async () => {
 if (!newProduct.name.trim() || !newProduct.sku.trim() || !newProduct.category.trim()) {
 showToast('Please fill in all required fields (Name, SKU, Category)', 'error')
 return
 }
 
 if (newProduct.price <= 0) {
 showToast('Price must be greater than 0', 'error')
 return
 }

 try {
 await vendorsAPI.createProduct({
 product: {
 name: newProduct.name,
 sku: newProduct.sku,
 category: newProduct.category,
 description: newProduct.description || undefined,
 specifications: Object.keys(newProduct.specifications).length > 0 
 ? newProduct.specifications 
 : undefined,
 image_url: newProduct.image_url || undefined,
 },
 stock_quantity: newProduct.stock_quantity,
 price: Math.round(newProduct.price * 100),
 })
 
 showToast('Product created successfully!', 'success')
 resetProductForm()
 setShowProductModal(false)
 loadVendorData()
 } catch (error: any) {
 showToast(error.response?.data?.detail || 'Failed to create product', 'error')
 }
 }

 const handleAddExistingProduct = async (product: any) => {
 if (!product.id) {
 showToast('Invalid product selected', 'error')
 return
 }

 try {
 await vendorsAPI.addProduct({
 product_id: product.id,
 stock_quantity: newProduct.stock_quantity,
 price: Math.round(newProduct.price * 100),
 })
 
 showToast('Product added successfully', 'success')
 resetProductForm()
 setShowProductModal(false)
 loadVendorData()
 } catch (error: any) {
 showToast(error.response?.data?.detail || 'Failed to add product', 'error')
 }
 }

 const handleUpdateProduct = async () => {
 if (!editingProduct) return
 
 if (editingProduct.price <= 0) {
 showToast('Price must be greater than 0', 'error')
 return
 }

 try {
 await vendorsAPI.updateProduct(editingProduct.id, {
 product_id: editingProduct.product_id,
 stock_quantity: editingProduct.stock_quantity,
 price: Math.round(editingProduct.price * 100),
 })
 
 showToast('Product updated successfully', 'success')
 setEditingProduct(null)
 setShowProductModal(false)
 loadVendorData()
 } catch (error: any) {
 showToast(error.response?.data?.detail || 'Failed to update product', 'error')
 }
 }

 const handleDeleteProduct = async (vendorProductId: number) => {
 if (!confirm('Are you sure you want to remove this product from your catalog?')) {
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

 const handleUpdateStock = async (vendorProductId: number, stock: number) => {
 try {
 await vendorsAPI.updateStock(vendorProductId, stock)
 showToast('Stock updated successfully', 'success')
 loadVendorData()
 } catch (error: any) {
 showToast(error.response?.data?.detail || 'Failed to update stock', 'error')
 }
 }

 const handleUpdateVendor = async () => {
 const newErrors: Record<string, string> = {}
 
 if (!vendorFormData.companyName.trim()) {
 newErrors.companyName = 'Company name is required'
 }
 
 setVendorErrors(newErrors)
 if (Object.keys(newErrors).length > 0) return

 setIsRegistering(true)
 try {
 const vendorData = {
 company_name: vendorFormData.companyName.trim(),
 business_registration_number: vendorFormData.businessRegistrationNumber?.trim() || undefined,
 domain: vendorFormData.domain?.trim() || undefined,
 phone: vendorFormData.phone?.trim() || undefined,
 address: vendorFormData.address?.trim() || undefined,
 }

 if (vendor) {
 await vendorsAPI.updateVendor(vendorData)
 showToast('Vendor information updated successfully!', 'success')
 } else {
 await vendorsAPI.register(vendorData)
 showToast('Vendor account created successfully!', 'success')
 }
 localStorage.removeItem('pending_vendor_registration')
 setShowRegisterForm(false)
 setIsEditingVendor(false)
 loadVendorData()
 } catch (error: any) {
 console.error('Vendor registration/update error:', error)
 console.error('Error details:', {
 response: error.response?.data,
 status: error.response?.status,
 message: error.message,
 code: error.code,
 })
 
 // Extract detailed error message
 let errorMessage = 'Failed to save vendor information'
 
 if (error.response) {
 // Backend returned an error response
 const status = error.response.status
 const detail = error.response.data?.detail
 
 if (status === 400) {
 if (typeof detail === 'string') {
 errorMessage = detail
 } else if (Array.isArray(detail)) {
 // Validation errors from Pydantic
 errorMessage = detail.map((err: any) => {
 if (typeof err === 'string') return err
 const field = err.loc?.join('.') || 'field'
 return `${field}: ${err.msg || err.message || 'Invalid value'}`
 }).join('\n')
 } else if (detail) {
 errorMessage = JSON.stringify(detail)
 } else {
 errorMessage = 'Invalid request. Please check all required fields are filled correctly.'
 }
 } else if (status === 401) {
 errorMessage = 'Authentication failed. Please log out and log back in.'
 } else if (status === 403) {
 errorMessage = 'You do not have permission to perform this action.'
 } else if (status === 404) {
 errorMessage = 'Resource not found. Please refresh the page and try again.'
 } else if (status === 500) {
 errorMessage = 'Server error. Please try again later or contact support.'
 } else if (detail) {
 errorMessage = typeof detail === 'string' ? detail : JSON.stringify(detail)
 }
 } else if (error.request) {
 // Request was made but no response received - use interceptor message if available
 errorMessage = error.userMessage || 'Cannot connect to server. Please check if the backend is running at http://localhost:8000'
 
 // Run diagnostics if backend connection fails
 if (typeof window !== 'undefined' && !error.userMessage) {
 console.log('🔍 Running backend diagnostics...')
 runBackendDiagnostics().then(result => {
 if (result.overall === 'healthy') {
 console.warn('⚠️ Backend is healthy but request failed - likely CORS issue')
 console.warn('💡 Solution: Restart backend with .\\RESTART-BACKEND-NOW.ps1')
 }
 }).catch(console.error)
 }
 } else if (error.userMessage) {
 // Custom error message from interceptor
 errorMessage = error.userMessage
 } else if (error.code === 'ERR_NETWORK' || error.code === 'ECONNREFUSED') {
 // Network errors
 errorMessage = error.userMessage || 'Cannot connect to backend server. Please ensure the backend is running. Try running: .\\start-all.ps1'
 
 // Run diagnostics for network errors
 if (typeof window !== 'undefined') {
 console.log('🔍 Running backend diagnostics for network error...')
 runBackendDiagnostics().then(result => {
 console.log('📊 Diagnostic results:', result)
 }).catch(console.error)
 }
 } else {
 // Error setting up the request
 errorMessage = error.message || 'An unexpected error occurred. Please try again.'
 }
 
 showToast(errorMessage, 'error')
 } finally {
 setIsRegistering(false)
 }
 }

 const resetProductForm = () => {
 setNewProduct({
 name: '',
 sku: '',
 category: '',
 description: '',
 specifications: {},
 stock_quantity: 0,
 price: 0,
 image_url: '',
 })
 setProductSearch('')
 setSearchResults([])
 setProductFormMode(null)
 setEditingProduct(null)
 }

 const openCreateProductModal = () => {
 resetProductForm()
 setProductFormMode('create')
 setShowProductModal(true)
 }

 const openSearchProductModal = () => {
 resetProductForm()
 setProductFormMode('search')
 setShowProductModal(true)
 }

 const openEditProductModal = (vendorProduct: any) => {
 setEditingProduct({
 ...vendorProduct,
 price: vendorProduct.price / 100,
 })
 setProductFormMode(null)
 setShowProductModal(true)
 }

 // Calculate stats
 const totalProducts = products.length
 const inStockProducts = products.filter(p => p.stock_quantity > 0).length
 const outOfStockProducts = products.filter(p => p.stock_quantity === 0).length
 const totalValue = products.reduce((sum, p) => sum + (p.price * p.stock_quantity), 0) / 100
 const averagePrice = products.length > 0 
 ? products.reduce((sum, p) => sum + (p.price / 100), 0) / products.length 
 : 0

 // Filter products
 const filteredProducts = products.filter(p => {
 if (!searchFilter.trim()) return true
 const search = searchFilter.toLowerCase()
 return (
 p.product?.name?.toLowerCase().includes(search) ||
 p.product?.sku?.toLowerCase().includes(search) ||
 p.product?.category?.toLowerCase().includes(search)
 )
 })

 if (loading) {
 return (
 <div className="min-h-screen flex items-center justify-center bg-[#212121]">
 <div className="text-center">
 <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
 <p className="mt-4 text-[#b4b4b4]">Loading dashboard...</p>
 </div>
 </div>
 )
 }

 if (!vendor) {
 return (
 <div className="py-4">
 <div className="max-w-2xl mx-auto">
 <div className="bg-[#2f2f2f] rounded-2xl shadow-xl p-8">
 <div className="text-center mb-8">
 <div className="inline-flex items-center justify-center w-20 h-20 bg-[#171717] rounded-full mb-4">
 <Building2 className="w-10 h-10 text-primary-600" />
 </div>
 <h2 className="text-3xl font-bold text-[#ececec] mb-2">Become a Vendor</h2>
 <p className="text-[#b4b4b4]">Register your company to start selling products</p>
 </div>

 {!showRegisterForm ? (
 <div className="text-center">
 <Button onClick={() => setShowRegisterForm(true)} size="lg" className="px-8">
 <Building2 className="w-5 h-5 mr-2" />
 Register as Vendor
 </Button>
 </div>
 ) : (
 <div className="space-y-6">
 <Input
 label="Company Name *"
 name="companyName"
 type="text"
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
 name="businessRegistrationNumber"
 type="text"
 value={vendorFormData.businessRegistrationNumber}
 onChange={(e) => setVendorFormData({ ...vendorFormData, businessRegistrationNumber: e.target.value })}
 placeholder="Optional"
 />
 <Input
 label="Domain/Website"
 name="domain"
 type="text"
 value={vendorFormData.domain}
 onChange={(e) => setVendorFormData({ ...vendorFormData, domain: e.target.value })}
 placeholder="Optional: yourcompany.com"
 />
 <Input
 label="Phone Number"
 name="phone"
 type="tel"
 value={vendorFormData.phone}
 onChange={(e) => setVendorFormData({ ...vendorFormData, phone: e.target.value })}
 placeholder="Optional"
 />
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">
 Address
 </label>
 <textarea
 name="address"
 value={vendorFormData.address}
 onChange={(e) => setVendorFormData({ ...vendorFormData, address: e.target.value })}
 className="w-full px-4 py-2 border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
 rows={3}
 placeholder="Optional: Company address"
 />
 </div>
 <div className="flex space-x-3 pt-4">
 <Button
 variant="outline"
 onClick={() => {
 setShowRegisterForm(false)
 setVendorFormData({
 companyName: '',
 businessRegistrationNumber: '',
 domain: '',
 phone: '',
 address: '',
 })
 setVendorErrors({})
 }}
 >
 Cancel
 </Button>
 <Button onClick={handleUpdateVendor} isLoading={isRegistering} className="flex-1">
 Register Vendor Account
 </Button>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>
 )
 }

 const verificationColors: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
 verified: 'success',
 pending: 'warning',
 rejected: 'danger',
 }

 return (
 <div className="min-h-screen bg-[#212121]">
 {/* Header */}
 <div className="bg-[#2f2f2f] border-b border-[#2f2f2f]">
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
 <div className="flex items-center justify-between">
 <div>
 <h1 className="text-3xl font-bold text-[#ececec]">Vendor Dashboard</h1>
 <p className="text-[#b4b4b4] mt-1">Welcome back, {vendor.company_name}</p>
 </div>
 <div className="flex items-center space-x-3">
 <Badge variant={(verificationColors[vendor.verification_status] || 'default') as 'success' | 'warning' | 'danger' | 'default'} className="text-sm px-3 py-1">
 {vendor.verification_status === 'verified' && <CheckCircle className="w-4 h-4 mr-1 inline" />}
 {vendor.verification_status === 'pending' && <AlertCircle className="w-4 h-4 mr-1 inline" />}
 {vendor.verification_status || 'Not Verified'}
 </Badge>
 <Button onClick={openCreateProductModal} className="bg-primary-600 hover:bg-primary-700">
 <Plus className="w-5 h-5 mr-2" />
 Add Product
 </Button>
 </div>
 </div>
 </div>
 </div>

 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
 {/* Stats Cards */}
 <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
 <div className="bg-[#2f2f2f] rounded-xl p-6 border border-[#2f2f2f] hover:bg-[#353535] transition-shadow">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm font-medium text-[#b4b4b4] uppercase tracking-wide">Total Products</p>
 <p className="text-3xl font-bold text-[#ececec] mt-2">{totalProducts}</p>
 <p className="text-xs text-[#8e8e8e] mt-1">{inStockProducts} in stock</p>
 </div>
 <div className="p-3 bg-[#171717] rounded-lg">
 <Package className="w-8 h-8 text-primary-600" />
 </div>
 </div>
 </div>

 <div className="bg-[#2f2f2f] rounded-xl p-6 border border-[#2f2f2f] hover:bg-[#353535] transition-shadow">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm font-medium text-[#b4b4b4] uppercase tracking-wide">In Stock</p>
 <p className="text-3xl font-bold text-green-600 mt-2">{inStockProducts}</p>
 <p className="text-xs text-[#8e8e8e] mt-1">{outOfStockProducts} out of stock</p>
 </div>
 <div className="p-3 bg-green-100 rounded-lg">
 <CheckCircle className="w-8 h-8 text-green-600" />
 </div>
 </div>
 </div>

 <div className="bg-[#2f2f2f] rounded-xl p-6 border border-[#2f2f2f] hover:bg-[#353535] transition-shadow">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm font-medium text-[#b4b4b4] uppercase tracking-wide">Inventory Value</p>
 <p className="text-3xl font-bold text-blue-600 mt-2">${totalValue.toFixed(2)}</p>
 <p className="text-xs text-[#8e8e8e] mt-1">Total stock value</p>
 </div>
 <div className="p-3 bg-blue-100 rounded-lg">
 <DollarSign className="w-8 h-8 text-blue-600" />
 </div>
 </div>
 </div>

 <div className="bg-[#2f2f2f] rounded-xl p-6 border border-[#2f2f2f] hover:bg-[#353535] transition-shadow">
 <div className="flex items-center justify-between">
 <div>
 <p className="text-sm font-medium text-[#b4b4b4] uppercase tracking-wide">Avg. Price</p>
 <p className="text-3xl font-bold text-primary-600 mt-2">${averagePrice.toFixed(2)}</p>
 <p className="text-xs text-[#8e8e8e] mt-1">Per product</p>
 </div>
 <div className="p-3 bg-[#171717] rounded-lg">
 <TrendingUp className="w-8 h-8 text-primary-600" />
 </div>
 </div>
 </div>
 </div>

 {/* Tabs */}
 <div className="bg-[#2f2f2f] rounded-xl border border-[#2f2f2f] mb-6">
 <div className="border-b border-[#2f2f2f]">
 <nav className="flex -mb-px">
 <button
 onClick={() => setActiveTab('products')}
 className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
 activeTab === 'products'
 ? 'border-primary-600 text-primary-600'
 : 'border-transparent text-[#8e8e8e] hover:text-[#b4b4b4] hover:border-[#3d3d3d]'
 }`}
 >
 <Package className="w-4 h-4 inline mr-2" />
 Products ({totalProducts})
 </button>
 <button
 onClick={() => setActiveTab('info')}
 className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
 activeTab === 'info'
 ? 'border-primary-600 text-primary-600'
 : 'border-transparent text-[#8e8e8e] hover:text-[#b4b4b4] hover:border-[#3d3d3d]'
 }`}
 >
 <Building2 className="w-4 h-4 inline mr-2" />
 Company Info
 </button>
 <button
 onClick={() => setActiveTab('analytics')}
 className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
 activeTab === 'analytics'
 ? 'border-primary-600 text-primary-600'
 : 'border-transparent text-[#8e8e8e] hover:text-[#b4b4b4] hover:border-[#3d3d3d]'
 }`}
 >
 <BarChart3 className="w-4 h-4 inline mr-2" />
 Analytics
 </button>
 </nav>
 </div>

 <div className="p-6">
 {/* Products Tab */}
 {activeTab === 'products' && (
 <div className="space-y-6">
 {/* Search and Filters */}
 <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
 <div className="flex-1 max-w-md">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-[#8e8e8e]" />
 <Input
 placeholder="Search products by name, SKU, or category..."
 value={searchFilter}
 onChange={(e) => setSearchFilter(e.target.value)}
 className="pl-10"
 />
 </div>
 </div>
 <div className="flex items-center space-x-2">
 <Button
 variant="outline"
 size="sm"
 onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
 className="px-3"
 >
 {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid3x3 className="w-4 h-4" />}
 </Button>
 <Button variant="outline" size="sm" onClick={openSearchProductModal}>
 <Search className="w-4 h-4 mr-2" />
 Add Existing
 </Button>
 <Button size="sm" onClick={openCreateProductModal}>
 <Plus className="w-4 h-4 mr-2" />
 New Product
 </Button>
 </div>
 </div>

 {/* Products Grid/List */}
 {filteredProducts.length === 0 ? (
 <div className="text-center py-16 bg-[#212121] rounded-lg border-2 border-dashed border-[#3d3d3d]">
 {products.length === 0 ? (
 <>
 <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
 <h3 className="text-lg font-semibold text-[#ececec] mb-2">No products yet</h3>
 <p className="text-[#b4b4b4] mb-6">Start by adding your first product to the catalog</p>
 <div className="flex justify-center space-x-3">
 <Button variant="outline" onClick={openSearchProductModal}>
 <Search className="w-4 h-4 mr-2" />
 Add Existing Product
 </Button>
 <Button onClick={openCreateProductModal}>
 <Plus className="w-4 h-4 mr-2" />
 Create New Product
 </Button>
 </div>
 </>
 ) : (
 <>
 <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
 <h3 className="text-lg font-semibold text-[#ececec] mb-2">No products found</h3>
 <p className="text-[#b4b4b4] mb-6">Try adjusting your search filters</p>
 <Button variant="outline" onClick={() => setSearchFilter('')}>
 Clear Filters
 </Button>
 </>
 )}
 </div>
 ) : viewMode === 'grid' ? (
 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
 {filteredProducts.map((vp) => (
 <div key={vp.id} className="bg-[#2f2f2f] rounded-xl border border-[#2f2f2f] hover:shadow-lg transition-all overflow-hidden group">
 {/* Product Image */}
 <div className="relative h-48 bg-[#2f2f2f] overflow-hidden">
 {vp.product?.image_url ? (
 <Image
 src={vp.product.image_url}
 alt={vp.product.name}
 fill
 className="object-cover"
 />
 ) : (
 <div className="flex items-center justify-center h-full">
 <ImageIcon className="w-16 h-16 text-gray-400" />
 </div>
 )}
 <div className="absolute top-3 right-3 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
 <button
 onClick={() => openEditProductModal(vp)}
 className="p-2 bg-[#2f2f2f] rounded-lg hover:bg-[#171717] text-[#b4b4b4] hover:text-primary-600 transition-colors"
 title="Edit product"
 >
 <Edit className="w-4 h-4" />
 </button>
 <button
 onClick={() => handleDeleteProduct(vp.id)}
 className="p-2 bg-[#2f2f2f] rounded-lg hover:bg-red-900/30 text-[#b4b4b4] hover:text-red-600 transition-colors"
 title="Delete product"
 >
 <Trash2 className="w-4 h-4" />
 </button>
 </div>
 {vp.stock_quantity === 0 && (
 <div className="absolute top-3 left-3">
 <Badge variant="warning">Out of Stock</Badge>
 </div>
 )}
 </div>

 {/* Product Info */}
 <div className="p-5">
 <div className="mb-3">
 <h3 className="font-semibold text-[#ececec] text-lg mb-1 line-clamp-1">
 {vp.product?.name || 'Unknown Product'}
 </h3>
 <p className="text-sm text-[#8e8e8e]">SKU: {vp.product?.sku || 'N/A'}</p>
 </div>

 {vp.product?.category && (
 <Badge variant="default" className="mb-3">
 {vp.product.category}
 </Badge>
 )}

 {vp.product?.description && (
 <p className="text-sm text-[#b4b4b4] mb-4 line-clamp-2">
 {vp.product.description}
 </p>
 )}

 <div className="flex items-center justify-between pt-4 border-t border-[#2f2f2f]">
 <div>
 <p className="text-xs text-[#8e8e8e] mb-1">Price</p>
 <p className="text-2xl font-bold text-[#ececec]">
 ${(vp.price / 100).toFixed(2)}
 </p>
 </div>
 <div>
 <p className="text-xs text-[#8e8e8e] mb-1">Stock</p>
 <input
 type="number"
 min="0"
 defaultValue={vp.stock_quantity}
 onBlur={(e) => handleUpdateStock(vp.id, parseInt(e.target.value) || 0)}
 className="w-20 px-2 py-1 text-center border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-medium"
 />
 </div>
 </div>
 </div>
 </div>
 ))}
 </div>
 ) : (
 <div className="space-y-4">
 {filteredProducts.map((vp) => (
 <div key={vp.id} className="bg-[#2f2f2f] rounded-lg border border-[#2f2f2f] p-6 hover:bg-[#353535] transition-shadow">
 <div className="flex items-start gap-6">
 {/* Product Image */}
 <div className="relative w-24 h-24 bg-[#2f2f2f] rounded-lg overflow-hidden flex-shrink-0">
 {vp.product?.image_url ? (
 <Image
 src={vp.product.image_url}
 alt={vp.product.name}
 fill
 className="object-cover"
 />
 ) : (
 <div className="flex items-center justify-center h-full">
 <ImageIcon className="w-8 h-8 text-gray-400" />
 </div>
 )}
 </div>

 {/* Product Details */}
 <div className="flex-1 min-w-0">
 <div className="flex items-start justify-between mb-2">
 <div className="flex-1 min-w-0">
 <h3 className="font-semibold text-[#ececec] text-lg mb-1">
 {vp.product?.name || 'Unknown Product'}
 </h3>
 <div className="flex items-center gap-4 text-sm text-[#b4b4b4] mb-2">
 <span>SKU: {vp.product?.sku || 'N/A'}</span>
 {vp.product?.category && (
 <>
 <span>•</span>
 <Badge variant="default">{vp.product.category}</Badge>
 </>
 )}
 </div>
 {vp.product?.description && (
 <p className="text-sm text-[#b4b4b4] line-clamp-2 mb-3">
 {vp.product.description}
 </p>
 )}
 </div>
 <div className="flex items-center space-x-2 ml-4">
 <button
 onClick={() => openEditProductModal(vp)}
 className="p-2 text-[#b4b4b4] hover:text-primary-600 hover:bg-[#171717] rounded-lg transition-colors"
 title="Edit product"
 >
 <Edit className="w-5 h-5" />
 </button>
 <button
 onClick={() => handleDeleteProduct(vp.id)}
 className="p-2 text-[#b4b4b4] hover:text-red-600 hover:bg-red-900/30 rounded-lg transition-colors"
 title="Delete product"
 >
 <Trash2 className="w-5 h-5" />
 </button>
 </div>
 </div>

 <div className="flex items-center justify-between pt-4 border-t border-[#2f2f2f]">
 <div className="flex items-center gap-6">
 <div>
 <p className="text-xs text-[#8e8e8e] mb-1">Price</p>
 <p className="text-xl font-bold text-[#ececec]">
 ${(vp.price / 100).toFixed(2)}
 </p>
 </div>
 <div>
 <p className="text-xs text-[#8e8e8e] mb-1">Stock Quantity</p>
 <input
 type="number"
 min="0"
 defaultValue={vp.stock_quantity}
 onBlur={(e) => handleUpdateStock(vp.id, parseInt(e.target.value) || 0)}
 className="w-24 px-3 py-2 border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
 />
 </div>
 <Badge variant={vp.stock_quantity > 0 ? 'success' : 'warning'}>
 {vp.stock_quantity > 0 ? 'In Stock' : 'Out of Stock'}
 </Badge>
 </div>
 </div>
 </div>
 </div>
 </div>
 ))}
 </div>
 )}
 </div>
 )}

 {/* Company Info Tab */}
 {activeTab === 'info' && (
 <div className="space-y-6">
 <div className="flex items-center justify-between mb-6">
 <h2 className="text-2xl font-bold text-[#ececec]">Company Information</h2>
 <Button
 variant="outline"
 onClick={() => {
 setIsEditingVendor(!isEditingVendor)
 if (!isEditingVendor) {
 setVendorFormData({
 companyName: vendor.company_name || '',
 businessRegistrationNumber: vendor.business_registration_number || '',
 domain: vendor.domain || '',
 phone: vendor.phone || '',
 address: vendor.address || '',
 })
 }
 }}
 >
 {isEditingVendor ? (
 <>
 <X className="w-4 h-4 mr-2" />
 Cancel
 </>
 ) : (
 <>
 <Edit className="w-4 h-4 mr-2" />
 Edit Information
 </>
 )}
 </Button>
 </div>

 {isEditingVendor ? (
 <div className="space-y-6 bg-[#212121] p-6 rounded-lg">
 <Input
 label="Company Name *"
 name="companyName"
 type="text"
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
 name="businessRegistrationNumber"
 type="text"
 value={vendorFormData.businessRegistrationNumber}
 onChange={(e) => setVendorFormData({ ...vendorFormData, businessRegistrationNumber: e.target.value })}
 />
 <Input
 label="Domain/Website"
 name="domain"
 type="text"
 value={vendorFormData.domain}
 onChange={(e) => setVendorFormData({ ...vendorFormData, domain: e.target.value })}
 placeholder="yourcompany.com"
 />
 <Input
 label="Phone Number"
 name="phone"
 type="tel"
 value={vendorFormData.phone}
 onChange={(e) => setVendorFormData({ ...vendorFormData, phone: e.target.value })}
 />
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">
 Address
 </label>
 <textarea
 name="address"
 value={vendorFormData.address}
 onChange={(e) => setVendorFormData({ ...vendorFormData, address: e.target.value })}
 className="w-full px-4 py-2 border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
 rows={4}
 placeholder="Company address"
 />
 </div>
 <div className="flex justify-end space-x-3 pt-4">
 <Button variant="outline" onClick={() => setIsEditingVendor(false)}>
 Cancel
 </Button>
 <Button onClick={handleUpdateVendor} isLoading={isRegistering}>
 <Save className="w-4 h-4 mr-2" />
 Save Changes
 </Button>
 </div>
 </div>
 ) : (
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div className="bg-[#212121] rounded-lg p-6">
 <p className="text-sm font-medium text-[#8e8e8e] mb-2">Company Name</p>
 <p className="text-lg font-semibold text-[#ececec]">{vendor.company_name}</p>
 </div>
 <div className="bg-[#212121] rounded-lg p-6">
 <p className="text-sm font-medium text-[#8e8e8e] mb-2">Verification Status</p>
 <Badge variant={(verificationColors[vendor.verification_status] || 'default') as 'success' | 'warning' | 'danger' | 'default'} className="text-sm">
 {vendor.verification_status === 'verified' && <CheckCircle className="w-4 h-4 mr-1 inline" />}
 {vendor.verification_status === 'pending' && <AlertCircle className="w-4 h-4 mr-1 inline" />}
 {vendor.verification_status || 'Not Verified'}
 </Badge>
 </div>
 {vendor.domain && (
 <div className="bg-[#212121] rounded-lg p-6">
 <p className="text-sm font-medium text-[#8e8e8e] mb-2">Website</p>
 <a href={vendor.domain.startsWith('http') ? vendor.domain : `https://${vendor.domain}`} target="_blank" rel="noopener noreferrer" className="text-lg font-semibold text-primary-600 hover:text-[#19C37D]">
 {vendor.domain}
 </a>
 </div>
 )}
 {vendor.phone && (
 <div className="bg-[#212121] rounded-lg p-6">
 <p className="text-sm font-medium text-[#8e8e8e] mb-2">Phone</p>
 <p className="text-lg font-semibold text-[#ececec]">{vendor.phone}</p>
 </div>
 )}
 {vendor.business_registration_number && (
 <div className="bg-[#212121] rounded-lg p-6">
 <p className="text-sm font-medium text-[#8e8e8e] mb-2">Registration Number</p>
 <p className="text-lg font-semibold text-[#ececec]">{vendor.business_registration_number}</p>
 </div>
 )}
 {vendor.address && (
 <div className="bg-[#212121] rounded-lg p-6 md:col-span-2">
 <p className="text-sm font-medium text-[#8e8e8e] mb-2">Address</p>
 <p className="text-lg font-semibold text-[#ececec]">{vendor.address}</p>
 </div>
 )}
 </div>
 )}
 </div>
 )}

 {/* Analytics Tab */}
 {activeTab === 'analytics' && (
 <div className="space-y-6">
 <h2 className="text-2xl font-bold text-[#ececec] mb-6">Analytics & Insights</h2>
 
 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
 <div className="bg-[#171717] rounded-xl p-6 border border-primary-200">
 <div className="flex items-center justify-between mb-4">
 <h3 className="text-lg font-semibold text-[#ececec]">Product Distribution</h3>
 <BarChart3 className="w-6 h-6 text-primary-600" />
 </div>
 <div className="space-y-3">
 <div>
 <div className="flex justify-between text-sm mb-1">
 <span className="text-[#b4b4b4]">In Stock</span>
 <span className="font-semibold">{inStockProducts} ({totalProducts > 0 ? Math.round((inStockProducts / totalProducts) * 100) : 0}%)</span>
 </div>
 <div className="w-full bg-[#3d3d3d] rounded-full h-2">
 <div 
 className="bg-green-600 h-2 rounded-full transition-all"
 style={{ width: `${totalProducts > 0 ? (inStockProducts / totalProducts) * 100 : 0}%` }}
 ></div>
 </div>
 </div>
 <div>
 <div className="flex justify-between text-sm mb-1">
 <span className="text-[#b4b4b4]">Out of Stock</span>
 <span className="font-semibold">{outOfStockProducts} ({totalProducts > 0 ? Math.round((outOfStockProducts / totalProducts) * 100) : 0}%)</span>
 </div>
 <div className="w-full bg-[#3d3d3d] rounded-full h-2">
 <div 
 className="bg-yellow-600 h-2 rounded-full transition-all"
 style={{ width: `${totalProducts > 0 ? (outOfStockProducts / totalProducts) * 100 : 0}%` }}
 ></div>
 </div>
 </div>
 </div>
 </div>

 <div className="bg-sky-50 rounded-2xl p-6 border border-sky-200">
 <div className="flex items-center justify-between mb-4">
 <h3 className="text-lg font-semibold text-[#ececec]">Price Range</h3>
 <DollarSign className="w-6 h-6 text-blue-600" />
 </div>
 {products.length > 0 ? (
 <div className="space-y-2">
 <div className="flex justify-between">
 <span className="text-sm text-[#b4b4b4]">Lowest</span>
 <span className="font-semibold text-[#ececec]">
 ${(Math.min(...products.map(p => p.price / 100))).toFixed(2)}
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-sm text-[#b4b4b4]">Average</span>
 <span className="font-semibold text-[#ececec]">
 ${averagePrice.toFixed(2)}
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-sm text-[#b4b4b4]">Highest</span>
 <span className="font-semibold text-[#ececec]">
 ${(Math.max(...products.map(p => p.price / 100))).toFixed(2)}
 </span>
 </div>
 </div>
 ) : (
 <p className="text-[#b4b4b4]">No products to analyze</p>
 )}
 </div>
 </div>

 <div className="bg-[#2f2f2f] rounded-xl border border-[#2f2f2f] p-6">
 <h3 className="text-lg font-semibold text-[#ececec] mb-4">Quick Actions</h3>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <Button variant="outline" className="justify-start h-auto py-4">
 <Download className="w-5 h-5 mr-3" />
 <div className="text-left">
 <div className="font-semibold">Export Products</div>
 <div className="text-xs text-[#8e8e8e]">Download CSV</div>
 </div>
 </Button>
 <Button variant="outline" className="justify-start h-auto py-4">
 <Share2 className="w-5 h-5 mr-3" />
 <div className="text-left">
 <div className="font-semibold">Share Catalog</div>
 <div className="text-xs text-[#8e8e8e]">Generate link</div>
 </div>
 </Button>
 <Button variant="outline" className="justify-start h-auto py-4">
 <FileText className="w-5 h-5 mr-3" />
 <div className="text-left">
 <div className="font-semibold">View Reports</div>
 <div className="text-xs text-[#8e8e8e]">Analytics</div>
 </div>
 </Button>
 </div>
 </div>
 </div>
 )}
 </div>
 </div>
 </div>

 {/* Product Modal */}
 <Modal
 isOpen={showProductModal}
 onClose={() => {
 setShowProductModal(false)
 resetProductForm()
 }}
 title={
 editingProduct 
 ? 'Edit Product' 
 : productFormMode === 'create' 
 ? 'Create New Product' 
 : 'Add Existing Product'
 }
 size="lg"
 footer={
 <div className="flex justify-end space-x-2">
 <Button variant="outline" onClick={() => {
 setShowProductModal(false)
 resetProductForm()
 }}>
 Cancel
 </Button>
 {editingProduct ? (
 <Button onClick={handleUpdateProduct}>
 <Save className="w-4 h-4 mr-2" />
 Save Changes
 </Button>
 ) : productFormMode === 'create' ? (
 <Button onClick={handleCreateProduct}>
 <Plus className="w-4 h-4 mr-2" />
 Create Product
 </Button>
 ) : null}
 </div>
 }
 >
 {editingProduct ? (
 <div className="space-y-6">
 <div className="bg-[#171717] p-4 rounded-lg border border-primary-200">
 <p className="text-sm font-medium text-primary-900 mb-1">Product Information</p>
 <p className="text-lg font-semibold text-[#ececec]">{editingProduct.product?.name}</p>
 <p className="text-sm text-[#b4b4b4]">SKU: {editingProduct.product?.sku}</p>
 </div>
 <div className="grid grid-cols-2 gap-4">
 <Input
 label="Stock Quantity"
 type="number"
 min="0"
 value={editingProduct.stock_quantity}
 onChange={(e) =>
 setEditingProduct({ ...editingProduct, stock_quantity: parseInt(e.target.value) || 0 })
 }
 />
 <Input
 label="Price (USD)"
 type="number"
 min="0"
 step="0.01"
 value={editingProduct.price}
 onChange={(e) =>
 setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })
 }
 helperText={`Current: $${editingProduct.price.toFixed(2)}`}
 />
 </div>
 </div>
 ) : productFormMode === 'create' ? (
 <div className="space-y-6">
 <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
 <div className="flex items-start">
 <Info className="w-5 h-5 text-blue-600 mr-2 mt-0.5" />
 <div className="text-sm text-blue-800">
 <p className="font-semibold mb-1">Create a new product</p>
 <p>Fill in the details below to add a new product to your catalog. Make sure all required fields are completed.</p>
 </div>
 </div>
 </div>

 <Input
 label="Product Name *"
 type="text"
 required
 value={newProduct.name}
 onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
 placeholder="e.g., Dell XPS 15 Laptop"
 />
 <div className="grid grid-cols-2 gap-4">
 <Input
 label="SKU *"
 type="text"
 required
 value={newProduct.sku}
 onChange={(e) => setNewProduct({ ...newProduct, sku: e.target.value.toUpperCase() })}
 placeholder="e.g., DELL-XPS15-001"
 helperText="Unique product identifier"
 />
 <Input
 label="Category *"
 type="text"
 required
 value={newProduct.category}
 onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
 placeholder="e.g., Laptops"
 />
 </div>
 <Input
 label="Description"
 type="textarea"
 className="min-h-[100px]"
 value={newProduct.description}
 onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
 placeholder="Detailed product description..."
 />
 <div className="grid grid-cols-2 gap-4">
 <Input
 label="Stock Quantity"
 type="number"
 min="0"
 value={newProduct.stock_quantity}
 onChange={(e) =>
 setNewProduct({ ...newProduct, stock_quantity: parseInt(e.target.value) || 0 })
 }
 />
 <Input
 label="Price (USD) *"
 type="number"
 min="0"
 step="0.01"
 required
 value={newProduct.price}
 onChange={(e) =>
 setNewProduct({ ...newProduct, price: parseFloat(e.target.value) || 0 })
 }
 helperText={newProduct.price > 0 ? `$${newProduct.price.toFixed(2)}` : ''}
 />
 </div>
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-2">
 Product Image URL (Optional)
 </label>
 <div className="flex items-center space-x-2">
 <Input
 type="url"
 value={newProduct.image_url}
 onChange={(e) => setNewProduct({ ...newProduct, image_url: e.target.value })}
 placeholder="https://example.com/image.jpg"
 />
 {newProduct.image_url && (
 <div className="relative w-16 h-16 rounded-lg overflow-hidden border border-[#3d3d3d]">
 <Image
 src={newProduct.image_url}
 alt="Preview"
 fill
 className="object-cover"
 onError={() => {
 showToast('Invalid image URL', 'error')
 setNewProduct({ ...newProduct, image_url: '' })
 }}
 />
 </div>
 )}
 </div>
 </div>
 </div>
 ) : (
 <div className="space-y-6">
 <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
 <div className="flex items-start">
 <Info className="w-5 h-5 text-blue-600 mr-2 mt-0.5" />
 <div className="text-sm text-blue-800">
 <p className="font-semibold mb-1">Add existing product</p>
 <p>Search for a product that already exists in the system and add it to your catalog with your own pricing and stock.</p>
 </div>
 </div>
 </div>

 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-2">
 Search for Existing Product
 </label>
 <div className="flex space-x-2">
 <Input
 placeholder="Search by name or SKU..."
 value={productSearch}
 onChange={(e) => setProductSearch(e.target.value)}
 onKeyPress={(e) => {
 if (e.key === 'Enter') {
 e.preventDefault()
 handleSearchProducts()
 }
 }}
 />
 <Button onClick={handleSearchProducts} isLoading={searching}>
 <Search className="w-4 h-4 mr-2" />
 Search
 </Button>
 </div>
 </div>

 {searchResults.length > 0 && (
 <div className="max-h-64 overflow-y-auto space-y-2 border border-[#2f2f2f] rounded-lg p-3 bg-[#212121]">
 {searchResults.map((product) => (
 <div
 key={product.id}
 onClick={() => {
 setNewProduct({
 ...newProduct,
 stock_quantity: 0,
 price: product.price ? product.price / 100 : 0,
 })
 setProductSearch(product.name)
 }}
 className={`p-3 border rounded-lg cursor-pointer transition-colors ${
 newProduct.name === product.name
 ? 'border-primary-600 bg-[#171717]'
 : 'border-[#2f2f2f] hover:bg-[#2f2f2f] hover:border-primary-300'
 }`}
 >
 <p className="font-medium text-[#ececec]">{product.name}</p>
 <p className="text-sm text-[#b4b4b4]">{product.category} • SKU: {product.sku}</p>
 {product.price && (
 <p className="text-sm font-medium text-primary-600 mt-1">
 ${(product.price / 100).toFixed(2)}
 </p>
 )}
 </div>
 ))}
 </div>
 )}

 {searchResults.length > 0 && (
 <div className="space-y-4 pt-4 border-t border-[#2f2f2f]">
 <div className="grid grid-cols-2 gap-4">
 <Input
 label="Stock Quantity"
 type="number"
 min="0"
 value={newProduct.stock_quantity}
 onChange={(e) =>
 setNewProduct({ ...newProduct, stock_quantity: parseInt(e.target.value) || 0 })
 }
 />
 <Input
 label="Your Price (USD) *"
 type="number"
 min="0"
 step="0.01"
 required
 value={newProduct.price}
 onChange={(e) =>
 setNewProduct({ ...newProduct, price: parseFloat(e.target.value) || 0 })
 }
 helperText={newProduct.price > 0 ? `$${newProduct.price.toFixed(2)}` : ''}
 />
 </div>
 <Button 
 onClick={() => {
 const selectedProduct = searchResults.find(p => p.name === productSearch)
 if (selectedProduct) {
 handleAddExistingProduct(selectedProduct)
 } else {
 showToast('Please select a product from the search results', 'error')
 }
 }}
 className="w-full"
 >
 <Plus className="w-4 h-4 mr-2" />
 Add Product to Catalog
 </Button>
 </div>
 )}

 {searchResults.length === 0 && productSearch && !searching && (
 <div className="text-center py-8 border border-[#2f2f2f] rounded-lg bg-[#212121]">
 <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
 <p className="text-[#b4b4b4] mb-4">No products found matching "{productSearch}"</p>
 <Button variant="outline" onClick={() => {
 setProductFormMode('create')
 setProductSearch('')
 setSearchResults([])
 }}>
 <Plus className="w-4 h-4 mr-2" />
 Create New Product Instead
 </Button>
 </div>
 )}
 </div>
 )}
 </Modal>
 </div>
 )
}
