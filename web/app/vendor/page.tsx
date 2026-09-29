'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { vendorsAPI, productAPI, apiErrorMessage } from '@/lib/api'
import { persistVendorProfile, useRequireAuth, isSuperAdmin } from '@/lib/auth'
import { getAccessToken, ensureFreshSession } from '@/lib/sessionToken'
import { useStore } from '@/lib/store'
import { showToast } from '@/lib/toast'
import { runBackendDiagnostics } from '@/lib/backendTest'
import { PRODUCT_CATEGORIES, GOODS_CATEGORIES, specFieldsFor, isDigitalCategory, generateProductSku, listingKind, allowsContactForPrice, isContactPriced, type PriceMode } from '@/lib/productCategories'
import PricingModeToggle from '@/components/PricingModeToggle'
import DeliveryModeToggle, { availabilityLabel, type DeliveryMode } from '@/components/DeliveryModeToggle'
import { resolveMediaUrl, productImageList, MAX_PRODUCT_IMAGES } from '@/lib/media'
import { VENDOR_ID_TYPES, validateVendorOnboarding, vendorCanList, vendorStatus } from '@/lib/vendorOnboarding'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Badge from '@/components/ui/Badge'
import Modal from '@/components/ui/Modal'
import PriceText from '@/components/PriceText'
import ProcureXLoader from '@/components/ProcureXLoader'
import SuperadminConsole from '@/components/SuperadminConsole'
import BisonBookShell from '@/components/bisonbook/BisonBookShell'
import { getCurrencyCode } from '@/lib/currency'
import { 
 Package, Plus, Edit, Trash2, CheckCircle, AlertCircle, Building2, 
 Upload, Search, DollarSign, Box, TrendingUp, X, Image as ImageIcon,
 BarChart3, Settings, FileText, Eye, EyeOff, Save, Copy, MoreVertical,
 Grid3x3, List, Filter, Download, Share2, Info, Sparkles, ShieldCheck, ShieldX, BookOpen
} from 'lucide-react'

type ProductFormMode = 'create' | 'search' | null
type ViewMode = 'grid' | 'list'

type ProductAssist = {
 kind: 'goods' | 'software' | 'service'
 kind_label: string
 suggested_category: string | null
 category_mismatch: boolean
 description: string
 note: string
 image_rule: string
}

const STOCK_INPUT_CLASS =
 'bg-[#171717] text-[#ececec] placeholder-[#8e8e8e] border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-medium'

function csvCell(value: string | number) {
 const text = String(value ?? '')
 if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
 return text
}

function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
 const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
 const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
 const url = URL.createObjectURL(blob)
 const link = document.createElement('a')
 link.href = url
 link.download = filename
 document.body.appendChild(link)
 link.click()
 link.remove()
 URL.revokeObjectURL(url)
}

function ContactPriceNote() {
 return (
  <div className="rounded-lg border border-[#3d3d3d] bg-[#171717] px-3 py-2 text-sm text-[#b4b4b4]">
   <p className="font-medium text-[#ececec]">Contact for price</p>
   <p className="text-xs mt-0.5">Buyers call or message you for a quote. Keep your phone number up to date.</p>
  </div>
 )
}

function effectivePriceMode(category: string, mode?: string | null): PriceMode {
 return allowsContactForPrice(category) && mode === 'contact' ? 'contact' : 'fixed'
}

async function copyToClipboard(text: string) {
 const fallbackCopy = () => {
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.left = '-9999px'
  document.body.appendChild(field)
  field.select()
  const copied = document.execCommand('copy')
  field.remove()
  return copied
 }
 try {
  if (!navigator.clipboard?.writeText) return fallbackCopy()
  await Promise.race([
   navigator.clipboard.writeText(text),
   new Promise((_, reject) => setTimeout(() => reject(new Error('clipboard timeout')), 800)),
  ])
  return true
 } catch {
  return fallbackCopy()
 }
}

