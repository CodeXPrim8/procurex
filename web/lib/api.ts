import axios, { type InternalAxiosRequestConfig } from 'axios'
import { ensureFreshSession, getAccessToken } from './sessionToken'
import { supabase } from './supabaseClient'
import { debugAuthLog } from './debugAuthLog'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export function apiErrorMessage(error: any, fallback = 'Something went wrong') {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) return detail
  if (Array.isArray(detail) && detail.length) {
    return detail
      .map((item: any) => item?.msg || item?.message || (typeof item === 'string' ? item : ''))
      .filter(Boolean)
      .join('\n')
  }
  if (error?.userMessage) return error.userMessage
  if (error?.message) return error.message
  return fallback
}

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
})

// Add Supabase auth token to requests
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  try {
    const token = await getAccessToken()
    if (token) {
      config.headers = config.headers || {}
      config.headers.Authorization = `Bearer ${token}`
    }
    if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
      if (typeof config.headers.delete === 'function') {
        config.headers.delete('Content-Type')
      } else {
        delete (config.headers as Record<string, unknown>)['Content-Type']
      }
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
  async (error) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true
      const token = await ensureFreshSession()
      if (token) {
        original.headers = original.headers || {}
        original.headers.Authorization = `Bearer ${token}`
        return api(original)
      }
    }
    if (error.response?.status === 401) {
      // #region agent log
      debugAuthLog(
        'api.ts:401',
        'request unauthorized',
        {
          url: String(original?.url || '').slice(0, 160),
          method: String(original?.method || ''),
          retried: Boolean(original?._retry),
        },
        'B'
      )
      // #endregion
    }

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
      error.userMessage = 'Could not verify this request. Please try again.'
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
    role?: 'buyer' | 'vendor',
    vendorProfile?: {
      company_name?: string
      business_registration_number?: string
      domain?: string
      phone?: string
      address?: string
      personal_name?: string
      id_type?: string
      id_number?: string
    }
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
          ...(role === 'vendor' ? vendorProfile || {} : {}),
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
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    if (!data.session?.user) {
      throw new Error('Not signed in')
    }
    return data.session.user
  },

  logout: async () => {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
  },
}

