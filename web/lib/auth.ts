import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import type { User as SupabaseUser } from '@supabase/supabase-js'
import { supabase } from './supabaseClient'
import { useStore, StoreUser } from './store'

export const mapSupabaseUser = (supabaseUser: SupabaseUser | null): StoreUser | null => {
  if (!supabaseUser) return null
  const metadata = supabaseUser.user_metadata || {}
  return {
    id: supabaseUser.id,
    email: supabaseUser.email || '',
    full_name: metadata.full_name || supabaseUser.email || undefined,
    role: metadata.role,
  }
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
          console.error('❌ Error getting Supabase session:', error)
          console.error('Error details:', {
            message: error.message,
            status: error.status,
            name: error.name
          })
          // If it's a credentials error, show a helpful message
          if (error.message?.includes('Invalid') || error.message?.includes('JWT') || error.message?.includes('API key') || error.message?.includes('API')) {
            console.error('❌ Invalid Supabase credentials detected!')
            console.error('Troubleshooting steps:')
            console.error('  1. Check your .env.local file has NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY')
            console.error('  2. Verify your Supabase project is active (not paused)')
            console.error('  3. Go to Supabase Dashboard > Settings > API to verify your credentials')
            console.error('  4. Restart your Next.js dev server after updating .env.local')
          }
          setAuthReady(true)
          return
        }
        console.log('✅ Auth initialized successfully', data.session ? '(user logged in)' : '(no session)')
        setUser(mapSupabaseUser(data.session?.user ?? null))
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

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
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

