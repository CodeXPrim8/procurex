'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { authAPI, vendorsAPI } from '@/lib/api'
import { useStore } from '@/lib/store'
import { mapSupabaseUser, persistVendorProfile } from '@/lib/auth'
import { showToast } from '@/lib/toast'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Logo from '@/components/Logo'
import { VENDOR_ID_TYPES, validateVendorOnboarding, validateVendorVat } from '@/lib/vendorOnboarding'

export default function RegisterPage() {
 const searchParams = useSearchParams()
 const [formData, setFormData] = useState({
 email: '',
 password: '',
 confirmPassword: '',
 fullName: '',
 role: 'buyer' as 'buyer' | 'vendor',
 // Vendor-specific fields
 companyName: '',
 businessRegistrationNumber: '',
 domain: '',
 phone: '',
 address: '',
 personalName: '',
 idType: 'National ID (NIN)',
 idNumber: '',
 termsAccepted: false,
 chargeVat: false,
 tin: '',
 taxClearanceExpiresAt: '',
 })
 const [vatCertificate, setVatCertificate] = useState<File | null>(null)
 const [taxClearance, setTaxClearance] = useState<File | null>(null)
 const [errors, setErrors] = useState<Record<string, string>>({})
 const [isLoading, setIsLoading] = useState(false)
 const router = useRouter()
 const { setUser } = useStore()

 // Initialize form data from URL query parameters
 useEffect(() => {
 const email = searchParams.get('email') || ''
 const password = searchParams.get('password') || ''
 const confirmPassword = searchParams.get('confirmPassword') || ''
 const fullName = searchParams.get('fullName') || ''
 const role = (searchParams.get('role') || 'buyer') as 'buyer' | 'vendor'

 if (email || password || confirmPassword || fullName || role !== 'buyer') {
 setFormData(prev => ({
 ...prev,
 email,
 password,
 confirmPassword,
 fullName,
 role,
 }))
 }
 }, [searchParams])

 const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
 setFormData({ ...formData, [e.target.name]: e.target.value })
 if (errors[e.target.name]) {
 setErrors({ ...errors, [e.target.name]: '' })
 }
 }

 const validate = () => {
 const newErrors: Record<string, string> = {}
 
 if (!formData.email) {
 newErrors.email = 'Email is required'
 } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
 newErrors.email = 'Email is invalid'
 }
 
 if (!formData.password) {
 newErrors.password = 'Password is required'
 } else if (formData.role === 'vendor' && formData.password.length < 8) {
 newErrors.password = 'Vendor passwords must be at least 8 characters'
 } else if (formData.password.length < 6) {
 newErrors.password = 'Password must be at least 6 characters'
 }
 
 if (formData.password !== formData.confirmPassword) {
 newErrors.confirmPassword = 'Passwords do not match'
 }

 if (formData.role === 'vendor') {
 const vendorErrors = validateVendorOnboarding({
 companyName: formData.companyName,
 businessRegistrationNumber: formData.businessRegistrationNumber,
 phone: formData.phone,
 address: formData.address,
 personalName: formData.personalName || formData.fullName,
 idType: formData.idType,
 idNumber: formData.idNumber,
 termsAccepted: formData.termsAccepted,
 email: formData.email,
 })
 Object.assign(newErrors, vendorErrors)
 Object.assign(newErrors, validateVendorVat({
 chargeVat: formData.chargeVat,
 tin: formData.tin,
 taxClearanceExpiresAt: formData.taxClearanceExpiresAt,
 vatCertificate,
 taxClearance,
 }))
 if (!formData.fullName.trim()) newErrors.fullName = 'Enter your full name'
 }
 
 setErrors(newErrors)
 return Object.keys(newErrors).length === 0
 }

 const vatFields = () =>
 formData.chargeVat
 ? {
 charge_vat: true,
 tin: formData.tin,
 tax_clearance_expires_at: formData.taxClearanceExpiresAt || undefined,
 }
 : { charge_vat: false }

 const uploadVatDocuments = async () => {
 if (!formData.chargeVat) return
 try {
 if (vatCertificate) await vendorsAPI.uploadDocument(vatCertificate, 'vat_certificate')
 if (taxClearance) await vendorsAPI.uploadDocument(taxClearance, 'tax_clearance')
 } catch (uploadError) {
 console.error('VAT document upload failed:', uploadError)
 showToast('Your account is ready, but the VAT documents did not upload. Add them in BisonBook > Settings.', 'info')
 }
 }

 const handleSubmit = async (e: React.FormEvent) => {
 e.preventDefault()
 
 if (!validate()) {
 showToast('Please fix the errors in the form', 'error')
 return
 }

 setIsLoading(true)
 try {
 console.log('Starting registration...', { email: formData.email, role: formData.role })
 
 const registration = await authAPI.register(
 formData.email,
 formData.password,
 formData.fullName || undefined,
 formData.role,
 formData.role === 'vendor'
 ? {
 company_name: formData.companyName,
 business_registration_number: formData.businessRegistrationNumber,
 domain: formData.domain || undefined,
 phone: formData.phone,
 address: formData.address,
 personal_name: formData.personalName || formData.fullName,
 id_type: formData.idType,
 id_number: formData.idNumber,
 }
 : undefined
 )

 console.log('Registration response:', registration)

 // Check if email confirmation is required
 if (!registration.session && registration.user) {
 // Store vendor data in localStorage if vendor registration
 if (formData.role === 'vendor') {
 const vendorData = {
 company_name: formData.companyName,
 business_registration_number: formData.businessRegistrationNumber,
 domain: formData.domain || undefined,
 phone: formData.phone,
 address: formData.address,
 personal_name: formData.personalName || formData.fullName,
 id_type: formData.idType,
 id_number: formData.idNumber,
 terms_accepted: formData.termsAccepted,
 email: formData.email,
 ...vatFields(),
 }
 localStorage.setItem('pending_vendor_registration', JSON.stringify(vendorData))
 showToast(
 formData.chargeVat
 ? 'Account created! Confirm your email, sign in, then upload your VAT certificate and tax clearance in BisonBook > Settings.'
 : 'Account created! Please check your email to confirm your account. After confirming, sign in to complete vendor registration.',
 'info',
 )
 } else {
 showToast('Account created! Please check your email to confirm your account, then sign in.', 'info')
 }
 router.push('/login')
 return
 }

 // If no session and no user, something went wrong
 if (!registration.session && !registration.user) {
 showToast('Registration failed. Please try again.', 'error')
 return
 }

 // Get user info after successful registration
 let supabaseUser
 try {
 supabaseUser = await authAPI.getMe()
 console.log('User info:', supabaseUser)
 } catch (getMeError: any) {
 console.error('Error getting user info:', getMeError)
 // If getMe fails, user might need to confirm email first
 if (registration.user) {
 if (formData.role === 'vendor') {
 const vendorData = {
 company_name: formData.companyName,
 business_registration_number: formData.businessRegistrationNumber,
 domain: formData.domain || undefined,
 phone: formData.phone,
 address: formData.address,
 personal_name: formData.personalName || formData.fullName,
 id_type: formData.idType,
 id_number: formData.idNumber,
 terms_accepted: formData.termsAccepted,
 email: formData.email,
 ...vatFields(),
 }
 localStorage.setItem('pending_vendor_registration', JSON.stringify(vendorData))
 showToast('Account created! Please check your email to confirm your account. After confirming, sign in to complete vendor registration.', 'info')
 } else {
 showToast('Account created! Please check your email to confirm your account, then sign in.', 'info')
 }
 router.push('/login')
 return
 }
 throw getMeError
 }

 const user = mapSupabaseUser(supabaseUser)
 setUser(user)
 
 // If vendor role, register vendor account
 if (formData.role === 'vendor') {
 try {
 console.log('Registering vendor account...', {
 company_name: formData.companyName,
 })
 await vendorsAPI.register({
 company_name: formData.companyName,
 business_registration_number: formData.businessRegistrationNumber,
 domain: formData.domain || undefined,
 phone: formData.phone,
 address: formData.address,
 personal_name: formData.personalName || formData.fullName,
 id_type: formData.idType,
 id_number: formData.idNumber,
 terms_accepted: formData.termsAccepted,
 ...vatFields(),
 })
 await uploadVatDocuments()
 const vendorUser = await persistVendorProfile({
 company_name: formData.companyName,
 business_registration_number: formData.businessRegistrationNumber,
 domain: formData.domain || undefined,
 phone: formData.phone,
 address: formData.address,
 personal_name: formData.personalName || formData.fullName,
 id_type: formData.idType,
 id_number: formData.idNumber,
 })
 if (vendorUser) setUser(vendorUser)
 showToast('Vendor application started. Upload documents so ProcureX can verify your business.', 'success')
 router.push('/vendor')
 return
 } catch (vendorError: any) {
 console.error('Vendor registration error:', vendorError)
 // If vendor registration fails, user is still logged in
 const errorMsg = vendorError?.response?.data?.detail || vendorError?.message || 'Failed to create vendor account'
 
 // If it's a duplicate vendor error, just redirect (they already have one)
 if (errorMsg.includes('already has a vendor account')) {
 showToast('Vendor account already exists. Redirecting to vendor dashboard.', 'info')
 router.push('/vendor')
 return
 }
 
 showToast(errorMsg, 'error')
 // Still redirect to vendor page where they can try again
 router.push('/vendor')
 return
 }
 }
 
 showToast('Registration successful!', 'success')
 router.push('/chat')
 } catch (error: any) {
 console.error('Registration error:', error)
 console.error('Error details:', {
 message: error?.message,
 name: error?.name,
 status: error?.status,
 code: error?.code,
 cause: error?.cause
 })
 
 // Provide more helpful error messages
 let message = 'Registration failed. Please try again.'
 
 if (error?.message) {
 message = error.message
 
 // Common Supabase errors
 if (error.message.includes('User already registered') || error.message.includes('already registered')) {
 message = 'This email is already registered. Please sign in instead.'
 } else if (error.message.includes('Invalid email') || error.message.includes('invalid email')) {
 message = 'Please enter a valid email address.'
 } else if (error.message.includes('Password') || error.message.includes('password')) {
 message = 'Password must be at least 6 characters long.'
 } else if (error.message.includes('Supabase environment variables')) {
 message = 'Server configuration error. Please contact support.'
 } else if (error.message.includes('network') || error.message.includes('fetch') || error.message.includes('Network') || error.message.includes('Failed to fetch')) {
 // More specific network error messages
 if (error.message.includes('Failed to fetch') || error.code === 'ERR_NETWORK' || error.message.includes('ERR_NAME_NOT_RESOLVED') || error.message.includes('could not be resolved')) {
 message = 'Cannot connect to Supabase. Your Supabase project appears to be paused or deleted.\n\nTo fix this:\n1. Go to https://supabase.com/dashboard\n2. Check if your project is paused → Click "Restore"\n3. If project is deleted → Create a new project\n4. Update .env.local with new credentials\n5. Restart the server\n\nSee FIX-SUPABASE-NOW.md for detailed instructions.'
 } else {
 message = 'Network error. Please check your internet connection and try again.'
 }
 } else if (error.message.includes('JWT') || error.message.includes('API key') || error.message.includes('Invalid API key')) {
 message = 'Supabase API key is invalid. Please check your .env.local file and restart the server.'
 } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
 message = 'Request timed out. Supabase may be slow or unreachable. Please try again.'
 }
 } else if (error?.error_description) {
 message = error.error_description
 } else if (error?.response?.data?.detail) {
 message = error.response.data.detail
 } else if (error?.name === 'AuthApiError') {
 message = `Supabase authentication error: ${error.message || 'Please check your Supabase configuration.'}`
 }
 
 showToast(message, 'error')
 } finally {
 setIsLoading(false)
 }
 }

 return (
 <div className="min-h-[calc(100dvh-3.5rem)] flex items-center justify-center bg-[#212121] py-8 px-4 sm:px-6">
 <div className="max-w-lg w-full space-y-8 bg-[#2f2f2f] border border-[#3d3d3d] rounded-2xl shadow-2xl p-5 sm:p-10">
 <div>
 <div className="flex justify-center">
 <Logo className="h-10 sm:h-12" />
 </div>
 <h2 className="mt-4 sm:mt-6 text-center text-2xl sm:text-3xl font-extrabold text-white">
 Create your account
 </h2>
 <p className="mt-2 text-center text-sm text-gray-400">
 Or{' '}
 <Link href="/login" className="font-medium text-[#19C37D] hover:text-[#16A66F]">
 sign in to your existing account
 </Link>
 </p>
 </div>
 <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
 <div className="space-y-4">
 <Input
 label="Full Name"
 name="fullName"
 type="text"
 value={formData.fullName}
 onChange={handleChange}
 error={errors.fullName}
 className="text-[#ececec]"
 />
 
 <Input
 label="Email"
 name="email"
 type="email"
 required
 value={formData.email}
 onChange={handleChange}
 error={errors.email}
 autoComplete="email"
 className="text-[#ececec]"
 />
 
 <Input
 label="Password"
 name="password"
 type="password"
 required
 value={formData.password}
 onChange={handleChange}
 error={errors.password}
 className="text-[#ececec]"
 autoComplete="new-password"
 />
 
 <Input
 label="Confirm Password"
 name="confirmPassword"
 type="password"
 required
 value={formData.confirmPassword}
 onChange={handleChange}
 error={errors.confirmPassword}
 className="text-[#ececec]"
 autoComplete="new-password"
 />
 
 <div>
 <label className="block text-sm font-medium text-gray-300 mb-1">
 Account Type
 </label>
 <select
 name="role"
 value={formData.role}
 onChange={handleChange}
 className="w-full px-4 py-2 border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#19C37D] bg-[#2f2f2f] text-[#ececec]"
 >
 <option value="buyer">Buyer</option>
 <option value="vendor">Vendor</option>
 </select>
 </div>

 {formData.role === 'vendor' && (
 <div className="space-y-4 pt-4 border-t border-[#3d3d3d]">
 <div>
 <p className="text-sm font-medium text-gray-300">Business verification</p>
 <p className="text-xs text-[#8e8e8e] mt-1">
 Listings stay hidden from buyers until ProcureX reviews your identity documents.
 </p>
 </div>
 <Input
 label="Registered company name"
 name="companyName"
 type="text"
 required
 value={formData.companyName}
 onChange={handleChange}
 error={errors.companyName}
 className="text-[#ececec]"
 placeholder="Name on your CAC certificate"
 />
 <Input
 label="CAC / registration number"
 name="businessRegistrationNumber"
 type="text"
 required
 value={formData.businessRegistrationNumber}
 onChange={handleChange}
 error={errors.businessRegistrationNumber}
 className="text-[#ececec]"
 placeholder="RC123456 or BN1234567"
 />
 <Input
 label="Authorized officer"
 name="personalName"
 type="text"
 required
 value={formData.personalName}
 onChange={handleChange}
 error={errors.personalName}
 className="text-[#ececec]"
 placeholder="Full name of the person authorized to sell"
 />
 <div>
 <label className="block text-sm font-medium text-gray-300 mb-1">Government ID type</label>
 <select
 name="idType"
 value={formData.idType}
 onChange={handleChange}
 className="w-full px-4 py-2 border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#19C37D] bg-[#2f2f2f] text-[#ececec]"
 >
 {VENDOR_ID_TYPES.map((type) => (
 <option key={type} value={type}>{type}</option>
 ))}
 </select>
 {errors.idType ? <p className="mt-1 text-sm text-red-400">{errors.idType}</p> : null}
 </div>
 <Input
 label="ID number"
 name="idNumber"
 type="text"
 required
 value={formData.idNumber}
 onChange={handleChange}
 error={errors.idNumber}
 className="text-[#ececec]"
 placeholder="NIN, passport, or license number"
 />
 <Input
 label="Business phone"
 name="phone"
 type="tel"
 required
 value={formData.phone}
 onChange={handleChange}
 error={errors.phone}
 className="text-[#ececec]"
 placeholder="0801 234 5678"
 />
 <Input
 label="Website"
 name="domain"
 type="text"
 value={formData.domain}
 onChange={handleChange}
 error={errors.domain}
 className="text-[#ececec]"
 placeholder="Optional: yourcompany.com"
 />
 <div>
 <label className="block text-sm font-medium text-gray-300 mb-1">Business address</label>
 <textarea
 name="address"
 value={formData.address}
 onChange={(e) => handleChange(e as any)}
 className="w-full px-4 py-2 border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#19C37D] bg-[#2f2f2f] text-[#ececec] resize-none"
 rows={3}
 placeholder="Street, city, and state"
 />
 {errors.address ? <p className="mt-1 text-sm text-red-400">{errors.address}</p> : null}
 </div>
 <label className="flex items-start gap-2 text-sm text-[#b4b4b4]">
 <input
 type="checkbox"
 checked={formData.termsAccepted}
 onChange={(e) => {
 setFormData({ ...formData, termsAccepted: e.target.checked })
 if (errors.termsAccepted) setErrors({ ...errors, termsAccepted: '' })
 }}
 className="mt-1"
 />
 <span>I confirm these details are true, I am authorized to sell, and I will upload CAC, ID, and address proof before listing.</span>
 </label>
 {errors.termsAccepted ? <p className="text-sm text-red-400">{errors.termsAccepted}</p> : null}

 <div className="space-y-3 pt-4 border-t border-[#3d3d3d]">
 <div>
 <p className="text-sm font-medium text-gray-300">Tax and VAT</p>
 <p className="text-xs text-[#8e8e8e] mt-1">
 Will you charge VAT on your sales? To charge VAT you need a VAT certificate and a current tax clearance certificate (TCC).
 </p>
 </div>
 <div className="grid grid-cols-2 gap-2">
 {[
 { value: false, label: 'No, not yet' },
 { value: true, label: 'Yes, I charge VAT' },
 ].map((option) => (
 <button
 key={String(option.value)}
 type="button"
 onClick={() => setFormData({ ...formData, chargeVat: option.value })}
 className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
 formData.chargeVat === option.value
 ? 'border-[#19C37D] bg-[#19C37D]/10 text-white'
 : 'border-[#3d3d3d] text-[#b4b4b4] hover:border-[#8e8e8e]'
 }`}
 >
 {option.label}
 </button>
 ))}
 </div>
 {formData.chargeVat ? (
 <div className="space-y-3">
 <Input
 label="Tax Identification Number (TIN)"
 name="tin"
 type="text"
 required
 value={formData.tin}
 onChange={handleChange}
 error={errors.tin}
 className="text-[#ececec]"
 placeholder="e.g. 12345678-0001"
 />
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">VAT registration certificate<span className="text-red-500 ml-1">*</span></label>
 <input
 type="file"
 accept=".pdf,.jpg,.jpeg,.png,.webp"
 onChange={(e) => {
 setVatCertificate(e.target.files?.[0] || null)
 if (errors.vatCertificate) setErrors({ ...errors, vatCertificate: '' })
 }}
 className="block w-full text-sm text-[#b4b4b4] file:mr-3 file:rounded-lg file:border-0 file:bg-[#3d3d3d] file:px-3 file:py-2 file:text-[#ececec]"
 />
 {errors.vatCertificate ? <p className="mt-1 text-sm text-red-400">{errors.vatCertificate}</p> : null}
 </div>
 <div>
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">Tax clearance certificate (TCC)<span className="text-red-500 ml-1">*</span></label>
 <input
 type="file"
 accept=".pdf,.jpg,.jpeg,.png,.webp"
 onChange={(e) => {
 setTaxClearance(e.target.files?.[0] || null)
 if (errors.taxClearance) setErrors({ ...errors, taxClearance: '' })
 }}
 className="block w-full text-sm text-[#b4b4b4] file:mr-3 file:rounded-lg file:border-0 file:bg-[#3d3d3d] file:px-3 file:py-2 file:text-[#ececec]"
 />
 {errors.taxClearance ? <p className="mt-1 text-sm text-red-400">{errors.taxClearance}</p> : null}
 </div>
 <Input
 label="TCC expiry date"
 name="taxClearanceExpiresAt"
 type="date"
 required
 value={formData.taxClearanceExpiresAt}
 onChange={handleChange}
 error={errors.taxClearanceExpiresAt}
 className="text-[#ececec]"
 />
 <p className="text-xs text-[#8e8e8e]">
 ProcureX reviews these documents. Until they are approved, your invoices and quotes are issued without VAT.
 </p>
 </div>
 ) : (
 <p className="text-xs text-[#8e8e8e]">
 You will sell without VAT. When you get your VAT certificate and tax clearance, upload them in BisonBook &gt; Settings to start charging VAT.
 </p>
 )}
 </div>
 </div>
 )}
 </div>

 <p className="text-sm text-gray-400 text-center">
 After creating an account, check your email inbox for a confirmation link before signing in.
 </p>

 <Button type="submit" isLoading={isLoading} className="w-full bg-[#19C37D] hover:bg-[#16A66F] text-white">
 Register
 </Button>
 </form>
 </div>
 </div>
 )
}