export const accountAPI = {
  me: async () => {
    const response = await api.get('/auth/me')
    return response.data as { id: number; email: string; country?: string | null; preferred_currency?: string | null }
  },
  updatePreferences: async (payload: { country: string; preferred_currency: string }) => {
    const response = await api.put('/auth/me/preferences', payload)
    return response.data as { country?: string | null; preferred_currency?: string | null }
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

  deleteSession: async (sessionId: number) => {
    await api.delete(`/chat/sessions/${sessionId}`)
  },

  renameSession: async (sessionId: number, title: string) => {
    const response = await api.patch(`/chat/sessions/${sessionId}`, { title })
    return response.data
  },

  createMessage: async (sessionId: number, content: string, role: 'user' | 'assistant' = 'user') => {
    const response = await api.post(`/chat/sessions/${sessionId}/messages`, {
      content,
      role,
    })
    return response.data
  },

  generateReply: async (
    sessionId: number,
    payload: {
      message: string
      voice?: boolean
      currency?: string
      currency_symbol?: string
      local_per_ngn?: number
      country?: string
      business_id?: number
      client_id?: number
      request_id?: number
    }
  ) => {
    const response = await api.post(`/chat/sessions/${sessionId}/reply`, payload, { timeout: 90000 })
    return response.data as {
      content: string
      title?: string
      product_results?: any[]
      quotation?: any
    }
  },

  transcribe: async (blob: Blob) => {
    const form = new FormData()
    const ext = blob.type.includes('mp4') ? 'm4a' : 'webm'
    form.append('file', blob, `speech.${ext}`)
    const response = await api.post('/chat/transcribe', form, { timeout: 45000 })
    return String(response.data?.text || '').trim()
  },

  speak: async (text: string, voice?: string) => {
    const response = await api.post(
      '/chat/speak',
      { text, voice: voice || undefined },
      { responseType: 'arraybuffer', timeout: 20000 }
    )
    const mime = String(response.headers?.['content-type'] || 'audio/mpeg').split(';')[0]
    return { data: response.data as ArrayBuffer, mime }
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

async function fileToDataUrl(file: File, maxChars = 350_000) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
  return dataUrl.length > maxChars ? '' : dataUrl
}

async function cloudWorkspace() {
  return import('./cloudWorkspace')
}

// Quotation API
export const quotationAPI = {
  create: async (quotationData: any) => {
    const response = await api.post('/quotations', quotationData)
    void cloudWorkspace().then(({ upsertQuotations }) => upsertQuotations([response.data]))
    return response.data
  },

  getQuotations: async (businessId?: number) => {
    try {
      const response = await api.get('/quotations', {
        params: businessId ? { business_id: businessId } : undefined,
      })
      const rows = Array.isArray(response.data) ? response.data : []
      const { upsertQuotations, replaceQuotations } = await cloudWorkspace()
      if (businessId) void upsertQuotations(rows)
      else void replaceQuotations(rows)
      return rows
    } catch (error) {
      const { loadWorkspace, quotationsForBusiness } = await cloudWorkspace()
      const rows = quotationsForBusiness((await loadWorkspace(true)).quotations || [], businessId)
      if (rows.length) return rows
      throw error
    }
  },

  getQuotation: async (quotationId: number) => {
    try {
      const response = await api.get(`/quotations/${quotationId}`)
      void cloudWorkspace().then(({ upsertQuotations }) => upsertQuotations([response.data]))
      return response.data
    } catch (error) {
      const { loadWorkspace } = await cloudWorkspace()
      const row = ((await loadWorkspace(true)).quotations || []).find(
        (item) => Number(item?.id) === Number(quotationId)
      )
      if (row) return row
      throw error
    }
  },

  update: async (quotationId: number, payload: any) => {
    const response = await api.patch(`/quotations/${quotationId}`, payload)
    void cloudWorkspace().then(({ upsertQuotations }) => upsertQuotations([response.data]))
    return response.data
  },

  getPDF: async (quotationId: number, inline = false) => {
    const response = await api.get(`/quotations/${quotationId}/pdf`, {
      responseType: 'blob',
      params: inline ? { inline: true } : undefined,
    })
    return response.data
  },

  send: async (quotationId: number, payload?: { to?: string[]; cc?: string[] }) => {
    const response = await api.post(`/quotations/${quotationId}/send`, payload || {})
    return response.data
  },

  convert: async (quotationId: number, kind: 'invoice' | 'receipt') => {
    const response = await api.post(`/quotations/${quotationId}/convert`, { kind })
    void cloudWorkspace().then(({ upsertQuotations }) => upsertQuotations([response.data]))
    return response.data
  },
}

async function rememberBusiness(row: any, wait = false) {
  if (!row) return row
  const job = cloudWorkspace().then(({ upsertBusinesses }) => upsertBusinesses([row]))
  if (wait) await job.catch(() => null)
  else void job
  return row
}

async function readCloudBusinesses() {
  const { loadWorkspace } = await cloudWorkspace()
  return (await loadWorkspace(true)).businesses || []
}

async function cloudBusinessName() {
  try {
    const { data } = await supabase.auth.getUser()
    const meta = data.user?.user_metadata || {}
    const named = String(meta.full_name || '').trim()
    if (named) return named
    return String(data.user?.email || '').split('@')[0] || 'My business'
  } catch {
    return 'My business'
  }
}

function asBusiness(row: any, patch: Record<string, any> = {}) {
  const now = new Date().toISOString()
  const clients = patch.clients ?? (Array.isArray(row?.clients) ? row.clients : [])
  const requests = patch.requests ?? (Array.isArray(row?.requests) ? row.requests : [])
  return {
    id: patch.id ?? row?.id ?? Date.now(),
    user_id: row?.user_id ?? 0,
    name: String(patch.name ?? row?.name ?? 'My business').trim() || 'My business',
    legal_name: patch.legal_name !== undefined ? patch.legal_name : row?.legal_name ?? null,
    email: patch.email !== undefined ? patch.email : row?.email ?? null,
    phone: patch.phone !== undefined ? patch.phone : row?.phone ?? null,
    address: patch.address !== undefined ? patch.address : row?.address ?? null,
    logo_url: patch.logo_url !== undefined ? patch.logo_url : row?.logo_url ?? null,
    letterhead_url: patch.letterhead_url !== undefined ? patch.letterhead_url : row?.letterhead_url ?? null,
    template_kind: patch.template_kind || row?.template_kind || 'classic',
    vat_percent: patch.vat_percent !== undefined ? patch.vat_percent : row?.vat_percent ?? 7.5,
    footer_note: patch.footer_note !== undefined ? patch.footer_note : row?.footer_note ?? null,
    is_default: patch.is_default !== undefined ? Boolean(patch.is_default) : Boolean(row?.is_default),
    created_at: row?.created_at || now,
    updated_at: now,
    clients,
    requests,
  }
}

async function cloudBusinessById(id: number) {
  return (await readCloudBusinesses()).find((item) => Number(item?.id) === Number(id)) || null
}

async function ensureCloudBusinesses(rows: any[]) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : []
  if (list.length) return list
  const created = asBusiness(null, {
    name: await cloudBusinessName(),
    is_default: true,
  })
  await rememberBusiness(created, true)
  return [created]
}

async function saveCloudBusiness(row: any) {
  return rememberBusiness(asBusiness(row), true)
}

export const businessAPI = {
  list: async () => {
    try {
      const response = await api.get('/businesses')
      const rows = Array.isArray(response.data) ? response.data : []
      const cloud = await readCloudBusinesses().catch(() => [])
      const extras = (cloud || []).filter(
        (item) => !rows.some((row: any) => String(row?.id) === String(item?.id))
      )
      const merged = [...rows, ...extras]
      void cloudWorkspace().then(({ upsertBusinesses }) => upsertBusinesses(merged))
      if (merged.length) return merged
      return ensureCloudBusinesses([])
    } catch {
      try {
        return await ensureCloudBusinesses(await readCloudBusinesses())
      } catch {
        return ensureCloudBusinesses([])
      }
    }
  },
  get: async (id: number) => {
    try {
      const response = await api.get(`/businesses/${id}`)
      return rememberBusiness(response.data)
    } catch (error) {
      const row = await cloudBusinessById(id)
      if (row) return row
      throw error
    }
  },
  create: async (payload: any) => {
    try {
      const response = await api.post('/businesses', payload)
      return rememberBusiness(response.data)
    } catch {
      const existing = await readCloudBusinesses().catch(() => [])
      const created = asBusiness(null, {
        ...payload,
        is_default: payload?.is_default || existing.length === 0,
      })
      return saveCloudBusiness(created)
    }
  },
  update: async (id: number, payload: any) => {
    try {
      const response = await api.patch(`/businesses/${id}`, payload)
      return rememberBusiness(response.data)
    } catch (error) {
      const row = await cloudBusinessById(id)
      if (!row) throw error
      return saveCloudBusiness(asBusiness(row, payload))
    }
  },
  remove: async (id: number) => {
    try {
      await api.delete(`/businesses/${id}`)
    } catch {
      // Keep the account copy in sync even when the laptop API is offline.
    }
    void cloudWorkspace().then(({ removeBusiness }) => removeBusiness(id))
  },
  uploadBrand: async (id: number, kind: 'logo' | 'letterhead', file: File) => {
    const overlay = await fileToDataUrl(file)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await api.post(`/businesses/${id}/branding/${kind}`, form)
      const next = overlay
        ? { ...response.data, [kind === 'logo' ? 'logo_url' : 'letterhead_url']: overlay }
        : response.data
      return rememberBusiness(next)
    } catch (error) {
      const row = await cloudBusinessById(id)
      if (!row || !overlay) throw error
      return saveCloudBusiness(
        asBusiness(row, { [kind === 'logo' ? 'logo_url' : 'letterhead_url']: overlay })
      )
    }
  },
  createClient: async (id: number, payload: any) => {
    try {
      const response = await api.post(`/businesses/${id}/clients`, payload)
      void api.get(`/businesses/${id}`).then((full) => rememberBusiness(full.data)).catch(() => null)
      return response.data
    } catch (error) {
      const row = await cloudBusinessById(id)
      if (!row) throw error
      const client = {
        id: Date.now(),
        business_id: id,
        created_at: new Date().toISOString(),
        ...payload,
      }
      await saveCloudBusiness(asBusiness(row, { clients: [...(row.clients || []), client] }))
      return client
    }
  },
  updateClient: async (id: number, clientId: number, payload: any) => {
    try {
      const response = await api.patch(`/businesses/${id}/clients/${clientId}`, payload)
      void api.get(`/businesses/${id}`).then((full) => rememberBusiness(full.data)).catch(() => null)
      return response.data
    } catch (error) {
      const row = await cloudBusinessById(id)
      if (!row) throw error
      const clients = (row.clients || []).map((item: any) =>
        Number(item.id) === Number(clientId) ? { ...item, ...payload } : item
      )
      await saveCloudBusiness(asBusiness(row, { clients }))
      return clients.find((item: any) => Number(item.id) === Number(clientId))
    }
  },
  removeClient: async (id: number, clientId: number) => {
    try {
      await api.delete(`/businesses/${id}/clients/${clientId}`)
      void api.get(`/businesses/${id}`).then((full) => rememberBusiness(full.data)).catch(() => null)
    } catch {
      const row = await cloudBusinessById(id)
      if (!row) return
      await saveCloudBusiness(
        asBusiness(row, {
          clients: (row.clients || []).filter((item: any) => Number(item.id) !== Number(clientId)),
        })
      )
    }
  },
  createRequest: async (id: number, payload: any) => {
    try {
      const response = await api.post(`/businesses/${id}/requests`, payload)
      void api.get(`/businesses/${id}`).then((full) => rememberBusiness(full.data)).catch(() => null)
      return response.data
    } catch (error) {
      const row = await cloudBusinessById(id)
      if (!row) throw error
      const request = {
        id: Date.now(),
        business_id: id,
        status: payload?.status || 'open',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...payload,
      }
      await saveCloudBusiness(asBusiness(row, { requests: [...(row.requests || []), request] }))
      return request
    }
  },
  updateRequest: async (id: number, requestId: number, payload: any) => {
    try {
      const response = await api.patch(`/businesses/${id}/requests/${requestId}`, payload)
      void api.get(`/businesses/${id}`).then((full) => rememberBusiness(full.data)).catch(() => null)
      return response.data
    } catch (error) {
      const row = await cloudBusinessById(id)
      if (!row) throw error
      const requests = (row.requests || []).map((item: any) =>
        Number(item.id) === Number(requestId)
          ? { ...item, ...payload, updated_at: new Date().toISOString() }
          : item
      )
      await saveCloudBusiness(asBusiness(row, { requests }))
      return requests.find((item: any) => Number(item.id) === Number(requestId))
    }
  },
  removeRequest: async (id: number, requestId: number) => {
    try {
      await api.delete(`/businesses/${id}/requests/${requestId}`)
      void api.get(`/businesses/${id}`).then((full) => rememberBusiness(full.data)).catch(() => null)
    } catch {
      const row = await cloudBusinessById(id)
      if (!row) return
      await saveCloudBusiness(
        asBusiness(row, {
          requests: (row.requests || []).filter((item: any) => Number(item.id) !== Number(requestId)),
        })
      )
    }
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

  assistProduct: async (payload: {
    name: string
    category: string
    specifications?: Record<string, any>
    description?: string
  }) => {
    const response = await api.post('/vendors/me/products/assist', payload, { timeout: 45000 })
    return response.data as {
      kind: 'goods' | 'software' | 'service'
      kind_label: string
      suggested_category: string | null
      category_mismatch: boolean
      description: string
      note: string
      image_rule: string
    }
  },

  uploadProductImages: async (files: File[], productName: string, category: string) => {
    if (!files.length) {
      throw new Error('Upload at least one product photo.')
    }
    const token = await getAccessToken()
    if (!token) {
      throw new Error('Please log in again to upload product photos.')
    }
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    const response = await api.post('/vendors/me/products/images', formData, {
      params: {
        product_name: productName,
        category,
      },
      headers: {
        Authorization: `Bearer ${token}`,
      },
      timeout: 180000,
    })
    return response.data as { urls: string[]; url: string; message?: string }
  },

  uploadProductImage: async (file: File, productName: string, category: string) => {
    const payload = await vendorsAPI.uploadProductImages([file], productName, category)
    return { url: payload.url || payload.urls?.[0], filename: undefined, message: payload.message }
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

  uploadDocument: async (
    file: File,
    documentType: 'id_document' | 'address_bill' | 'company_certificate' | 'vat_certificate' | 'tax_clearance',
  ) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Please log in again to upload documents.')
    const formData = new FormData()
    formData.append('file', file)
    const response = await api.post('/vendors/me/upload-document', formData, {
      params: { document_type: documentType },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 120000,
    })
    return response.data as { url: string; document_type: string; vendor?: any; message?: string }
  },

  submitForReview: async () => {
    const response = await api.post('/vendors/me/submit')
    return response.data
  },

  updateVatDetails: async (payload: { tin?: string; tax_clearance_expires_at?: string | null }) => {
    const response = await api.put('/vendors/me/vat', payload)
    return response.data
  },

  requestVatReview: async () => {
    const response = await api.post('/vendors/me/vat/request')
    return response.data
  },
}

export const adminAPI = {
  listVendors: async (status?: string) => {
    const response = await api.get('/admin/vendors', { params: status ? { status } : undefined })
    return response.data as any[]
  },
  reviewVendor: async (vendorId: number, action: 'approve' | 'reject' | 'revoke', notes?: string) => {
    const response = await api.post(`/admin/vendors/${vendorId}/review`, { action, notes })
    return response.data
  },
  getVendor: async (vendorId: number) => {
    const response = await api.get(`/admin/vendors/${vendorId}`)
    return response.data
  },
  assessVendorProduct: async (
    vendorId: number,
    listingId: number,
    action: 'approve' | 'flag' | 'hide',
    notes?: string,
  ) => {
    const response = await api.post(`/admin/vendors/${vendorId}/products/${listingId}/assess`, { action, notes })
    return response.data
  },
  deleteVendorProduct: async (vendorId: number, listingId: number) => {
    const response = await api.delete(`/admin/vendors/${vendorId}/products/${listingId}`)
    return response.data
  },
  reviewVendorVat: async (vendorId: number, action: 'approve' | 'reject', notes?: string) => {
    const response = await api.post(`/admin/vendors/${vendorId}/vat`, { action, notes })
    return response.data
  },
  getVendorBooks: async (vendorId: number) => {
    const response = await api.get(`/bisonbook/admin/vendors/${vendorId}`)
    return response.data
  },
  adviseVendor: async (vendorId: number, message: string, vendorProductId?: number | null) => {
    const response = await api.post(`/admin/vendors/${vendorId}/advice`, {
      message,
      vendor_product_id: vendorProductId || null,
    })
    return response.data
  },
}

export const bisonbookAPI = {
  get: async <T = any>(path: string, params?: Record<string, any>) => {
    const response = await api.get(`/bisonbook${path}`, { params })
    return response.data as T
  },
  post: async <T = any>(path: string, body?: any) => {
    const response = await api.post(`/bisonbook${path}`, body ?? {})
    return response.data as T
  },
  put: async <T = any>(path: string, body?: any) => {
    const response = await api.put(`/bisonbook${path}`, body ?? {})
    return response.data as T
  },
  patch: async <T = any>(path: string, body?: any) => {
    const response = await api.patch(`/bisonbook${path}`, body ?? {})
    return response.data as T
  },
  del: async <T = any>(path: string) => {
    const response = await api.delete(`/bisonbook${path}`)
    return response.data as T
  },
  upload: async <T = any>(path: string, form: FormData) => {
    const token = await getAccessToken()
    const response = await api.post(`/bisonbook${path}`, form, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      timeout: 180000,
    })
    return response.data as T
  },
  /** Fetch an authenticated file (PDF/CSV) and open or download it in the browser. */
  open: async (path: string, params?: Record<string, any>, filename?: string) => {
    const response = await api.get(`/bisonbook${path}`, { params, responseType: 'blob', timeout: 60000 })
    const blob = response.data as Blob
    const url = URL.createObjectURL(blob)
    if (filename && !blob.type.includes('pdf')) {
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
    } else {
      window.open(url, '_blank', 'noopener')
    }
    setTimeout(() => URL.revokeObjectURL(url), 60000)
  },
}

export default api

