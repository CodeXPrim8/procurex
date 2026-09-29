import { createClient as createBrowserSupabase, type SupabaseClient } from '@supabase/supabase-js'
import { createClient as createBrowserSSRClient } from '@/utils/supabase/client'
import { getSupabaseAnonKey, getSupabaseUrl, isSupabaseEnvConfigured } from '@/lib/supabaseEnv'

const supabaseUrl = getSupabaseUrl()
const supabaseKey = getSupabaseAnonKey()
const isConfigured = isSupabaseEnvConfigured()

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
      supabaseUrl || 'https://placeholder.supabase.co',
      supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      }
    )

export const isSupabaseConfigured = isConfigured
