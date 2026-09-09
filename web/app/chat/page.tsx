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
  Search,
  BookOpen,
  Folder,
  Bell,
  Settings,
  User,
  LogOut,
  ChevronUp,
  Building2,
  Mic,
  MicOff,
  AudioLines
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
import { getAccessToken } from '@/lib/sessionToken'
import { naturalChatTitle } from '@/lib/chatTitle'
import { formatPriceRange, getCurrencySymbol } from '@/lib/currency'
import SpeedTest from '@/components/SpeedTest'
import { useVoiceChat } from '@/lib/useVoiceChat'

const LAST_CHAT_KEY = 'procurex_last_chat_id'

function isBlankChat(session: any) {
  const title = (session?.title || 'New chat').trim().toLowerCase()
  const untitled = !title || title === 'new chat' || title === 'newchat'
  const messages = session?.messages
  return untitled && (!messages || messages.length === 0)
}

function persistGuestSessions(updatedSession: any) {
  const localSessions = localStorage.getItem('temp_chat_sessions')
  const stored = localSessions ? JSON.parse(localSessions) : []
  const nextList = [
    updatedSession,
    ...stored.filter((item: any) => item.id !== updatedSession.id),
  ]
  localStorage.setItem('temp_chat_sessions', JSON.stringify(nextList))
  return nextList
}

function rememberChat(id: number | undefined) {
  if (!id || typeof window === 'undefined') return
  try {
    localStorage.setItem(LAST_CHAT_KEY, String(id))
  } catch {
    // ignore storage errors
  }
}

function readLastChatId(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LAST_CHAT_KEY)
    const parsed = raw ? Number(raw) : NaN
    return Number.isFinite(parsed) ? parsed : null
  } catch {
    return null
  }
}

function mergeSessionLists(serverList: any[], localList: any[]) {
  const byId = new Map<number, any>()
  for (const item of serverList) {
    if (item?.id == null) continue
    byId.set(item.id, { ...item, messages: item.messages || [] })
  }
  for (const item of localList) {
    if (item?.id == null) continue
    const existing = byId.get(item.id)
    if (!existing) {
      byId.set(item.id, item)
      continue
    }
    const existingTitle = (existing.title || '').trim()
    const localTitle = (item.title || '').trim()
    const preferLocal =
      localTitle &&
      localTitle.toLowerCase() !== 'new chat' &&
      (!existingTitle || existingTitle.toLowerCase() === 'new chat')
    byId.set(item.id, {
      ...existing,
      ...item,
      title: preferLocal ? localTitle : existingTitle || localTitle,
      messages: existing.messages?.length ? existing.messages : item.messages || [],
    })
  }
  return Array.from(byId.values()).sort((a, b) => {
    const tb = new Date(b.updated_at || b.created_at || 0).getTime()
    const ta = new Date(a.updated_at || a.created_at || 0).getTime()
    return tb - ta
  })
}

