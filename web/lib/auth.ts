import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import {
  rememberAccessToken,
  hasStoredAuth,
  getMemoryAccessToken,
  hasClientClockSkew,
  stopRefreshIfClockSkew,
  tokenExpLeft,
} from './sessionToken'
import { useStore, StoreUser } from './store'
import { debugAuthLog, debugAuthStorageSnapshot } from './debugAuthLog'
import { hydrateTtsVoiceFromAccount, normalizeTtsVoiceId } from './ttsVoices'

export function hasVendorAccountMarkers(metadata: Record<string, any> = {}) {
  return metadata.role === 'vendor'
}

export function isVendorUser(user?: { role?: string } | null) {
  return Boolean(user && (user.role === 'vendor' || useStore.getState().hasVendorAccount))
}

export function useIsVendor() {
  const user = useStore((state) => state.user)
  const hasVendorAccount = useStore((state) => state.hasVendorAccount)
  return Boolean(user && (hasVendorAccount || user.role === 'vendor'))
}

export const SUPERADMIN_EMAIL = 'stepheniwewezinem@gmail.com'

export function isSuperAdmin(user?: { email?: string } | null) {
  return String(user?.email || '').trim().toLowerCase() === SUPERADMIN_EMAIL
}

export function isAdminUser(user?: { email?: string; role?: string } | null) {
  return isSuperAdmin(user)
}

export function accountRoleLabel(user?: { email?: string; role?: string } | null) {
  if (isSuperAdmin(user)) return 'superadmin'
  return user?.role || 'buyer'
}

export async function resolveVendorAccess(user: StoreUser | null): Promise<{
  user: StoreUser | null
  hasVendorAccount: boolean
}> {
  if (!user) return { user, hasVendorAccount: false }
  const fromRole = user.role === 'vendor'
  if (!fromRole) return { user, hasVendorAccount: false }
  try {
    const { vendorsAPI } = await import('./api')
    const vendor = await vendorsAPI.getMyVendor()
    return { user, hasVendorAccount: Boolean(vendor?.company_name) }
  } catch (error: any) {
    if (error?.response?.status === 404) {
      return { user, hasVendorAccount: true }
    }
    return { user, hasVendorAccount: true }
  }
}

export const mapSupabaseUser = (supabaseUser: SupabaseUser | null): StoreUser | null => {
  if (!supabaseUser) return null
  const metadata = supabaseUser.user_metadata || {}
  return {
    id: supabaseUser.id,
    email: supabaseUser.email || '',
    full_name: metadata.full_name || supabaseUser.email || undefined,
    role: hasVendorAccountMarkers(metadata) ? 'vendor' : (metadata.role || 'buyer'),
    tts_voice: metadata.tts_voice ? normalizeTtsVoiceId(metadata.tts_voice) : undefined,
  }
}

export async function persistVendorProfile(profile: {
  company_name?: string
  business_registration_number?: string
  domain?: string
  phone?: string
  address?: string
  personal_name?: string
  id_type?: string
  id_number?: string
}) {
  const metadata: Record<string, string> = { role: 'vendor' }
  if (profile.company_name) metadata.company_name = profile.company_name
  if (profile.business_registration_number) {
    metadata.business_registration_number = profile.business_registration_number
  }
  if (profile.domain) metadata.domain = profile.domain
  if (profile.phone) metadata.phone = profile.phone
  if (profile.address) metadata.address = profile.address
  if (profile.personal_name) metadata.personal_name = profile.personal_name
  if (profile.id_type) metadata.id_type = profile.id_type
  if (profile.id_number) metadata.id_number = profile.id_number

  const { data, error } = await supabase.auth.updateUser({ data: metadata })
  if (error) {
    console.error('Failed to persist vendor profile on auth account:', error)
    return null
  }
  return mapSupabaseUser(data.user)
}

