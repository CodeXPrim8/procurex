import { createClient as createBrowserSupabase, type SupabaseClient } from '@supabase/supabase-js'
import { createClient as createBrowserSSRClient } from '@/utils/supabase/client'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  ''

const isConfigured =
  Boolean(supabaseUrl) &&
  Boolean(supabaseKey) &&
  supabaseUrl.startsWith('https://') &&
  (supabaseKey.startsWith('eyJ') || supabaseKey.startsWith('sb_'))

if (!isConfigured && typeof window !== 'undefined') {
  console.error(
    'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.'
  )
}

/**
 * Browser Supabase client used by existing auth/chat code.
 * Prefers the SSR browser helper when configured; falls back to a
 * placeholder client during build so Next.js can still compile.
 */
export const supabase: SupabaseClient = isConfigured
  ? (createBrowserSSRClient() as unknown as SupabaseClient)
  : createBrowserSupabase(
      'https://placeholder.supabase.co',
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      }
    )

export const isSupabaseConfigured = isConfigured