export default function VendorDashboard() {
 const { user } = useRequireAuth()
 const { setUser, setAccountView } = useStore()
 const router = useRouter()
 const [vendor, setVendor] = useState<any>(null)
 const [platformMode, setPlatformMode] = useState(false)
 const [products, setProducts] = useState<any[]>([])
 const [loading, setLoading] = useState(true)
 const [showProductModal, setShowProductModal] = useState(false)
 const [productFormMode, setProductFormMode] = useState<ProductFormMode>(null)
 const [editingProduct, setEditingProduct] = useState<any>(null)
 const [viewMode, setViewMode] = useState<ViewMode>('grid')
 const [searchFilter, setSearchFilter] = useState('')
 const [activeTab, setActiveTab] = useState<'products' | 'info' | 'analytics' | 'bisonbook'>('products')

 useEffect(() => {
 const tab = new URLSearchParams(window.location.search).get('tab')
 if (tab === 'bisonbook' || tab === 'info' || tab === 'analytics') setActiveTab(tab)
 }, [])
 const [currencyCode, setCurrencyCode] = useState('NGN')
 
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
 price_mode: 'fixed' as PriceMode,
 delivery_mode: '' as DeliveryMode | '',
 image_url: '',
 })
 const [isCreatingProduct, setIsCreatingProduct] = useState(false)
 const [productImageFiles, setProductImageFiles] = useState<File[]>([])
 const [productImagePreviews, setProductImagePreviews] = useState<string[]>([])
 const [productAssist, setProductAssist] = useState<ProductAssist | null>(null)
 const [assistLoading, setAssistLoading] = useState(false)
 const [descriptionTouched, setDescriptionTouched] = useState(false)
 
 // Vendor registration state
 const [vendorFormData, setVendorFormData] = useState({
 companyName: '',
 businessRegistrationNumber: '',
 domain: '',
 phone: '',
 address: '',
 personalName: '',
 idType: 'National ID (NIN)',
 idNumber: '',
 termsAccepted: false,
 })
 const [vendorErrors, setVendorErrors] = useState<Record<string, string>>({})
 const [isRegistering, setIsRegistering] = useState(false)
 const [showRegisterForm, setShowRegisterForm] = useState(false)
 const [isEditingVendor, setIsEditingVendor] = useState(false)
 const [uploadingDoc, setUploadingDoc] = useState('')
 const [submittingReview, setSubmittingReview] = useState(false)

 // Prevent multiple simultaneous loads
 const loadingRef = useRef(false)
 const vendorRef = useRef<any>(null)
 const userRef = useRef(user)
 const profileSyncedRef = useRef(false)
 const fileInputRef = useRef<HTMLInputElement>(null)
 const assistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
 const descriptionTouchedRef = useRef(false)
 userRef.current = user
 descriptionTouchedRef.current = descriptionTouched

 const hydrateVendorForm = (data: any) => {
 setVendorFormData({
 companyName: data?.company_name || '',
 businessRegistrationNumber: data?.business_registration_number || '',
 domain: data?.domain || '',
 phone: data?.phone || '',
 address: data?.business_address || data?.address || '',
 personalName: data?.personal_name || '',
 idType: data?.id_type || 'National ID (NIN)',
 idNumber: data?.id_number || '',
 termsAccepted: Boolean(data?.terms_accepted_at),
 })
 }

 const checkPendingRegistration = useCallback(async () => {
 const pendingVendorData = localStorage.getItem('pending_vendor_registration')
 if (!pendingVendorData) return
 try {
 const vendorData = JSON.parse(pendingVendorData)
 setVendorFormData({
 companyName: vendorData.company_name || '',
 businessRegistrationNumber: vendorData.business_registration_number || '',
 domain: vendorData.domain || '',
 phone: vendorData.phone || '',
 address: vendorData.address || '',
 personalName: vendorData.personal_name || '',
 idType: vendorData.id_type || 'National ID (NIN)',
 idNumber: vendorData.id_number || '',
 termsAccepted: Boolean(vendorData.terms_accepted),
 })
 } catch (error) {
 console.error('Error parsing pending vendor data:', error)
 localStorage.removeItem('pending_vendor_registration')
 }
 }, [])

 const loadVendorData = useCallback(async () => {
 if (loadingRef.current) return

 loadingRef.current = true
 const isFirstPaint = !vendorRef.current
 if (isFirstPaint) setLoading(true)

 const token = (await getAccessToken()) || (await ensureFreshSession())
 if (!token) {
  setLoading(false)
  loadingRef.current = false
  router.replace('/login?redirect=/vendor')
  return
 }

 try {
 const vendorData = await vendorsAPI.getMyVendor()
 vendorRef.current = vendorData
 setVendor(vendorData)
 hydrateVendorForm(vendorData)
 setAccountView('vendor')
 localStorage.removeItem('pending_vendor_registration')

 if (!profileSyncedRef.current && userRef.current?.role !== 'vendor' && vendorData?.company_name) {
 profileSyncedRef.current = true
 const vendorUser = await persistVendorProfile({ company_name: vendorData.company_name })
 if (vendorUser) setUser(vendorUser)
 } else {
 profileSyncedRef.current = true
 }

 const vendorProducts = await vendorsAPI.getMyProducts()
 setProducts(vendorProducts || [])
 } catch (error: any) {
 console.error('Error loading vendor data:', error)
 const pendingRaw = localStorage.getItem('pending_vendor_registration')
 let pending: any = null
 if (pendingRaw) {
 try {
 pending = JSON.parse(pendingRaw)
 } catch {
 localStorage.removeItem('pending_vendor_registration')
 }
 }
 if (!pending?.company_name) {
 const status = error?.response?.status
 if (status === 404 && isSuperAdmin(userRef.current)) {
 setPlatformMode(true)
 setLoading(false)
 loadingRef.current = false
 return
 }
 if (status === 404 && userRef.current?.role !== 'vendor') {
 useStore.getState().setHasVendorAccount(false)
 router.replace('/chat')
 }
 return
 }
 try {
 const created = await vendorsAPI.register({
 company_name: pending.company_name,
 business_registration_number: pending.business_registration_number,
 domain: pending.domain,
 phone: pending.phone,
 address: pending.address,
 })
 vendorRef.current = created
 setVendor(created)
 hydrateVendorForm(created)
 setAccountView('vendor')
 if (!profileSyncedRef.current) {
 profileSyncedRef.current = true
 const vendorUser = await persistVendorProfile({
 company_name: created.company_name,
 business_registration_number: created.business_registration_number,
 domain: created.domain,
 phone: created.phone,
 address: created.address,
 })
 if (vendorUser) setUser(vendorUser)
 }
 localStorage.removeItem('pending_vendor_registration')
 try {
 const vendorProducts = await vendorsAPI.getMyProducts()
 setProducts(vendorProducts || [])
 } catch {
 setProducts([])
 }
 } catch (registerError) {
 console.error('Auto vendor setup failed:', registerError)
 router.replace('/chat')
 }
 } finally {
 setLoading(false)
 loadingRef.current = false
 }
 }, [])

 useEffect(() => {
 void getCurrencyCode().then(setCurrencyCode)
 }, [])

 useEffect(() => {
 if (!user?.id) return
 loadVendorData()
 checkPendingRegistration()
 }, [user?.id, user?.email, loadVendorData, checkPendingRegistration])

 useEffect(() => {
 const refresh = () => {
 if (document.visibilityState && document.visibilityState !== 'visible') return
 void loadVendorData()
 }
 window.addEventListener('focus', refresh)
 document.addEventListener('visibilitychange', refresh)
 return () => {
 window.removeEventListener('focus', refresh)
 document.removeEventListener('visibilitychange', refresh)
 }
 }, [loadVendorData])

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
 if (!newProduct.name.trim() || !newProduct.category.trim()) {
 showToast('Please fill in all required fields (Name, Category)', 'error')
 return
 }

 const createPriceMode = effectivePriceMode(newProduct.category, newProduct.price_mode)
 if (createPriceMode === 'fixed' && newProduct.price <= 0) {
 showToast('Price must be greater than 0', 'error')
 return
 }
 if (newProduct.category === 'Service' && !newProduct.delivery_mode) {
 showToast('Choose whether this service is delivered remotely or onsite', 'error')
 return
 }

 const requiredSpecs = specFieldsFor(newProduct.category).filter((field) => field.required)
 const missingSpec = requiredSpecs.find((field) => !String(newProduct.specifications[field.key] || '').trim())
 if (missingSpec) {
 showToast(`${missingSpec.label} is required for this ${newProduct.category.toLowerCase()}`, 'error')
 return
 }

 if (!isDigitalCategory(newProduct.category) && !productImageFiles.length && !newProduct.image_url) {
 showToast('Upload at least one clear photo of this product', 'error')
 return
 }

 setIsCreatingProduct(true)
 try {
 let imageUrls: string[] = newProduct.image_url ? [newProduct.image_url] : []
 if (productImageFiles.length) {
 const uploaded = await vendorsAPI.uploadProductImages(
 productImageFiles,
 newProduct.name.trim(),
 newProduct.category
 )
 imageUrls = uploaded.urls || (uploaded.url ? [uploaded.url] : [])
 }
 const imageUrl = imageUrls[0]

 const specifications = Object.fromEntries(
 Object.entries(newProduct.specifications).filter(([, value]) => String(value || '').trim())
 )

 await vendorsAPI.createProduct({
 product: {
 name: newProduct.name.trim(),
 sku: generateProductSku(newProduct.name, newProduct.category),
 category: newProduct.category,
 description: newProduct.description.trim() || undefined,
 specifications: Object.keys(specifications).length > 0 ? specifications : undefined,
 image_url: imageUrl,
 image_urls: imageUrls,
 },
 stock_quantity: newProduct.stock_quantity,
 price: createPriceMode === 'contact' ? 0 : Math.round(newProduct.price * 100),
 price_mode: createPriceMode,
 delivery_mode: newProduct.category === 'Service' ? newProduct.delivery_mode : undefined,
 })

 showToast('Product created successfully!', 'success')
 resetProductForm()
 setShowProductModal(false)
 loadVendorData()
 } catch (error: any) {
 showToast(apiErrorMessage(error, 'Failed to create product'), 'error')
 } finally {
 setIsCreatingProduct(false)
 }
 }

 const probeImage = (file: File) =>
 new Promise<{ ok: boolean; url: string }>((resolve) => {
 const objectUrl = URL.createObjectURL(file)
 const probe = new window.Image()
 const minSide = isDigitalCategory(newProduct.category) ? 200 : 400
 probe.onload = () => {
 resolve({
 ok: Math.min(probe.naturalWidth, probe.naturalHeight) >= minSide,
 url: objectUrl,
 })
 }
 probe.onerror = () => {
 URL.revokeObjectURL(objectUrl)
 resolve({ ok: false, url: '' })
 }
 probe.src = objectUrl
 })

 const handleProductImagesSelected = async (incoming: File[]) => {
 if (!incoming.length) return
 const remaining = MAX_PRODUCT_IMAGES - productImageFiles.length
 if (remaining <= 0) {
 showToast(`You can upload up to ${MAX_PRODUCT_IMAGES} photos`, 'error')
 return
 }

 const acceptedFiles: File[] = []
 const acceptedPreviews: string[] = []
 for (const file of incoming.slice(0, remaining)) {
 if (!file.type.startsWith('image/')) {
 showToast('Upload JPG, PNG, or WebP photos of the product', 'error')
 continue
 }
 if (file.size > 8 * 1024 * 1024) {
 showToast(`${file.name} is larger than 8MB`, 'error')
 continue
 }
 const probed = await probeImage(file)
 if (!probed.ok) {
 showToast(
 isDigitalCategory(newProduct.category)
 ? 'Use a clear logo, screenshot, or portfolio image at least 200px on the shortest side'
 : 'Use a clear product photo at least 400px on the shortest side',
 'error'
 )
 continue
 }
 acceptedFiles.push(file)
 acceptedPreviews.push(probed.url)
 }

 if (incoming.length > remaining) {
 showToast(`Only ${MAX_PRODUCT_IMAGES} photos are allowed. Extra files were skipped.`, 'info')
 }

 if (acceptedFiles.length) {
 setProductImageFiles((prev) => [...prev, ...acceptedFiles])
 setProductImagePreviews((prev) => [...prev, ...acceptedPreviews])
 }
 }

 const removeProductImage = (index: number) => {
 setProductImagePreviews((prev) => {
 const url = prev[index]
 if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
 return prev.filter((_, i) => i !== index)
 })
 setProductImageFiles((prev) => prev.filter((_, i) => i !== index))
 }

 const clearProductImages = () => {
 productImagePreviews.forEach((url) => {
 if (url.startsWith('blob:')) URL.revokeObjectURL(url)
 })
 setProductImageFiles([])
 setProductImagePreviews([])
 }

 const handleAddExistingProduct = async (product: any) => {
 if (!product.id) {
 showToast('Invalid product selected', 'error')
 return
 }

 const addPriceMode = effectivePriceMode(product.category, newProduct.price_mode)
 if (addPriceMode === 'fixed' && newProduct.price <= 0) {
 showToast('Price must be greater than 0', 'error')
 return
 }
 if (product.category === 'Service' && !newProduct.delivery_mode) {
 showToast('Choose whether this service is delivered remotely or onsite', 'error')
 return
 }

 try {
 await vendorsAPI.addProduct({
 product_id: product.id,
 stock_quantity: newProduct.stock_quantity,
 price: addPriceMode === 'contact' ? 0 : Math.round(newProduct.price * 100),
 price_mode: addPriceMode,
 delivery_mode: product.category === 'Service' ? newProduct.delivery_mode : undefined,
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

 const editPriceMode = effectivePriceMode(editingProduct.product?.category || '', editingProduct.price_mode)
 if (editPriceMode === 'fixed' && editingProduct.price <= 0) {
 showToast('Price must be greater than 0', 'error')
 return
 }

 try {
 await vendorsAPI.updateProduct(editingProduct.id, {
 product_id: editingProduct.product_id,
 stock_quantity: editingProduct.stock_quantity,
 price: editPriceMode === 'contact' ? 0 : Math.round(editingProduct.price * 100),
 price_mode: editPriceMode,
 delivery_mode: editingProduct.product?.category === 'Service' ? editingProduct.delivery_mode || 'onsite' : undefined,
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

 const handleExportProducts = () => {
 if (!products.length) {
 showToast('No products to export', 'warning')
 return
 }
 const rows: Array<Array<string | number>> = [
 ['Name', 'SKU', 'Category', 'Price (NGN)', 'Stock', 'Status', 'Description'],
 ...products.map((item) => [
 item.product?.name || '',
 item.product?.sku || '',
 item.product?.category || '',
 isContactPriced(item) ? 'Contact for price' : item.price ?? 0,
 item.stock_quantity ?? 0,
 item.stock_quantity > 0 ? 'In Stock' : 'Out of Stock',
 item.product?.description || '',
 ]),
 ]
 downloadCsv(`procurex-catalog-${new Date().toISOString().slice(0, 10)}.csv`, rows)
 showToast('Product catalog exported', 'success')
 }

 const handleShareCatalog = async () => {
 const origin = typeof window !== 'undefined' ? window.location.origin : ''
 const catalogUrl = `${origin}/products`
 const company = vendor?.company_name || 'ProcureX vendor'
 const copied = await copyToClipboard(catalogUrl)
 if (copied) {
  showToast('Catalog link copied to clipboard', 'success')
 } else {
  window.prompt('Copy this catalog link:', catalogUrl)
 }
 if (typeof navigator.share === 'function' && /Mobi|Android/i.test(navigator.userAgent)) {
  navigator.share({
   title: `${company} catalog`,
   text: `${company} catalog on ProcureX`,
   url: catalogUrl,
  }).catch(() => undefined)
 }
 }

 const handleViewReports = () => {
 const inventoryValue = products.reduce((sum, item) => sum + (item.price * item.stock_quantity), 0)
 const averagePrice = pricedProducts.length
 ? pricedProducts.reduce((sum, item) => sum + item.price, 0) / pricedProducts.length
 : 0
 const rows: Array<Array<string | number>> = [
 ['Metric', 'Value'],
 ['Vendor', vendor?.company_name || ''],
 ['Generated', new Date().toISOString()],
 ['Total products', products.length],
 ['In stock', inStockProducts],
 ['Out of stock', outOfStockProducts],
 ['Inventory value (NGN)', inventoryValue],
 ['Average price (NGN)', Math.round(averagePrice)],
 [],
 ['Name', 'SKU', 'Category', 'Price (NGN)', 'Stock', 'Line value (NGN)'],
 ...products.map((item) => [
 item.product?.name || '',
 item.product?.sku || '',
 item.product?.category || '',
 isContactPriced(item) ? 'Contact for price' : item.price ?? 0,
 item.stock_quantity ?? 0,
 (item.price ?? 0) * (item.stock_quantity ?? 0),
 ]),
 ]
 downloadCsv(`procurex-report-${new Date().toISOString().slice(0, 10)}.csv`, rows)
 showToast('Analytics report downloaded', 'success')
 }

 const handleUpdateVendor = async () => {
 const newErrors = validateVendorOnboarding({
 companyName: vendorFormData.companyName,
 businessRegistrationNumber: vendorFormData.businessRegistrationNumber,
 phone: vendorFormData.phone,
 address: vendorFormData.address,
 personalName: vendorFormData.personalName,
 idType: vendorFormData.idType,
 idNumber: vendorFormData.idNumber,
 termsAccepted: vendorFormData.termsAccepted || Boolean(vendor?.terms_accepted_at),
 })
 setVendorErrors(newErrors)
 if (Object.keys(newErrors).length > 0) return

 setIsRegistering(true)
 try {
 const vendorData = {
 company_name: vendorFormData.companyName.trim(),
 business_registration_number: vendorFormData.businessRegistrationNumber.trim(),
 domain: vendorFormData.domain?.trim() || undefined,
 phone: vendorFormData.phone.trim(),
 address: vendorFormData.address.trim(),
 personal_name: vendorFormData.personalName.trim(),
 id_type: vendorFormData.idType,
 id_number: vendorFormData.idNumber.trim(),
 terms_accepted: vendorFormData.termsAccepted || Boolean(vendor?.terms_accepted_at),
 }

 if (vendor) {
 await vendorsAPI.updateVendor(vendorData)
 showToast('Vendor information updated successfully!', 'success')
 } else {
 await vendorsAPI.register(vendorData)
 showToast('Welcome — your vendor dashboard is ready.', 'success')
 }
 const vendorUser = await persistVendorProfile(vendorData)
 if (vendorUser) setUser(vendorUser)
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
 clearProductImages()
 setNewProduct({
 name: '',
 sku: '',
 category: '',
 description: '',
 specifications: {},
 stock_quantity: 0,
 price: 0,
 price_mode: 'fixed',
 delivery_mode: '',
 image_url: '',
 })
 setProductAssist(null)
 setAssistLoading(false)
 setDescriptionTouched(false)
 setProductSearch('')
 setSearchResults([])
 setProductFormMode(null)
 setEditingProduct(null)
 }

 const handleUploadVerificationDoc = async (
 documentType: 'id_document' | 'address_bill' | 'company_certificate',
 file?: File | null
 ) => {
 if (!file) return
 setUploadingDoc(documentType)
 try {
 const result = await vendorsAPI.uploadDocument(file, documentType)
 if (result.vendor) {
 setVendor(result.vendor)
 hydrateVendorForm(result.vendor)
 } else {
 await loadVendorData()
 }
 showToast('Document uploaded', 'success')
 } catch (error: any) {
 showToast(apiErrorMessage(error, 'Could not upload that document.'), 'error')
 } finally {
 setUploadingDoc('')
 }
 }

 const handleSubmitForReview = async () => {
 setSubmittingReview(true)
 try {
 const updated = await vendorsAPI.submitForReview()
 setVendor(updated)
 hydrateVendorForm(updated)
 showToast('Application submitted for ProcureX review.', 'success')
 } catch (error: any) {
 showToast(apiErrorMessage(error, 'Could not submit for review.'), 'error')
 } finally {
 setSubmittingReview(false)
 }
 }

 const openCreateProductModal = () => {
 if (!vendorCanList(vendor)) {
 showToast(vendor?.next_step || 'Complete verification before listing products.', 'warning')
 setActiveTab('info')
 return
 }
 resetProductForm()
 setProductFormMode('create')
 setShowProductModal(true)
 }

 useEffect(() => {
 if (productFormMode !== 'create' || !newProduct.category || newProduct.name.trim().length < 3) {
 setProductAssist(null)
 setAssistLoading(false)
 return
 }
 if (assistTimerRef.current) clearTimeout(assistTimerRef.current)
 assistTimerRef.current = setTimeout(async () => {
 setAssistLoading(true)
 try {
 const result = await vendorsAPI.assistProduct({
 name: newProduct.name.trim(),
 category: newProduct.category,
 specifications: newProduct.specifications,
 description: descriptionTouchedRef.current ? newProduct.description : '',
 })
 setProductAssist(result)
 setNewProduct((prev) => {
 if (descriptionTouchedRef.current || prev.description.trim()) return prev
 if (!result.description) return prev
 return { ...prev, description: result.description }
 })
 } catch {
 setProductAssist(null)
 } finally {
 setAssistLoading(false)
 }
 }, 700)
 return () => {
 if (assistTimerRef.current) clearTimeout(assistTimerRef.current)
 }
 }, [productFormMode, newProduct.name, newProduct.category, newProduct.specifications])

 const openSearchProductModal = () => {
 if (!vendorCanList(vendor)) {
 showToast(vendor?.next_step || 'Complete verification before listing products.', 'warning')
 setActiveTab('info')
 return
 }
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

 const selectedSearchCategory = searchResults.find((p) => p.name === productSearch)?.category || ''
 const pricedProducts = products.filter((p) => !isContactPriced(p))

 // Calculate stats
 const totalProducts = products.length
 const inStockProducts = products.filter(p => p.stock_quantity > 0).length
 const outOfStockProducts = products.filter(p => p.stock_quantity === 0).length
 const totalValue = products.reduce((sum, p) => sum + (p.price * p.stock_quantity), 0) / 100
 const averagePrice = pricedProducts.length > 0
 ? pricedProducts.reduce((sum, p) => sum + (p.price / 100), 0) / pricedProducts.length
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

 if (loading && !vendor && !platformMode) {
 return (
 <div className="min-h-screen flex items-center justify-center bg-[#212121]">
 <ProcureXLoader size={128} label="Loading dashboard" />
 </div>
 )
 }

 if (platformMode) {
 return <SuperadminConsole />
 }

 if (!vendor) {
 return (
 <div className="min-h-screen flex items-center justify-center bg-[#212121]">
 <ProcureXLoader size={128} label="Opening procurement chat" />
 </div>
 )
 }

 const verificationColors: Record<string, 'success' | 'warning' | 'danger' | 'default'> = {
 verified: 'success',
 pending: 'warning',
 rejected: 'danger',
 revoked: 'danger',
 }
 const status = vendorStatus(vendor)
 const listingLocked = !vendorCanList(vendor)
 const blocked = status === 'revoked' || status === 'rejected'
 const statusLabel =
  status === 'verified'
   ? 'Verified'
   : status === 'revoked'
     ? 'Revoked'
     : status === 'rejected'
       ? 'Rejected'
       : vendor.submitted
         ? 'In review'
         : 'Unverified'

 return (
 <div className="min-h-dvh bg-[#212121]">
 {/* Header */}
 <div className="bg-[#2f2f2f] border-b border-[#2f2f2f]">
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
 <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
 <div className="min-w-0">
 <h1 className="text-2xl sm:text-3xl font-bold text-[#ececec]">Vendor Dashboard</h1>
 <p className="text-[#b4b4b4] mt-1 truncate">Welcome back, {vendor.company_name}</p>
 </div>
 <div className="flex items-center gap-3 flex-wrap">
 <Badge variant={(verificationColors[status] || 'default') as 'success' | 'warning' | 'danger' | 'default'} className="text-sm px-3 py-1">
 {status === 'verified' && <CheckCircle className="w-4 h-4 mr-1 inline" />}
 {status === 'pending' && <AlertCircle className="w-4 h-4 mr-1 inline" />}
 {(status === 'rejected' || status === 'revoked') && <ShieldX className="w-4 h-4 mr-1 inline" />}
 {statusLabel}
 </Badge>
 {!listingLocked ? (
 <Button onClick={openCreateProductModal} className="bg-primary-600 hover:bg-primary-700 flex-1 sm:flex-none">
 <Plus className="w-5 h-5 mr-2" />
 Add Product
 </Button>
 ) : null}
 </div>
 </div>
 </div>
 </div>

 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
 {listingLocked ? (
 <div className={`mb-6 rounded-xl border bg-[#2f2f2f] p-4 sm:p-5 ${blocked ? 'border-red-700/60' : 'border-amber-700/50'}`}>
 <div className="flex items-start gap-3">
 {blocked ? (
 <ShieldX className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
 ) : (
 <ShieldCheck className="w-6 h-6 text-amber-400 shrink-0 mt-0.5" />
 )}
 <div className="min-w-0 flex-1">
 <h2 className="text-lg font-semibold text-[#ececec]">
 {status === 'revoked'
  ? 'Verification revoked'
  : status === 'rejected'
    ? 'Application rejected'
    : vendor.submitted
      ? 'Application in review'
      : 'Verify this business before listing'}
 </h2>
 <p className="text-sm text-[#b4b4b4] mt-1">
 {status === 'revoked'
  ? (vendor.verification_notes || 'ProcureX revoked this account. Your products are hidden from buyers until you are approved again.')
  : status === 'rejected'
    ? (vendor.verification_notes || 'ProcureX rejected this application. Fix the issues below and resubmit.')
    : (vendor.next_step || 'Complete identity checks. Unverified vendors are hidden from buyers and chat search.')}
 </p>
 {Array.isArray(vendor.missing_requirements) && vendor.missing_requirements.length > 0 ? (
 <ul className="mt-3 text-sm text-[#ececec] list-disc pl-5 space-y-1">
 {vendor.missing_requirements.map((item: string) => (
 <li key={item}>{item}</li>
 ))}
 </ul>
 ) : null}
 <div className="mt-4 flex flex-wrap gap-2">
 <Button type="button" variant="outline" onClick={() => setActiveTab('info')}>
 {blocked ? 'Fix details' : 'Complete verification'}
 </Button>
 <Button
 type="button"
 onClick={() => void handleSubmitForReview()}
 isLoading={submittingReview}
 disabled={Boolean(vendor.missing_requirements?.length) || vendor.submitted}
 >
 {vendor.submitted ? 'In review' : blocked ? 'Resubmit for review' : 'Submit for review'}
 </Button>
 </div>
 </div>
 </div>
 </div>
 ) : null}

 {Array.isArray(vendor.admin_advice) && vendor.admin_advice.length > 0 ? (
 <div className="mb-6 rounded-xl border border-[#19C37D]/40 bg-[#2f2f2f] p-4 sm:p-5">
 <div className="flex items-start gap-3">
 <Info className="w-6 h-6 text-[#19C37D] shrink-0 mt-0.5" />
 <div className="min-w-0 flex-1">
 <h2 className="text-lg font-semibold text-[#ececec]">ProcureX advice</h2>
 <p className="text-sm text-[#b4b4b4] mt-1">The platform team left notes on your account or listings.</p>
 <div className="mt-3 space-y-2">
 {vendor.admin_advice.slice(0, 6).map((item: any) => (
 <div key={item.id} className="rounded-lg bg-[#171717] px-3 py-2">
 <p className="text-sm text-[#ececec]">{item.message}</p>
 <p className="text-xs text-[#8e8e8e] mt-1">
 {item.product_name ? `${item.product_name} · ` : ''}
 {item.created_at ? new Date(item.created_at).toLocaleString() : ''}
 </p>
 </div>
 ))}
 </div>
 </div>
 </div>
 </div>
 ) : null}

 {/* Stats Cards */}
 <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
 <div className="bg-[#2f2f2f] rounded-xl p-3 sm:p-4 border border-[#2f2f2f] hover:bg-[#353535] transition-shadow min-w-0">
 <div className="flex items-center justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] font-medium text-[#b4b4b4] uppercase tracking-wide">Total Products</p>
 <p className="text-lg sm:text-xl font-bold text-[#ececec] mt-1 whitespace-nowrap tabular-nums">{totalProducts}</p>
 <p className="text-[11px] text-[#8e8e8e] mt-1">{inStockProducts} in stock</p>
 </div>
 <div className="p-2 bg-[#171717] rounded-lg hidden lg:block shrink-0">
 <Package className="w-5 h-5 text-primary-600" />
 </div>
 </div>
 </div>

 <div className="bg-[#2f2f2f] rounded-xl p-3 sm:p-4 border border-[#2f2f2f] hover:bg-[#353535] transition-shadow min-w-0">
 <div className="flex items-center justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] font-medium text-[#b4b4b4] uppercase tracking-wide">In Stock</p>
 <p className="text-lg sm:text-xl font-bold text-green-600 mt-1 whitespace-nowrap tabular-nums">{inStockProducts}</p>
 <p className="text-[11px] text-[#8e8e8e] mt-1">{outOfStockProducts} out of stock</p>
 </div>
 <div className="p-2 bg-green-900/30 rounded-lg hidden lg:block shrink-0">
 <CheckCircle className="w-5 h-5 text-green-600" />
 </div>
 </div>
 </div>

 <div className="bg-[#2f2f2f] rounded-xl p-3 sm:p-4 border border-[#2f2f2f] hover:bg-[#353535] transition-shadow min-w-0">
 <div className="flex items-center justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] font-medium text-[#b4b4b4] uppercase tracking-wide">Inventory Value</p>
 <p className="text-sm sm:text-base font-bold text-blue-400 mt-1 whitespace-nowrap tabular-nums leading-tight">
 <PriceText amount={products.reduce((sum, p) => sum + (p.price * p.stock_quantity), 0)} />
 </p>
 <p className="text-[11px] text-[#8e8e8e] mt-1">Total stock value</p>
 </div>
 <div className="p-2 bg-[#171717] rounded-lg hidden xl:block shrink-0">
 <DollarSign className="w-5 h-5 text-blue-400" />
 </div>
 </div>
 </div>

 <div className="bg-[#2f2f2f] rounded-xl p-3 sm:p-4 border border-[#2f2f2f] hover:bg-[#353535] transition-shadow min-w-0">
 <div className="flex items-center justify-between gap-2">
 <div className="min-w-0">
 <p className="text-[11px] font-medium text-[#b4b4b4] uppercase tracking-wide">Avg. Price</p>
 <p className="text-sm sm:text-base font-bold text-primary-500 mt-1 whitespace-nowrap tabular-nums leading-tight">
 <PriceText amount={pricedProducts.length ? pricedProducts.reduce((sum, p) => sum + p.price, 0) / pricedProducts.length : 0} />
 </p>
 <p className="text-[11px] text-[#8e8e8e] mt-1">Per product</p>
 </div>
 <div className="p-2 bg-[#171717] rounded-lg hidden xl:block shrink-0">
 <TrendingUp className="w-5 h-5 text-primary-500" />
 </div>
 </div>
 </div>
 </div>

 {/* Tabs */}
 <div className="bg-[#2f2f2f] rounded-xl border border-[#2f2f2f] mb-6">
 <div className="border-b border-[#2f2f2f] overflow-x-auto no-scrollbar">
 <nav className="flex -mb-px min-w-max">
 <button
 onClick={() => setActiveTab('products')}
 className={`px-4 sm:px-6 py-3 sm:py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
 className={`px-4 sm:px-6 py-3 sm:py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
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
 className={`px-4 sm:px-6 py-3 sm:py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
 activeTab === 'analytics'
 ? 'border-primary-600 text-primary-600'
 : 'border-transparent text-[#8e8e8e] hover:text-[#b4b4b4] hover:border-[#3d3d3d]'
 }`}
 >
 <BarChart3 className="w-4 h-4 inline mr-2" />
 Analytics
 </button>
 <button
 onClick={() => setActiveTab('bisonbook')}
 className={`px-4 sm:px-6 py-3 sm:py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
 activeTab === 'bisonbook'
 ? 'border-primary-600 text-primary-600'
 : 'border-transparent text-[#8e8e8e] hover:text-[#b4b4b4] hover:border-[#3d3d3d]'
 }`}
 >
 <BookOpen className="w-4 h-4 inline mr-2" />
 BisonBook
 </button>
 </nav>
 </div>

 <div className="p-4 sm:p-6">
 {/* Products Tab */}
 {activeTab === 'products' && (
 <div className="space-y-6">
 {listingLocked ? (
 <div className="rounded-lg border border-red-700/50 bg-[#171717] px-4 py-3 text-sm text-red-300">
 {status === 'revoked'
  ? 'Verification was revoked. These products are hidden from buyers until ProcureX approves this account again.'
  : 'Listings stay hidden from buyers until this account is verified.'}
 </div>
 ) : null}
 {/* Search and Filters */}
 <div className="flex flex-col gap-3 sm:flex-row sm:gap-4 sm:items-center sm:justify-between">
 <div className="flex-1 w-full sm:max-w-md">
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
 <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
 <Button
 variant="outline"
 size="sm"
 onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
 className="px-3"
 >
 {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid3x3 className="w-4 h-4" />}
 </Button>
 {listingLocked ? null : (
 <>
 <Button variant="outline" size="sm" onClick={openSearchProductModal}>
 <Search className="w-4 h-4 mr-2" />
 Add Existing
 </Button>
 <Button size="sm" onClick={openCreateProductModal}>
 <Plus className="w-4 h-4 mr-2" />
 New Product
 </Button>
 </>
 )}
 </div>
 </div>

 {/* Products Grid/List */}
 {filteredProducts.length === 0 ? (
 <div className="text-center py-16 bg-[#212121] rounded-lg border-2 border-dashed border-[#3d3d3d]">
 {products.length === 0 ? (
 <>
 <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
 <h3 className="text-lg font-semibold text-[#ececec] mb-2">No products yet</h3>
 <p className="text-[#b4b4b4] mb-6">{listingLocked ? 'Verification is required before you can add products.' : 'Start by adding your first product to the catalog'}</p>
 <div className="flex flex-col sm:flex-row justify-center gap-3">
 {listingLocked ? (
 <Button variant="outline" onClick={() => setActiveTab('info')}>
 Fix verification
 </Button>
 ) : (
 <>
 <Button variant="outline" onClick={openSearchProductModal}>
 <Search className="w-4 h-4 mr-2" />
 Add Existing Product
 </Button>
 <Button onClick={openCreateProductModal}>
 <Plus className="w-4 h-4 mr-2" />
 Create New Product
 </Button>
 </>
 )}
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
 {(() => {
 const photos = productImageList(vp.product)
 const cover = photos[0]
 return cover ? (
 <>
 <img
 src={resolveMediaUrl(cover)}
 alt={vp.product.name}
 className="w-full h-full object-cover"
 />
 {photos.length > 1 && (
 <span className="absolute bottom-3 left-3 text-xs bg-black/70 text-white px-2 py-0.5 rounded-full">
 {photos.length} photos
 </span>
 )}
 </>
 ) : (
 <div className="flex items-center justify-center h-full">
 <ImageIcon className="w-16 h-16 text-gray-400" />
 </div>
 )
 })()}
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
 <div className="absolute top-3 left-3 flex flex-col gap-1">
 {vp.stock_quantity === 0 ? <Badge variant="warning">Out of Stock</Badge> : null}
 {String(vp.admin_assessment || '') === 'flagged' ? <Badge variant="warning">Needs changes</Badge> : null}
 {String(vp.admin_assessment || '') === 'hidden' || vp.is_active === false ? <Badge variant="danger">Hidden</Badge> : null}
 </div>
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

 {vp.product?.specifications && Object.keys(vp.product.specifications).length > 0 && (
 <p className="text-sm text-[#8e8e8e] mb-3">
 {Object.entries(vp.product.specifications)
 .slice(0, 3)
 .map(([key, value]) => `${key.toUpperCase()}: ${value}`)
 .join(' · ')}
 </p>
 )}

 {vp.product?.description && (
 <p className="text-sm text-[#b4b4b4] mb-4 line-clamp-2">
 {vp.product.description}
 </p>
 )}

 {vp.admin_assessment_notes ? (
 <p className="text-sm text-amber-300 mb-4">{vp.admin_assessment_notes}</p>
 ) : null}

 <div className="flex items-center justify-between pt-4 border-t border-[#2f2f2f]">
 <div>
 <p className="text-xs text-[#8e8e8e] mb-1">Price</p>
 <p className={`${isContactPriced(vp) ? 'text-base' : 'text-2xl'} font-bold text-[#ececec]`}>
 <PriceText amount={vp.price} contact={isContactPriced(vp)} />
 </p>
 <p className="text-[11px] text-[#8e8e8e] mt-0.5">{availabilityLabel(vp.product?.category, vp.delivery_mode, vendor?.country)}</p>
 </div>
 <div>
 <p className="text-xs text-[#8e8e8e] mb-1">Stock</p>
 <input
 type="number"
 min="0"
 defaultValue={vp.stock_quantity}
 onBlur={(e) => handleUpdateStock(vp.id, parseInt(e.target.value) || 0)}
 className={`w-20 px-2 py-1 text-center ${STOCK_INPUT_CLASS}`}
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
 <div key={vp.id} className="bg-[#2f2f2f] rounded-lg border border-[#2f2f2f] p-4 sm:p-6 hover:bg-[#353535] transition-shadow">
 <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6">
 {/* Product Image */}
 <div className="relative w-24 h-24 bg-[#2f2f2f] rounded-lg overflow-hidden flex-shrink-0">
 {(() => {
 const cover = productImageList(vp.product)[0]
 return cover ? (
 <img
 src={resolveMediaUrl(cover)}
 alt={vp.product.name}
 className="w-full h-full object-cover"
 />
 ) : (
 <div className="flex items-center justify-center h-full">
 <ImageIcon className="w-8 h-8 text-gray-400" />
 </div>
 )
 })()}
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
 <p className={`${isContactPriced(vp) ? 'text-base' : 'text-xl'} font-bold text-[#ececec]`}>
 <PriceText amount={vp.price} contact={isContactPriced(vp)} />
 </p>
 <p className="text-[11px] text-[#8e8e8e] mt-0.5">{availabilityLabel(vp.product?.category, vp.delivery_mode, vendor?.country)}</p>
 </div>
 <div>
 <p className="text-xs text-[#8e8e8e] mb-1">Stock Quantity</p>
 <input
 type="number"
 min="0"
 defaultValue={vp.stock_quantity}
 onBlur={(e) => handleUpdateStock(vp.id, parseInt(e.target.value) || 0)}
 className={`w-24 px-3 py-2 text-center ${STOCK_INPUT_CLASS}`}
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
 if (!isEditingVendor) hydrateVendorForm(vendor)
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
 label="Company Name"
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
 label="CAC / registration number"
 name="businessRegistrationNumber"
 type="text"
 value={vendorFormData.businessRegistrationNumber}
 onChange={(e) => setVendorFormData({ ...vendorFormData, businessRegistrationNumber: e.target.value })}
 error={vendorErrors.businessRegistrationNumber}
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
 error={vendorErrors.phone}
 />
 <Input
 label="Authorized officer"
 name="personalName"
 type="text"
 value={vendorFormData.personalName}
 onChange={(e) => setVendorFormData({ ...vendorFormData, personalName: e.target.value })}
 error={vendorErrors.personalName}
 />
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">Government ID type</label>
 <select
 value={vendorFormData.idType}
 onChange={(e) => setVendorFormData({ ...vendorFormData, idType: e.target.value })}
 className="w-full px-4 py-2 border border-[#3d3d3d] rounded-lg bg-[#2f2f2f] text-[#ececec]"
 >
 {VENDOR_ID_TYPES.map((type) => (
 <option key={type} value={type}>{type}</option>
 ))}
 </select>
 </div>
 <Input
 label="ID number"
 name="idNumber"
 type="text"
 value={vendorFormData.idNumber}
 onChange={(e) => setVendorFormData({ ...vendorFormData, idNumber: e.target.value })}
 error={vendorErrors.idNumber}
 />
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">
 Address
 </label>
 <textarea
 name="address"
 value={vendorFormData.address}
 onChange={(e) => setVendorFormData({ ...vendorFormData, address: e.target.value })}
 className="w-full px-4 py-2 border border-[#3d3d3d] rounded-lg bg-[#2f2f2f] text-[#ececec] placeholder-[#8e8e8e] focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
 rows={4}
 placeholder="Company address"
 />
 {vendorErrors.address ? <p className="mt-1 text-sm text-red-400">{vendorErrors.address}</p> : null}
 </div>
 <label className="flex items-start gap-2 text-sm text-[#b4b4b4]">
 <input
 type="checkbox"
 checked={vendorFormData.termsAccepted}
 onChange={(e) => setVendorFormData({ ...vendorFormData, termsAccepted: e.target.checked })}
 className="mt-1"
 />
 <span>I confirm these business details are true and I am authorized to sell on ProcureX.</span>
 </label>
 {vendorErrors.termsAccepted ? <p className="text-sm text-red-400">{vendorErrors.termsAccepted}</p> : null}
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
 <Badge variant={(verificationColors[status] || 'default') as 'success' | 'warning' | 'danger' | 'default'} className="text-sm">
 {status === 'verified' && <CheckCircle className="w-4 h-4 mr-1 inline" />}
 {status === 'pending' && <AlertCircle className="w-4 h-4 mr-1 inline" />}
 {status === 'rejected' && <ShieldX className="w-4 h-4 mr-1 inline" />}
 {status === 'revoked' && <ShieldX className="w-4 h-4 mr-1 inline" />}
 {statusLabel}
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
 <div className="bg-[#212121] rounded-lg p-6 space-y-4">
 <h3 className="text-lg font-semibold text-[#ececec]">Verification documents</h3>
 <p className="text-sm text-[#b4b4b4]">PDF, JPG, or PNG up to 8MB. Replacing a document sends the account back to review.</p>
 {[
 { key: 'id_document' as const, label: 'Government ID', url: vendor.id_document_url },
 { key: 'company_certificate' as const, label: 'CAC / company certificate', url: vendor.company_certificate_url },
 { key: 'address_bill' as const, label: 'Proof of business address', url: vendor.address_verification_bill_url },
 ].map((doc) => (
 <div key={doc.key} className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between border border-[#3d3d3d] rounded-lg p-3">
 <div>
 <p className="text-sm font-medium text-[#ececec]">{doc.label}</p>
 <p className="text-xs text-[#8e8e8e]">{doc.url ? 'Uploaded' : 'Required'}</p>
 </div>
 <label className="inline-flex items-center gap-2 text-sm text-primary-400 cursor-pointer">
 <Upload className="w-4 h-4" />
 {uploadingDoc === doc.key ? 'Uploading...' : 'Upload'}
 <input
 type="file"
 accept=".pdf,.jpg,.jpeg,.png,.webp"
 className="hidden"
 disabled={Boolean(uploadingDoc)}
 onChange={(event) => {
 const file = event.target.files?.[0]
 event.target.value = ''
 void handleUploadVerificationDoc(doc.key, file)
 }}
 />
 </label>
 </div>
 ))}
 <Button
 type="button"
 onClick={() => void handleSubmitForReview()}
 isLoading={submittingReview}
 disabled={Boolean(vendor.missing_requirements?.length) || vendor.submitted || vendorCanList(vendor)}
 >
 {vendorCanList(vendor) ? 'Verified' : vendor.submitted ? 'Waiting for review' : blocked ? 'Resubmit for review' : 'Submit for review'}
 </Button>
 </div>
 </div>
 )}

 {activeTab === 'bisonbook' && (
 <BisonBookShell
 vendor={vendor}
 onVendorChange={(next) => {
 vendorRef.current = next
 setVendor(next)
 }}
 />
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

 <div className="bg-[#171717] rounded-xl p-6 border border-primary-200">
 <div className="flex items-center justify-between mb-4">
 <h3 className="text-lg font-semibold text-[#ececec]">Price Range</h3>
 <DollarSign className="w-6 h-6 text-blue-400" />
 </div>
 {pricedProducts.length > 0 ? (
 <div className="space-y-2">
 <div className="flex justify-between">
 <span className="text-sm text-[#b4b4b4]">Lowest</span>
 <span className="font-semibold text-[#ececec]">
 <PriceText amount={Math.min(...pricedProducts.map(p => p.price))} />
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-sm text-[#b4b4b4]">Average</span>
 <span className="font-semibold text-[#ececec]">
 <PriceText amount={pricedProducts.reduce((sum, p) => sum + p.price, 0) / pricedProducts.length} />
 </span>
 </div>
 <div className="flex justify-between">
 <span className="text-sm text-[#b4b4b4]">Highest</span>
 <span className="font-semibold text-[#ececec]">
 <PriceText amount={Math.max(...pricedProducts.map(p => p.price))} />
 </span>
 </div>
 {pricedProducts.length < products.length ? (
 <p className="text-xs text-[#8e8e8e] pt-1">
 {products.length - pricedProducts.length} contact-for-price listing{products.length - pricedProducts.length === 1 ? '' : 's'} not included
 </p>
 ) : null}
 </div>
 ) : (
 <p className="text-[#b4b4b4]">No products to analyze</p>
 )}
 </div>
 </div>

 <div className="bg-[#2f2f2f] rounded-xl border border-[#2f2f2f] p-6">
 <h3 className="text-lg font-semibold text-[#ececec] mb-4">Quick Actions</h3>
 <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
 <Button type="button" variant="outline" className="justify-start h-auto py-4" onClick={handleExportProducts}>
 <Download className="w-5 h-5 mr-3" />
 <div className="text-left">
 <div className="font-semibold">Export Products</div>
 <div className="text-xs text-[#8e8e8e]">Download CSV</div>
 </div>
 </Button>
 <Button type="button" variant="outline" className="justify-start h-auto py-4" onClick={handleShareCatalog}>
 <Share2 className="w-5 h-5 mr-3" />
 <div className="text-left">
 <div className="font-semibold">Share Catalog</div>
 <div className="text-xs text-[#8e8e8e]">Generate link</div>
 </div>
 </Button>
 <Button type="button" variant="outline" className="justify-start h-auto py-4" onClick={handleViewReports}>
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
 size="xl"
 footer={
 <div className="flex justify-end gap-2 w-full sm:w-auto flex-col-reverse sm:flex-row">
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
 <Button onClick={handleCreateProduct} isLoading={isCreatingProduct} disabled={!newProduct.category}>
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
 {allowsContactForPrice(editingProduct.product?.category || '') ? (
 <PricingModeToggle
 category={editingProduct.product?.category || ''}
 value={effectivePriceMode(editingProduct.product?.category || '', editingProduct.price_mode)}
 onChange={(mode) => setEditingProduct({ ...editingProduct, price_mode: mode })}
 />
 ) : null}
 {editingProduct.product?.category === 'Service' ? (
 <DeliveryModeToggle
 value={editingProduct.delivery_mode || 'onsite'}
 vendorCountry={vendor?.country}
 onChange={(mode) => setEditingProduct({ ...editingProduct, delivery_mode: mode })}
 />
 ) : null}
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
 {effectivePriceMode(editingProduct.product?.category || '', editingProduct.price_mode) === 'contact' ? (
 <ContactPriceNote />
 ) : (
 <Input
 label={`Price (${currencyCode})`}
 type="number"
 min="0"
 step="0.01"
 value={editingProduct.price}
 onChange={(e) =>
 setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })
 }
 helperText={`Buyers see this in ${currencyCode}`}
 />
 )}
 </div>
 </div>
 ) : productFormMode === 'create' ? (
 <div className="space-y-6">
 <div className="bg-[#171717] border border-[#3d3d3d] rounded-lg p-4">
 <div className="flex items-start">
 <Sparkles className="w-5 h-5 text-primary-500 mr-2 mt-0.5" />
 <div className="text-sm text-[#b4b4b4]">
 <p className="font-semibold mb-1 text-[#ececec]">Category first</p>
 <p>Choose goods, software, or a service. That decision unlocks the right fields, AI description, and image rules.</p>
 </div>
 </div>
 </div>

 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">
 Category <span className="text-red-500">*</span>
 </label>
 <select
 required
 value={newProduct.category}
 onChange={(e) => {
 setProductAssist(null)
 setDescriptionTouched(false)
 setNewProduct((prev) => ({
 ...prev,
 category: e.target.value,
 specifications: {},
 description: '',
 }))
 }}
 className="w-full px-4 py-2 border border-[#3d3d3d] rounded-lg bg-[#2f2f2f] text-[#ececec] focus:outline-none focus:ring-2 focus:ring-primary-500"
 >
 <option value="">Select a category</option>
 <optgroup label="Physical goods">
 {GOODS_CATEGORIES.map((category) => (
 <option key={category} value={category}>
 {category}
 </option>
 ))}
 </optgroup>
 <optgroup label="Software & services">
 {PRODUCT_CATEGORIES.filter((category) => isDigitalCategory(category)).map((category) => (
 <option key={category} value={category}>
 {category}
 </option>
 ))}
 </optgroup>
 </select>
 {newProduct.category ? (
 <p className="mt-2 text-xs text-[#8e8e8e]">
 {listingKind(newProduct.category) === 'goods'
 ? 'Physical goods — a real photo of this product is required.'
 : listingKind(newProduct.category) === 'software'
 ? 'Software — a logo, app icon, or screenshot is accepted.'
 : 'Service — a logo, mockup, or portfolio image is accepted.'}
 </p>
 ) : (
 <p className="mt-2 text-xs text-[#8e8e8e]">The rest of the form appears after you pick a category.</p>
 )}
 </div>

 {!newProduct.category ? null : (
 <>
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
 <Input
 label={
 listingKind(newProduct.category) === 'service'
 ? 'Service name'
 : listingKind(newProduct.category) === 'software'
 ? 'Software name'
 : 'Product name'
 }
 type="text"
 required
 value={newProduct.name}
 onChange={(e) => setNewProduct((prev) => ({ ...prev, name: e.target.value }))}
 placeholder={
 isDigitalCategory(newProduct.category)
 ? newProduct.category === 'Service'
 ? 'e.g., Company website build'
 : 'e.g., Inventory Manager Cloud'
 : 'e.g., Dell XPS 15 Laptop'
 }
 />
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">SKU</label>
 <div className="w-full px-4 py-2 border border-[#3d3d3d] rounded-lg bg-[#171717] text-[#ececec] font-mono text-sm truncate">
 {generateProductSku(newProduct.name, newProduct.category) || 'Generated from name'}
 </div>
 <p className="mt-1 text-sm text-[#8e8e8e]">Assigned automatically</p>
 </div>
 </div>

 {(assistLoading || productAssist) && (
 <div className="rounded-lg border border-[#3d3d3d] bg-[#171717] p-4 space-y-2">
 <div className="flex items-center justify-between gap-2">
 <p className="text-sm font-medium text-[#ececec] flex items-center gap-2">
 <Sparkles className="w-4 h-4 text-primary-400" />
 {assistLoading ? 'Identifying this listing…' : productAssist?.kind_label}
 </p>
 {productAssist?.kind ? (
 <Badge variant="default">{productAssist.kind_label}</Badge>
 ) : null}
 </div>
 {productAssist?.note ? (
 <p className="text-xs text-amber-300">{productAssist.note}</p>
 ) : null}
 {productAssist?.category_mismatch && productAssist.suggested_category ? (
 <button
 type="button"
 className="text-xs text-primary-400 hover:text-primary-300"
 onClick={() => {
 setDescriptionTouched(false)
 setNewProduct((prev) => ({
 ...prev,
 category: productAssist.suggested_category || prev.category,
 specifications: {},
 description: '',
 }))
 }}
 >
 Use suggested category: {productAssist.suggested_category}
 </button>
 ) : null}
 {productAssist?.image_rule ? (
 <p className="text-xs text-[#8e8e8e]">{productAssist.image_rule}</p>
 ) : null}
 </div>
 )}

 {specFieldsFor(newProduct.category).length > 0 && (
 <div className="grid grid-cols-2 gap-4">
 {specFieldsFor(newProduct.category).map((field) => (
 <Input
 key={field.key}
 label={field.label}
 type="text"
 required={field.required}
 value={newProduct.specifications[field.key] || ''}
 onChange={(e) =>
 setNewProduct({
 ...newProduct,
 specifications: {
 ...newProduct.specifications,
 [field.key]: e.target.value,
 },
 })
 }
 placeholder={field.placeholder}
 />
 ))}
 </div>
 )}

 <div>
 <div className="flex items-center justify-between mb-1">
 <label className="block text-sm font-medium text-[#b4b4b4]">
 Description
 </label>
 {productAssist?.description ? (
 <button
 type="button"
 className="text-xs text-primary-400 hover:text-primary-300"
 onClick={() => {
 setNewProduct((prev) => ({ ...prev, description: productAssist.description }))
 setDescriptionTouched(true)
 }}
 >
 Use AI description
 </button>
 ) : null}
 </div>
 <Input
 type="textarea"
 className="min-h-[100px]"
 value={newProduct.description}
 onChange={(e) => {
 setDescriptionTouched(true)
 setNewProduct({ ...newProduct, description: e.target.value })
 }}
 placeholder={
 isDigitalCategory(newProduct.category)
 ? newProduct.category === 'Service'
 ? 'Describe the work, who it is for, and what problem it solves...'
 : 'Describe the problem this software solves and who it is for...'
 : 'Extra details buyers should know...'
 }
 />
 </div>
 <div className="grid grid-cols-2 gap-4">
 <Input
 label={
 isDigitalCategory(newProduct.category)
 ? newProduct.category === 'Service'
 ? 'Available slots'
 : 'Licenses available'
 : 'Stock Quantity'
 }
 type="number"
 min="0"
 value={newProduct.stock_quantity}
 onChange={(e) =>
 setNewProduct({ ...newProduct, stock_quantity: parseInt(e.target.value) || 0 })
 }
 />
 {effectivePriceMode(newProduct.category, newProduct.price_mode) === 'contact' ? (
 <ContactPriceNote />
 ) : (
 <Input
 label={`Price (${currencyCode})`}
 type="number"
 min="0"
 step="0.01"
 required
 value={newProduct.price}
 onChange={(e) =>
 setNewProduct({ ...newProduct, price: parseFloat(e.target.value) || 0 })
 }
 helperText={newProduct.price > 0 ? `Listed in ${currencyCode}` : ''}
 />
 )}
 </div>
 {allowsContactForPrice(newProduct.category) ? (
 <PricingModeToggle
 category={newProduct.category}
 value={effectivePriceMode(newProduct.category, newProduct.price_mode)}
 onChange={(mode) => setNewProduct({ ...newProduct, price_mode: mode })}
 />
 ) : null}
 {newProduct.category === 'Service' ? (
 <DeliveryModeToggle
 value={newProduct.delivery_mode}
 vendorCountry={vendor?.country}
 onChange={(mode) => setNewProduct({ ...newProduct, delivery_mode: mode })}
 />
 ) : null}
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-2">
 {isDigitalCategory(newProduct.category) ? 'Cover image' : 'Product photos'}
 {!isDigitalCategory(newProduct.category) ? <span className="text-red-500"> *</span> : null}
 </label>
 <p className="text-xs text-[#8e8e8e] mb-3">
 {isDigitalCategory(newProduct.category)
 ? `Optional. Upload a screenshot, logo, or portfolio image (JPG, PNG, or WebP).`
 : `Upload 1–${MAX_PRODUCT_IMAGES} sharp photos of this product (JPG, PNG, or WebP, at least 400px). Show the actual item. Logos, screenshots, and unrelated pictures will be rejected.`}
 </p>
 <input
 ref={fileInputRef}
 type="file"
 accept="image/jpeg,image/png,image/webp"
 multiple
 className="hidden"
 onChange={(e) => {
 const selected = Array.from(e.target.files || [])
 void handleProductImagesSelected(selected)
 e.target.value = ''
 }}
 />
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 {productImagePreviews.map((preview, index) => (
 <div key={`${preview}-${index}`} className="relative group">
 <img
 src={preview}
 alt={`Product photo ${index + 1}`}
 className="w-full h-28 object-cover rounded-lg border border-[#3d3d3d] bg-[#171717]"
 />
 {index === 0 && (
 <span className="absolute left-2 top-2 text-[10px] font-semibold uppercase tracking-wide bg-black/70 text-white px-1.5 py-0.5 rounded">
 Cover
 </span>
 )}
 <button
 type="button"
 onClick={() => removeProductImage(index)}
 className="absolute right-2 top-2 p-1 rounded-full bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
 aria-label="Remove photo"
 >
 <X className="w-3.5 h-3.5" />
 </button>
 </div>
 ))}
 {productImageFiles.length < MAX_PRODUCT_IMAGES && (
 <button
 type="button"
 onClick={() => fileInputRef.current?.click()}
 className="flex flex-col items-center justify-center h-28 rounded-lg border-2 border-dashed border-[#3d3d3d] bg-[#171717] text-[#b4b4b4] hover:border-primary-500 hover:text-[#ececec] transition-colors"
 >
 <Upload className="w-6 h-6 mb-1" />
 <span className="text-xs">{productImageFiles.length ? 'Add more' : isDigitalCategory(newProduct.category) ? 'Upload image' : 'Upload photos'}</span>
 </button>
 )}
 </div>
 <p className="text-xs text-[#8e8e8e] mt-2">
 {productImageFiles.length}/{MAX_PRODUCT_IMAGES} photos
 </p>
 </div>
 </>
 )}
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
 <Button onClick={handleSearchProducts} disabled={searching}>
 {searching ? (
 <ProcureXLoader size={24} label="Searching products" className="mr-2" />
 ) : (
 <Search className="w-4 h-4 mr-2" />
 )}
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
 price_mode: 'fixed',
 delivery_mode: '',
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
 {(product.price || isContactPriced(product)) ? (
 <p className="text-sm font-medium text-primary-600 mt-1">
 <PriceText amount={product.price} contact={isContactPriced(product)} />
 </p>
 ) : null}
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
 {effectivePriceMode(selectedSearchCategory, newProduct.price_mode) === 'contact' ? (
 <ContactPriceNote />
 ) : (
 <Input
 label={`Your Price (${currencyCode}) *`}
 type="number"
 min="0"
 step="0.01"
 required
 value={newProduct.price}
 onChange={(e) =>
 setNewProduct({ ...newProduct, price: parseFloat(e.target.value) || 0 })
 }
 helperText={newProduct.price > 0 ? `Listed in ${currencyCode}` : ''}
 />
 )}
 </div>
 {allowsContactForPrice(selectedSearchCategory) ? (
 <PricingModeToggle
 category={selectedSearchCategory}
 value={effectivePriceMode(selectedSearchCategory, newProduct.price_mode)}
 onChange={(mode) => setNewProduct({ ...newProduct, price_mode: mode })}
 />
 ) : null}
 {selectedSearchCategory === 'Service' ? (
 <DeliveryModeToggle
 value={newProduct.delivery_mode}
 vendorCountry={vendor?.country}
 onChange={(mode) => setNewProduct({ ...newProduct, delivery_mode: mode })}
 />
 ) : null}
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

 {searching && searchResults.length === 0 && (
 <div className="flex justify-center py-6">
 <ProcureXLoader size={24} label="Searching products" />
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
