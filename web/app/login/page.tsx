'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authAPI } from '@/lib/api'
import { useStore } from '@/lib/store'
import { mapSupabaseUser, persistVendorProfile, resolveVendorAccess, useAuth } from '@/lib/auth'
import { getAccessToken } from '@/lib/sessionToken'
import { showToast } from '@/lib/toast'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Logo from '@/components/Logo'

export default function LoginPage() {
 const [email, setEmail] = useState('')
 const [password, setPassword] = useState('')
 const [isLoading, setIsLoading] = useState(false)
 const router = useRouter()
 const { isAuthenticated, authReady, user } = useAuth()
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
 useStore.getState().setAccountView('buyer')
 }
 if (redirect.startsWith('/vendor') && isVendor) {
 useStore.getState().setAccountView('vendor')
 }
 router.push(redirect)
 return
 }
 if (isVendor) {
 useStore.getState().setAccountView('vendor')
 }
 router.push(isVendor ? '/vendor' : '/chat')
 }

 useEffect(() => {
   if (!authReady || !isAuthenticated) return
   let cancelled = false
   void (async () => {
     const token = await getAccessToken()
     if (cancelled || !token) return
     const resolved = await resolveVendorAccess(useStore.getState().user)
     if (cancelled) return
     useStore.getState().setHasVendorAccount(resolved.hasVendorAccount)
     if (resolved.user) setUser(resolved.user)
     goHome(resolved.hasVendorAccount || resolved.user?.role === 'vendor')
   })()
   return () => {
     cancelled = true
   }
 }, [authReady, isAuthenticated, user?.id])

 const handleLogin = async (e: React.FormEvent) => {
 e.preventDefault()
 setIsLoading(true)

 try {
 const loginData = await authAPI.login(email, password)
 const supabaseUser = loginData.user || (await authAPI.getMe())
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
 pending?.email &&
 pending.email.toLowerCase() === (user?.email || '').toLowerCase()
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
 personal_name: pending.personal_name,
 id_type: pending.id_type,
 id_number: pending.id_number,
 terms_accepted: Boolean(pending.terms_accepted),
 charge_vat: Boolean(pending.charge_vat),
 tin: pending.charge_vat ? pending.tin : undefined,
 tax_clearance_expires_at: pending.charge_vat ? pending.tax_clearance_expires_at : undefined,
 })
 const vendorUser = await persistVendorProfile(pending)
 if (vendorUser) setUser(vendorUser)
 useStore.getState().setHasVendorAccount(true)
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

 const resolved = await resolveVendorAccess(user)
 if (resolved.user) {
 setUser(resolved.user)
 user = resolved.user
 }
 useStore.getState().setHasVendorAccount(resolved.hasVendorAccount)
 const isVendor = resolved.hasVendorAccount || resolved.user?.role === 'vendor' || user?.role === 'vendor'
 showToast(isVendor ? 'Welcome back — opening your vendor dashboard.' : 'Login successful!', 'success')
 goHome(Boolean(isVendor))
 } catch (err: any) {
 console.error('Login error:', err)
 let message = 'Login failed'
 const status = Number(err?.status || err?.code || err?.response?.status || 0)
 const raw = String(err?.message || err?.error_description || '')
 
 if (status === 503 || status === 502 || status === 504 || /HTTP 503|upstream connect|service unavailable/i.test(raw)) {
 message = 'Sign-in is temporarily unavailable. Wait a minute and try again, and check that your Supabase project is not paused.'
 } else if (raw.includes('Invalid login credentials')) {
 message = 'Invalid email or password. Please try again.'
 } else if (raw.includes('Email not confirmed')) {
 message = 'Please check your email and confirm your account before signing in.'
 } else if (/network|fetch|Failed to fetch/i.test(raw)) {
 message = 'Network error. Please check your internet connection and try again.'
 } else if (raw) {
 message = raw
 } else if (err?.response?.data?.detail) {
 message = err.response.data.detail
 }
 
 showToast(message, 'error')
 } finally {
 setIsLoading(false)
 }
 }

 return (
 <div className="min-h-[calc(100dvh-3.5rem)] flex items-center justify-center bg-[#212121] py-8 px-4 sm:px-6">
 <div className="max-w-md w-full space-y-8 bg-[#2f2f2f] border border-[#3d3d3d] rounded-2xl shadow-2xl p-5 sm:p-10">
 <div>
 <div className="flex justify-center">
 <Logo className="h-10 sm:h-12" />
 </div>
 <h2 className="mt-4 sm:mt-6 text-center text-2xl sm:text-3xl font-extrabold text-white">
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
