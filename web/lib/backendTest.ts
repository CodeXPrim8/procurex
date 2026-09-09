/**
 * Backend Connection Test Utility
 * Use this to diagnose backend connection issues
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export interface BackendTestResult {
  healthCheck: {
    success: boolean
    status?: string
    database?: string
    error?: string
  }
  apiTest: {
    success: boolean
    statusCode?: number
    error?: string
  }
  corsTest: {
    success: boolean
    error?: string
  }
  overall: 'healthy' | 'degraded' | 'down'
  message: string
}

export async function testBackendConnection(): Promise<BackendTestResult> {
  const result: BackendTestResult = {
    healthCheck: { success: false },
    apiTest: { success: false },
    corsTest: { success: false },
    overall: 'down',
    message: '',
  }

  // Test 1: Health endpoint (no CORS required)
  try {
    const healthResponse = await fetch(`${API_URL}/health`)
    if (healthResponse.ok) {
      const healthData = await healthResponse.json()
      result.healthCheck = {
        success: true,
        status: healthData.status,
        database: healthData.database,
      }
    } else {
      result.healthCheck.error = `Health check returned ${healthResponse.status}`
    }
  } catch (error: any) {
    result.healthCheck.error = error.message || 'Health check failed'
  }

  // Test 2: API endpoint (requires CORS)
  try {
    const apiResponse = await fetch(`${API_URL}/api/v1/vendors/me`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-token',
      },
    })
    result.apiTest = {
      success: true,
      statusCode: apiResponse.status,
    }
    // 401 is expected without valid auth, so this is actually a success (CORS is working)
    if (apiResponse.status === 401) {
      result.corsTest.success = true
    }
  } catch (error: any) {
    result.apiTest.error = error.message || 'API test failed'
    
    // Check if it's a CORS error
    if (error.message?.includes('CORS') || error.message?.includes('Access-Control')) {
      result.corsTest.error = 'CORS error detected. Backend may not allow requests from this origin.'
    } else if (error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError')) {
      result.corsTest.error = 'Network error. Backend may not be accessible from browser.'
    }
  }

  // Determine overall status
  if (result.healthCheck.success && result.apiTest.success) {
    result.overall = 'healthy'
    result.message = 'Backend is running and accessible. API requests should work.'
  } else if (result.healthCheck.success && !result.apiTest.success) {
    result.overall = 'degraded'
    result.message = 'Backend is running but API requests are failing. This may be a CORS or authentication issue.'
  } else {
    result.overall = 'down'
    result.message = 'Backend is not accessible. Please ensure the backend server is running.'
  }

  return result
}

/**
 * Log backend test results to console
 */
export function logBackendTestResults(result: BackendTestResult) {
  console.group('🔍 Backend Connection Test Results')
  
  console.log('Overall Status:', result.overall.toUpperCase())
  console.log('Message:', result.message)
  console.log('')
  
  console.log('Health Check:')
  if (result.healthCheck.success) {
    console.log('  ✅ Success')
    console.log('  Status:', result.healthCheck.status)
    console.log('  Database:', result.healthCheck.database)
  } else {
    console.log('  ❌ Failed')
    console.log('  Error:', result.healthCheck.error)
  }
  console.log('')
  
  console.log('API Test:')
  if (result.apiTest.success) {
    console.log('  ✅ Success')
    console.log('  Status Code:', result.apiTest.statusCode)
    if (result.apiTest.statusCode === 401) {
      console.log('  ℹ️  401 is expected without valid authentication')
    }
  } else {
    console.log('  ❌ Failed')
    console.log('  Error:', result.apiTest.error)
  }
  console.log('')
  
  console.log('CORS Test:')
  if (result.corsTest.success) {
    console.log('  ✅ CORS is working')
  } else {
    console.log('  ❌ CORS issue detected')
    console.log('  Error:', result.corsTest.error)
    console.log('  💡 Check backend CORS configuration in backend/app/core/config.py')
    console.log('  💡 Make sure CORS_ORIGINS includes your frontend URL (http://localhost:3000)')
  }
  
  console.groupEnd()
  
  return result
}

/**
 * Run backend test and log results
 */
export async function runBackendDiagnostics() {
  const result = await testBackendConnection()
  logBackendTestResults(result)
  return result
}
