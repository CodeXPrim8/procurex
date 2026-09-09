'use client'

import { useState, useEffect, useRef } from 'react'
import {
  MessageSquare,
  Send,
  Loader2,
  Plus,
  ShoppingCart,
  FileText,
  Package,
  Lock,
  Search,
  BookOpen,
  Folder,
  Bell,
  Settings,
  User,
  LogOut,
  ChevronUp
} from 'lucide-react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { chatAPI } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import ChatMessage from '@/components/ChatMessage'
import ProductCard from '@/components/ProductCard'
import Button from '@/components/ui/Button'
import { showToast } from '@/lib/toast'
import { supabase } from '@/lib/supabaseClient'
import { formatPriceRange, getCurrencySymbol } from '@/lib/currency'
import SpeedTest from '@/components/SpeedTest'

export default function ChatPage() {
  const { user, isAuthenticated, authReady } = useAuth()
  const router = useRouter()
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [productResults, setProductResults] = useState<any[]>([])
  const [sessions, setSessions] = useState<any[]>([])
  const [showSidebar, setShowSidebar] = useState(true)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showUserMenuHeader, setShowUserMenuHeader] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchModal, setShowSearchModal] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const userMenuHeaderRef = useRef<HTMLDivElement>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  
  const { currentSession, setCurrentSession, addMessage, setMessages, logout } = useStore()

  // Check backend health with better error handling
  const checkBackendHealth = async (): Promise<boolean> => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    
    // Try health endpoint
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2000) // 2 second timeout
      
      const response = await fetch(`${apiUrl}/health`, { 
        method: 'GET',
        cache: 'no-cache',
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      })
      
      clearTimeout(timeoutId)
      
      if (response.ok) {
        setBackendAvailable(true)
        return true
      }
    } catch (err: any) {
      // Ignore abort errors (timeouts)
      if (err.name !== 'AbortError') {
        console.debug('Health check error:', err.message)
      }
    }
    
    // If health check fails, try root endpoint as fallback
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 2000)
      
      const response = await fetch(`${apiUrl}/`, { 
        method: 'GET',
        cache: 'no-cache',
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)
      
      if (response.ok) {
        setBackendAvailable(true)
        return true
      }
    } catch (err: any) {
      // Ignore errors
    }
    
    setBackendAvailable(false)
    return false
  }

  // Periodically check backend health (only when not connected)
  useEffect(() => {
    if (isAuthenticated && !wsConnected) {
      // Initial check after a short delay
      const initialCheck = setTimeout(() => {
        checkBackendHealth()
      }, 1000)
      
      // Check every 10 seconds if backend is offline (less aggressive)
      const healthCheckInterval = setInterval(() => {
        if (!wsConnected && backendAvailable === false) {
          checkBackendHealth()
        }
      }, 10000) // Check every 10 seconds

      return () => {
        clearTimeout(initialCheck)
        clearInterval(healthCheckInterval)
      }
    }
  }, [isAuthenticated, wsConnected, backendAvailable])

  useEffect(() => {
    // Wait for auth to be ready before loading sessions
    if (!authReady) {
      return
    }

    if (isAuthenticated) {
      loadSessions()
      // Only create new session if we don't have one and sessions are loaded
      // This prevents creating a new session on every refresh
      if (!currentSession) {
        // Wait a bit for sessions to load, then create if still no session
        setTimeout(() => {
          if (!currentSession) {
            createNewSession()
          }
        }, 500)
      }
    } else {
      // For unauthenticated users, load from localStorage
      const localSessions = localStorage.getItem('temp_chat_sessions')
      if (localSessions) {
        const sessions = JSON.parse(localSessions)
        setSessions(sessions)
        // Set the most recent session as current
        if (sessions.length > 0 && !currentSession) {
          const latestSession = sessions[sessions.length - 1]
          setCurrentSession(latestSession)
        }
      }
      // Create a new session if none exists
      if (!currentSession) {
        const tempSession = {
          id: Date.now(),
          title: 'New Chat',
          messages: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        setCurrentSession(tempSession as any)
      }
    }
  }, [authReady, isAuthenticated])

  useEffect(() => {
    if (currentSession?.id) {
      loadMessages()
    }
  }, [currentSession?.id])

  useEffect(() => {
    // Wait for auth to be ready before attempting connection
    if (!authReady) {
      console.log('⏳ Waiting for auth to initialize...')
      return
    }

    if (!isAuthenticated || !currentSession?.id) {
      // Close connection if user logs out or session is lost
      if (wsRef.current) {
        try {
          wsRef.current.close(1000, 'User logged out or session lost')
        } catch (e) {
          // Ignore errors
        }
        wsRef.current = null
      }
      setWsConnected(false)
      setIsReconnecting(false)
      return
    }

    // Only connect if we have a valid session ID (not a temporary local session)
    // Temporary sessions have timestamp IDs, real sessions have numeric IDs
    const sessionId = currentSession.id
    if (typeof sessionId === 'number' && sessionId > 0) {
      // Check if already connected to avoid duplicate connections
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('✅ WebSocket already connected')
        setWsConnected(true)
        return
      }

      const connect = async () => {
        console.log('🔌 Connecting WebSocket for session:', sessionId)
        try {
          const connected = await connectWebSocket(sessionId, 0, false)
          if (!connected) {
            console.log('⚠️ WebSocket connection failed, will retry...')
            // Retry after a short delay
            setTimeout(() => {
              if (currentSession?.id === sessionId && isAuthenticated) {
                connectWebSocket(sessionId, 0, true)
              }
            }, 2000)
          }
        } catch (error) {
          console.error('Failed to connect WebSocket:', error)
          setWsConnected(false)
          setIsReconnecting(false)
          // Retry after delay
          setTimeout(() => {
            if (currentSession?.id === sessionId && isAuthenticated) {
              connectWebSocket(sessionId, 0, true)
            }
          }, 3000)
        }
      }
      connect()
    } else {
      // Temporary session, don't try to connect WebSocket
      setWsConnected(false)
      setIsReconnecting(false)
    }

    return () => {
      // Don't close on unmount if we're just refreshing - let it reconnect
      // Only cleanup timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }
  }, [authReady, isAuthenticated, currentSession?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [currentSession?.messages])

  // Reconnect WebSocket when page becomes visible (handles tab switching and refresh)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Page became visible, check if we need to reconnect
        if (isAuthenticated && currentSession?.id && typeof currentSession.id === 'number') {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            console.log('Page visible, reconnecting WebSocket...')
            connectWebSocket(currentSession.id, 0, true)
          }
        }
      }
    }

    // Also handle page focus
    const handleFocus = () => {
      if (isAuthenticated && currentSession?.id && typeof currentSession.id === 'number') {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          console.log('Page focused, reconnecting WebSocket...')
          connectWebSocket(currentSession.id, 0, true)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [isAuthenticated, currentSession?.id])

  const loadSessions = async () => {
    if (!isAuthenticated) {
      // For unauthenticated users, use local storage
      const localSessions = localStorage.getItem('temp_chat_sessions')
      if (localSessions) {
        setSessions(JSON.parse(localSessions))
      }
      return
    }

    try {
      const data = await chatAPI.getSessions()
      setSessions(data)
    } catch (error: any) {
      if (error.response?.status === 401) {
        // User not authenticated, use local storage
        const localSessions = localStorage.getItem('temp_chat_sessions')
        if (localSessions) {
          setSessions(JSON.parse(localSessions))
        }
      } else {
        console.error('Failed to load sessions:', error)
      }
    }
  }

  const createNewSession = async () => {
    if (!isAuthenticated) {
      // Check chat limit for unauthenticated users
      const localSessions = localStorage.getItem('temp_chat_sessions')
      const existingSessions = localSessions ? JSON.parse(localSessions) : []
      const chatLimit = 5 // Free users get 5 chats
      
      if (existingSessions.length >= chatLimit) {
        showToast('Chat limit reached. Please login for unlimited chats.', 'warning')
        router.push('/login?redirect=/chat')
        return
      }

        // Create temporary session for unauthenticated users
        const tempSession = {
          id: Date.now(),
          title: 'New Chat',
          messages: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        const updatedSessions = [...existingSessions, tempSession]
        localStorage.setItem('temp_chat_sessions', JSON.stringify(updatedSessions))
        setCurrentSession(tempSession as any)
        setSessions(updatedSessions)
        return
      }

    try {
      const session = await chatAPI.createSession()
      setCurrentSession({ ...session, messages: [] })
      loadSessions()
    } catch (error: any) {
      if (error.response?.status === 401) {
        showToast('Please login to create new chats', 'warning')
        router.push('/login?redirect=/chat')
      } else {
        console.error('Failed to create session:', error)
      }
    }
  }

  const loadMessages = async () => {
    if (!currentSession?.id) return
    try {
      const session = await chatAPI.getSession(currentSession.id)
      setMessages(session.messages || [])
    } catch (error) {
      console.error('Failed to load messages:', error)
    }
  }

  const selectSession = async (sessionId: number) => {
    if (!isAuthenticated) {
      // For unauthenticated users, load from local storage
      const localSessions = localStorage.getItem('temp_chat_sessions')
      if (localSessions) {
        const sessions = JSON.parse(localSessions)
        const session = sessions.find((s: any) => s.id === sessionId)
        if (session) {
          setCurrentSession(session)
        }
      }
      return
    }

    try {
      const session = await chatAPI.getSession(sessionId)
      setCurrentSession(session)
    } catch (error: any) {
      if (error.response?.status === 401) {
        showToast('Please login to view chat history', 'warning')
        router.push('/login?redirect=/chat')
      } else {
        console.error('Failed to load session:', error)
      }
    }
  }

  const connectWebSocket = async (sessionId: number, retryCount = 0, isReconnect = false): Promise<boolean> => {
    const maxRetries = 3 // Allow more retries for better reliability
    
    // Get fresh session token
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token || ''
    if (!token) {
      console.warn('No auth token available, user may need to login')
      if (isAuthenticated) {
        // If we think we're authenticated but have no token, try refreshing
        showToast('Session expired. Please refresh the page.', 'warning')
      } else {
        showToast('Please login to use chat.', 'info')
      }
      setWsConnected(false)
      setIsReconnecting(false)
      return false
    }
    
    // Get API URL from environment or use default
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    const wsProtocol = apiUrl.startsWith('https://') ? 'wss://' : 'ws://'
    const wsHost = apiUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
    const wsUrl = `${wsProtocol}${wsHost}/api/v1/chat/ws/${sessionId}?token=${token}`
    
    return new Promise((resolve) => {
      // If already connected to the same session, don't reconnect
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        console.log('✅ WebSocket already connected, skipping reconnect')
        setWsConnected(true)
        setIsReconnecting(false)
        resolve(true)
        return
      }
    
      // Close existing connection if any (but only if it's not already open or connecting)
      if (wsRef.current) {
        const currentState = wsRef.current.readyState
        if (currentState === WebSocket.CONNECTING || currentState === WebSocket.OPEN) {
          // Don't close if connecting or open, just resolve
          if (currentState === WebSocket.OPEN) {
            setWsConnected(true)
            resolve(true)
            return
          }
          // If connecting, wait a bit
          setTimeout(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
              setWsConnected(true)
              resolve(true)
            } else {
              // Continue with new connection
              connectWebSocket(sessionId, retryCount, isReconnect).then(resolve)
            }
          }, 1000)
          return
        }
        // Close if closing or closed
        try {
          wsRef.current.close()
        } catch (e) {
          // Ignore errors when closing
        }
        wsRef.current = null
      }
    
      if (isReconnect) {
        setIsReconnecting(true)
        reconnectAttemptsRef.current = retryCount
      }
    
      const ws = new WebSocket(wsUrl)
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close()
          if (retryCount < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, retryCount), 5000) // Exponential backoff
            setTimeout(() => {
              connectWebSocket(sessionId, retryCount + 1, true).then(resolve)
            }, delay)
          } else {
            setIsReconnecting(false)
            setWsConnected(false)
            showToast('Failed to connect. Please refresh the page.', 'error')
            resolve(false)
          }
        }
      }, 5000) // Increased timeout to 5 seconds
      
      wsRef.current = ws

      ws.onopen = () => {
        clearTimeout(connectionTimeout)
        console.log('WebSocket connected')
        setWsConnected(true)
        setIsReconnecting(false)
        reconnectAttemptsRef.current = 0
        resolve(true)
      }

    ws.onmessage = (event) => {
        try {
      const data = JSON.parse(event.data)
      
      if (data.type === 'typing') {
        // Show typing indicator immediately for instant feedback
        if (data.status) {
          setMessages((prev) => {
            const updated = [...prev]
            const lastMsg = updated[updated.length - 1]
            // Only add typing indicator if last message isn't already assistant
            if (!lastMsg || lastMsg.role !== 'assistant') {
              return [...updated, { role: 'assistant' as const, content: '...' }]
            }
            return updated
          })
        }
      } else if (data.type === 'chunk') {
        setMessages((prev) => {
          const updated = [...prev]
          const lastMsg = updated[updated.length - 1]
          if (lastMsg && lastMsg.role === 'assistant') {
            // Replace typing indicator or append content
            if (lastMsg.content === '...') {
              lastMsg.content = data.content
            } else {
              lastMsg.content += data.content
            }
            return updated
          } else {
            return [...updated, { role: 'assistant' as const, content: data.content }]
          }
        })
      } else if (data.type === 'done') {
        setIsLoading(false)
        if (data.product_results) {
          setProductResults(data.product_results)
        }
      } else if (data.type === 'error') {
        setIsLoading(false)
        console.error('WebSocket error:', data.error)
        const errorMsg = data.error || 'An error occurred. Please try again.'
        showToast(errorMsg, 'error')
        // Add error message to chat
        setMessages((prev) => [...prev, { 
          role: 'assistant' as const, 
          content: `❌ Error: ${errorMsg}` 
        }])
      } else if (data.error) {
        // Handle plain error objects
        setIsLoading(false)
        console.error('WebSocket error:', data.error)
        showToast(data.error, 'error')
      }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
          setIsLoading(false)
      }
    }

      ws.onerror = (error) => {
        clearTimeout(connectionTimeout)
        console.error('WebSocket error:', error)
        setWsConnected(false)
        // Don't resolve here, let onclose handle reconnection
      }

      ws.onclose = (event) => {
        clearTimeout(connectionTimeout)
        setWsConnected(false)
        
        const closeReasons: { [key: number]: string } = {
          1000: 'Normal closure',
          1001: 'Going away',
          1006: 'Abnormal closure (connection lost)',
          1008: 'Policy violation (authentication failed)',
          1011: 'Internal server error',
          1012: 'Service restart',
        }
        const reason = closeReasons[event.code] || `Code ${event.code}`
        console.log(`WebSocket disconnected: ${reason}`, event.code, event.reason)
        
        // Don't reconnect for authentication errors
        if (event.code === 1008) {
          setIsLoading(false)
          setIsReconnecting(false)
          showToast('Authentication failed. Please try logging out and back in.', 'error')
          resolve(false)
          return
        }
        
        // Don't reconnect for normal closures
        if (event.code === 1000) {
          setIsReconnecting(false)
          resolve(false)
          return
        }
        
        // For abnormal closures and other errors, try to reconnect (with longer delays to prevent connection spam)
        if (event.code !== 1000 && retryCount < maxRetries) {
          const delay = Math.min(2000 * Math.pow(2, retryCount), 10000) // Exponential backoff: 2s, 4s, 8s (longer to prevent spam)
          console.log(`Reconnecting in ${delay}ms... (attempt ${retryCount + 1}/${maxRetries})`)
          
          if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current)
          }
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connectWebSocket(sessionId, retryCount + 1, true).then(resolve)
          }, delay) as any
        } else {
          // Max retries reached - but continue trying in background
          setIsReconnecting(false)
          setIsLoading(false)
          
          if (event.code === 1006) {
            // Connection lost - try to reconnect after checking backend health
            console.log('Connection lost. Checking backend health and will retry...')
            
            // Check if backend is available before showing error
            checkBackendHealth().then((backendHealthy) => {
              if (backendHealthy) {
                // Backend is healthy, retry connection after delay
                console.log('Backend is healthy. Retrying WebSocket connection in 5 seconds...')
                setTimeout(() => {
                  if (currentSession?.id && typeof currentSession.id === 'number') {
                    connectWebSocket(currentSession.id, 0, true)
                  }
                }, 5000)
                showToast('Connection lost. Reconnecting automatically...', 'info')
              } else {
                // Backend is down
                const errorMsg = 'Connection lost. The backend server may be down. Auto-restarting...'
                showToast(errorMsg, 'error')
                // Add helpful message to chat
                setMessages((prev) => [...prev, { 
                  role: 'assistant' as const, 
                  content: '⚠️ **Connection Lost**\n\nThe WebSocket connection failed. The backend watchdog is attempting to restart the server automatically.\n\n**What\'s happening:**\n- Backend server is restarting\n- This usually takes 10-30 seconds\n- Connection will be restored automatically\n\n**You can:**\n- Wait for automatic reconnection\n- Click the "Reconnect" button in the header\n- Or refresh the page'
                }])
                
                // Retry after longer delay when backend is down
                setTimeout(() => {
                  if (currentSession?.id && typeof currentSession.id === 'number') {
                    connectWebSocket(currentSession.id, 0, true)
                  }
                }, 15000) // Wait 15 seconds for backend to restart
              }
            }).catch(() => {
              // If health check fails, assume backend is down and retry
              showToast('Connection lost. Reconnecting automatically...', 'info')
              setTimeout(() => {
                if (currentSession?.id && typeof currentSession.id === 'number') {
                  connectWebSocket(currentSession.id, 0, true)
                }
              }, 5000)
            })
          } else {
            showToast(`Connection closed: ${reason}. Will retry...`, 'warning')
            // Retry after delay for other errors
            setTimeout(() => {
              if (currentSession?.id && typeof currentSession.id === 'number') {
                connectWebSocket(currentSession.id, 0, true)
              }
            }, 5000)
          }
          resolve(false)
        }
      }
    })
  }

  const handleSend = async () => {
    if (!input.trim() || !currentSession || isLoading) return

    const userMessage = input.trim()
    
    // Check if message is asking for prices/products and user is not authenticated
    const priceKeywords = ['price', 'cost', 'buy', 'purchase', 'available', 'stock', 'product', 'laptop', 'phone', 'tablet', 'monitor']
    const isPriceQuery = priceKeywords.some(keyword => userMessage.toLowerCase().includes(keyword))
    
    if (isPriceQuery && !isAuthenticated) {
      showToast('Please login to get product prices and availability', 'warning')
      setInput('')
      // Show login prompt
      setTimeout(() => {
        if (confirm('Login required for pricing information. Would you like to login now?')) {
          router.push('/login?redirect=/chat')
        }
      }, 500)
      return
    }

    setInput('')
    setIsLoading(true)
    setProductResults([])

    const userMsg = { role: 'user' as const, content: userMessage }
    addMessage(userMsg)

    // For unauthenticated users, provide helpful AI-like responses
      if (!isAuthenticated) {
        // Save message to local storage
        const updatedMessages = [...(currentSession?.messages || []), userMsg]
        const updatedSession = {
          ...currentSession,
          messages: updatedMessages,
        }
        setCurrentSession(updatedSession as any)
        
        // Update local storage
        const localSessions = localStorage.getItem('temp_chat_sessions')
        const sessions = localSessions ? JSON.parse(localSessions) : []
        const sessionIndex = sessions.findIndex((s: any) => s.id === currentSession?.id)
        if (sessionIndex >= 0) {
          sessions[sessionIndex] = updatedSession
          localStorage.setItem('temp_chat_sessions', JSON.stringify(sessions))
        }

      // Generate helpful AI-like response based on query
        setTimeout(() => {
        let response = ""
        const lowerMessage = userMessage.toLowerCase().trim()
        const conversationHistory = currentSession?.messages || []
        const lastFewMessages = conversationHistory.slice(-4).map(m => m.content.toLowerCase())
        
        // Greetings and casual conversation
        if (/^(hello|hi|hey|good morning|good afternoon|good evening|greetings|howdy)$/i.test(lowerMessage) || 
            lowerMessage.startsWith('hello') || lowerMessage.startsWith('hi ') || lowerMessage.startsWith('hey ')) {
          response = "Hello! I'm ProcureX, your AI procurement assistant. I can help you find IT products, compare prices, check availability, and connect you with verified vendors. What are you looking for today?"
        } else if (lowerMessage.includes('how are you') || lowerMessage.includes("how's it going") || lowerMessage.includes('how do you do')) {
          response = "I'm doing great, thank you for asking! I'm here and ready to help you with your IT procurement needs. What can I assist you with today?"
        } else if (/^(thanks?|thank you|appreciate it)$/i.test(lowerMessage) || lowerMessage.startsWith('thank')) {
          response = "You're very welcome! I'm happy to help. To access pricing and vendor information, please login to your account. Is there anything else I can help with?"
        } else if (lowerMessage.includes('product') || lowerMessage.includes('laptop') || lowerMessage.includes('phone') || lowerMessage.includes('tablet') || lowerMessage.includes('monitor')) {
          response = "I can help you find IT products! However, to see real-time pricing, availability, and vendor information, please login to your account. Once logged in, I'll instantly show you matching products with prices, stock levels, and verified vendor details. Would you like to login now?"
        } else if (lowerMessage.includes('quote') || lowerMessage.includes('quotation')) {
          response = "I can generate professional quotations for you! To create and export quotations, please login to your ProcureX account. After logging in, I can help you build detailed quotes with product specifications, pricing, and vendor information."
        } else if (lowerMessage.includes('vendor') || lowerMessage.includes('supplier')) {
          response = "ProcureX connects you with verified vendors for IT products. After you login, I can show you vendor profiles, contact information, product catalogs, and stock availability. This helps ensure you're working with trusted suppliers."
        } else if (lowerMessage.includes('what can you') || lowerMessage.includes('help me') || lowerMessage.includes('what do you do')) {
          response = "I'm ProcureX, your AI procurement assistant! Here's what I can help you with:\n\n🔍 **Product Discovery**: Find IT products matching your requirements\n💰 **Pricing Information**: Get current prices from verified vendors\n📊 **Availability Checks**: Check stock levels in real-time\n🏢 **Vendor Connections**: Connect with verified suppliers\n📄 **Quotation Generation**: Create professional procurement quotes\n\nTo access these features, please login to your account. What would you like to know?"
        } else {
          response = "I'm here to help with IT procurement! I can assist you with:\n\n• Finding IT products (laptops, phones, tablets, accessories)\n• Comparing prices and specifications\n• Checking availability and stock levels\n• Connecting with verified vendors\n• Generating quotations\n\nTo access pricing and vendor information, please login to your account. What would you like to know?"
        }
        
          const assistantMsg = { role: 'assistant' as const, content: response }
          addMessage(assistantMsg)
          
          // Save assistant message to local storage
          const finalMessages = [...updatedMessages, assistantMsg]
          const finalSession = {
            ...updatedSession,
            messages: finalMessages,
          }
          setCurrentSession(finalSession as any)
          if (sessionIndex >= 0) {
            sessions[sessionIndex] = finalSession
            localStorage.setItem('temp_chat_sessions', JSON.stringify(sessions))
          }
          
          setIsLoading(false)
      }, 500)
      return
    }

    // Authenticated users: Try WebSocket first, fallback to REST API
    try {
      // Try to ensure WebSocket is connected
      const connected = await connectWebSocket(currentSession.id)
      
      if (connected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        // Wait a bit for WebSocket to be fully ready
        await new Promise(resolve => setTimeout(resolve, 100))
        wsRef.current.send(JSON.stringify({ message: userMessage }))
        return
      }

      // Fallback to REST API with simulated streaming
      console.log('WebSocket not available, using REST API fallback')
      
      // Save message via REST API
      try {
      await chatAPI.createMessage(currentSession.id, userMessage)
      } catch (e) {
        console.error('Failed to save message:', e)
      }

      // Simulate streaming response using REST API
      // First, get a basic response
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
      
      try {
        // Try to get AI response via a simple endpoint or use fallback
        const response = await fetch(`${apiUrl}/api/v1/chat/sessions/${currentSession.id}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token || ''}`
          },
          body: JSON.stringify({ content: userMessage, role: 'user' })
        })

        // Generate intelligent contextual response
        let assistantResponse = ""
        const lowerMessage = userMessage.toLowerCase().trim()
        const currencySymbol = await getCurrencySymbol()
        const priceRange = await formatPriceRange(30000, 80000)
        
        // Get conversation context
        const conversationHistory = currentSession?.messages || []
        const lastFewMessages = conversationHistory.slice(-4).map(m => m.content.toLowerCase())
        
        // Greetings and casual conversation
        if (/^(hello|hi|hey|good morning|good afternoon|good evening|greetings|howdy)$/i.test(lowerMessage) || 
            lowerMessage.startsWith('hello') || lowerMessage.startsWith('hi ') || lowerMessage.startsWith('hey ')) {
          assistantResponse = "Hello! I'm ProcureX, your AI procurement assistant. I can help you find IT products, compare prices, check availability, and connect you with verified vendors. What are you looking for today?"
        } 
        // How are you / how's it going
        else if (lowerMessage.includes('how are you') || lowerMessage.includes("how's it going") || lowerMessage.includes('how do you do')) {
          assistantResponse = "I'm doing great, thank you for asking! I'm here and ready to help you with your IT procurement needs. What can I assist you with today?"
        }
        // Thank you / thanks
        else if (/^(thanks?|thank you|appreciate it)$/i.test(lowerMessage) || lowerMessage.startsWith('thank')) {
          assistantResponse = "You're very welcome! I'm happy to help. Is there anything else you'd like to know about our products or services?"
        }
        // Product queries - laptop
        else if (lowerMessage.includes('laptop') || lowerMessage.includes('computer') || lowerMessage.includes('notebook')) {
          // Check if it's about age/kids
          if (lowerMessage.includes('12') || lowerMessage.includes('kid') || lowerMessage.includes('child') || lowerMessage.includes('son') || lowerMessage.includes('daughter')) {
            assistantResponse = `I can help you find the perfect laptop! For a 12-year-old, I'd recommend:\n\n**Educational Laptops (Budget-friendly):**\n• 13-15 inch screen size\n• 8GB RAM minimum\n• 256GB storage\n• Intel Core i3/i5 or AMD Ryzen 3/5\n• Lightweight for carrying to school\n\n**Key Considerations:**\n• Durability and build quality\n• Good battery life\n• Suitable for schoolwork, light gaming, and creative projects\n• Parental controls and safety features\n\n**Price Range:** ${priceRange}\n\nWould you like me to show you specific laptop models that match these criteria? I can search our catalog for verified vendors with current pricing and availability.`
          } else {
            assistantResponse = `I can help you find the perfect laptop! To recommend the best option, I need to know:\n\n• What will you primarily use it for? (work, gaming, school, creative tasks)\n• Budget range\n• Any specific requirements? (screen size, RAM, storage, portability)\n\nOnce you share these details, I'll search our catalog and show you matching laptops with prices, specifications, and vendor information. What's your budget range?`
          }
        }
        // Product queries - phone
        else if (lowerMessage.includes('phone') || lowerMessage.includes('smartphone') || lowerMessage.includes('mobile')) {
          assistantResponse = "I can help you find a suitable phone! To recommend the best options, tell me:\n\n• What features are important to you? (camera, battery life, performance)\n• Budget range\n• Brand preferences (if any)\n• Intended use (calls, social media, gaming, work)\n\nWould you like me to search for available phones with current pricing?"
        }
        // Product queries - general
        else if (lowerMessage.includes('product') || lowerMessage.includes('item') || lowerMessage.includes('buy') || lowerMessage.includes('purchase')) {
          assistantResponse = "I can help you find IT products! What specifically are you looking for?\n\n• Product type (laptops, phones, tablets, monitors, accessories, etc.)\n• Specifications or features you need\n• Budget range\n• Quantity needed\n\nOnce you provide these details, I'll search our catalog and show you matching products with real-time pricing and vendor information!"
        }
        // Price queries
        else if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('how much') || lowerMessage.includes('pricing')) {
          assistantResponse = "I can help you get pricing information! To provide accurate prices for IT products, I need to know:\n\n• What product are you interested in?\n• Any specific specifications or brand preferences?\n• Quantity needed?\n\nOnce you provide these details, I'll search our database and show you current prices from verified vendors along with availability."
        }
        // What can you do / help
        else if (lowerMessage.includes('what can you') || lowerMessage.includes('help me') || lowerMessage.includes('what do you do') || lowerMessage.includes('capabilities')) {
          assistantResponse = "I'm ProcureX, your AI procurement assistant! Here's what I can help you with:\n\n🔍 **Product Discovery**: Find IT products matching your requirements\n💰 **Pricing Information**: Get current prices from verified vendors\n📊 **Availability Checks**: Check stock levels in real-time\n🏢 **Vendor Connections**: Connect with verified suppliers\n📄 **Quotation Generation**: Create professional procurement quotes\n📋 **Product Comparison**: Compare specifications and prices\n✨ **Smart Recommendations**: Get AI-powered product suggestions\n\nJust tell me what you're looking for, and I'll help you find it quickly!"
        }
        // Default contextual response
        else {
          // Check conversation context to provide more relevant response
          if (lastFewMessages.some(m => m.includes('laptop') || m.includes('computer'))) {
            assistantResponse = "I'd be happy to help you with laptop recommendations! Could you tell me more about:\n\n• Your budget range\n• Primary use case (work, gaming, school, etc.)\n• Any specific requirements?\n\nThis will help me find the perfect laptop for you!"
          } else if (lastFewMessages.some(m => m.includes('phone') || m.includes('mobile'))) {
            assistantResponse = "I can help you find the perfect phone! What specific features or budget are you looking for?"
          } else {
            assistantResponse = "I'm here to help with your IT procurement needs! I can assist you with finding products, checking prices, verifying vendors, and generating quotations.\n\nWhat would you like to do today? You can ask me about:\n\n• Specific IT products (laptops, phones, tablets, etc.)\n• Product availability and pricing\n• Vendor information\n• Creating quotations\n\nJust let me know what you need!"
          }
        }

        // Simulate streaming by adding characters one by one
        const assistantMsg = { role: 'assistant' as const, content: '' }
        addMessage(assistantMsg)
        
        for (let i = 0; i < assistantResponse.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 20))
          setMessages((prev) => {
            const updated = [...prev]
            const lastMsg = updated[updated.length - 1]
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.content = assistantResponse.substring(0, i + 1)
              return updated
            }
            return updated
          })
        }

        setIsLoading(false)
      } catch (apiError: any) {
        console.error('API error:', apiError)
        // Use same intelligent fallback as above
        let assistantResponse = ""
        const lowerMessage = userMessage.toLowerCase().trim()
        const conversationHistory = currentSession?.messages || []
        const lastFewMessages = conversationHistory.slice(-4).map(m => m.content.toLowerCase())
        const currencySymbol = await getCurrencySymbol()
        const priceRange = await formatPriceRange(30000, 80000)
        
        // Use same logic as above
        if (/^(hello|hi|hey|good morning|good afternoon|good evening|greetings|howdy)$/i.test(lowerMessage) || 
            lowerMessage.startsWith('hello') || lowerMessage.startsWith('hi ') || lowerMessage.startsWith('hey ')) {
          assistantResponse = "Hello! I'm ProcureX, your AI procurement assistant. I can help you find IT products, compare prices, check availability, and connect you with verified vendors. What are you looking for today?"
        } else if (lowerMessage.includes('how are you') || lowerMessage.includes("how's it going") || lowerMessage.includes('how do you do')) {
          assistantResponse = "I'm doing great, thank you for asking! I'm here and ready to help you with your IT procurement needs. What can I assist you with today?"
        } else if (/^(thanks?|thank you|appreciate it)$/i.test(lowerMessage) || lowerMessage.startsWith('thank')) {
          assistantResponse = "You're very welcome! I'm happy to help. Is there anything else you'd like to know about our products or services?"
        } else if (lowerMessage.includes('laptop') || lowerMessage.includes('computer') || lowerMessage.includes('notebook')) {
          if (lowerMessage.includes('12') || lowerMessage.includes('kid') || lowerMessage.includes('child') || lowerMessage.includes('son') || lowerMessage.includes('daughter')) {
            assistantResponse = `I can help you find the perfect laptop! For a 12-year-old, I'd recommend:\n\n**Educational Laptops (Budget-friendly):**\n• 13-15 inch screen size\n• 8GB RAM minimum\n• 256GB storage\n• Intel Core i3/i5 or AMD Ryzen 3/5\n• Lightweight for carrying to school\n\n**Key Considerations:**\n• Durability and build quality\n• Good battery life\n• Suitable for schoolwork, light gaming, and creative projects\n• Parental controls and safety features\n\n**Price Range:** ${priceRange}\n\nWould you like me to show you specific laptop models that match these criteria? I can search our catalog for verified vendors with current pricing and availability.`
          } else {
            assistantResponse = `I can help you find the perfect laptop! To recommend the best option, I need to know:\n\n• What will you primarily use it for? (work, gaming, school, creative tasks)\n• Budget range\n• Any specific requirements? (screen size, RAM, storage, portability)\n\nOnce you share these details, I'll search our catalog and show you matching laptops with prices, specifications, and vendor information. What's your budget range?`
          }
        } else if (lowerMessage.includes('phone') || lowerMessage.includes('smartphone') || lowerMessage.includes('mobile')) {
          assistantResponse = "I can help you find a suitable phone! To recommend the best options, tell me:\n\n• What features are important to you? (camera, battery life, performance)\n• Budget range\n• Brand preferences (if any)\n• Intended use (calls, social media, gaming, work)\n\nWould you like me to search for available phones with current pricing?"
        } else if (lowerMessage.includes('product') || lowerMessage.includes('item') || lowerMessage.includes('buy') || lowerMessage.includes('purchase')) {
          assistantResponse = "I can help you find IT products! What specifically are you looking for?\n\n• Product type (laptops, phones, tablets, monitors, accessories, etc.)\n• Specifications or features you need\n• Budget range\n• Quantity needed\n\nOnce you provide these details, I'll search our catalog and show you matching products with real-time pricing and vendor information!"
        } else if (lowerMessage.includes('what can you') || lowerMessage.includes('help me') || lowerMessage.includes('what do you do')) {
          assistantResponse = "I'm ProcureX, your AI procurement assistant! Here's what I can help you with:\n\n🔍 **Product Discovery**: Find IT products matching your requirements\n💰 **Pricing Information**: Get current prices from verified vendors\n📊 **Availability Checks**: Check stock levels in real-time\n🏢 **Vendor Connections**: Connect with verified suppliers\n📄 **Quotation Generation**: Create professional procurement quotes\n📋 **Product Comparison**: Compare specifications and prices\n✨ **Smart Recommendations**: Get AI-powered product suggestions\n\nJust tell me what you're looking for, and I'll help you find it quickly!"
        } else {
          if (lastFewMessages.some(m => m.includes('laptop') || m.includes('computer'))) {
            assistantResponse = "I'd be happy to help you with laptop recommendations! Could you tell me more about:\n\n• Your budget range\n• Primary use case (work, gaming, school, etc.)\n• Any specific requirements?\n\nThis will help me find the perfect laptop for you!"
          } else if (lastFewMessages.some(m => m.includes('phone') || m.includes('mobile'))) {
            assistantResponse = "I can help you find the perfect phone! What specific features or budget are you looking for?"
          } else {
            assistantResponse = "I'm here to help with your IT procurement needs! I can assist you with finding products, checking prices, verifying vendors, and generating quotations.\n\nWhat would you like to do today? You can ask me about:\n\n• Specific IT products (laptops, phones, tablets, etc.)\n• Product availability and pricing\n• Vendor information\n• Creating quotations\n\nJust let me know what you need!"
        }
        }

        // Simulate streaming
        const assistantMsg = { role: 'assistant' as const, content: '' }
        addMessage(assistantMsg)
        
        for (let i = 0; i < assistantResponse.length; i++) {
          await new Promise(resolve => setTimeout(resolve, 20))
          setMessages((prev) => {
            const updated = [...prev]
            const lastMsg = updated[updated.length - 1]
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.content = assistantResponse.substring(0, i + 1)
              return updated
            }
            return updated
          })
        }

        setIsLoading(false)
      }
    } catch (error: any) {
        console.error('Failed to send message:', error)
        const errorMessage =
          error?.response?.data?.detail ||
          error?.message ||
          'Failed to send message. Please try again.'
        showToast(errorMessage, 'error')
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Handle logout
  const handleLogout = async () => {
    await logout()
    setShowUserMenu(false)
    router.push('/login')
    showToast('Logged out successfully', 'success')
  }

  // Close user menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false)
      }
      if (userMenuHeaderRef.current && !userMenuHeaderRef.current.contains(event.target as Node)) {
        setShowUserMenuHeader(false)
      }
    }

    if (showUserMenu || showUserMenuHeader) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showUserMenu, showUserMenuHeader])

  // Check if user has reached chat limit (for non-authenticated or free users)
  const chatLimit = isAuthenticated ? Infinity : 5 // Free users get 5 chats
  const localSessionsCount = !isAuthenticated ? (() => {
    if (typeof window !== 'undefined') {
      const local = localStorage.getItem('temp_chat_sessions')
      return local ? JSON.parse(local).length : 0
    }
    return 0
  })() : 0
  const totalSessions = isAuthenticated ? sessions.length : localSessionsCount
  const remainingChats = isAuthenticated ? Infinity : Math.max(0, chatLimit - totalSessions)
  const hasReachedLimit = !isAuthenticated && totalSessions >= chatLimit

  return (
    <div className="fixed inset-0 top-0 flex bg-[#212121] overflow-hidden">
      {/* Sidebar - Navigation & Chat History (ChatGPT style) */}
      <div className={`${showSidebar ? 'w-64' : 'w-0'} hidden md:block bg-[#171717] border-r border-[#2f2f2f] transition-all duration-300 overflow-hidden flex flex-col relative`}>
        {/* New Chat Button */}
          <div className="p-3 border-b border-[#2f2f2f]">
          <Button
            variant="ghost"
            size="sm"
            onClick={createNewSession}
            disabled={hasReachedLimit}
            className="w-full justify-start bg-transparent hover:bg-[#2f2f2f] text-[#ececec] border border-[#2f2f2f] disabled:opacity-50"
          >
            <Plus className="w-4 h-4 mr-2" />
            New chat
          </Button>
          {hasReachedLimit && (
            <p className="text-xs text-[#8e8e8e] mt-2 px-2">
              Chat limit reached. <Link href="/login" className="text-primary-600 hover:underline">Login</Link> for unlimited chats.
            </p>
          )}
        </div>

        {/* Utility Links */}
        <div className="p-2 border-b border-[#2f2f2f] space-y-1">
          <p className="text-xs text-[#b4b4b4] px-3 py-2 uppercase tracking-wider">Menu</p>
          <button 
            onClick={() => setShowSearchModal(true)}
            className="w-full flex items-center space-x-2 px-3 py-2.5 rounded-lg hover:bg-[#2f2f2f] transition-colors text-[#ececec]"
          >
            <Search className="w-4 h-4 text-[#b4b4b4]" />
            <span className="text-sm">Search chats</span>
          </button>
          <Link
            href="/quotations"
            className="w-full flex items-center space-x-2 px-3 py-2.5 rounded-lg hover:bg-[#2f2f2f] transition-colors text-[#ececec]"
          >
            <BookOpen className="w-4 h-4 text-[#b4b4b4]" />
            <span className="text-sm">Library</span>
          </Link>
          <Link
            href="/quotations"
            className="w-full flex items-center space-x-2 px-3 py-2.5 rounded-lg hover:bg-[#2f2f2f] transition-colors text-[#ececec]"
          >
            <Folder className="w-4 h-4 text-[#b4b4b4]" />
            <span className="text-sm">Projects</span>
          </Link>
        </div>

        {/* Navigation Links */}
        <div className="p-2 border-b border-[#2f2f2f] space-y-1">
          <p className="text-xs text-[#b4b4b4] px-3 py-2 uppercase tracking-wider">Workspace</p>
          <Link
            href="https://www.bison.ng"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-2 px-3 py-2.5 rounded-lg hover:bg-[#2f2f2f] transition-colors text-[#ececec]"
          >
            <Image src="/images/bisonbooks.svg" alt="BisonBooks" width={20} height={20} />
            <span className="text-sm">BisonBooks</span>
          </Link>
          <Link
            href="/products"
            className="flex items-center space-x-2 px-3 py-2.5 rounded-lg hover:bg-[#2f2f2f] transition-colors text-[#ececec]"
          >
            <ShoppingCart className="w-4 h-4 text-[#b4b4b4]" />
            <span className="text-sm">Browse Products</span>
          </Link>
          <Link
            href="/quotations"
            className="flex items-center space-x-2 px-3 py-2.5 rounded-lg hover:bg-[#2f2f2f] transition-colors text-[#ececec]"
          >
            <FileText className="w-4 h-4 text-[#b4b4b4]" />
            <span className="text-sm">Quotations</span>
          </Link>
        </div>

        {/* Recent Chats */}
        <div className="flex-1 overflow-y-auto pb-24">
          <div className="p-2">
            <div className="px-3 mb-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#8e8e8e]" />
                <input
                  type="text"
                  placeholder="Search chats..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#2f2f2f] border border-[#2f2f2f] rounded-lg text-[#ececec] placeholder-[#8e8e8e] focus:outline-none focus:ring-2 focus:ring-gray-600"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 transform -translate-y-1/2 text-[#8e8e8e] hover:text-[#ececec]"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-[#b4b4b4] px-3 py-2 uppercase tracking-wider">Recent Chats</p>
            {(() => {
              const filteredSessions = searchQuery
                ? sessions.filter((session) =>
                    (session.title || `Chat ${session.id}`)
                      .toLowerCase()
                      .includes(searchQuery.toLowerCase())
                  )
                : sessions

              if (filteredSessions.length === 0) {
                return (
                  <p className="text-xs text-[#8e8e8e] px-3 py-2">
                    {searchQuery ? 'No chats found' : 'No recent chats'}
                  </p>
                )
              }

              return filteredSessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => {
                    selectSession(session.id)
                    setSearchQuery('')
                  }}
                  className={`w-full text-left px-3 py-2.5 rounded-lg hover:bg-[#2f2f2f] transition-colors mb-1 group ${
                    currentSession?.id === session.id ? 'bg-[#2f2f2f]' : ''
                  }`}
                >
                  <p className="text-sm text-[#ececec] truncate flex items-center">
                    <MessageSquare className="w-4 h-4 mr-2 text-[#b4b4b4]" />
                    {session.title || `Chat ${session.id}`}
                  </p>
                </button>
              ))
            })()}
          </div>
        </div>

        {/* User Info / Login Prompt */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-[#2f2f2f] bg-[#171717]">
          {isAuthenticated ? (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[#2f2f2f] transition-colors text-left"
              >
                <div className="text-xs text-[#b4b4b4] flex-1">
                  <p className="text-[#ececec] font-medium mb-1">{user?.full_name || user?.email}</p>
                  <p>Unlimited chats</p>
                </div>
                <ChevronUp className={`w-4 h-4 text-[#b4b4b4] transition-transform ${showUserMenu ? '' : 'rotate-180'}`} />
              </button>
              
              {showUserMenu && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#2f2f2f] border border-[#2f2f2f] rounded-lg shadow-lg overflow-hidden z-50">
                  <Link
                    href="/profile"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center space-x-2 px-4 py-3 text-sm text-[#ececec] hover:bg-[#3d3d3d] transition-colors"
                  >
                    <User className="w-4 h-4" />
                    <span>Profile</span>
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center space-x-2 px-4 py-3 text-sm text-red-400 hover:bg-[#3d3d3d] transition-colors text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col w-full space-y-2">
              <p className="text-xs text-[#b4b4b4]">
                {remainingChats > 0 ? (
                  <span>{remainingChats} chat{remainingChats !== 1 ? 's' : ''} remaining</span>
                ) : (
                  <span className="text-amber-400">Chat limit reached</span>
                )}
              </p>
              <div className="flex space-x-2">
                <Link href="/login" className="flex-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full bg-primary-600 hover:bg-primary-700 text-white border-0 text-xs px-4 py-2"
                  >
                    Login
                  </Button>
                </Link>
                <Link href="/register" className="flex-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full bg-transparent border border-[#2f2f2f] text-[#ececec] hover:bg-[#2f2f2f] text-xs px-4 py-2"
                  >
                    Sign up
                  </Button>
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Search Modal */}
      {showSearchModal && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-start justify-center pt-20"
          onClick={() => {
            setShowSearchModal(false)
            setSearchQuery('')
          }}
        >
          <div 
            className="bg-[#2f2f2f] border border-[#2f2f2f] rounded-lg w-full max-w-md mx-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-[#2f2f2f]">
              <div className="flex items-center space-x-2 mb-3">
                <Search className="w-5 h-5 text-[#b4b4b4]" />
                <h3 className="text-lg font-semibold text-[#ececec]">Search Chats</h3>
              </div>
              <input
                type="text"
                placeholder="Search by chat title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 bg-[#171717] border border-[#2f2f2f] rounded-lg text-[#ececec] placeholder-[#8e8e8e] focus:outline-none focus:ring-2 focus:ring-primary-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setShowSearchModal(false)
                    setSearchQuery('')
                  }
                }}
              />
            </div>
            <div className="max-h-96 overflow-y-auto p-2">
              {searchQuery ? (
                sessions.filter((session) =>
                  (session.title || `Chat ${session.id}`)
                    .toLowerCase()
                    .includes(searchQuery.toLowerCase())
                ).length > 0 ? (
                  sessions
                    .filter((session) =>
                      (session.title || `Chat ${session.id}`)
                        .toLowerCase()
                        .includes(searchQuery.toLowerCase())
                    )
                    .map((session) => (
                      <button
                        key={session.id}
                        onClick={() => {
                          selectSession(session.id)
                          setShowSearchModal(false)
                          setSearchQuery('')
                        }}
                        className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-[#3d3d3d] transition-colors mb-1 text-[#ececec]"
                      >
                        <p className="text-sm flex items-center">
                          <MessageSquare className="w-4 h-4 mr-2 text-[#b4b4b4]" />
                          {session.title || `Chat ${session.id}`}
                        </p>
                      </button>
                    ))
                ) : (
                  <p className="text-sm text-[#8e8e8e] px-3 py-4 text-center">No chats found</p>
                )
              ) : (
                <p className="text-sm text-[#8e8e8e] px-3 py-4 text-center">Start typing to search...</p>
              )}
            </div>
            <div className="p-4 border-t border-[#2f2f2f]">
              <button
                onClick={() => {
                  setShowSearchModal(false)
                  setSearchQuery('')
                }}
                className="w-full px-4 py-2 bg-[#171717] border border-[#2f2f2f] rounded-lg text-[#ececec] hover:bg-[#2f2f2f] transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Chat Area - ChatGPT Style */}
      <div className="flex-1 flex flex-col bg-[#212121]">
        {/* Top Header */}
        <div className="bg-[#171717] border-b border-[#2f2f2f] px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-[#ececec]">
            <Package className="w-5 h-5 text-primary-600" />
            <span className="font-semibold">ProcureX</span>
            <span className="text-[#8e8e8e] text-sm hidden sm:inline">v1</span>
            {isAuthenticated && (
              <div className="flex items-center space-x-2 ml-4">
                {backendAvailable === false && (
                  <span className="text-xs text-red-400 flex items-center mr-2" title="Backend server is not running">
                    <div className="w-2 h-2 bg-red-400 rounded-full mr-1 animate-pulse"></div>
                    Backend Offline
                  </span>
                )}
                {isReconnecting ? (
                  <span className="text-xs text-amber-400 flex items-center">
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                    Reconnecting...
                  </span>
                ) : wsConnected ? (
                  <span className="text-xs text-green-400 flex items-center">
                    <div className="w-2 h-2 bg-green-400 rounded-full mr-1"></div>
                    Connected
                  </span>
                ) : (
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-red-400 flex items-center">
                      <div className="w-2 h-2 bg-red-400 rounded-full mr-1"></div>
                      Disconnected
                    </span>
                    {currentSession?.id && typeof currentSession.id === 'number' && (
                      <button
                        onClick={async () => {
                          // Check backend first
                          const backendHealthy = await checkBackendHealth()
                          if (!backendHealthy) {
                            showToast('Backend server is not running. Please start it with: cd backend && uvicorn app.main:app --reload', 'error')
                            return
                          }
                          
                          setIsReconnecting(true)
                          const connected = await connectWebSocket(currentSession.id, 0, true)
                          if (!connected) {
                            setIsReconnecting(false)
                            showToast('Failed to reconnect. Please check if the backend server is running.', 'error')
                          }
                        }}
                        className="text-xs text-primary-600 hover:text-primary-700 underline"
                        title="Reconnect WebSocket"
                      >
                        Reconnect
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center space-x-3">
            {/* Internet Speed Test */}
            <SpeedTest />
            <Link
              href="/upgrade"
              className="hidden md:inline-flex items-center text-xs uppercase tracking-wide border border-primary-500 text-primary-600 px-3 py-1.5 rounded-full hover:bg-primary-600/10 transition"
            >
              Upgrade to Pro
            </Link>
            <button className="p-2 rounded-full text-[#b4b4b4] hover:bg-[#2f2f2f]">
              <Bell className="w-4 h-4" />
            </button>
            {isAuthenticated ? (
              <div className="relative" ref={userMenuHeaderRef}>
                <button
                  onClick={() => setShowUserMenuHeader(!showUserMenuHeader)}
                  className="p-2 rounded-full text-[#b4b4b4] hover:bg-[#2f2f2f] relative"
                >
                  <Settings className="w-4 h-4" />
                </button>
                
                {showUserMenuHeader && (
                  <div className="absolute right-0 top-full mt-2 w-48 bg-[#2f2f2f] border border-[#2f2f2f] rounded-lg shadow-lg overflow-hidden z-50">
                    <div className="px-4 py-3 border-b border-[#2f2f2f]">
                      <p className="text-sm font-medium text-[#ececec]">{user?.full_name || user?.email}</p>
                      <p className="text-xs text-[#b4b4b4] mt-1">{user?.email}</p>
                    </div>
                    <Link
                      href="/profile"
                      onClick={() => setShowUserMenuHeader(false)}
                      className="flex items-center space-x-2 px-4 py-3 text-sm text-[#ececec] hover:bg-[#3d3d3d] transition-colors"
                    >
                      <User className="w-4 h-4" />
                      <span>Profile</span>
                    </Link>
                    <button
                      onClick={() => {
                        handleLogout()
                        setShowUserMenuHeader(false)
                      }}
                      className="w-full flex items-center space-x-2 px-4 py-3 text-sm text-red-400 hover:bg-[#3d3d3d] transition-colors text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/login">
                <button className="p-2 rounded-full text-[#b4b4b4] hover:bg-[#2f2f2f]">
                  <Settings className="w-4 h-4" />
                </button>
              </Link>
            )}
          </div>
        </div>

        {/* Mobile Sidebar Toggle */}
        <div className="md:hidden p-3 border-b border-[#2f2f2f] flex items-center justify-between bg-[#171717]">
          <button
            onClick={() => setShowSidebar(!showSidebar)}
            className="p-2 hover:bg-[#2f2f2f] rounded text-[#ececec]"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          <h2 className="font-semibold text-[#ececec]">Chat</h2>
          <button
            onClick={createNewSession}
            className="p-2 hover:bg-[#2f2f2f] rounded text-[#ececec]"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Messages - ChatGPT Style */}
        <div className="flex-1 overflow-y-auto">
          {currentSession?.messages.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center max-w-2xl px-4">
                <h1 className="text-4xl font-semibold text-white mb-4">ProcureX</h1>
                {!isAuthenticated ? (
                  <>
                    <p className="text-[#b4b4b4] text-lg mb-4">I can help you know the price. Find the source. Close the deal.</p>
                    <div className="bg-amber-900/20 border border-amber-700 rounded-lg p-4">
                      <div className="flex items-start space-x-2">
                        <Lock className="w-5 h-5 text-amber-400 mt-0.5" />
                        <div className="text-left">
                          <p className="text-amber-400 font-medium text-sm mb-1">Login Required for Pricing</p>
                          <p className="text-[#b4b4b4] text-xs">To get product prices, availability, and create quotations, please login to your account.</p>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-[#b4b4b4] text-lg mb-8">Ask me about IT products, prices, and availability!</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        "What laptops do you have?",
                        "Show me available phones",
                        "Find products under $500",
                        "What's in stock?"
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => setInput(suggestion)}
                          className="p-3 bg-[#2f2f2f] hover:bg-[#3d3d3d] rounded-lg text-[#ececec] text-left text-sm transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          
          <div className="max-w-3xl mx-auto">
            {currentSession?.messages.map((message, index) => (
              <ChatMessage key={index} message={message} />
            ))}
            
            {isLoading && (
              <div className="px-4 py-8 bg-transparent">
                <div className="flex items-center space-x-3 max-w-3xl mx-auto">
                  <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
                    <MessageSquare className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
              </div>
            )}
            
            {productResults.length > 0 && isAuthenticated && (
              <div className="px-4 py-6 bg-transparent">
                <div className="max-w-3xl mx-auto">
                  <h3 className="text-sm font-semibold text-[#ececec] mb-4">Available Products:</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {productResults.map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            
            {productResults.length > 0 && !isAuthenticated && (
              <div className="px-4 py-6 bg-transparent">
                <div className="max-w-3xl mx-auto">
                  <div className="bg-amber-900/20 border border-amber-700 rounded-lg p-4">
                    <div className="flex items-start space-x-2">
                      <Lock className="w-5 h-5 text-amber-400 mt-0.5" />
                      <div>
                        <p className="text-amber-400 font-medium text-sm mb-1">Login Required</p>
                        <p className="text-[#b4b4b4] text-xs mb-3">Please login to view product prices and details.</p>
                        <Link href="/login">
                          <Button size="sm" className="bg-primary-600 hover:bg-primary-700 text-white">
                            Login Now
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input - ChatGPT Style */}
        <div className="border-t border-[#2f2f2f] bg-[#212121] p-4">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end bg-[#2f2f2f] rounded-2xl border border-transparent shadow-lg">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Message ProcureX..."
                className="flex-1 resize-none bg-transparent text-[#ececec] placeholder-[#8e8e8e] px-4 py-3 focus:outline-none max-h-200px overflow-y-auto"
                rows={1}
                disabled={isLoading}
                style={{ maxHeight: '200px' }}
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="m-2 p-2 rounded-lg bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Send className="w-5 h-5 text-white" />
                )}
              </button>
            </div>
            <p className="text-xs text-[#8e8e8e] text-center mt-2">
              AI can make mistakes. Check important info.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}


