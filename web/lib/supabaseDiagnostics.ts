/**
 * Diagnostic utility to check Supabase configuration
 * Run this in the browser console to diagnose Supabase issues
 */
export async function diagnoseSupabase() {
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    checks: {},
    errors: [],
    warnings: [],
    recommendations: []
  }

  // Check 1: Environment variables
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  
  diagnostics.checks.envVars = {
    url: {
      exists: !!url,
      value: url ? `${url.substring(0, 30)}...` : 'MISSING',
      valid: url ? /^https?:\/\/.+\..+/.test(url) : false
    },
    key: {
      exists: !!key,
      value: key ? `${key.substring(0, 20)}...${key.substring(key.length - 10)}` : 'MISSING',
      valid: key ? /^eyJ/.test(key) : false
    }
  }

  if (!url || !key) {
    diagnostics.errors.push('Missing Supabase environment variables')
    diagnostics.recommendations.push('Check your .env.local file in the web directory')
  }

  if (url && !/^https?:\/\/.+\..+/.test(url)) {
    diagnostics.errors.push('Invalid Supabase URL format')
  }

  if (key && !/^eyJ/.test(key)) {
    diagnostics.warnings.push('Supabase anon key format looks invalid (should start with "eyJ")')
  }

  // Check 2: Test Supabase connection
  if (url && key) {
    try {
      const response = await fetch(`${url}/rest/v1/`, {
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`
        }
      })
      
      diagnostics.checks.connection = {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      }

      if (response.status === 401) {
        diagnostics.errors.push('Supabase API key is invalid or expired')
        diagnostics.recommendations.push('Check your Supabase project settings and regenerate API keys if needed')
      } else if (response.status === 404) {
        diagnostics.errors.push('Supabase project not found or URL is incorrect')
        diagnostics.recommendations.push('Verify your Supabase project URL in the dashboard')
      } else if (!response.ok) {
        diagnostics.warnings.push(`Supabase connection returned status ${response.status}`)
      } else {
        diagnostics.checks.connection.success = true
      }
    } catch (error: any) {
      diagnostics.errors.push(`Failed to connect to Supabase: ${error.message}`)
      diagnostics.checks.connection = {
        error: error.message
      }
      diagnostics.recommendations.push('Check your internet connection and ensure your Supabase project is active (not paused)')
    }
  }

  // Check 3: Test auth endpoint
  if (url && key) {
    try {
      const response = await fetch(`${url}/auth/v1/health`, {
        headers: {
          'apikey': key
        }
      })
      
      diagnostics.checks.auth = {
        status: response.status,
        ok: response.ok
      }

      if (!response.ok) {
        diagnostics.warnings.push(`Auth endpoint returned status ${response.status}`)
      } else {
        diagnostics.checks.auth.success = true
      }
    } catch (error: any) {
      diagnostics.warnings.push(`Auth endpoint check failed: ${error.message}`)
    }
  }

  // Generate summary
  const hasErrors = diagnostics.errors.length > 0
  const hasWarnings = diagnostics.warnings.length > 0

  console.group('🔍 Supabase Diagnostics')
  console.log('Timestamp:', diagnostics.timestamp)
  console.log('')
  
  console.group('✅ Environment Variables')
  console.log('URL:', diagnostics.checks.envVars?.url?.exists ? '✅ Set' : '❌ Missing', diagnostics.checks.envVars?.url?.value)
  console.log('Key:', diagnostics.checks.envVars?.key?.exists ? '✅ Set' : '❌ Missing', diagnostics.checks.envVars?.key?.value)
  console.groupEnd()
  
  if (diagnostics.checks.connection) {
    console.group('🌐 Connection Test')
    if (diagnostics.checks.connection.success) {
      console.log('✅ Connection successful')
    } else {
      console.log('❌ Connection failed:', diagnostics.checks.connection.status, diagnostics.checks.connection.statusText)
    }
    console.groupEnd()
  }

  if (diagnostics.errors.length > 0) {
    console.group('❌ Errors')
    diagnostics.errors.forEach((err: string) => console.error(err))
    console.groupEnd()
  }

  if (diagnostics.warnings.length > 0) {
    console.group('⚠️ Warnings')
    diagnostics.warnings.forEach((warn: string) => console.warn(warn))
    console.groupEnd()
  }

  if (diagnostics.recommendations.length > 0) {
    console.group('💡 Recommendations')
    diagnostics.recommendations.forEach((rec: string) => console.log('•', rec))
    console.groupEnd()
  }

  console.log('')
  if (!hasErrors && !hasWarnings) {
    console.log('✅ All checks passed! Supabase is configured correctly.')
  } else if (hasErrors) {
    console.log('❌ Issues found. Please address the errors above.')
  } else {
    console.log('⚠️ Some warnings found. Review the warnings above.')
  }
  console.groupEnd()

  return diagnostics
}

// Make it available globally in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as any).diagnoseSupabase = diagnoseSupabase
  console.log('💡 Run diagnoseSupabase() in the console to check Supabase configuration')
}

















