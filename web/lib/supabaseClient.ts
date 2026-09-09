import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase environment variables are not set!')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'Set' : 'Missing')
  console.error('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseAnonKey ? 'Set' : 'Missing')
  throw new Error('Supabase environment variables are not set. Please configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your .env.local file.')
}

// Validate URL format
if (supabaseUrl && !supabaseUrl.startsWith('https://')) {
  console.warn('⚠️ Supabase URL should start with https://')
}

// Validate API key format (should start with eyJ for JWT)
if (supabaseAnonKey && !supabaseAnonKey.startsWith('eyJ')) {
  console.warn('⚠️ Supabase API key format looks invalid (should start with "eyJ")')
}

// Create Supabase client with better error handling
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  },
  global: {
    headers: {
      'x-client-info': 'procurex-web'
    }
  }
})

// Test connection on client side (only in browser)
if (typeof window !== 'undefined') {
  // Test Supabase connection
  fetch(`${supabaseUrl}/rest/v1/`, {
    method: 'HEAD',
    headers: {
      'apikey': supabaseAnonKey
    }
  }).then(response => {
    if (response.status === 401) {
      console.error('❌ Supabase API key is invalid or expired')
    } else if (response.status === 404) {
      console.error('❌ Supabase project not found. Check if project is paused or URL is incorrect.')
    } else if (!response.ok) {
      console.warn(`⚠️ Supabase connection returned status ${response.status}`)
    } else {
      console.log('✅ Supabase connection successful')
    }
  }).catch(error => {
    const errorMsg = error.message || ''
    const isDnsError = errorMsg.includes('Failed to fetch') || 
                      errorMsg.includes('ERR_NAME_NOT_RESOLVED') || 
                      errorMsg.includes('could not be resolved') ||
                      errorMsg.includes('getaddrinfo ENOTFOUND')
    
    if (isDnsError) {
      console.error('❌ Supabase project cannot be resolved - Project is likely PAUSED or DELETED')
      console.error('')
      console.error('🔴 IMMEDIATE ACTION REQUIRED:')
      console.error('1. Go to: https://supabase.com/dashboard')
      console.error('2. Check if project "eugnepzbjrvqmzldhrql" exists')
      console.error('3. If PAUSED → Click "Restore" button')
      console.error('4. If DELETED → Create a new project')
      console.error('5. Update web/.env.local with new credentials')
      console.error('6. Restart Next.js dev server')
      console.error('')
      console.error('📖 See FIX-SUPABASE-NOW.md for detailed instructions')
    } else {
      console.error('❌ Cannot connect to Supabase:', error.message)
      console.error('Troubleshooting:')
      console.error('1. Check your internet connection')
      console.error('2. Verify Supabase project is active (not paused) at https://supabase.com/dashboard')
      console.error('3. Check Supabase URL in .env.local matches your project')
      console.error('4. Restart Next.js dev server after updating .env.local')
    }
  })
}

