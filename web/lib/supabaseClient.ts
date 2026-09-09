import { createClient, SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const isConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseAnonKey) &&
  supabaseUrl.startsWith('https://') &&
  supabaseAnonKey.startsWith('eyJ')

if (!isConfigured && typeof window !== 'undefined') {
  console.error(
    'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
  )
}

// Use placeholders during build/SSR when env vars are missing so the app can still compile.
export const supabase: SupabaseClient = createClient(
  isConfigured ? supabaseUrl : 'https://placeholder.supabase.co',
  isConfigured ? supabaseAnonKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder',
  {
    auth: {
      autoRefreshToken: isConfigured,
      persistSession: isConfigured,
      detectSessionInUrl: isConfigured,
    },
    global: {
      headers: {
        'x-client-info': 'procurex-web',
      },
    },
  }
)

export const isSupabaseConfigured = isConfigured
