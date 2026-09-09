import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import { rememberAccessToken } from './sessionToken'
import { useStore, StoreUser } from './store'

export function hasVendorAccountMarkers(metadata: Record<string, any> = {}) {
  return Boolean(
    metadata.role === 'vendor' ||
    metadata.company_name ||
    metadata.business_registration_number ||
    metadata.domain
  )
}

export const mapSupabaseUser = (supabaseUser: SupabaseUser | null): StoreUser | null => {
  if (!supabaseUser) return null
  const metadata = supabaseUser.user_metadata || {}
  return {
    id: supabaseUser.id,
    email: supabaseUser.email || '',
    full_name: metadata.full_name || supabaseUser.email || undefined,
    role: hasVendorAccountMarkers(metadata) ? 'vendor' : metadata.role,
  }
}

export async function persistVendorProfile(profile: {
  company_name?: string
  business_registration_number?: string
  domain?: string
  phone?: string
  address?: string
}) {
  const metadata: Record<string, string> = { role: 'vendor' }
  if (profile.company_name) metadata.company_name = profile.company_name
  if (profile.business_registration_number) {
    metadata.business_registration_number = profile.business_registration_number
  }
  if (profile.domain) metadata.domain = profile.domain
  if (profile.phone) metadata.phone = profile.phone
  if (profile.address) metadata.address = profile.address

  const { data, error } = await supabase.auth.updateUser({ data: metadata })
  if (error) {
    console.error('Failed to persist vendor profile on auth account:', error)
    return null
  }
  return mapSupabaseUser(data.user)
}

export async function syncVendorRole(user: StoreUser | null): Promise<StoreUser | null> {
  if (!user) return user
  if (user.role === 'vendor') return user
  try {
    const { vendorsAPI } = await import('./api')
    const vendor = await vendorsAPI.getMyVendor()
    if (!vendor?.company_name) return user
    const restored = await persistVendorProfile({
      company_name: vendor.company_name,
      business_registration_number: vendor.business_registration_number,
      domain: vendor.domain,
      phone: vendor.phone,
      address: vendor.address,
    })
    return restored || { ...user, role: 'vendor' }
  } catch {
    return user
  }
}

export async function persistBuyerRole() {
  const { data, error } = await supabase.auth.updateUser({ data: { role: 'buyer' } })
  if (error) {
    console.error('Failed to restore buyer role on auth account:', error)
    return null
  }
  return mapSupabaseUser(data.user)
}

export function useAuth() {
  const { user, isAuthenticated, setUser, authReady, setAuthReady } = useStore()

  useEffect(() => {
    let mounted = true
    const init = async () => {
      try {
        console.log('🔍 Initializing auth...')
        const { data, error } = await supabase.auth.getSession()
        if (!mounted) return
        if (error) {
          console.warn('getSession warning:', error.message)
        }
        let session = data?.session
        if (!session?.access_token) {
          const { data: userData } = await supabase.auth.getUser()
          if (userData?.user) {
            const refreshed = await supabase.auth.getSession()
            session = refreshed.data.session ?? session
          }
        }
        if (!session?.access_token) {
          try {
            const refreshed = await supabase.auth.refreshSession()
            session = refreshed.data.session ?? session
          } catch (refreshError) {
            console.warn('Could not refresh session:', refreshError)
          }
        }
        if (session?.access_token) {
          rememberAccessToken(session.access_token)
        }
        console.log('✅ Auth initialized successfully', session ? '(user logged in)' : '(no session)')
        const mapped = mapSupabaseUser(session?.user ?? null)
        const metadata = session?.user?.user_metadata || {}
        if (mapped && metadata.role !== 'vendor' && hasVendorAccountMarkers(metadata)) {
          const restored = await persistVendorProfile({
            company_name: metadata.company_name,
            business_registration_number: metadata.business_registration_number,
            domain: metadata.domain,
            phone: metadata.phone,
            address: metadata.address,
          })
          if (!mounted) return
          setUser(restored || mapped)
        } else {
          const synced = await syncVendorRole(mapped)
          if (!mounted) return
          setUser(synced)
        }
        setAuthReady(true)
      } catch (error: any) {
        console.error('❌ Failed to initialize auth:', error)
        console.error('Error details:', {
          message: error?.message,
          stack: error?.stack
        })
        setAuthReady(true)
      }
    }
    init()

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.access_token) {
        rememberAccessToken(session.access_token)
      } else if (event === 'SIGNED_OUT') {
        rememberAccessToken(null)
      }
      if (mounted) {
        setUser(mapSupabaseUser(session?.user ?? null))
      }
    })

    return () => {
      mounted = false
      listener?.subscription?.unsubscribe()
    }
  }, [setUser, setAuthReady])

  return { user, isAuthenticated, authReady }
}

export function useRequireAuth() {
  const { user, isAuthenticated, authReady } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (authReady && !isAuthenticated) {
      router.push('/login')
    }
  }, [authReady, isAuthenticated, router])

  return { user, isAuthenticated }
}

