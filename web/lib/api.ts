import axios, { type InternalAxiosRequestConfig } from 'axios'
import { supabase } from './supabaseClient'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add Supabase auth token to requests
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      console.warn('Failed to get session for API request:', error)
    }
    const token = data?.session?.access_token
    if (token) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
    }
  } catch (error) {
    console.error('Error getting session token:', error)
    // Continue with request even if token retrieval fails
    // The backend will return 401 if auth is required
  }
  return config
}, (error) => {
  // Handle request setup errors
  console.error('Request interceptor error:', error)
  return Promise.reject(error)
})

// Add response interceptor for better error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Enhanced error handling with specific messages
    if (error.code === 'ERR_NETWORK' || error.message?.includes('Network Error') || error.message?.includes('Failed to fetch')) {
      // Check if backend is reachable
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      const isLocalhost = apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')
      
      // Check if this is a CORS error (browser blocks before reaching server)
      const isCorsError = error.message?.includes('CORS') || 
                         error.message?.includes('Access-Control') ||
                         (typeof window !== 'undefined' && !error.response) // No response = likely CORS
      
      if (isLocalhost) {
        // Try to check backend health first
        if (typeof window !== 'undefined') {
          fetch(`${apiUrl}/health`)
            .then(res => {
              if (res.ok) {
                return res.json()
              }
              throw new Error(`Health check returned ${res.status}`)
            })
            .then(data => {
              console.log('Backend health check successful:', data)
              if (data.status === 'healthy') {
                // Backend is running, so this is likely a CORS issue
                if (isCorsError || !error.response) {
                  error.userMessage = `CORS Error: Backend is running but browser is blocking the request. Please restart the backend to apply CORS fixes: .\\RESTART-BACKEND-NOW.ps1`
                  console.error('🔴 CORS ERROR DETECTED:')
                  console.error('Backend is healthy but browser blocked the request')
                  console.error('This usually means:')
                  console.error('1. Backend needs restart to apply CORS configuration')
                  console.error('2. CORS headers are missing from response')
                  console.error('3. Browser cached old CORS response')
                  console.error('')
                  console.error('SOLUTION: Restart backend with: .\\RESTART-BACKEND-NOW.ps1')
                  console.error('Then hard refresh browser: Ctrl+Shift+R')
                } else {
                  error.userMessage = `Backend is running but request failed. Check browser console for details.`
                }
                console.warn('Backend is healthy but API request failed. Possible causes:')
                console.warn('1. CORS configuration issue (most likely)')
                console.warn('2. Authentication token missing or invalid')
                console.warn('3. API endpoint path incorrect')
                console.warn('Request URL:', error.config?.url)
                console.warn('Base URL:', error.config?.baseURL)
              }
            })
            .catch(err => {
              console.error('Backend health check failed:', err)
              error.userMessage = `Cannot connect to backend API at ${apiUrl}/api/v1. Backend server appears to be down. Please ensure the backend is running. Try running: .\\start-all.ps1 or .\\backend-watchdog.ps1`
            })
        } else {
          error.userMessage = `Cannot connect to backend API at ${apiUrl}/api/v1. Please ensure the backend server is running. Try running: .\\start-all.ps1 or .\\backend-watchdog.ps1`
        }
        
        console.error('Backend connection error:', {
          url: apiUrl,
          baseURL: error.config?.baseURL,
          fullURL: error.config?.url,
          message: 'Check: http://localhost:8000/health'
        })
      } else {
        error.userMessage = `Cannot connect to backend API at ${apiUrl}. Please check your internet connection and ensure the server is running.`
      }
    } else if (error.code === 'ECONNREFUSED') {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      error.userMessage = `Connection refused. The backend server at ${apiUrl} is not running. Please start it using: .\\start-all.ps1 or .\\backend-watchdog.ps1`
      console.error('Connection refused:', {
        url: error.config?.url,
        baseURL: error.config?.baseURL,
        apiUrl: apiUrl,
        message: 'Backend server is not running or not accessible. Start it with: .\\backend-watchdog.ps1'
      })
    } else if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      error.userMessage = 'Request timed out. The server is taking too long to respond. Please try again.'
    } else if (error.response?.status === 401) {
      error.userMessage = 'Authentication failed. Please log in again.'
    } else if (error.response?.status === 403) {
      error.userMessage = 'You do not have permission to perform this action.'
    } else if (error.response?.status === 404) {
      error.userMessage = 'The requested resource was not found.'
    } else if (error.response?.status === 500) {
      error.userMessage = 'Server error. Please try again later or contact support.'
    } else if (error.response?.status >= 500) {
      error.userMessage = 'Server error. Please try again later.'
    } else if (error.response?.data?.detail) {
      error.userMessage = error.response.data.detail
    } else if (!error.userMessage) {
      error.userMessage = error.message || 'An unexpected error occurred. Please try again.'
    }
    
    // Log detailed error information for debugging
    console.error('API Error:', {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      url: error.config?.url,
      baseURL: error.config?.baseURL,
      userMessage: error.userMessage,
    })
    
    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  register: async (
    email: string,
    password: string,
    fullName?: string,
    role?: 'buyer' | 'vendor'
  ) => {
    try {
      console.log('Supabase signUp called with:', { email, hasPassword: !!password, fullName, role })
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role,
        },
          emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined,
      },
    })
      
    if (error) {
        console.error('Supabase signUp error:', error)
        throw error
      }
      
      console.log('Supabase signUp success:', { 
        user: data.user?.id, 
        session: !!data.session,
        needsConfirmation: !data.session && !!data.user 
      })
      return data
    } catch (error: any) {
      console.error('Registration API error:', error)
      throw error
    }
  },

  login: async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) {
      throw error
    }
    return data
  },

  getMe: async () => {
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      throw error
    }
    return data.user
  },

  logout: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },
}