export default function ChatPage() {
  const { user, isAuthenticated, authReady } = useAuth()
  const router = useRouter()
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [productResults, setProductResults] = useState<any[]>([])
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
  const wsSessionIdRef = useRef<number | null>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const userMenuHeaderRef = useRef<HTMLDivElement>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const backgroundRetryRef = useRef(0)
  
  const { currentSession, setCurrentSession, addMessage, setMessages, logout } = useStore()
  const [sessions, setSessions] = useState<any[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [clientReady, setClientReady] = useState(false)
  const currentSessionRef = useRef(currentSession)
  currentSessionRef.current = currentSession
  const handleSendRef = useRef<(preset?: string) => Promise<void>>(async () => {})

  const voice = useVoiceChat({
    busy: isLoading,
    onInterim: (text) => setInput(text),
    onFinalTranscript: (text) => {
      setInput('')
      void handleSendRef.current(text)
    },
    onError: (message) => showToast(message, 'error'),
  })

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

  const isServerSession = (id: unknown) =>
    typeof id === 'number' && id > 0 && id < 1_000_000_000

  const sessionLabel = (session: any) =>
    session?.title?.trim() || `Chat ${session?.id ?? ''}`

  useEffect(() => {
    setClientReady(true)
  }, [])

  useEffect(() => {
    if (!authReady) return
    if (user?.role === 'vendor') {
      router.replace('/vendor')
    }
  }, [authReady, user?.role, router])

  useEffect(() => {
    if (!authReady) return
    if (user?.role === 'vendor') return
    let cancelled = false

    const initGuest = () => {
      let parsed: any[] = []
      try {
        const localSessions = localStorage.getItem('temp_chat_sessions')
        parsed = localSessions ? JSON.parse(localSessions) : []
        if (!Array.isArray(parsed)) parsed = []
      } catch {
        parsed = []
      }
      if (cancelled) return

      const current = currentSessionRef.current
      const keepCurrent =
        current && !isServerSession(current.id)
          ? [current]
          : []
      let ordered = mergeSessionLists(parsed, keepCurrent)

      if (ordered.length === 0) {
        const tempSession = {
          id: Date.now(),
          title: 'New chat',
          messages: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        setCurrentSession(tempSession as any)
        setSessions([tempSession])
        rememberChat(tempSession.id)
        localStorage.setItem('temp_chat_sessions', JSON.stringify([tempSession]))
        return
      }

      setSessions(ordered)
      localStorage.setItem('temp_chat_sessions', JSON.stringify(ordered))
      if (!current || isServerSession(current.id)) {
        const lastId = readLastChatId()
        const preferred =
          ordered.find((item) => item.id === lastId) || ordered[0]
        setCurrentSession(preferred)
        rememberChat(preferred.id)
      }
    }

    const initAuthed = async () => {
      setSessionsLoading(true)
      try {
        const data = await chatAPI.getSessions()
        if (cancelled) return
        const list = Array.isArray(data) ? data : []
        setSessions((prev) => mergeSessionLists(list, prev))
        const current = currentSessionRef.current
        const currentIsServer = current && isServerSession(current.id)
        if (currentIsServer) {
          rememberChat(current.id)
          if (!current.messages || current.messages.length === 0) {
            try {
              const full = await chatAPI.getSession(current.id)
              if (!cancelled && currentSessionRef.current?.id === current.id) {
                setCurrentSession({ ...full, messages: full.messages || [] })
              }
            } catch {
              // keep the local session if history cannot be refreshed
            }
          }
        } else {
          const lastId = readLastChatId()
          const preferred =
            list.find((item: any) => item.id === lastId) || list[0]
          if (preferred) {
            try {
              const full = await chatAPI.getSession(preferred.id)
              if (!cancelled) {
                setCurrentSession({ ...full, messages: full.messages || [] })
                rememberChat(full.id)
              }
            } catch {
              if (!cancelled) {
                setCurrentSession({ ...preferred, messages: [] })
                rememberChat(preferred.id)
              }
            }
          } else {
            const session = await chatAPI.createSession('New chat')
            if (!cancelled) {
              const next = { ...session, messages: [], title: session.title || 'New chat' }
              setCurrentSession(next)
              setSessions((prev) => mergeSessionLists([next], prev))
              rememberChat(session.id)
            }
          }
        }
      } catch (error) {
        console.error('Failed to load chats:', error)
      } finally {
        if (!cancelled) setSessionsLoading(false)
      }
    }

    if (isAuthenticated) {
      void initAuthed()
    } else {
      initGuest()
    }

    return () => {
      cancelled = true
    }
  }, [authReady, isAuthenticated, user?.role, setCurrentSession])

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

    const sessionId = currentSession.id
    if (!isServerSession(sessionId)) {
      if (wsRef.current) {
        try {
          wsRef.current.close(1000, 'Temporary session')
        } catch {
          // ignore
        }
        wsRef.current = null
      }
      wsSessionIdRef.current = null
      setWsConnected(false)
      setIsReconnecting(false)
      return
    }

    if (
      wsRef.current &&
      wsRef.current.readyState === WebSocket.OPEN &&
      wsSessionIdRef.current === sessionId
    ) {
      setWsConnected(true)
      return
    }

    if (wsRef.current && wsSessionIdRef.current !== sessionId) {
      try {
        wsRef.current.close(1000, 'Switching chat')
      } catch {
        // ignore
      }
      wsRef.current = null
      wsSessionIdRef.current = null
    }

    const connect = async () => {
      try {
        const connected = await connectWebSocket(sessionId, 0, false)
        if (!connected) {
          setTimeout(() => {
            if (currentSessionRef.current?.id === sessionId && isAuthenticated) {
              connectWebSocket(sessionId, 0, true)
            }
          }, 2000)
        }
      } catch (error) {
        console.error('Failed to connect WebSocket:', error)
        setWsConnected(false)
        setIsReconnecting(false)
        setTimeout(() => {
          if (currentSessionRef.current?.id === sessionId && isAuthenticated) {
            connectWebSocket(sessionId, 0, true)
          }
        }, 3000)
      }
    }
    connect()

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
        if (isAuthenticated && isServerSession(currentSession?.id)) {
          if (
            !wsRef.current ||
            wsRef.current.readyState !== WebSocket.OPEN ||
            wsSessionIdRef.current !== currentSession.id
          ) {
            connectWebSocket(currentSession.id, 0, true)
          }
        }
      }
    }

    // Also handle page focus
    const handleFocus = () => {
      if (isAuthenticated && isServerSession(currentSession?.id)) {
        if (
          !wsRef.current ||
          wsRef.current.readyState !== WebSocket.OPEN ||
          wsSessionIdRef.current !== currentSession.id
        ) {
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

  const createNewSession = async () => {
    if (!authReady) return

    const blankInSidebar =
      isBlankChat(currentSession) &&
      sessions.some((item) => item.id === currentSession?.id)
    if (blankInSidebar) {
      setProductResults([])
      return
    }

    if (!isAuthenticated) {
      const localSessions = localStorage.getItem('temp_chat_sessions')
      const existingSessions = localSessions ? JSON.parse(localSessions) : []
      const chatLimit = 5

      if (existingSessions.length >= chatLimit) {
        showToast('Chat limit reached. Please login for unlimited chats.', 'warning')
        router.push('/login?redirect=/chat')
        return
      }

      const tempSession = {
        id: Date.now(),
        title: 'New chat',
        messages: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const updatedSessions = [tempSession, ...existingSessions]
      localStorage.setItem('temp_chat_sessions', JSON.stringify(updatedSessions))
      setCurrentSession(tempSession as any)
      setSessions(updatedSessions)
      rememberChat(tempSession.id)
      setProductResults([])
      return
    }

    try {
      const session = await chatAPI.createSession('New chat')
      const next = {
        ...session,
        messages: [],
        title: session.title || 'New chat',
        updated_at: session.updated_at || new Date().toISOString(),
      }
      setCurrentSession(next)
      setSessions((prev) => [next, ...prev.filter((item) => item.id !== session.id)])
      rememberChat(session.id)
      setProductResults([])
    } catch (error: any) {
      if (error.response?.status === 401) {
        showToast('Please login to create new chats', 'warning')
        router.push('/login?redirect=/chat')
      } else {
        console.error('Failed to create session:', error)
        showToast('Could not start a new chat. Try again.', 'error')
      }
    }
  }

  const selectSession = async (sessionId: number) => {
    rememberChat(sessionId)
    if (!isAuthenticated || !isServerSession(sessionId)) {
      const localSessions = localStorage.getItem('temp_chat_sessions')
      if (localSessions) {
        const list = JSON.parse(localSessions)
        const session = list.find((item: any) => item.id === sessionId)
        if (session) {
          setCurrentSession(session)
        }
      }
      return
    }

    try {
      const session = await chatAPI.getSession(sessionId)
      setCurrentSession({ ...session, messages: session.messages || [] })
      setSessions((prev) =>
        prev.map((item) =>
          item.id === session.id ? { ...item, title: session.title || item.title } : item
        )
      )
      setProductResults([])
    } catch (error: any) {
      if (error.response?.status === 401) {
        showToast('Please login to view chat history', 'warning')
        router.push('/login?redirect=/chat')
      } else {
        console.error('Failed to load session:', error)
        showToast('Could not open that chat.', 'error')
      }
    }
  }

  const connectWebSocket = async (sessionId: number, retryCount = 0, isReconnect = false): Promise<boolean> => {
    const maxRetries = 3 // Allow more retries for better reliability
    
    // Get fresh session token
    const token = (await getAccessToken()) || ''
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
      if (
        wsRef.current &&
        wsRef.current.readyState === WebSocket.OPEN &&
        wsSessionIdRef.current === sessionId
      ) {
        setWsConnected(true)
        setIsReconnecting(false)
        resolve(true)
        return
      }

      if (wsRef.current) {
        try {
          wsRef.current.close(1000, 'Reconnecting')
        } catch {
          // ignore
        }
        wsRef.current = null
        if (wsSessionIdRef.current === sessionId) {
          wsSessionIdRef.current = null
        }
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
            resolve(false)
          }
        }
      }, 5000) // Increased timeout to 5 seconds
      
      wsRef.current = ws

      ws.onopen = () => {
        clearTimeout(connectionTimeout)
        wsSessionIdRef.current = sessionId
        setWsConnected(true)
        setIsReconnecting(false)
        reconnectAttemptsRef.current = 0
        backgroundRetryRef.current = 0
        resolve(true)
      }

    ws.onmessage = (event) => {
        if (wsRef.current !== ws || currentSessionRef.current?.id !== sessionId) return
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
      } else if (data.type === 'title') {
        if (data.title && wsSessionIdRef.current) {
          const sid = wsSessionIdRef.current
          setSessions((prev) =>
            prev.map((item) => (item.id === sid ? { ...item, title: data.title } : item))
          )
          const current = currentSessionRef.current
          if (current?.id === sid) {
            setCurrentSession({
              ...current,
              title: data.title,
              messages: current.messages || [],
            })
          }
        }
      } else if (data.type === 'done') {
        setIsLoading(false)
        if (data.product_results) {
          setProductResults(data.product_results)
        }
        if (data.title && wsSessionIdRef.current) {
          const sid = wsSessionIdRef.current
          setSessions((prev) =>
            prev.map((item) => (item.id === sid ? { ...item, title: data.title } : item))
          )
          const current = currentSessionRef.current
          if (current?.id === sid) {
            setCurrentSession({
              ...current,
              title: data.title,
              messages: current.messages || [],
            })
          }
        }
        const sid = wsSessionIdRef.current
        if (sid && isServerSession(sid) && !data.title) {
          chatAPI
            .getSession(sid)
            .then((full) => {
              if (!full) return
              setSessions((prev) =>
                prev.map((item) =>
                  item.id === full.id
                    ? { ...item, title: full.title || item.title, updated_at: full.updated_at }
                    : item
                )
              )
              const current = currentSessionRef.current
              if (current?.id === full.id && full.title) {
                setCurrentSession({
                  ...current,
                  title: full.title,
                  messages: current.messages || [],
                })
              }
            })
            .catch(() => {})
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
        if (wsRef.current !== ws) return
        clearTimeout(connectionTimeout)
        console.error('WebSocket error:', error)
        setWsConnected(false)
        // Don't resolve here, let onclose handle reconnection
      }

      ws.onclose = (event) => {
        clearTimeout(connectionTimeout)
        if (wsRef.current !== ws) {
          resolve(false)
          return
        }
        if (wsSessionIdRef.current === sessionId) {
          wsSessionIdRef.current = null
        }
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
              if (backgroundRetryRef.current >= 8) {
                return
              }
              backgroundRetryRef.current += 1
              if (backendHealthy) {
                console.log('Retrying chat connection in 5 seconds...')
                setTimeout(() => {
                  if (currentSession?.id && typeof currentSession.id === 'number') {
                    connectWebSocket(currentSession.id, 0, true)
                  }
                }, 5000)
              } else {
                setTimeout(() => {
                  if (currentSession?.id && typeof currentSession.id === 'number') {
                    connectWebSocket(currentSession.id, 0, true)
                  }
                }, 15000)
              }
            }).catch(() => {
              if (backgroundRetryRef.current >= 8) return
              backgroundRetryRef.current += 1
              setTimeout(() => {
                if (currentSession?.id && typeof currentSession.id === 'number') {
                  connectWebSocket(currentSession.id, 0, true)
                }
              }, 5000)
            })
          } else {
            console.log(`Connection closed: ${reason}. Retrying in background.`)
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

  const handleSend = async (preset?: string) => {
    if (!currentSession || isLoading) return
    const userMessage = (typeof preset === 'string' ? preset : input || '').trim()
    if (!userMessage) return

    setInput('')
    setIsLoading(true)
    setProductResults([])

    const userMsg = { role: 'user' as const, content: userMessage }
    addMessage(userMsg)
    const generated = naturalChatTitle(userMessage, currentSession.title)
    const nextTitle = generated || currentSession.title || 'New chat'
    setSessions((prev) => {
      const now = new Date().toISOString()
      const rest = prev.filter((item) => item.id !== currentSession.id)
      const current = prev.find((item) => item.id === currentSession.id)
      return [
        {
          ...(current || currentSession),
          id: currentSession.id,
          title: nextTitle || current?.title || currentSession.title || 'New chat',
          updated_at: now,
          messages: current?.messages || currentSession.messages || [],
        },
        ...rest,
      ]
    })

    // For unauthenticated users, provide helpful AI-like responses
      if (!isAuthenticated) {
        // Save message to local storage
        const updatedMessages = [...(currentSession?.messages || []), userMsg]
        const updatedSession = {
          ...currentSession,
          title: nextTitle || currentSession.title,
          messages: updatedMessages,
          updated_at: new Date().toISOString(),
        }
        setCurrentSession(updatedSession as any)
        setSessions(persistGuestSessions(updatedSession))

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
          setSessions(persistGuestSessions(finalSession))
          
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

      try {
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
        try {
          await chatAPI.createMessage(currentSession.id, assistantResponse, 'assistant')
        } catch (error) {
          console.error('Failed to save assistant message:', error)
        }
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
        try {
          await chatAPI.createMessage(currentSession.id, assistantResponse, 'assistant')
        } catch (error) {
          console.error('Failed to save assistant message:', error)
        }
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

  handleSendRef.current = handleSend

  useEffect(() => {
    if (isLoading) return
    const last = currentSession?.messages?.[currentSession.messages.length - 1]
    if (last?.role === 'assistant' && last.content) {
      voice.speakReply(last.content)
    }
  }, [isLoading, currentSession?.messages, voice.speakReply])

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

  // Guest chat limit — count localStorage only after mount to avoid hydration mismatch
  const chatLimit = 5
  const localSessionsCount = clientReady && !isAuthenticated
    ? (() => {
        try {
          const local = localStorage.getItem('temp_chat_sessions')
          return local ? JSON.parse(local).length : 0
        } catch {
          return 0
        }
      })()
    : 0
  const remainingChats = Math.max(0, chatLimit - localSessionsCount)
  const hasReachedLimit = clientReady && !isAuthenticated && localSessionsCount >= chatLimit

  return (
    <div className="fixed inset-0 top-0 flex bg-[#212121] overflow-hidden">
      {/* Sidebar - Navigation & Chat History (ChatGPT style) */}
      <div className={`${showSidebar ? 'w-64' : 'w-0'} hidden md:flex md:flex-col h-full bg-[#171717] border-r border-[#2f2f2f] transition-all duration-300 overflow-hidden relative`}>
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
            onClick={() => {
              setSearchQuery('')
              setShowSearchModal(true)
            }}
            className="w-full flex items-center space-x-2 px-3 py-2.5 rounded-lg hover:bg-[#2f2f2f] transition-colors text-[#ececec]"
          >
            <Search className="w-4 h-4 text-[#b4b4b4]" />
            <span className="text-sm">Search chats</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('')
              setShowSearchModal(true)
            }}
            className="w-full flex items-center space-x-2 px-3 py-2.5 rounded-lg hover:bg-[#2f2f2f] transition-colors text-[#ececec]"
          >
            <BookOpen className="w-4 h-4 text-[#b4b4b4]" />
            <span className="text-sm">Library</span>
          </button>
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
          {user?.role === 'vendor' && (
            <Link
              href="/vendor"
              className="flex items-center space-x-2 px-3 py-2.5 rounded-lg hover:bg-[#2f2f2f] transition-colors text-[#ececec]"
            >
              <Building2 className="w-4 h-4 text-[#b4b4b4]" />
              <span className="text-sm">Vendor</span>
            </Link>
          )}
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
                    sessionLabel(session).toLowerCase().includes(searchQuery.toLowerCase())
                  )
                : sessions

              if (!authReady || sessionsLoading) {
                return <p className="text-xs text-[#8e8e8e] px-3 py-2">Loading chats...</p>
              }

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
                    <MessageSquare className="w-4 h-4 mr-2 text-[#b4b4b4] flex-shrink-0" />
                    {sessionLabel(session)}
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
              {clientReady && (
                <p className="text-xs text-[#b4b4b4]">
                  {remainingChats > 0 ? (
                    <span>{remainingChats} chat{remainingChats !== 1 ? 's' : ''} remaining</span>
                  ) : (
                    <span className="text-amber-400">Chat limit reached</span>
                  )}
                </p>
              )}
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
              {(() => {
                const matches = searchQuery
                  ? sessions.filter((session) =>
                      sessionLabel(session).toLowerCase().includes(searchQuery.toLowerCase())
                    )
                  : sessions
                if (!authReady || sessionsLoading) {
                  return <p className="text-sm text-[#8e8e8e] px-3 py-4 text-center">Loading chats...</p>
                }
                if (matches.length === 0) {
                  return (
                    <p className="text-sm text-[#8e8e8e] px-3 py-4 text-center">
                      {searchQuery ? 'No chats found' : 'No chats yet. Start a new chat.'}
                    </p>
                  )
                }
                return matches.map((session) => (
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
                      <MessageSquare className="w-4 h-4 mr-2 text-[#b4b4b4] flex-shrink-0" />
                      <span className="truncate">{sessionLabel(session)}</span>
                    </p>
                  </button>
                ))
              })()}
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
                      onClick={() => void handleSend(suggestion)}
                      className="p-3 bg-[#2f2f2f] hover:bg-[#3d3d3d] rounded-lg text-[#ececec] text-left text-sm transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          
          <div className="max-w-3xl mx-auto">
            {currentSession?.messages.map((message, index) => (
              <ChatMessage key={index} message={message} onSpeak={voice.speakNow} />
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
            
            {productResults.length > 0 && (currentSession?.messages?.length ?? 0) > 0 && (
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
          </div>
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input - ChatGPT Style */}
        <div className="border-t border-[#2f2f2f] bg-[#212121] p-4">
          <div className="max-w-3xl mx-auto">
            <div className={`relative flex items-end bg-[#2f2f2f] rounded-2xl border shadow-lg ${
              voice.listening ? 'border-[#19C37D]' : 'border-transparent'
            }`}>
              {voice.supported && (
                <button
                  type="button"
                  onClick={voice.toggleVoiceMode}
                  disabled={isLoading}
                  title={voice.voiceMode ? 'Stop voice chat' : 'Start voice chat'}
                  className={`m-2 p-2 rounded-lg flex-shrink-0 transition-colors ${
                    voice.voiceMode
                      ? 'bg-[#19C37D] text-white'
                      : 'text-[#8e8e8e] hover:bg-[#3d3d3d] hover:text-[#ececec]'
                  }`}
                >
                  <AudioLines className="w-5 h-5" />
                </button>
              )}
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={
                  voice.listening
                    ? 'Listening...'
                    : voice.speaking
                      ? 'Speaking...'
                      : 'Message ProcureX...'
                }
                className="flex-1 resize-none bg-transparent text-[#ececec] placeholder-[#8e8e8e] px-2 py-3 focus:outline-none max-h-200px overflow-y-auto"
                rows={1}
                disabled={isLoading}
                style={{ maxHeight: '200px' }}
              />
              {voice.supported && (
                <button
                  type="button"
                  onClick={voice.toggleListening}
                  disabled={isLoading || voice.speaking}
                  title={voice.listening ? 'Stop listening' : 'Speak'}
                  className={`m-2 p-2 rounded-lg flex-shrink-0 transition-colors ${
                    voice.listening
                      ? 'bg-red-600 text-white animate-pulse'
                      : 'text-[#8e8e8e] hover:bg-[#3d3d3d] hover:text-[#ececec]'
                  }`}
                >
                  {voice.listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              )}
              <button
                onClick={() => void handleSend()}
                disabled={isLoading || !(input || '').trim()}
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
              {voice.voiceMode
                ? 'Voice chat on. Speak, then ProcureX will answer out loud.'
                : voice.supported
                  ? 'Tap the mic to talk, or the waveform for hands-free voice chat.'
                  : 'AI can make mistakes. Check important info.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}


