const LIVE_SUPABASE_URL = 'https://tbxqhxxdshfylyxmsflw.supabase.co'
const STALE_PROJECT_REFS = new Set([
  'placeholder',
  'hgjuebpraxnmrmgogebr',
  'eugnepzbjrvqmzldhrql',
])

function projectRef(url: string) {
  try {
    return new URL(url).hostname.split('.')[0] || ''
  } catch {
    return ''
  }
}

export function getSupabaseUrl() {
  const raw = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  if (!raw || !raw.startsWith('https://')) return LIVE_SUPABASE_URL
  const ref = projectRef(raw)
  if (!ref || STALE_PROJECT_REFS.has(ref)) return LIVE_SUPABASE_URL
  return raw.replace(/\/+$/, '')
}

export function getSupabaseAnonKey() {
  return String(
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      ''
  ).trim()
}

export function isSupabaseEnvConfigured() {
  const url = getSupabaseUrl()
  const key = getSupabaseAnonKey()
  return (
    url.startsWith('https://') &&
    !url.includes('placeholder.supabase') &&
    Boolean(key) &&
    (key.startsWith('eyJ') || key.startsWith('sb_'))
  )
}