export async function syncVendorRole(user: StoreUser | null): Promise<StoreUser | null> {
  const resolved = await resolveVendorAccess(user)
  useStore.getState().setHasVendorAccount(resolved.hasVendorAccount)
  return resolved.user
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
  const { user, isAuthenticated, setUser, authReady, setAuthReady, setHasVendorAccount } = useStore()

  useEffect(() => {
    let mounted = true

    const applySessionUser = (session: { access_token?: string; user?: SupabaseUser | null } | null) => {
      if (session?.access_token) {
        rememberAccessToken(session.access_token)
        void stopRefreshIfClockSkew(session.access_token)
      }
      const mapped = mapSupabaseUser(session?.user ?? null)
      if (mapped && mounted) {
        hydrateTtsVoiceFromAccount(mapped)
        setUser(mapped)
        void import('./cloudWorkspace').then(({ hydrateAccountWorkspace }) =>
          hydrateAccountWorkspace().catch(() => null)
        )
      }
    }

    const recoverSession = async (clearIfMissing = false) => {
      try {
        if (!clearIfMissing && getMemoryAccessToken() && useStore.getState().user) {
          return true
        }
        const { data } = await supabase.auth.getSession()
        if (!mounted) return Boolean(data?.session?.user)
        if (data?.session?.user) {
          applySessionUser(data.session)
          return true
        }
        try {
          const refreshed = await supabase.auth.refreshSession()
          if (!mounted) return Boolean(refreshed.data?.session?.user)
          if (refreshed.data?.session?.user) {
            applySessionUser(refreshed.data.session)
            return true
          }
        } catch {
          // no recoverable supabase session
        }
        if (clearIfMissing && !hasStoredAuth()) {
          // #region agent log
          debugAuthLog(
            'auth.ts:recoverSession',
            'clearIfMissing with no session',
            {
              ...debugAuthStorageSnapshot(),
              hadUser: Boolean(useStore.getState().user),
            },
            'A'
          )
          // #endregion
          rememberAccessToken(null)
          setUser(null)
        }
        return false
      } catch (error: any) {
        console.warn('Could not recover auth session:', error?.message || error)
        return false
      }
    }

    const waitForHydration = () =>
      new Promise<void>((resolve) => {
        const api = useStore as typeof useStore & {
          persist?: {
            hasHydrated: () => boolean
            onFinishHydration: (cb: () => void) => () => void
          }
        }
        if (!api.persist || api.persist.hasHydrated()) {
          resolve()
          return
        }
        const unsub = api.persist.onFinishHydration(() => {
          unsub?.()
          resolve()
        })
      })

    const init = async () => {
      try {
        await waitForHydration()
        const recovered = await recoverSession(false)
        if (!recovered && !hasStoredAuth() && mounted && !useStore.getState().user) {
          rememberAccessToken(null)
        }
        // #region agent log
        debugAuthLog(
          'auth.ts:init',
          'getSession result',
          {
            ...debugAuthStorageSnapshot(),
            hasSession: recovered,
            hasUser: Boolean(useStore.getState().user),
            error: null,
          },
          'B'
        )
        // #endregion
      } catch (error: any) {
        console.error('Failed to initialize auth:', error)
      } finally {
        if (mounted) setAuthReady(true)
      }
    }
    void init()

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      // #region agent log
      debugAuthLog(
        'auth.ts:onAuthStateChange',
        String(event || 'unknown'),
        {
          ...debugAuthStorageSnapshot(),
          hasSession: Boolean(session?.access_token),
          hasUser: Boolean(session?.user?.id),
        },
        event === 'SIGNED_OUT' ? 'A' : 'B'
      )
      // #endregion
      if (session?.access_token) {
        rememberAccessToken(session.access_token)
      }
      if (!mounted) return
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION') {
        if (session?.user) applySessionUser(session)
        return
      }
      if (event === 'SIGNED_OUT') {
        if (hasClientClockSkew() && getMemoryAccessToken()) {
          // #region agent log
          debugAuthLog(
            'auth.ts:onAuthStateChange',
            'ignored SIGNED_OUT during clock skew',
            {
              ...debugAuthStorageSnapshot(),
              expLeft: tokenExpLeft(getMemoryAccessToken()),
            },
            'A'
          )
          // #endregion
          return
        }
        window.setTimeout(() => {
          void recoverSession(true)
        }, 800)
        return
      }
      if (session?.user) {
        applySessionUser(session)
      }
    })

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      void recoverSession(false)
    }
    const onOnline = () => {
      void recoverSession(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('online', onOnline)

    return () => {
      mounted = false
      listener?.subscription?.unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [setUser, setAuthReady])

  useEffect(() => {
    if (!authReady) return
    if (!user) {
      setHasVendorAccount(false)
      return
    }
    if (user.role === 'vendor') {
      setHasVendorAccount(true)
    }
    let cancelled = false
    void resolveVendorAccess(user).then((result) => {
      if (cancelled) return
      setHasVendorAccount(result.hasVendorAccount)
      if (result.user && result.user.role !== user.role) {
        setUser(result.user)
      }
    })
    return () => {
      cancelled = true
    }
  }, [authReady, user, setHasVendorAccount, setUser])

  return { user, isAuthenticated, authReady }
}

export function useRequireAuth() {
  const { user, isAuthenticated, authReady } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (authReady && !isAuthenticated) {
      // #region agent log
      debugAuthLog(
        'auth.ts:useRequireAuth',
        'redirect to login',
        debugAuthStorageSnapshot(),
        'D'
      )
      // #endregion
      router.push('/login')
    }
  }, [authReady, isAuthenticated, router])

  return { user, isAuthenticated }
}
