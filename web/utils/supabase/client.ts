import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

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

function clearAuthCookies() {
  if (typeof document === 'undefined') return
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim()
    if (!name.startsWith('sb-') || !name.includes('auth-token')) continue
    document.cookie = `${name}=; Max-Age=0; path=/`
  }
}

function adoptCookieSessionIfNeeded() {
  const key = storageKey()
  if (key && !window.localStorage.getItem(key)) {
    const copied = parseCookieSession()
    if (copied) window.localStorage.setItem(key, copied)
  }
  clearAuthCookies()
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
        flowType: 'pkce',
      },
    })
  }

  return globalForSupabase.procurexLocalSupabase
}
