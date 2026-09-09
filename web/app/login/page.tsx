'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authAPI } from '@/lib/api'
import { useStore } from '@/lib/store'
import { hasVendorAccountMarkers, mapSupabaseUser, persistVendorProfile, syncVendorRole } from '@/lib/auth'
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

 const goHome = (isVendor: boolean) => {
 const redirect = sessionStorage.getItem('redirect_after_login')
 if (redirect) {
 sessionStorage.removeItem('redirect_after_login')
 if (redirect.startsWith('/vendor') && !isVendor) {
 router.push('/chat')
 return
 }
 if (redirect.startsWith('/chat') && isVendor) {
 router.push('/vendor')
 return
 }
 router.push(redirect)
 return
 }
 router.push(isVendor ? '/vendor' : '/chat')
 }

 const handleLogin = async (e: React.FormEvent) => {
 e.preventDefault()
 setIsLoading(true)

 try {
 await authAPI.login(email, password)
 const supabaseUser = await authAPI.getMe()
 const metadata = supabaseUser?.user_metadata || {}
 let user = mapSupabaseUser(supabaseUser)
 setUser(user)

 const pendingRaw = localStorage.getItem('pending_vendor_registration')
 let pending: any = null
 if (pendingRaw) {
 try {
 pending = JSON.parse(pendingRaw)
 } catch {
 localStorage.removeItem('pending_vendor_registration')
 }
 }
 const pendingForThisUser = Boolean(
 pending &&
 (!pending.email || pending.email.toLowerCase() === (user?.email || '').toLowerCase())
 )

 if (pendingForThisUser) {
 try {
 const { vendorsAPI } = await import('@/lib/api')
 await vendorsAPI.register({
 company_name: pending.company_name,
 business_registration_number: pending.business_registration_number,
 domain: pending.domain,
 phone: pending.phone,
 address: pending.address,
 })
 const vendorUser = await persistVendorProfile(pending)
 if (vendorUser) setUser(vendorUser)
 localStorage.removeItem('pending_vendor_registration')
 showToast('Welcome back — opening your vendor dashboard.', 'success')
 router.push('/vendor')
 return
 } catch (vendorError: any) {
 console.error('Error completing vendor registration:', vendorError)
 localStorage.removeItem('pending_vendor_registration')
 }
 } else if (pendingRaw) {
 localStorage.removeItem('pending_vendor_registration')
 }

 const isVendor = hasVendorAccountMarkers(metadata)
 if (isVendor && metadata.role !== 'vendor') {
 const vendorUser = await persistVendorProfile({
 company_name: metadata.company_name,
 business_registration_number: metadata.business_registration_number,
 domain: metadata.domain,
 phone: metadata.phone,
 address: metadata.address,
 })
 if (vendorUser) {
 setUser(vendorUser)
 user = vendorUser
 }
 } else if (!isVendor) {
 const synced = await syncVendorRole(user)
 if (synced) {
 setUser(synced)
 user = synced
 }
 }

 const vendorAccount = (user?.role === 'vendor') || hasVendorAccountMarkers(metadata)
 showToast(vendorAccount ? 'Welcome back — opening your vendor dashboard.' : 'Login successful!', 'success')
 goHome(Boolean(vendorAccount))
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
