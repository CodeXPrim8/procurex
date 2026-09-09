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
 })
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
 } else if (formData.password.length < 6) {
 newErrors.password = 'Password must be at least 6 characters'
 }
 
 if (formData.password !== formData.confirmPassword) {
 newErrors.confirmPassword = 'Passwords do not match'
 }

 // Vendor-specific validation
 if (formData.role === 'vendor' && !formData.companyName.trim()) {
 newErrors.companyName = 'Company name is required for vendors'
 }
 
 setErrors(newErrors)
 return Object.keys(newErrors).length === 0
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
 business_registration_number: formData.businessRegistrationNumber || undefined,
 domain: formData.domain || undefined,
 phone: formData.phone || undefined,
 address: formData.address || undefined,
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
 business_registration_number: formData.businessRegistrationNumber || undefined,
 domain: formData.domain || undefined,
 phone: formData.phone || undefined,
 address: formData.address || undefined,
 email: formData.email,
 }
 localStorage.setItem('pending_vendor_registration', JSON.stringify(vendorData))
 showToast('Account created! Please check your email to confirm your account. After confirming, sign in to complete vendor registration.', 'info')
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
 business_registration_number: formData.businessRegistrationNumber || undefined,
 domain: formData.domain || undefined,
 phone: formData.phone || undefined,
 address: formData.address || undefined,
 email: formData.email,
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
 business_registration_number: formData.businessRegistrationNumber || undefined,
 domain: formData.domain || undefined,
 phone: formData.phone || undefined,
 address: formData.address || undefined,
 })
 const vendorUser = await persistVendorProfile({
 company_name: formData.companyName,
 business_registration_number: formData.businessRegistrationNumber || undefined,
 domain: formData.domain || undefined,
 phone: formData.phone || undefined,
 address: formData.address || undefined,
 })
 if (vendorUser) setUser(vendorUser)
 showToast('Vendor account created. Opening your dashboard.', 'success')
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
 <div className="min-h-screen flex items-center justify-center bg-[#212121] py-12 px-4 sm:px-6 lg:px-8">
 <div className="max-w-md w-full space-y-8 bg-[#2f2f2f] border border-[#3d3d3d] rounded-2xl shadow-2xl p-10">
 <div>
 <h2 className="mt-6 text-center text-3xl font-extrabold text-white">
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

 {/* Vendor-specific fields */}
 {formData.role === 'vendor' && (
 <div className="space-y-4 pt-4 border-t border-[#3d3d3d]">
 <p className="text-sm font-medium text-gray-300 mb-3">Vendor Information</p>
 <Input
 label="Company Name *"
 name="companyName"
 type="text"
 required
 value={formData.companyName}
 onChange={handleChange}
 error={errors.companyName}
 className="text-[#ececec]"
 placeholder="Enter your company name"
 />
 <Input
 label="Business Registration Number"
 name="businessRegistrationNumber"
 type="text"
 value={formData.businessRegistrationNumber}
 onChange={handleChange}
 error={errors.businessRegistrationNumber}
 className="text-[#ececec]"
 placeholder="Optional: Business registration number"
 />
 <Input
 label="Domain/Website"
 name="domain"
 type="text"
 value={formData.domain}
 onChange={handleChange}
 error={errors.domain}
 className="text-[#ececec]"
 placeholder="Optional: yourcompany.com"
 />
 <Input
 label="Phone Number"
 name="phone"
 type="tel"
 value={formData.phone}
 onChange={handleChange}
 error={errors.phone}
 className="text-[#ececec]"
 placeholder="Optional: +234 XXX XXX XXXX"
 />
 <div>
 <label className="block text-sm font-medium text-gray-300 mb-1">
 Address
 </label>
 <textarea
 name="address"
 value={formData.address}
 onChange={(e) => handleChange(e as any)}
 className="w-full px-4 py-2 border border-[#3d3d3d] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#19C37D] bg-[#2f2f2f] text-[#ececec] resize-none"
 rows={3}
 placeholder="Optional: Company address"
 />
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


