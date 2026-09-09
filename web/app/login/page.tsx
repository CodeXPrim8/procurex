'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authAPI } from '@/lib/api'
import { useStore } from '@/lib/store'
import { mapSupabaseUser } from '@/lib/auth'
import { showToast } from '@/lib/toast'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

export default function LoginPage() {
 const [email, setEmail] = useState('')
 const [password, setPassword] = useState('')
 const [isLoading, setIsLoading] = useState(false)
 const router = useRouter()
 const { setUser } = useStore()
 
 // Get redirect URL from query params
 useEffect(() => {
 const params = new URLSearchParams(window.location.search)
 const redirect = params.get('redirect')
 if (redirect && typeof window !== 'undefined') {
 // Store redirect for after login
 sessionStorage.setItem('redirect_after_login', redirect)
 }
 }, [])

 const handleLogin = async (e: React.FormEvent) => {
 e.preventDefault()
 setIsLoading(true)

 try {
 await authAPI.login(email, password)
 const supabaseUser = await authAPI.getMe()
 const user = mapSupabaseUser(supabaseUser)
 setUser(user)
 
 // Check for pending vendor registration
 const pendingVendorData = localStorage.getItem('pending_vendor_registration')
 if (pendingVendorData && user?.role === 'vendor') {
 try {
 const vendorData = JSON.parse(pendingVendorData)
 const { vendorsAPI } = await import('@/lib/api')
 await vendorsAPI.register({
 company_name: vendorData.company_name,
 business_registration_number: vendorData.business_registration_number,
 domain: vendorData.domain,
 phone: vendorData.phone,
 address: vendorData.address,
 })
 localStorage.removeItem('pending_vendor_registration')
 showToast('Vendor account completed successfully!', 'success')
 router.push('/vendor')
 return
 } catch (vendorError: any) {
 console.error('Error completing vendor registration:', vendorError)
 // If vendor already exists, just clear the pending data
 if (vendorError?.response?.data?.detail?.includes('already has a vendor account')) {
 localStorage.removeItem('pending_vendor_registration')
 showToast('Vendor account already exists. Redirecting to vendor dashboard.', 'info')
 router.push('/vendor')
 return
 }
 // Otherwise, show error but still allow login
 showToast('Login successful, but vendor registration failed. You can complete it on the vendor page.', 'warning')
 }
 }
 
 showToast('Login successful!', 'success')
 
 // Check for redirect URL first
 const redirect = sessionStorage.getItem('redirect_after_login')
 if (redirect) {
 sessionStorage.removeItem('redirect_after_login')
 router.push(redirect)
 return
 }
 
 // Redirect based on user role
 if (user?.role === 'vendor') {
 router.push('/vendor')
 } else {
 router.push('/chat')
 }
 } catch (err: any) {
 console.error('Login error:', err)
 let message = 'Login failed'
 
 if (err?.message) {
 message = err.message
 // Common Supabase errors
 if (err.message.includes('Invalid login credentials')) {
 message = 'Invalid email or password. Please try again.'
 } else if (err.message.includes('Email not confirmed')) {
 message = 'Please check your email and confirm your account before signing in.'
 } else if (err.message.includes('network') || err.message.includes('fetch')) {
 message = 'Network error. Please check your internet connection and try again.'
 }
 } else if (err?.error_description) {
 message = err.error_description
 } else if (err?.response?.data?.detail) {
 message = err.response.data.detail
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
 Sign in to your account
 </h2>
 <p className="mt-2 text-center text-sm text-gray-400">
 Or{' '}
 <Link href="/register" className="font-medium text-[#19C37D] hover:text-[#16A66F]">
 create a new account
 </Link>
 </p>
 </div>
 <form className="mt-8 space-y-6" onSubmit={handleLogin}>
 <div className="space-y-4">
 <Input
 label="Email"
 name="email"
 type="email"
 required
 value={email}
 onChange={(e) => setEmail(e.target.value)}
 autoComplete="username"
 className="text-[#ececec]"
 />
 <Input
 label="Password"
 name="password"
 type="password"
 required
 value={password}
 onChange={(e) => setPassword(e.target.value)}
 autoComplete="current-password"
 className="text-[#ececec]"
 />
 </div>

 <Button type="submit" isLoading={isLoading} className="w-full bg-[#19C37D] hover:bg-[#16A66F] text-white">
 Sign in
 </Button>
 </form>
 </div>
 </div>
 )
}

