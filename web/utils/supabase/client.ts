import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseAnonKey, getSupabaseUrl } from '@/lib/supabaseEnv'

const supabaseUrl = getSupabaseUrl()
const supabaseKey = getSupabaseAnonKey()

const globalForSupabase = globalThis as unknown as {
  procurexLocalSupabase?: SupabaseClient
}

function projectRef() {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0]
  } catch {
    return ''
  }
}

function storageKey() {
  return `sb-${projectRef()}-auth-token`
}

function parseCookieSession(): string | null {
  if (typeof document === 'undefined') return null
  const prefix = storageKey()
  const chunks: { name: string; value: string }[] = []
  for (const raw of document.cookie.split(';')) {
    const trimmed = raw.trim()
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const name = trimmed.slice(0, eq)
    if (name !== prefix && !name.startsWith(`${prefix}.`)) continue
    chunks.push({ name, value: decodeURIComponent(trimmed.slice(eq + 1)) })
  }
  if (!chunks.length) return null
  chunks.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  let combined = chunks.map((chunk) => chunk.value).join('')
  try {
    if (combined.startsWith('base64-')) {
      combined = atob(combined.slice(7))
    }
    const parsed = JSON.parse(combined)
    const session = parsed?.currentSession || parsed
    if (!session?.access_token || !session?.refresh_token) return null
    return JSON.stringify(session)
  } catch {
    return null
  }
}

function adoptCookieSessionIfNeeded() {
  if (typeof window === 'undefined') return
  const key = storageKey()
  if (!key || window.localStorage.getItem(key)) return
  const fromCookie = parseCookieSession()
  if (fromCookie) window.localStorage.setItem(key, fromCookie)
}

export function createClient() {
  if (typeof window === 'undefined') {
    return createSupabaseClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    })
  }

  if (!globalForSupabase.procurexLocalSupabase) {
    adoptCookieSessionIfNeeded()
    globalForSupabase.procurexLocalSupabase = createSupabaseClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
        storageKey: storageKey() || undefined,
        flowType: 'pkce',
      },
    })
    void globalForSupabase.procurexLocalSupabase.auth.startAutoRefresh()
  }

  return globalForSupabase.procurexLocalSupabase
}
