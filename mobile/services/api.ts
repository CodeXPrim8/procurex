import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'

const API_URL = 'http://localhost:8000'

const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to requests
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Auth API
export const authAPI = {
  register: async (email: string, password: string, fullName?: string) => {
    const response = await api.post('/auth/register', {
      email,
      password,
      full_name: fullName,
    })
    return response.data
  },

  login: async (email: string, password: string) => {
    const formData = new FormData()
    formData.append('username', email)
    formData.append('password', password)
    
    const response = await axios.post(`${API_URL}/api/v1/auth/login`, formData, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    
    if (response.data.access_token) {
      await AsyncStorage.setItem('access_token', response.data.access_token)
    }
    return response.data
  },

  getMe: async () => {
    const response = await api.get('/auth/me')
    return response.data
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
}

export default api


