import { supabase } from './supabaseClient'
import { debugAuthLog } from './debugAuthLog'

let memoryAccessToken: string | null = null
let readLock: Promise<string | null> | null = null
let clientClockSkew = false
let stoppedAutoRefresh = false

export function rememberAccessToken(token: string | null) {
  memoryAccessToken = token
}

export function getMemoryAccessToken() {
  return memoryAccessToken
}

export function hasClientClockSkew() {
  return clientClockSkew
}

export function decodeJwtExp(token: string): number | null {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const padded = part.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((part.length + 3) % 4)
    const payload = JSON.parse(atob(padded))
    return typeof payload.exp === 'number' ? payload.exp : null
  } catch {
    return null
  }
}

export function tokenExpLeft(token: string | null): number | null {
  if (!token) return null
  const exp = decodeJwtExp(token)
  if (exp == null) return null
  return Math.round(exp - Date.now() / 1000)
}

export async function stopRefreshIfClockSkew(token: string | null) {
  const expLeft = tokenExpLeft(token)
  if (expLeft == null || expLeft > -120) return
  clientClockSkew = true
  if (stoppedAutoRefresh) return
  stoppedAutoRefresh = true
  try {
    await supabase.auth.stopAutoRefresh()
  } catch {
    // ignore
  }
  // #region agent log
  debugAuthLog(
    'sessionToken.ts:clockSkew',
    'stopped auto refresh; client clock behind jwt exp',
    { expLeft, hasToken: Boolean(token) },
    'A'
  )
  // #endregion
}

async function readStoredToken(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (token) {
      memoryAccessToken = token
      return token
    }
  } catch (error) {
    console.warn('Could not read auth session:', error)
  }
  return memoryAccessToken
}

export async function ensureFreshSession(): Promise<string | null> {
  if (memoryAccessToken) return memoryAccessToken
  if (readLock) return readLock
  readLock = (async () => {
    try {
      // #region agent log
      debugAuthLog(
        'sessionToken.ts:ensureFreshSession',
        'read stored session',
        {
          hadMemory: Boolean(memoryAccessToken),
          expLeft: tokenExpLeft(memoryAccessToken),
          clockSkew: clientClockSkew,
        },
        'A'
      )
      // #endregion
      const stored = await readStoredToken()
      if (stored) {
        // #region agent log
        debugAuthLog(
          'sessionToken.ts:ensureFreshSession:result',
          'stored token result',
          { hasToken: true, expLeft: tokenExpLeft(stored), clockSkew: clientClockSkew },
          'I'
        )
        // #endregion
        return stored
      }
      if (typeof window !== 'undefined') {
        try {
          const { data } = await supabase.auth.refreshSession()
          const token = data?.session?.access_token || null
          if (token) {
            memoryAccessToken = token
            // #region agent log
            debugAuthLog(
              'sessionToken.ts:ensureFreshSession:result',
              'refresh recovered token',
              { hasToken: true, expLeft: tokenExpLeft(token), clockSkew: clientClockSkew },
              'I'
            )
            // #endregion
            return token
          }
        } catch {
          // keep going with no token
        }
      }
      // #region agent log
      debugAuthLog(
        'sessionToken.ts:ensureFreshSession:result',
        'stored token result',
        { hasToken: false, expLeft: null, clockSkew: clientClockSkew },
        'I'
      )
      // #endregion
      return stored
    } finally {
      readLock = null
    }
  })()
  return readLock
}

export async function getAccessToken(): Promise<string | null> {
  return memoryAccessToken || ensureFreshSession()
}

export async function hasLiveSession(): Promise<boolean> {
  return Boolean(memoryAccessToken || (await ensureFreshSession()))
}

export function hasStoredAuth() {
  if (typeof window === 'undefined') return false
  return Object.keys(window.localStorage).some((key) => {
    if (!key.startsWith('sb-') || !key.includes('auth-token')) return false
    return Boolean(window.localStorage.getItem(key))
  })
}