// Chat API
export const chatAPI = {
  createSession: async (title?: string) => {
    const response = await api.post('/chat/sessions', { title })
    return response.data
  },

  getSessions: async () => {
    const response = await api.get('/chat/sessions')
    return response.data
  },

  getSession: async (sessionId: number) => {
    const response = await api.get(`/chat/sessions/${sessionId}`)
    return response.data
  },

  createMessage: async (sessionId: number, content: string) => {
    const response = await api.post(`/chat/sessions/${sessionId}/messages`, {
      content,
      role: 'user',
    })
    return response.data
  },
}

// Product API
export const productAPI = {
  search: async (query: string, category?: string) => {
    const params: any = { q: query }
    if (category) params.category = category
    const response = await api.get('/products/search', { params })
    return response.data
  },

  getProduct: async (productId: number) => {
    const response = await api.get(`/products/${productId}`)
    return response.data
  },

  getAlternatives: async (productId: number) => {
    const response = await api.get(`/products/${productId}/alternatives`)
    return response.data
  },
}

// Quotation API
export const quotationAPI = {
  create: async (quotationData: any) => {
    const response = await api.post('/quotations', quotationData)
    return response.data
  },

  getQuotations: async () => {
    const response = await api.get('/quotations')
    return response.data
  },

  getQuotation: async (quotationId: number) => {
    const response = await api.get(`/quotations/${quotationId}`)
    return response.data
  },

  getPDF: async (quotationId: number) => {
    const response = await api.get(`/quotations/${quotationId}/pdf`, {
      responseType: 'blob',
    })
    return response.data
  },

  send: async (quotationId: number) => {
    const response = await api.post(`/quotations/${quotationId}/send`)
    return response.data
  },
}

// Vendor API
export const vendorsAPI = {
  register: async (vendorData: any) => {
    const response = await api.post('/vendors', vendorData)
    return response.data
  },

  getMyVendor: async () => {
    const response = await api.get('/vendors/me')
    return response.data
  },

  updateVendor: async (vendorData: any) => {
    const response = await api.put('/vendors/me', vendorData)
    return response.data
  },

  addProduct: async (productData: any) => {
    const response = await api.post('/vendors/me/products', productData)
    return response.data
  },

  createProduct: async (productData: any) => {
    const response = await api.post('/vendors/me/products/create', productData)
    return response.data
  },

  updateProduct: async (vendorProductId: number, productData: any) => {
    const response = await api.put(`/vendors/me/products/${vendorProductId}`, productData)
    return response.data
  },

  updateStock: async (vendorProductId: number, stockQuantity: number) => {
    const response = await api.put(`/vendors/me/products/${vendorProductId}/stock`, {
      stock_quantity: stockQuantity,
    })
    return response.data
  },

  deleteProduct: async (vendorProductId: number) => {
    const response = await api.delete(`/vendors/me/products/${vendorProductId}`)
    return response.data
  },

  getMyProducts: async () => {
    const response = await api.get('/vendors/me/products')
    return response.data
  },
}

export default api

