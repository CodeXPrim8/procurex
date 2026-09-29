'use client'

import { useState, useEffect, useRef } from 'react'
import {
  MessageSquare,
  Send,
  Plus,
  FileText,
  Search,
  Settings,
  User,
  LogOut,
  ChevronUp,
  Building2,
  Mic,
  MicOff,
  AudioLines,
  Pencil,
  MoreHorizontal,
  ArrowUp,
  Menu,
  X,
  Trash2,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useStore } from '@/lib/store'
import { chatAPI } from '@/lib/api'
import { useIsVendor, useAuth, isSuperAdmin } from '@/lib/auth'
import ChatMessage from '@/components/ChatMessage'
import Logo from '@/components/Logo'
import ProcureXLoader from '@/components/ProcureXLoader'
import ProductCard from '@/components/ProductCard'
import SuperadminPagesMenu from '@/components/SuperadminPagesMenu'
import BusinessSwitcher from '@/components/BusinessSwitcher'
import Button from '@/components/ui/Button'
import { showToast } from '@/lib/toast'
import { debugAuthLog, debugAuthStorageSnapshot } from '@/lib/debugAuthLog'
import { getAccessToken, hasLiveSession, ensureFreshSession } from '@/lib/sessionToken'
import { naturalChatTitle, isSmalltalk, isChatTitleLocked, isWeakTitle, uniqueChatTitle, lockChatTitle, uniquifySessionTitles } from '@/lib/chatTitle'
import { getDisplayCurrencyNow, formatFromUsd } from '@/lib/currency'
import { quoteScopePayload } from '@/lib/businessContext'
import { useVoiceChat } from '@/lib/useVoiceChat'
import VoiceOverlay from '@/components/voice/VoiceOverlay'
import type { VoiceOrbState } from '@/components/voice/VoiceOrb'
import {
  cloudChatsReady,
  createCloudSession,
  getCloudSession,
  deleteCloudSession,
  importApiSessionToCloud,
  isCloudSessionId,
  listCloudSessions,
  mergeChatHistory,
  saveCloudMessage,
  subscribeCloudChats,
  updateCloudSession,
} from '@/lib/cloudChats'

const LAST_CHAT_KEY = 'procurex_last_chat_id'
const GUEST_CHATS_KEY = 'temp_chat_sessions'

function accountChatsKey(userId: string) {
  return `procurex_account_chats_${userId}`
}

function isBlankChat(session: any) {
  const title = (session?.title || 'New chat').trim().toLowerCase()
  const untitled = !title || title === 'newchat' || /^new chat(?:\s+\d+)?$/.test(title)
  const messages = session?.messages
  return untitled && (!messages || messages.length === 0)
}

const GUEST_CHAT_LIMIT = 5

function countGuestChats(list: any[]) {
  return (Array.isArray(list) ? list : []).filter((item) => !isBlankChat(item)).length
}

function readStoredSessions(key: string): any[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStoredSessions(key: string, sessions: any[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(sessions))
  } catch {
    try {
      const slim = sessions.map((session) => ({
        ...session,
        messages: (session.messages || []).slice(-120),
      }))
      localStorage.setItem(key, JSON.stringify(slim))
    } catch {
      // Storage is full; keep chats in memory.
    }
  }
}

function persistGuestSessions(updatedSession: any) {
  const nextList = mergeSessionLists([updatedSession], readStoredSessions(GUEST_CHATS_KEY))
  writeStoredSessions(GUEST_CHATS_KEY, nextList)
  return nextList
}

function pickLongerMessages(a?: any[], b?: any[]) {
  const left = a || []
  const right = b || []
  return left.length >= right.length ? left : right
}

function newerTimestamp(a?: string, b?: string) {
  const ta = new Date(a || 0).getTime()
  const tb = new Date(b || 0).getTime()
  if (tb > ta) return b
  return a
}

function chatTimeGroup(session: any) {
  const stamp = new Date(session?.updated_at || session?.created_at || 0)
  const time = stamp.getTime()
  if (!Number.isFinite(time) || time <= 0) return 'Older'
  const startOfToday = new Date()
  startOfToday.setHours(0, 0, 0, 0)
  const today = startOfToday.getTime()
  if (time >= today) return 'Today'
  if (time >= today - 86400000) return 'Yesterday'
  if (time >= today - 7 * 86400000) return 'Previous 7 days'
  if (time >= today - 30 * 86400000) return 'Previous 30 days'
  return stamp.toLocaleString(undefined, { month: 'long', year: 'numeric' })
}

function groupSessions(sessions: any[]) {
  const groups: { label: string; items: any[] }[] = []
  for (const session of sessions) {
    const label = chatTimeGroup(session)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(session)
    else groups.push({ label, items: [session] })
  }
  return groups
}

function sessionMatchesQuery(session: any, query: string, label: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  if (label.toLowerCase().includes(needle)) return true
  return (session?.messages || []).some((message: any) =>
    String(message?.content || '').toLowerCase().includes(needle)
  )
}

function catalogPriceRangeLabel(minNgn = 30000, maxNgn = 80000) {
  const { currency, locale, localPerNgn } = getDisplayCurrencyNow()
  const fmt = (amount: number) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount * localPerNgn)
  return `${fmt(minNgn)}–${fmt(maxNgn)}`
}

function isHearMeUtterance(text: string) {
  return /\b(can you hear me|are you there|you hear me|why aren'?t you responding|not responding)\b/i.test(text)
}

function isShortGreeting(text: string) {
  const spoken = (text || '').toLowerCase().trim()
  if (!spoken || isHearMeUtterance(spoken)) return false
  return /^(hello|hi|hey|good morning|good afternoon|good evening|greetings|howdy)([,.!?\s]*)$/i.test(spoken)
}

function cannedAssistantReply(userMessage: string, options: { guest?: boolean; priceRange?: string } = {}) {
  const lowerMessage = (userMessage || '').toLowerCase().trim()
  const guest = Boolean(options.guest)
  const priceRange = options.priceRange || catalogPriceRangeLabel()

  if (isHearMeUtterance(lowerMessage)) {
    return guest
      ? 'Yes, I can hear you. Tell me the product and budget. Login if you want live catalog prices.'
      : 'Yes, I can hear you. Tell me the product and budget and I will take the next step.'
  }

  if (isShortGreeting(lowerMessage)) {
    return "Hello! I'm ProcureX, your AI procurement assistant. I can help you find IT products, compare prices, check availability, and connect you with verified vendors. What are you looking for today?"
  }

  if (lowerMessage.includes('how are you') || lowerMessage.includes("how's it going") || lowerMessage.includes('how do you do')) {
    return "I'm doing great, thank you for asking! I'm here and ready to help you with your IT procurement needs. What can I assist you with today?"
  }

  if (/^(thanks?|thank you|appreciate it)$/i.test(lowerMessage) || lowerMessage.startsWith('thank')) {
    return guest
      ? "You're very welcome! I'm happy to help. To access pricing and vendor information, please login to your account. Is there anything else I can help with?"
      : "You're very welcome! I'm happy to help. Is there anything else you'd like to know about our products or services?"
  }

  if (guest) {
    if (lowerMessage.includes('product') || lowerMessage.includes('laptop') || lowerMessage.includes('phone') || lowerMessage.includes('tablet') || lowerMessage.includes('monitor') || lowerMessage.includes('software') || lowerMessage.includes('website')) {
      return "I can help you find IT products! However, to see real-time pricing, availability, and vendor information, please login to your account. Once logged in, I'll instantly show you matching products with prices, stock levels, and verified vendor details. Would you like to login now?"
    }
    if (lowerMessage.includes('quote') || lowerMessage.includes('quotation')) {
      return 'I can generate professional quotations for you! To create and export quotations, please login to your ProcureX account. After logging in, I can help you build detailed quotes with product specifications, pricing, and vendor information.'
    }
    if (lowerMessage.includes('vendor') || lowerMessage.includes('supplier')) {
      return "ProcureX connects you with verified vendors for IT products. After you login, I can show you vendor profiles, contact information, product catalogs, and stock availability. This helps ensure you're working with trusted suppliers."
    }
    if (lowerMessage.includes('what can you') || lowerMessage.includes('help me') || lowerMessage.includes('what do you do')) {
      return "I'm ProcureX, your AI procurement assistant! Here's what I can help you with:\n\n🔍 **Product Discovery**: Find IT products matching your requirements\n💰 **Pricing Information**: Get current prices from verified vendors\n📊 **Availability Checks**: Check stock levels in real-time\n🏢 **Vendor Connections**: Connect with verified suppliers\n📄 **Quotation Generation**: Create professional procurement quotes\n\nTo access these features, please login to your account. What would you like to know?"
    }
      return "I'm here to help with IT procurement! I can assist you with:\n\n• Finding IT products (laptops, phones, tablets, accessories)\n• Software that solves a business problem\n• Services such as websites and custom apps\n• Comparing prices and specifications\n• Checking availability and stock levels\n• Connecting with verified vendors\n• Generating quotations\n\nTo access pricing and vendor information, please login to your account. What would you like to know?"
  }

  if (
    lowerMessage.includes('software') ||
    lowerMessage.includes('saas') ||
    /\bapps?\b/.test(lowerMessage) ||
    lowerMessage.includes('crm') ||
    (lowerMessage.includes('manage') && (lowerMessage.includes('inventory') || lowerMessage.includes('payroll') || lowerMessage.includes('invoice') || lowerMessage.includes('sales')))
  ) {
    return guest
      ? 'I can help you find software for that. Login to see live tools, prices, and vendors that match the problem you described.'
      : 'I can search software that solves that problem. Tell me the workflow you want to fix (inventory, payroll, invoicing, CRM) and a budget if you have one.'
  }

  if (
    lowerMessage.includes('website') ||
    lowerMessage.includes('web design') ||
    lowerMessage.includes('web development') ||
    lowerMessage.includes('app development') ||
    /build (me )?(a |an )?(website|app|software)/.test(lowerMessage)
  ) {
    return guest
      ? 'Vendors here also offer services like websites and custom apps. Login to see who can build it and starting prices.'
      : 'I can find vendors who build websites, apps, and custom software. Tell me what you need built and any timeline or budget.'
  }

  if (lowerMessage.includes('laptop') || lowerMessage.includes('computer') || lowerMessage.includes('notebook')) {
    if (lowerMessage.includes('12') || lowerMessage.includes('kid') || lowerMessage.includes('child') || lowerMessage.includes('son') || lowerMessage.includes('daughter')) {
      return `I can help you find the perfect laptop! For a 12-year-old, I'd recommend:\n\n**Educational Laptops (Budget-friendly):**\n• 13-15 inch screen size\n• 8GB RAM minimum\n• 256GB storage\n• Intel Core i3/i5 or AMD Ryzen 3/5\n• Lightweight for carrying to school\n\n**Key Considerations:**\n• Durability and build quality\n• Good battery life\n• Suitable for schoolwork, light gaming, and creative projects\n• Parental controls and safety features\n\n**Price Range:** ${priceRange}\n\nWould you like me to show you specific laptop models that match these criteria? I can search our catalog for verified vendors with current pricing and availability.`
    }
    return `I can help you find the perfect laptop! To recommend the best option, I need to know:\n\n• What will you primarily use it for? (work, gaming, school, creative tasks)\n• Budget range\n• Any specific requirements? (screen size, RAM, storage, portability)\n\nOnce you share these details, I'll search our catalog and show you matching laptops with prices, specifications, and vendor information. What's your budget range?`
  }

  if (lowerMessage.includes('phone') || lowerMessage.includes('smartphone') || lowerMessage.includes('mobile')) {
    return 'I can help you find a suitable phone! To recommend the best options, tell me:\n\n• What features are important to you? (camera, battery life, performance)\n• Budget range\n• Brand preferences (if any)\n• Intended use (calls, social media, gaming, work)\n\nWould you like me to search for available phones with current pricing?'
  }

  if (
    (/\b(products?|items?|buy)\b/.test(lowerMessage) || /\bpurchase\b/.test(lowerMessage)) &&
    !/\bpurchase orders?\b/.test(lowerMessage)
  ) {
    return 'I can help you find IT products, software, and services! What specifically are you looking for?\n\n• Hardware (laptops, phones, tablets, monitors)\n• Software that solves a problem (inventory, payroll, CRM)\n• A service (website, mobile app, custom software)\n• Budget range\n• Quantity or timeline\n\nOnce you provide these details, I\'ll search our catalog and show you matching listings with real-time pricing and vendor information!'
  }

  if (lowerMessage.includes('price') || lowerMessage.includes('cost') || lowerMessage.includes('how much') || lowerMessage.includes('pricing')) {
    return 'I can help you get pricing information! To provide accurate prices for IT products, I need to know:\n\n• What product are you interested in?\n• Any specific specifications or brand preferences?\n• Quantity needed?\n\nOnce you provide these details, I\'ll search our database and show you current prices from verified vendors along with availability.'
  }

  if (lowerMessage.includes('what can you') || lowerMessage.includes('help me') || lowerMessage.includes('what do you do') || lowerMessage.includes('capabilities')) {
    return "I'm ProcureX, your AI procurement assistant! Here's what I can help you with:\n\n🔍 **Product Discovery**: Find IT products matching your requirements\n💰 **Pricing Information**: Get current prices from verified vendors\n📊 **Availability Checks**: Check stock levels in real-time\n🏢 **Vendor Connections**: Connect with verified suppliers\n📄 **Quotation Generation**: Create professional procurement quotes\n📋 **Product Comparison**: Compare specifications and prices\n✨ **Smart Recommendations**: Get AI-powered product suggestions\n\nJust tell me what you're looking for, and I'll help you find it quickly!"
  }

  return "I'm with you. What product, quantity, or budget should I use next?"
}

function makeLocalSession() {
  return {
    id: Date.now(),
    title: 'New chat',
    messages: [] as { role: 'user' | 'assistant' | 'system'; content: string }[],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

function sameChatId(a: unknown, b: unknown) {
  return a != null && b != null && String(a) === String(b)
}

function applyCloudSession(current: any, incoming: any) {
  if (!incoming) return incoming
  const same = current && sameChatId(current.id, incoming.id)
  const keepTitle =
    same &&
    current.title &&
    (isChatTitleLocked(current.id) ||
      (isWeakTitle(incoming.title) && !isWeakTitle(current.title)))
  const title = keepTitle ? current.title : incoming.title
  if (same) {
    return {
      ...incoming,
      title,
      messages: mergeChatHistory(current.messages, incoming.messages),
    }
  }
  return { ...incoming, messages: incoming.messages || [] }
}

function rememberChat(id: number | string | undefined) {
  if (id == null || id === '' || typeof window === 'undefined') return
  try {
    localStorage.setItem(LAST_CHAT_KEY, String(id))
  } catch {
    // ignore storage errors
  }
}

function readLastChatId(): string | number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(LAST_CHAT_KEY)
    if (!raw) return null
    if (isCloudSessionId(raw)) return raw
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : raw
  } catch {
    return null
  }
}

function mergeSessionLists(serverList: any[], localList: any[]) {
  const byId = new Map<string, any>()
  const ingest = (item: any) => {
    if (item?.id == null) return
    const key = String(item.id)
    const existing = byId.get(key)
    if (!existing) {
      byId.set(key, { ...item, messages: item.messages || [] })
      return
    }
    const existingTitle = (existing.title || '').trim()
    const incomingTitle = (item.title || '').trim()
    const preferIncoming =
      incomingTitle &&
      incomingTitle.toLowerCase() !== 'new chat' &&
      (!existingTitle || existingTitle.toLowerCase() === 'new chat')
    byId.set(key, {
      ...existing,
      ...item,
      title: preferIncoming ? incomingTitle : existingTitle || incomingTitle,
      messages: pickLongerMessages(existing.messages, item.messages),
      created_at: existing.created_at || item.created_at,
      updated_at: newerTimestamp(existing.updated_at, item.updated_at) || existing.updated_at || item.updated_at,
      legacy_id: item.legacy_id ?? existing.legacy_id,
    })
  }
  for (const item of serverList) ingest(item)
  for (const item of localList) ingest(item)
  return Array.from(byId.values()).sort((a, b) => {
    const tb = new Date(b.updated_at || b.created_at || 0).getTime()
    const ta = new Date(a.updated_at || a.created_at || 0).getTime()
    return tb - ta
  })
}

async function redirectIfSignedOut(router: { push: (href: string) => void }, message: string) {
  const live = await hasLiveSession()
  // #region agent log
  debugAuthLog(
    'chat/page.tsx:redirectIfSignedOut',
    live ? 'kept session' : 'redirect login',
    { ...debugAuthStorageSnapshot(), live },
    live ? 'B' : 'C'
  )
  // #endregion
  if (live) {
    showToast('Could not complete that account request. Please try again.', 'warning')
    return false
  }
  showToast(message, 'warning')
  router.push('/login?redirect=/chat')
  return true
}

export default function ChatPage() {
  const { user, isAuthenticated, authReady } = useAuth()
  const isVendor = useIsVendor()
  const isSuper = isSuperAdmin(user)
  const router = useRouter()
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [productResults, setProductResults] = useState<any[]>([])
  const [showSidebar, setShowSidebar] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showUserMenuHeader, setShowUserMenuHeader] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearchModal, setShowSearchModal] = useState(false)
  const [chatMenuId, setChatMenuId] = useState<string | number | null>(null)
  const [renamingId, setRenamingId] = useState<string | number | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [deletingChat, setDeletingChat] = useState(false)
  const [showComposerMenu, setShowComposerMenu] = useState(false)
  const [accountSyncReady, setAccountSyncReady] = useState<boolean | null>(null)
  const [budgetHint, setBudgetHint] = useState('Find products under $500')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const latestReplyRef = useRef<HTMLDivElement>(null)
  const pinnedMessageCountRef = useRef(0)
  const scrollSessionIdRef = useRef<string | number | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const wsSessionIdRef = useRef<number | null>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const userMenuHeaderRef = useRef<HTMLDivElement>(null)
  const userMenuMobileRef = useRef<HTMLDivElement>(null)
  const chatMenuRef = useRef<HTMLDivElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const backgroundRetryRef = useRef(0)
  
  const { currentSession, setCurrentSession, addMessage, setMessages, logout, setAccountView } = useStore()
  const [sessions, setSessions] = useState<any[]>([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [clientReady, setClientReady] = useState(false)
  const currentSessionRef = useRef(currentSession)
  currentSessionRef.current = currentSession
  const wasAuthedRef = useRef(false)
  if (isAuthenticated) wasAuthedRef.current = true
  const handleSendRef = useRef<(preset?: string) => Promise<void>>(async () => {})
  const sendLockRef = useRef(false)
  const ghostToastRef = useRef(false)
  const isLoadingRef = useRef(false)
  const liveAssistantRef = useRef('')
  const chatLoadGenRef = useRef(0)
  const acceptingReplyRef = useRef(true)
  const replyIdleRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  isLoadingRef.current = isLoading

  const persistLiveAssistantRef = useRef(() => {})

  const releaseComposer = () => {
    if (replyIdleRef.current) {
      clearTimeout(replyIdleRef.current)
      replyIdleRef.current = null
    }
    persistLiveAssistantRef.current()
    setIsLoading(false)
    sendLockRef.current = false
  }

  const armComposerWatch = (ms: number) => {
    if (replyIdleRef.current) clearTimeout(replyIdleRef.current)
    replyIdleRef.current = setTimeout(() => {
      replyIdleRef.current = null
      persistLiveAssistantRef.current()
      setIsLoading(false)
      sendLockRef.current = false
    }, ms)
  }
  const composerCtlRef = useRef({ release: releaseComposer, arm: armComposerWatch })
  composerCtlRef.current = { release: releaseComposer, arm: armComposerWatch }

  useEffect(() => {
    return () => {
      if (replyIdleRef.current) clearTimeout(replyIdleRef.current)
    }
  }, [])

  const voice = useVoiceChat({
    busy: isLoading,
    onFinalTranscript: (text) => {
      void handleSendRef.current(text)
    },
    onInterrupt: () => {
      acceptingReplyRef.current = false
    },
    onError: (message) => showToast(message, 'error'),
  })
  const speakReplyFn = useRef(voice.speakReply)
  speakReplyFn.current = voice.speakReply
  const feedSpokenFn = useRef(voice.feedSpokenReply)
  feedSpokenFn.current = voice.feedSpokenReply
  const finishSpokenFn = useRef(voice.finishSpokenReply)
  finishSpokenFn.current = voice.finishSpokenReply

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

  const isServerSession = (id: unknown): id is number =>
    typeof id === 'number' && id > 0 && id < 1_000_000_000

  const accountWsId = (session: any): number | null => {
    if (!session) return null
    if (isServerSession(session.id)) return session.id
    if (isServerSession(session.legacy_id)) return session.legacy_id
    return null
  }

  const matchesWsSession = (session: any, wsId: number) =>
    Boolean(session && (sameChatId(session.id, wsId) || sameChatId(session.legacy_id, wsId)))

  const persistAccountMessage = async (
    session: any,
    role: 'user' | 'assistant' | 'system',
    content: string,
    title?: string
  ) => {
    if (!isAuthenticated || !isCloudSessionId(session?.id) || !content) return
    try {
      await saveCloudMessage(session.id, role, content, title)
    } catch (error) {
      console.error('Failed to sync chat:', error)
    }
  }
  persistLiveAssistantRef.current = () => {
    const session = currentSessionRef.current
    const text = liveAssistantRef.current
    if (!session || !text || text === '...') return
    void persistAccountMessage(session, 'assistant', text, session.title)
  }

  const sessionLabel = (session: any) =>
    session?.title?.trim() || `Chat ${session?.id ?? ''}`

  useEffect(() => {
    const next = uniquifySessionTitles(sessions)
    const changed = next.some((item, index) => item.title !== sessions[index]?.title)
    if (!changed) return
    setSessions(next)
    const current = currentSessionRef.current
    if (current) {
      const updated = next.find((item) => sameChatId(item.id, current.id))
      if (updated && updated.title !== current.title) {
        useStore.setState((state) => {
          if (!state.currentSession || !sameChatId(state.currentSession.id, updated.id)) return {}
          return { currentSession: { ...state.currentSession, title: updated.title } }
        })
      }
    }
    next.forEach((session) => {
      const previous = sessions.find((item) => sameChatId(item.id, session.id))
      if (!previous || previous.title === session.title) return
      if (isCloudSessionId(session.id)) {
        void updateCloudSession(session.id, { title: session.title }).catch(() => {})
      }
    })
  }, [sessions])

  useEffect(() => {
    if (renamingId == null) return
    renameInputRef.current?.focus()
    renameInputRef.current?.select()
  }, [renamingId])

  useEffect(() => {
    setClientReady(true)
    void formatFromUsd(500).then((amount) => {
      setBudgetHint(`Find products under ${amount}`)
    })
  }, [])

  useEffect(() => {
    if (!authReady) return
    if (isVendor) setAccountView('buyer')
  }, [authReady, isVendor, setAccountView])

  useEffect(() => {
    if (!authReady) return
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
        // #region agent log
        debugAuthLog(
          'chat/page.tsx:initGuest',
          'replacing session with guest chat',
          {
            hadCurrent: Boolean(current),
            replacingServer: Boolean(current && isServerSession(current.id)),
            prevMessageCount: current?.messages?.length ?? 0,
            nextMessageCount: (ordered.find((item) => item.id === readLastChatId()) || ordered[0])?.messages?.length ?? 0,
          },
          'C'
        )
        // #endregion
        const lastId = readLastChatId()
        const preferred =
          ordered.find((item) => item.id === lastId) || ordered[0]
        setCurrentSession(preferred)
        rememberChat(preferred.id)
      }
    }

    const initAuthed = async () => {
      const gen = ++chatLoadGenRef.current
      setSessionsLoading(true)
      const stillActive = () => !cancelled && chatLoadGenRef.current === gen
      try {
        const cloudReady = await cloudChatsReady()
        if (!stillActive()) return
        setAccountSyncReady(cloudReady)

        if (cloudReady) {
          let list = await listCloudSessions()
          if (!stillActive()) return
          if (list.length === 0) {
            list = [await createCloudSession('New chat')]
          }
          const lastId = readLastChatId()
          const preferred =
            list.find((item) => sameChatId(item.id, lastId)) ||
            list.find((item) => sameChatId(item.id, currentSessionRef.current?.id)) ||
            list[0]
          if (!stillActive()) return
          setSessions(list)
          const current = currentSessionRef.current
          setCurrentSession(
            applyCloudSession(current, { ...preferred, messages: preferred.messages || [] }) as any
          )
          rememberChat(preferred.id)
          setSessionsLoading(false)

          void getCloudSession(preferred.id).then((full) => {
            if (!stillActive() || !full) return
            if (sameChatId(currentSessionRef.current?.id, full.id)) {
              setCurrentSession(applyCloudSession(currentSessionRef.current, full) as any)
            }
          })

          void (async () => {
            try {
              const apiList = await chatAPI.getSessions()
              const existing = await listCloudSessions()
              const haveLegacy = new Set(
                existing.map((item) => item.legacy_id).filter((id): id is number => typeof id === 'number')
              )
              for (const item of Array.isArray(apiList) ? apiList : []) {
                if (!stillActive()) return
                if (haveLegacy.has(item.id)) continue
                try {
                  const full = await chatAPI.getSession(item.id)
                  await importApiSessionToCloud({
                    ...full,
                    messages: (full.messages || []).map((message: any) => ({
                      role: message.role,
                      content: message.content,
                    })),
                  })
                } catch {
                  await importApiSessionToCloud(item)
                }
                haveLegacy.add(item.id)
              }
              if (!stillActive()) return
              const refreshed = await listCloudSessions()
              setSessions(refreshed)
            } catch {
              // Phone and Vercel often cannot reach the laptop API. Account chats still load.
            }
          })()
          return
        }

        const data = await chatAPI.getSessions()
        if (cancelled) return
        const list = Array.isArray(data) ? data : []
        setSessions((prev) => mergeSessionLists(list, prev.filter((item) => isServerSession(item.id))))
        const current = currentSessionRef.current
        if (current && isServerSession(current.id)) {
          rememberChat(current.id)
          if (!current.messages || current.messages.length === 0) {
            try {
              const full = await chatAPI.getSession(current.id)
              if (!cancelled && sameChatId(currentSessionRef.current?.id, current.id)) {
                setCurrentSession({ ...full, messages: full.messages || [] })
              }
            } catch {
              // keep the local session if history cannot be refreshed
            }
          }
        } else {
          const lastId = readLastChatId()
          const preferred =
            list.find((item: any) => sameChatId(item.id, lastId)) || list[0]
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
        if (stillActive()) setAccountSyncReady(false)
        if (stillActive() && !currentSessionRef.current) {
          try {
            const created = await createCloudSession('New chat')
            setCurrentSession(created as any)
            setSessions([created])
            rememberChat(created.id)
          } catch {
            const tempSession = makeLocalSession()
            setCurrentSession(tempSession as any)
            setSessions([tempSession])
            rememberChat(tempSession.id)
          }
        }
      } finally {
        if (chatLoadGenRef.current === gen) setSessionsLoading(false)
      }
    }

    // #region agent log
    debugAuthLog(
      'chat/page.tsx:sessionInit',
      isAuthenticated ? 'init authed chats' : 'init guest chats',
      {
        ...debugAuthStorageSnapshot(),
        isAuthenticated,
        authReady,
        sessionId: String(currentSessionRef.current?.id ?? ''),
        messageCount: currentSessionRef.current?.messages?.length ?? 0,
        voiceMode: voice.voiceMode,
        keepConversation: Boolean(!isAuthenticated && wasAuthedRef.current && currentSessionRef.current),
      },
      'C'
    )
    // #endregion
    if (isAuthenticated) {
      void initAuthed()
    } else if (wasAuthedRef.current && currentSessionRef.current) {
      // Unexpected auth drop: keep the live conversation and voice overlay.
    } else {
      initGuest()
    }

    return () => {
      cancelled = true
    }
  }, [authReady, isAuthenticated, user?.role, setCurrentSession])

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return
    let cancelled = false
    let unsub: (() => void) | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const reload = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(async () => {
        if (cancelled || isLoadingRef.current) return
        try {
          if (!(await cloudChatsReady())) return
          const list = await listCloudSessions()
          if (cancelled) return
          setSessions(list)
          const current = currentSessionRef.current
          if (current && isCloudSessionId(current.id)) {
            const full = await getCloudSession(current.id)
            if (!cancelled && full && sameChatId(currentSessionRef.current?.id, full.id)) {
              setCurrentSession(applyCloudSession(currentSessionRef.current, full) as any)
            }
          }
        } catch (error) {
          console.error('Failed to refresh synced chats:', error)
        }
      }, 400)
    }
    void (async () => {
      if (!(await cloudChatsReady()) || cancelled) return
      unsub = subscribeCloudChats(user.id, reload)
    })()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      unsub?.()
    }
  }, [isAuthenticated, user?.id, setCurrentSession])

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

    const sessionId = accountWsId(currentSession)
    if (!sessionId) {
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
            if (matchesWsSession(currentSessionRef.current, sessionId) && isAuthenticated) {
                connectWebSocket(sessionId, 0, true)
              }
            }, 2000)
          }
        } catch (error) {
          console.error('Failed to connect WebSocket:', error)
          setWsConnected(false)
          setIsReconnecting(false)
          setTimeout(() => {
          if (matchesWsSession(currentSessionRef.current, sessionId) && isAuthenticated) {
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
    const sessionId = currentSession?.id ?? null
    const messages = currentSession?.messages || []
    if (scrollSessionIdRef.current !== sessionId) {
      scrollSessionIdRef.current = sessionId
      pinnedMessageCountRef.current = messages.length
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
      return
    }
    if (messages.length <= pinnedMessageCountRef.current) return
    pinnedMessageCountRef.current = messages.length
    const last = messages[messages.length - 1]
    if (last?.role === 'assistant') {
      latestReplyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      return
    }
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [currentSession?.id, currentSession?.messages])

  // Reconnect WebSocket when page becomes visible (handles tab switching and refresh)
  useEffect(() => {
    const sessionId = accountWsId(currentSession)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (isAuthenticated && sessionId) {
          if (
            !wsRef.current ||
            wsRef.current.readyState !== WebSocket.OPEN ||
            wsSessionIdRef.current !== sessionId
          ) {
            connectWebSocket(sessionId, 0, true)
          }
        }
      }
    }

    const handleFocus = () => {
      if (isAuthenticated && sessionId) {
        if (
          !wsRef.current ||
          wsRef.current.readyState !== WebSocket.OPEN ||
          wsSessionIdRef.current !== sessionId
        ) {
          connectWebSocket(sessionId, 0, true)
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

  const createNewSession = async (force = false) => {
    if (!authReady) return
    setShowSidebar(false)

    const blankInSidebar =
      !force &&
      isBlankChat(currentSession) &&
      sessions.some((item) => sameChatId(item.id, currentSession?.id))
    if (blankInSidebar) {
      setProductResults([])
      return
    }

    if (!isAuthenticated) {
      const localSessions = localStorage.getItem('temp_chat_sessions')
      const existingSessions = localSessions ? JSON.parse(localSessions) : []
      
      if (countGuestChats(existingSessions) >= GUEST_CHAT_LIMIT) {
        showToast('Login to start more chats.', 'warning')
        return
      }

      const tempSession = makeLocalSession()
      const updatedSessions = [tempSession, ...existingSessions]
        localStorage.setItem('temp_chat_sessions', JSON.stringify(updatedSessions))
        setCurrentSession(tempSession as any)
        setSessions(updatedSessions)
      rememberChat(tempSession.id)
      setProductResults([])
        return
      }

    try {
      let legacyId: number | null = null
      try {
        const apiSession = await chatAPI.createSession('New chat')
        legacyId = apiSession.id
      } catch {
        // Account chats still sync even if the laptop API is offline.
      }
      if (await cloudChatsReady()) {
        const cloud = await createCloudSession('New chat', legacyId)
        setCurrentSession({ ...cloud, messages: [], legacy_id: legacyId } as any)
        setSessions((prev) => [cloud, ...prev.filter((item) => !sameChatId(item.id, cloud.id))])
        rememberChat(cloud.id)
        setProductResults([])
        return
      }
      if (!legacyId) throw new Error('Could not create chat')
      const next = {
        id: legacyId,
        messages: [],
        title: 'New chat',
        updated_at: new Date().toISOString(),
      }
      setCurrentSession(next as any)
      setSessions((prev) => [next, ...prev.filter((item) => !sameChatId(item.id, legacyId))])
      rememberChat(legacyId)
      setProductResults([])
    } catch (error: any) {
      if (error.response?.status === 401) {
        await redirectIfSignedOut(router, 'Please login to create new chats')
      } else {
        console.error('Failed to create session:', error)
        try {
          const cloud = await createCloudSession('New chat')
          setCurrentSession(cloud as any)
          setSessions((prev) => [cloud, ...prev.filter((item) => !sameChatId(item.id, cloud.id))])
          rememberChat(cloud.id)
          setProductResults([])
        } catch {
          const tempSession = makeLocalSession()
          setCurrentSession(tempSession as any)
          setSessions((prev) => [tempSession, ...prev])
          rememberChat(tempSession.id)
          setProductResults([])
        }
      }
    }
  }

  const selectSession = async (sessionId: number | string) => {
    setShowSidebar(false)
    rememberChat(sessionId)
    const cached = sessions.find((item) => sameChatId(item.id, sessionId))
    if (isAuthenticated && isCloudSessionId(sessionId)) {
      try {
        const session = await getCloudSession(sessionId)
        if (session) {
          setCurrentSession(applyCloudSession(currentSessionRef.current, session) as any)
          setSessions((prev) =>
            prev.map((item) =>
              sameChatId(item.id, session.id)
                ? { ...item, title: session.title || item.title, messages: session.messages }
                : item
            )
          )
          setProductResults([])
          return
        }
    } catch (error) {
        console.error('Failed to load synced chat:', error)
      }
      if (cached) {
        setCurrentSession({ ...cached, messages: cached.messages || [] })
      }
      return
    }
    if (!isAuthenticated || !isServerSession(sessionId)) {
      const localSessions = localStorage.getItem('temp_chat_sessions')
      if (localSessions) {
        const list = JSON.parse(localSessions)
        const session = list.find((item: any) => sameChatId(item.id, sessionId))
        if (session) {
          setCurrentSession(session)
        }
      } else if (cached) {
        setCurrentSession({ ...cached, messages: cached.messages || [] })
      }
      return
    }

    try {
      const session = await chatAPI.getSession(sessionId)
      setCurrentSession({ ...session, messages: session.messages || [] })
      setSessions((prev) =>
        prev.map((item) =>
          item.id === session.id || sameChatId(item.id, session.id)
            ? { ...item, title: session.title || item.title }
            : item
        )
      )
      setProductResults([])
    } catch (error: any) {
      if (error.response?.status === 401) {
        await redirectIfSignedOut(router, 'Please login to view chat history')
      } else {
        console.error('Failed to load session:', error)
        showToast('Could not open that chat.', 'error')
      }
    }
  }

  const deleteChat = async (session: any) => {
    if (!session?.id || deletingChat) return
    const id = session.id
    const legacyId = isServerSession(session.legacy_id)
      ? session.legacy_id
      : isServerSession(id)
        ? id
        : null
    setDeletingChat(true)
    try {
      let cloudFailed = false
      if (isAuthenticated && isCloudSessionId(id)) {
        try {
          await deleteCloudSession(String(id))
        } catch (error) {
          cloudFailed = true
          console.error('Failed to delete synced chat:', error)
        }
      }
      let apiFailed = false
      if (isAuthenticated && legacyId) {
        try {
          await chatAPI.deleteSession(legacyId)
        } catch (error) {
          apiFailed = true
          console.error('Failed to delete API chat:', error)
        }
      }
      const remoteFailed =
        isAuthenticated &&
        ((isCloudSessionId(id) && cloudFailed && (!legacyId || apiFailed)) ||
          (!isCloudSessionId(id) && Boolean(legacyId) && apiFailed))
      if (remoteFailed) {
        showToast('Could not delete that chat.', 'error')
        return
      }
      const remaining = sessions.filter(
        (item) => !sameChatId(item.id, id) && !sameChatId(item.legacy_id, id)
      )
      if (!isAuthenticated) {
        writeStoredSessions(GUEST_CHATS_KEY, remaining)
      }
      setSessions(remaining)
      const deletingCurrent =
        sameChatId(currentSession?.id, id) || sameChatId(currentSession?.legacy_id, id)
      if (deletingCurrent) {
        if (wsRef.current) {
          try {
            wsRef.current.close(1000, 'Chat deleted')
          } catch {
            // ignore
          }
          wsRef.current = null
        }
        if (voice.voiceMode) voice.stopVoice()
        setProductResults([])
        if (remaining[0]) {
          await selectSession(remaining[0].id)
        } else {
          setCurrentSession(null)
          await createNewSession(true)
        }
      }
      showToast('Chat deleted', 'success')
    } catch (error) {
      console.error('Failed to delete chat:', error)
      showToast('Could not delete that chat.', 'error')
    } finally {
      setDeletingChat(false)
      setDeleteTarget(null)
      setChatMenuId(null)
    }
  }

  const openDeleteChat = (session: any) => {
    setChatMenuId(null)
    setDeleteTarget(session)
  }

  const openRenameChat = (session: any) => {
    setChatMenuId(null)
    setShowSidebar(true)
    setRenamingId(session.id)
    setRenameDraft(sessionLabel(session))
  }

  const renameChat = async (session: any, rawTitle: string) => {
    if (!session) {
      setRenamingId(null)
      return
    }
    const draft = (rawTitle || '').trim()
    if (!draft) {
      setRenamingId(null)
      return
    }
    const existing = sessions
      .filter((item) => !sameChatId(item.id, session.id))
      .map((item) => item.title || '')
    const title = uniqueChatTitle(draft, existing)
    lockChatTitle(session.id)
    const now = new Date().toISOString()
    setRenamingId(null)
    setChatMenuId(null)
    setSessions((prev) =>
      prev.map((item) => (sameChatId(item.id, session.id) ? { ...item, title, updated_at: now } : item))
    )
    if (sameChatId(currentSessionRef.current?.id, session.id)) {
      useStore.setState((state) => {
        if (!state.currentSession || !sameChatId(state.currentSession.id, session.id)) return {}
        return { currentSession: { ...state.currentSession, title, updated_at: now } }
      })
    }
    try {
      if (isCloudSessionId(session.id)) {
        await updateCloudSession(session.id, { title })
      } else if (isServerSession(session.id)) {
        await chatAPI.renameSession(session.id, title)
      } else if (isServerSession(session.legacy_id)) {
        await chatAPI.renameSession(session.legacy_id, title)
      } else {
        persistGuestSessions({ ...session, title, updated_at: now })
      }
    } catch (error) {
      console.error('Failed to rename chat:', error)
      showToast('Could not save the chat name.', 'error')
    }
  }

  const applyRemoteTitle = (sid: number, incoming: string) => {
    const current = currentSessionRef.current
    if (current && matchesWsSession(current, sid) && isChatTitleLocked(current.id)) return
    setSessions((prev) => {
      const match = prev.find((item) => matchesWsSession(item, sid))
      if (match && isChatTitleLocked(match.id)) return prev
      const others = prev.filter((item) => !matchesWsSession(item, sid)).map((item) => item.title || '')
      const title = uniqueChatTitle(incoming, others)
      return prev.map((item) => (matchesWsSession(item, sid) ? { ...item, title } : item))
    })
    if (current && matchesWsSession(current, sid)) {
      useStore.setState((state) => {
        if (!state.currentSession || !matchesWsSession(state.currentSession, sid)) return {}
        if (isChatTitleLocked(state.currentSession.id)) return {}
        const others = sessions
          .filter((item) => !matchesWsSession(item, sid))
          .map((item) => item.title || '')
        return {
          currentSession: {
            ...state.currentSession,
            title: uniqueChatTitle(incoming, others),
          },
        }
      })
    }
  }

  const renderChatRow = (session: any, inModal = false) => {
    const selected = sameChatId(currentSession?.id, session.id)
    const menuOpen = sameChatId(chatMenuId, session.id)
    const renaming = sameChatId(renamingId, session.id)
    return (
      <div
        key={session.id}
        ref={menuOpen ? chatMenuRef : undefined}
        className={`group relative mb-1 rounded-lg ${
          selected ? 'bg-[#2f2f2f]' : inModal ? 'hover:bg-[#3d3d3d]' : 'hover:bg-[#2f2f2f]'
        }`}
      >
        {renaming ? (
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void renameChat(session, renameDraft)
            }}
            className="flex items-center gap-2 px-3 py-1.5"
            onClick={(event) => event.stopPropagation()}
          >
            <MessageSquare className="w-4 h-4 text-[#b4b4b4] flex-shrink-0" />
            <input
              ref={renameInputRef}
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  event.stopPropagation()
                  void renameChat(session, event.currentTarget.value)
                }
                if (event.key === 'Escape') {
                  event.preventDefault()
                  setRenamingId(null)
                }
              }}
              onBlur={(event) => void renameChat(session, event.currentTarget.value)}
              maxLength={60}
              aria-label="Chat name"
              className="min-w-0 flex-1 bg-[#1a1a1a] text-sm text-[#ececec] rounded-md px-2 py-1 outline-none border border-[#4d4d4d]"
            />
          </form>
        ) : (
          <>
        <button
          type="button"
          onClick={() => {
            selectSession(session.id)
            setSearchQuery('')
            setChatMenuId(null)
            if (inModal) setShowSearchModal(false)
          }}
          className={`w-full text-left px-3 py-2.5 pr-10 rounded-lg transition-colors ${
            inModal ? 'text-[#ececec]' : ''
          }`}
        >
          <p className="text-sm text-[#ececec] truncate flex items-center">
            <MessageSquare className="w-4 h-4 mr-2 text-[#b4b4b4] flex-shrink-0" />
            <span className="truncate">{sessionLabel(session)}</span>
          </p>
        </button>
        <button
          type="button"
          aria-label="Chat options"
          onClick={(event) => {
            event.stopPropagation()
            setChatMenuId(menuOpen ? null : session.id)
          }}
          className={`absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8 inline-flex items-center justify-center rounded-md text-[#b4b4b4] hover:bg-[#3d3d3d] hover:text-[#ececec] ${
            menuOpen ? 'opacity-100' : 'opacity-100 md:opacity-0 md:group-hover:opacity-100'
          }`}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {menuOpen ? (
          <div className="absolute right-1 top-full z-30 mt-1 w-40 rounded-xl border border-[#3d3d3d] bg-[#2f2f2f] py-1 shadow-lg">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                openRenameChat(session)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[#ececec] hover:bg-[#3d3d3d] text-left"
            >
              <Pencil className="w-4 h-4" />
              Rename
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                openDeleteChat(session)
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-[#3d3d3d] text-left"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        ) : null}
          </>
        )}
      </div>
    )
  }

  const connectWebSocket = async (sessionId: number, retryCount = 0, isReconnect = false): Promise<boolean> => {
    const maxRetries = 3 // Allow more retries for better reliability
    
    // Get fresh session token
    const token = (await getAccessToken()) || ''
    if (!token) {
      // #region agent log
      fetch('http://127.0.0.1:7822/ingest/99b396db-6f63-4207-97c0-0286dee5a836',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53a75c'},body:JSON.stringify({sessionId:'53a75c',runId:'voice-monitor-2',hypothesisId:'I',location:'chat/page.tsx:connectWebSocket',message:'no auth token',data:{sessionId,isReconnect,isAuthenticated},timestamp:Date.now()})}).catch(()=>{})
      // #endregion
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
        if (wsRef.current !== ws || !matchesWsSession(currentSessionRef.current, sessionId)) return
        try {
      const data = JSON.parse(event.data)
      if (
        !acceptingReplyRef.current &&
        data.type !== 'typing' &&
        data.type !== 'title' &&
        data.type !== 'done' &&
        data.type !== 'error' &&
        !data.error
      ) {
        return
      }
      
      if (data.type === 'typing') {
        acceptingReplyRef.current = true
        composerCtlRef.current.arm(25000)
        if (data.status) {
          liveAssistantRef.current = ''
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
        if (!liveAssistantRef.current || liveAssistantRef.current === '...') {
          liveAssistantRef.current = data.content
        } else {
          liveAssistantRef.current += data.content
        }
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
        if (liveAssistantRef.current && liveAssistantRef.current !== '...') {
          feedSpokenFn.current(liveAssistantRef.current)
        }
        composerCtlRef.current.arm(12000)
      } else if (data.type === 'title') {
        if (data.title && wsSessionIdRef.current) {
          applyRemoteTitle(wsSessionIdRef.current, data.title)
        }
      } else if (data.type === 'done') {
        composerCtlRef.current.release()
        if (data.product_results) {
          setProductResults(data.product_results)
        }
        if (data.quotation) {
          setMessages((prev) => {
            const updated = [...prev]
            const lastMsg = updated[updated.length - 1]
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.quotation = data.quotation
            }
            return updated
          })
        }
        if (data.title && wsSessionIdRef.current) {
          applyRemoteTitle(wsSessionIdRef.current, data.title)
        }
        const sid = wsSessionIdRef.current
        const current = currentSessionRef.current
        if (current && isCloudSessionId(current.id) && liveAssistantRef.current && liveAssistantRef.current !== '...') {
          void persistAccountMessage(
            current,
            'assistant',
            liveAssistantRef.current,
            isChatTitleLocked(current.id) ? current.title : data.title || current.title
          )
        }
        if (liveAssistantRef.current && liveAssistantRef.current !== '...') {
          finishSpokenFn.current(liveAssistantRef.current)
        }
        if (sid && isServerSession(sid) && !data.title) {
          chatAPI
            .getSession(sid)
            .then((full) => {
              if (!full?.title) return
              applyRemoteTitle(full.id, full.title)
            })
            .catch(() => {})
        }
      } else if (data.type === 'error') {
        composerCtlRef.current.release()
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
        composerCtlRef.current.release()
        console.error('WebSocket error:', data.error)
        showToast(data.error, 'error')
      }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error)
          composerCtlRef.current.release()
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
          // #region agent log
          debugAuthLog(
            'chat/page.tsx:ws',
            'websocket auth close',
            { code: event.code, reason: String(event.reason || '').slice(0, 80) },
            'B'
          )
          // #endregion
          composerCtlRef.current.release()
          setIsReconnecting(false)
          showToast('Authentication failed. Please try logging out and back in.', 'error')
          resolve(false)
          return
        }
        
        // Don't reconnect for normal closures
        if (event.code === 1000) {
          composerCtlRef.current.release()
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
          composerCtlRef.current.release()
          
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
                  if (accountWsId(currentSession)) {
                    connectWebSocket(accountWsId(currentSession) as number, 0, true)
                  }
                }, 5000)
              } else {
                setTimeout(() => {
                  if (accountWsId(currentSession)) {
                    connectWebSocket(accountWsId(currentSession) as number, 0, true)
                  }
                }, 15000)
              }
            }).catch(() => {
              if (backgroundRetryRef.current >= 8) return
              backgroundRetryRef.current += 1
              setTimeout(() => {
                if (accountWsId(currentSession)) {
                  connectWebSocket(accountWsId(currentSession) as number, 0, true)
                }
              }, 5000)
            })
          } else {
            console.log(`Connection closed: ${reason}. Retrying in background.`)
            setTimeout(() => {
              if (accountWsId(currentSession)) {
                connectWebSocket(accountWsId(currentSession) as number, 0, true)
              }
            }, 5000)
          }
          resolve(false)
        }
      }
    })
  }

  const handleSend = async (preset?: string) => {
    const userMessage = (typeof preset === 'string' ? preset : input || '').trim()
    if (!userMessage) return
    const fromVoice = typeof preset === 'string' && voice.voiceMode
    if (isLoadingRef.current || sendLockRef.current) {
      acceptingReplyRef.current = false
      sendLockRef.current = false
      voice.interruptSpeech()
    }
    if (!fromVoice) voice.stopCapture()
    acceptingReplyRef.current = true
    // #region agent log
    fetch('http://127.0.0.1:7822/ingest/99b396db-6f63-4207-97c0-0286dee5a836',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53a75c'},body:JSON.stringify({sessionId:'53a75c',location:'chat/page.tsx:handleSend',message:'send message',data:{fromVoice:typeof preset==='string',voiceMode:voice.voiceMode,listening:voice.listening,speaking:voice.speaking,preview:userMessage.slice(0,180),isLoading},timestamp:Date.now(),hypothesisId:'E'})}).catch(()=>{})
    // #endregion
    sendLockRef.current = true

    let session = currentSession
    if (!session) {
      if (!isAuthenticated) {
        const localSessions = localStorage.getItem('temp_chat_sessions')
        const existingSessions = localSessions ? JSON.parse(localSessions) : []
        if (countGuestChats(existingSessions) >= GUEST_CHAT_LIMIT) {
          showToast('Login to start more chats.', 'warning')
          sendLockRef.current = false
          return
        }
        const tempSession = makeLocalSession()
        const updatedSessions = [tempSession, ...existingSessions]
        localStorage.setItem('temp_chat_sessions', JSON.stringify(updatedSessions))
        setCurrentSession(tempSession as any)
        setSessions(updatedSessions)
        rememberChat(tempSession.id)
        session = tempSession as any
      } else {
        try {
          let legacyId: number | null = null
          try {
            const created = await chatAPI.createSession('New chat')
            legacyId = created.id
          } catch (error: any) {
            if (error.response?.status === 401) {
              await redirectIfSignedOut(router, 'Please login to send messages')
              sendLockRef.current = false
              return
            }
          }
          if (await cloudChatsReady()) {
            const cloud = await createCloudSession('New chat', legacyId)
            const next = { ...cloud, messages: [], legacy_id: legacyId }
            setCurrentSession(next as any)
            setSessions((prev) => [next, ...prev.filter((item) => !sameChatId(item.id, cloud.id))])
            rememberChat(cloud.id)
            session = next as any
          } else if (legacyId) {
            const next = {
              id: legacyId,
              messages: [],
              title: 'New chat',
              updated_at: new Date().toISOString(),
            }
            setCurrentSession(next as any)
            setSessions((prev) => [next, ...prev.filter((item) => !sameChatId(item.id, legacyId))])
            rememberChat(legacyId)
            session = next as any
          } else {
            throw new Error('Could not create chat')
          }
        } catch (error: any) {
          if (error.response?.status === 401) {
            await redirectIfSignedOut(router, 'Please login to send messages')
            sendLockRef.current = false
            return
          }
          const tempSession = makeLocalSession()
          setCurrentSession(tempSession as any)
          setSessions((prev) => [tempSession, ...prev])
          rememberChat(tempSession.id)
          session = tempSession as any
        }
      }
    }
    if (!session) {
      sendLockRef.current = false
      showToast('Could not start a chat. Try again.', 'error')
      return
    }

    setInput('')
    setIsLoading(true)
    setProductResults([])

    const userMsg = { role: 'user' as const, content: userMessage }
    addMessage(userMsg)
    const topicText =
      [...(session.messages || []), userMsg]
        .filter((item) => item.role === 'user' && String(item.content || '').trim())
        .map((item) => String(item.content))
        .filter((text) => !isSmalltalk(text))
        .slice(-1)[0] || userMessage
    const existingTitles = sessions
      .filter((item) => !sameChatId(item.id, session.id))
      .map((item) => item.title || '')
    const generated = naturalChatTitle(topicText, session.title, {
      existingTitles,
      locked: isChatTitleLocked(session.id),
    })
    const nextTitle = generated || session.title || 'New chat'
    setSessions((prev) => {
      const now = new Date().toISOString()
      const rest = prev.filter((item) => !sameChatId(item.id, session.id))
      const current = prev.find((item) => sameChatId(item.id, session.id))
      return [
        {
          ...(current || session),
          id: session.id,
          title: nextTitle || current?.title || session.title || 'New chat',
          updated_at: now,
          messages: current?.messages || session.messages || [],
          legacy_id: session.legacy_id ?? current?.legacy_id,
        },
        ...rest,
      ]
    })
    useStore.setState((state) => {
      if (!state.currentSession || !sameChatId(state.currentSession.id, session.id)) return {}
      return { currentSession: { ...state.currentSession, title: nextTitle } }
    })
    void persistAccountMessage(session, 'user', userMessage, nextTitle)

    const token = (await getAccessToken()) || (await ensureFreshSession())
    const authed = Boolean(token)

    // For guests, keep the chat working locally.
      if (!authed) {
        if (isAuthenticated && !ghostToastRef.current) {
          ghostToastRef.current = true
          showToast('Your login session expired. Log in again for live catalog answers.', 'warning')
        }
        // Save message to local storage
        const updatedMessages = [...(session?.messages || []), userMsg]
        const updatedSession = {
          ...session,
          title: nextTitle || session.title,
          messages: updatedMessages,
          updated_at: new Date().toISOString(),
        }
        setCurrentSession(updatedSession as any)
        setSessions(persistGuestSessions(updatedSession))

      // Generate helpful AI-like response based on query
        const response = cannedAssistantReply(userMessage, { guest: true })
        
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
          sendLockRef.current = false
          speakReplyFn.current(response)
      return
    }

    // Authenticated users: Try WebSocket first, fallback to REST API
    try {
      let wsId = accountWsId(session)
      if (!wsId && token) {
        try {
          const created = await chatAPI.createSession(nextTitle || session?.title || 'Voice chat')
          wsId = created.id
          const next = {
            ...session,
            id: isServerSession(session?.id) ? session.id : created.id,
            legacy_id: created.id,
          }
          session = next
          setCurrentSession(next as any)
        } catch {
          wsId = null
        }
      }
      const connected = token && wsId ? await connectWebSocket(wsId) : false
      // #region agent log
      fetch('http://127.0.0.1:7822/ingest/99b396db-6f63-4207-97c0-0286dee5a836',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53a75c'},body:JSON.stringify({sessionId:'53a75c',runId:'voice-monitor-2',hypothesisId:'I',location:'chat/page.tsx:handleSend:ws',message:'ws path',data:{hasWsId:Boolean(wsId),idKind:typeof session?.id==='number'?'number':typeof session?.id,idLen:typeof session?.id==='string'?session.id.length:0,hasLegacy:Boolean(session?.legacy_id),connected,readyState:wsRef.current?.readyState??null,hasToken:Boolean(await getAccessToken())},timestamp:Date.now()})}).catch(()=>{})
      // #endregion
      
      if (connected && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        const money = getDisplayCurrencyNow()
        wsRef.current.send(JSON.stringify({
          message: userMessage,
          voice: Boolean(voice.voiceMode),
          currency: money.currency,
          currency_symbol: money.symbol,
          country: money.country,
          local_per_ngn: money.localPerNgn,
          ...quoteScopePayload(),
        }))
        armComposerWatch(25000)
        return
      }

      // Fallback to REST API with live generate, then canned scripts
      console.log('WebSocket not available, using REST API fallback')
      
      const applyAssistant = async (assistantResponse: string, extra?: { title?: string; product_results?: any[]; quotation?: any; saved?: boolean }) => {
        addMessage({ role: 'assistant' as const, content: assistantResponse, quotation: extra?.quotation })
        if (extra?.product_results) setProductResults(extra.product_results)
        const title = isChatTitleLocked(session.id)
          ? nextTitle
          : uniqueChatTitle(extra?.title || nextTitle, existingTitles)
        if (title !== nextTitle) {
          setSessions((prev) =>
            prev.map((item) => (sameChatId(item.id, session.id) ? { ...item, title } : item))
          )
          useStore.setState((state) => {
            if (!state.currentSession || !sameChatId(state.currentSession.id, session.id)) return {}
            return { currentSession: { ...state.currentSession, title } }
          })
        }
        setIsLoading(false)
        sendLockRef.current = false
        speakReplyFn.current(assistantResponse)
        void persistAccountMessage(session, 'assistant', assistantResponse, title)
        if (wsId && !extra?.saved) {
          try {
            await chatAPI.createMessage(wsId, assistantResponse, 'assistant')
          } catch (error) {
            console.error('Failed to save assistant message:', error)
          }
        }
      }

      if (wsId && token) {
        try {
          const money = getDisplayCurrencyNow()
          const reply = await chatAPI.generateReply(wsId, {
            message: userMessage,
            voice: Boolean(voice.voiceMode),
            currency: money.currency,
            currency_symbol: money.symbol,
            local_per_ngn: money.localPerNgn,
            country: money.country,
            ...quoteScopePayload(),
          })
          const assistantResponse = String(reply?.content || '').trim()
          if (assistantResponse) {
            await applyAssistant(assistantResponse, {
              title: isChatTitleLocked(session.id) ? nextTitle : reply.title || nextTitle,
              product_results: reply.product_results,
              quotation: reply.quotation,
              saved: true,
            })
            return
          }
        } catch (error) {
          console.error('REST generate failed:', error)
        }
      }

      try {
        if (wsId) await chatAPI.createMessage(wsId, userMessage)
      } catch (e) {
        console.error('Failed to save message:', e)
      }

      try {
        await applyAssistant(cannedAssistantReply(userMessage, { guest: false }))
      } catch (apiError: any) {
        console.error('API error:', apiError)
        await applyAssistant(cannedAssistantReply(userMessage, { guest: false }))
      }
    } catch (error: any) {
        console.error('Failed to send message:', error)
        const errorMessage =
          error?.response?.data?.detail ||
          error?.message ||
          'Failed to send message. Please try again.'
        showToast(errorMessage, 'error')
      setIsLoading(false)
      sendLockRef.current = false
    }
  }

  handleSendRef.current = handleSend

  useEffect(() => {
    if (!isLoading) sendLockRef.current = false
  }, [isLoading])

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // Handle logout
  const handleLogout = async () => {
    wasAuthedRef.current = false
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
      const inHeader = userMenuHeaderRef.current?.contains(event.target as Node)
      const inMobile = userMenuMobileRef.current?.contains(event.target as Node)
      if (!inHeader && !inMobile) {
        setShowUserMenuHeader(false)
      }
      if (chatMenuRef.current && !chatMenuRef.current.contains(event.target as Node)) {
        setChatMenuId(null)
      }
    }

    if (showUserMenu || showUserMenuHeader || chatMenuId != null) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showUserMenu, showUserMenuHeader, chatMenuId])

  useEffect(() => {
    if (!showSidebar) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowSidebar(false)
    }
    const media = window.matchMedia('(max-width: 767px)')
    const syncOverflow = () => {
      document.body.style.overflow = media.matches ? 'hidden' : ''
    }
    syncOverflow()
    media.addEventListener('change', syncOverflow)
    document.addEventListener('keydown', onKey)
    return () => {
      media.removeEventListener('change', syncOverflow)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [showSidebar])

  useEffect(() => {
    if (!deleteTarget && chatMenuId == null) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (deleteTarget && !deletingChat) setDeleteTarget(null)
      else setChatMenuId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [deleteTarget, chatMenuId, deletingChat])

  // Guest limit is on starting new chats, not on sending in an open chat.
  const guestChatsUsed = clientReady && !isAuthenticated ? countGuestChats(sessions) : 0
  const remainingChats = Math.max(0, GUEST_CHAT_LIMIT - guestChatsUsed)
  const lastChatMessage = currentSession?.messages[currentSession.messages.length - 1]
  const waitingForReply =
    isLoading &&
    (!lastChatMessage ||
      lastChatMessage.role !== 'assistant' ||
      !lastChatMessage.content ||
      lastChatMessage.content === '...')
  const hasReachedLimit = clientReady && !isAuthenticated && guestChatsUsed >= GUEST_CHAT_LIMIT
  const voiceStatus: VoiceOrbState = voice.voiceError
    ? 'error'
    : voice.speaking
      ? 'speaking'
      : waitingForReply
        ? 'thinking'
        : voice.cueName === 'listening' || voice.listening || voice.micMuted
          ? 'listening'
          : 'connecting'
  const voiceCaption =
    voice.transcript?.trim() ||
    (voice.speaking || waitingForReply ? voice.spokenCaption : '') ||
    undefined

  return (
    <>
      <VoiceOverlay
        open={voice.voiceMode}
        status={voiceStatus}
        muted={voice.micMuted}
        error={voice.voiceError}
        caption={voiceCaption}
        cueName={voice.cueName}
        onMute={() => voice.setMicMuted(!voice.micMuted)}
        onEnd={voice.stopVoice}
        onClose={voice.stopVoice}
        onRetry={voice.retryListen}
      />
      {deleteTarget ? (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 px-4"
          onClick={() => {
            if (!deletingChat) setDeleteTarget(null)
          }}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[#2f2f2f] p-5 text-[#ececec] shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Delete chat?</h2>
            <p className="mt-2 text-sm text-[#b4b4b4]">
              This will delete{' '}
              <span className="text-[#ececec]">{sessionLabel(deleteTarget)}</span>.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deletingChat}
                onClick={() => setDeleteTarget(null)}
                className="rounded-lg px-3 py-2 text-sm text-[#ececec] hover:bg-[#3d3d3d] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingChat}
                onClick={() => void deleteChat(deleteTarget)}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-500 disabled:opacity-50"
              >
                {deletingChat ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    <div
      className={`fixed inset-0 h-dvh max-h-dvh bg-[#212121] overflow-hidden md:flex ${
        voice.voiceMode ? 'pointer-events-none' : ''
      }`}
      aria-hidden={voice.voiceMode || undefined}
    >
      {showSidebar && (
        <button
          type="button"
          aria-label="Close menu"
          className="md:hidden fixed inset-0 z-40 bg-black/50"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* Sidebar - Navigation & Chat History (ChatGPT style) */}
      <div className={`flex flex-col h-full bg-black md:bg-[#171717] border-r border-[#2f2f2f] overflow-hidden z-50 w-72 max-w-[85vw] fixed inset-y-0 left-0 md:relative md:max-w-none md:w-64 md:flex-shrink-0 transition-transform duration-300 ${showSidebar ? 'translate-x-0' : '-translate-x-full max-md:pointer-events-none'} md:translate-x-0`}>
        <div className="hidden md:flex items-center justify-between px-4 py-3 border-b border-[#2f2f2f]">
          <Logo className="h-6" />
          {isSuper ? <SuperadminPagesMenu align="right" compact /> : null}
        </div>
        <div className="md:hidden flex items-center justify-between p-3 border-b border-[#2f2f2f]">
          <Logo className="h-6" />
          <button
            type="button"
            onClick={() => setShowSidebar(false)}
            className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-lg text-[#ececec] hover:bg-[#2f2f2f]"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-2 space-y-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={createNewSession}
            disabled={hasReachedLimit}
            className="w-full justify-start bg-transparent hover:bg-[#2f2f2f] text-[#ececec] disabled:opacity-50"
          >
            <Plus className="w-4 h-4 mr-2" />
            New chat
          </Button>
          <button 
            type="button"
            onClick={() => {
              setSearchQuery('')
              setShowSidebar(false)
              setShowSearchModal(true)
            }}
            className="w-full flex items-center space-x-2 px-3 py-2.5 rounded-lg hover:bg-[#2f2f2f] transition-colors text-[#ececec]"
          >
            <Search className="w-4 h-4 text-[#b4b4b4]" />
            <span className="text-sm">Search chats</span>
          </button>
          {hasReachedLimit && (
            <p className="text-xs text-[#8e8e8e] px-3 pb-1">
              You can keep chatting here.{' '}
              <Link href="/login" className="text-primary-600 hover:underline">Login</Link> to start more chats.
            </p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto pb-24">
          <div className="p-2">
            <p className="text-xs text-[#8e8e8e] px-3 py-2">Chats</p>
            {isAuthenticated ? (
              <div className="px-3 pb-3">
                <BusinessSwitcher compact />
              </div>
            ) : null}
            {(() => {
              const filteredSessions = sessions.filter(
                (session) => !isBlankChat(session) || sameChatId(session.id, currentSession?.id)
              )

              if ((!authReady || sessionsLoading) && sessions.length === 0) {
                return <p className="text-xs text-[#8e8e8e] px-3 py-2">Loading chats...</p>
              }

              if (filteredSessions.length === 0) {
                return <p className="text-xs text-[#8e8e8e] px-3 py-2">No chats yet</p>
              }

              return filteredSessions.map((session) => renderChatRow(session))
            })()}
          </div>
        </div>

        {/* User Info / Login Prompt */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-[#2f2f2f] bg-black md:bg-[#171717]">
          {isAuthenticated ? (
            <div className="relative" ref={userMenuRef}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[#2f2f2f] transition-colors text-left"
              >
                <div className="text-xs text-[#b4b4b4] flex-1 min-w-0">
                  <p className="text-[#ececec] font-medium truncate">{user?.full_name || user?.email}</p>
                </div>
                <ChevronUp className={`w-4 h-4 text-[#b4b4b4] transition-transform ${showUserMenu ? '' : 'rotate-180'}`} />
              </button>
              
              {showUserMenu && (
                <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#2f2f2f] border border-[#2f2f2f] rounded-lg shadow-lg overflow-hidden z-50">
                  <Link
                    href="/quotations"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center space-x-2 px-4 py-3 text-sm text-[#ececec] hover:bg-[#3d3d3d] transition-colors"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Quotations</span>
                  </Link>
                  <Link
                    href="/businesses"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center space-x-2 px-4 py-3 text-sm text-[#ececec] hover:bg-[#3d3d3d] transition-colors"
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Businesses</span>
                  </Link>
                  {isVendor && (
                    <Link
                      href="/vendor"
                      onClick={() => {
                        setAccountView('vendor')
                        setShowUserMenu(false)
                      }}
                      className="flex items-center space-x-2 px-4 py-3 text-sm text-[#ececec] hover:bg-[#3d3d3d] transition-colors"
                    >
                      <Building2 className="w-4 h-4" />
                      <span>Vendor dashboard</span>
                    </Link>
                  )}
                  <Link
                    href="/upgrade"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center space-x-2 px-4 py-3 text-sm text-[#ececec] hover:bg-[#3d3d3d] transition-colors"
                  >
                    <span>Upgrade to Pro</span>
                  </Link>
                  <Link
                    href="/profile#voice"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center space-x-2 px-4 py-3 text-sm text-[#ececec] hover:bg-[#3d3d3d] transition-colors"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Voice settings</span>
                  </Link>
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
                    <span>{remainingChats} new chat{remainingChats !== 1 ? 's' : ''} remaining</span>
                ) : (
                    <span className="text-amber-400">Login to start more chats</span>
                )}
              </p>
              )}
              <Link
                href="/profile#voice"
                className="text-xs text-[#8e8e8e] hover:text-[#ececec] inline-flex items-center gap-1"
              >
                <Settings className="w-3.5 h-3.5" />
                Voice settings
              </Link>
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
          className="fixed inset-0 bg-black bg-opacity-50 z-[60] flex items-start justify-center pt-[12vh] px-3"
          onClick={() => {
            setShowSearchModal(false)
            setSearchQuery('')
          }}
        >
          <div 
            className="bg-[#2f2f2f] border border-[#2f2f2f] rounded-lg w-full max-w-md mx-0 shadow-xl max-h-[80dvh] flex flex-col"
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
            <div className="max-h-[50vh] overflow-y-auto p-2">
              {(() => {
                const matches = searchQuery
                  ? sessions.filter((session) =>
                      sessionLabel(session).toLowerCase().includes(searchQuery.toLowerCase())
                    )
                  : sessions.filter(
                      (session) => !isBlankChat(session) || sameChatId(session.id, currentSession?.id)
                    )
                if ((!authReady || sessionsLoading) && sessions.length === 0) {
                  return <p className="text-sm text-[#8e8e8e] px-3 py-4 text-center">Loading chats...</p>
                }
                if (matches.length === 0) {
                  return (
                    <p className="text-sm text-[#8e8e8e] px-3 py-4 text-center">
                      {searchQuery ? 'No chats found' : 'No chats yet. Start a new chat.'}
                    </p>
                  )
                }
                return matches.map((session) => renderChatRow(session, true))
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
      <div className="flex-1 flex flex-col bg-black md:bg-[#212121] min-w-0 min-h-0 h-full w-full">
        {/* Mobile header */}
        <div className="md:hidden relative flex items-center justify-between px-3 py-2 shrink-0">
                      <button
            type="button"
            onClick={() => setShowSidebar(true)}
            className="h-10 w-10 inline-flex items-center justify-center rounded-full bg-[#2a2a2a] text-white"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h1 className="absolute left-1/2 -translate-x-1/2 max-w-[46%] truncate text-sm font-semibold text-[#ececec] pointer-events-none">
            {currentSession ? sessionLabel(currentSession) : 'New chat'}
          </h1>
          <div className="flex items-center gap-2">
            {isSuper ? <SuperadminPagesMenu align="right" compact /> : null}
            <button
              type="button"
              onClick={() => void createNewSession()}
              disabled={hasReachedLimit}
              className="h-10 w-10 inline-flex items-center justify-center rounded-full bg-[#2a2a2a] text-white disabled:opacity-40"
              aria-label="New chat"
            >
              <Pencil className="w-5 h-5" />
            </button>
            <div className="relative" ref={userMenuMobileRef}>
              <button
                type="button"
                onClick={() => {
                  if (isAuthenticated) setShowUserMenuHeader(!showUserMenuHeader)
                  else router.push('/login')
                }}
                className="h-10 w-10 inline-flex items-center justify-center rounded-full bg-[#2a2a2a] text-white"
                aria-label="More"
              >
                <MoreHorizontal className="w-5 h-5" />
                      </button>
              {isAuthenticated && showUserMenuHeader && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-[#2f2f2f] border border-[#2f2f2f] rounded-2xl shadow-lg overflow-hidden z-50">
                  <div className="px-4 py-3 border-b border-[#3d3d3d]">
                    <p className="text-sm font-medium text-[#ececec] truncate">{user?.full_name || user?.email}</p>
                    <p className="text-xs text-[#b4b4b4] mt-1 truncate">{user?.email}</p>
                  </div>
                  <Link
                    href="/quotations"
                    onClick={() => setShowUserMenuHeader(false)}
                    className="flex items-center space-x-2 px-4 py-3 text-sm text-[#ececec] hover:bg-[#3d3d3d]"
                  >
                    <FileText className="w-4 h-4" />
                    <span>Quotations</span>
                  </Link>
                  <Link
                    href="/businesses"
                    onClick={() => setShowUserMenuHeader(false)}
                    className="flex items-center space-x-2 px-4 py-3 text-sm text-[#ececec] hover:bg-[#3d3d3d]"
                  >
                    <Building2 className="w-4 h-4" />
                    <span>Businesses</span>
                  </Link>
                  {isVendor && (
                    <Link
                      href="/vendor"
                      onClick={() => {
                        setAccountView('vendor')
                        setShowUserMenuHeader(false)
                      }}
                      className="flex items-center space-x-2 px-4 py-3 text-sm text-[#ececec] hover:bg-[#3d3d3d]"
                    >
                      <Building2 className="w-4 h-4" />
                      <span>Vendor dashboard</span>
                    </Link>
                  )}
                  <Link
                    href="/profile#voice"
                    onClick={() => setShowUserMenuHeader(false)}
                    className="flex items-center space-x-2 px-4 py-3 text-sm text-[#ececec] hover:bg-[#3d3d3d]"
                >
                  <Settings className="w-4 h-4" />
                    <span>Voice settings</span>
                  </Link>
                    <Link
                      href="/profile"
                      onClick={() => setShowUserMenuHeader(false)}
                    className="flex items-center space-x-2 px-4 py-3 text-sm text-[#ececec] hover:bg-[#3d3d3d]"
                    >
                      <User className="w-4 h-4" />
                      <span>Profile</span>
                    </Link>
                  {currentSession ? (
                    <button
                      onClick={() => {
                        openRenameChat(currentSession)
                        setShowUserMenuHeader(false)
                      }}
                      className="w-full flex items-center space-x-2 px-4 py-3 text-sm text-[#ececec] hover:bg-[#3d3d3d] text-left"
                    >
                      <Pencil className="w-4 h-4" />
                      <span>Rename chat</span>
                    </button>
                  ) : null}
                  {currentSession ? (
                    <button
                      onClick={() => {
                        openDeleteChat(currentSession)
                        setShowUserMenuHeader(false)
                      }}
                      className="w-full flex items-center space-x-2 px-4 py-3 text-sm text-red-400 hover:bg-[#3d3d3d] text-left"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Delete chat</span>
                    </button>
                  ) : null}
                    <button
                      onClick={() => {
                        handleLogout()
                        setShowUserMenuHeader(false)
                      }}
                    className="w-full flex items-center space-x-2 px-4 py-3 text-sm text-red-400 hover:bg-[#3d3d3d] text-left"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Logout</span>
                    </button>
                  </div>
                )}
              </div>
          </div>
        </div>

        {/* Desktop header */}
        <div className="hidden md:flex px-4 py-3 items-center shrink-0">
          {currentSession ? (
            <button
              type="button"
              onClick={() => openRenameChat(currentSession)}
              className="font-semibold truncate text-base text-[#ececec] hover:text-white"
              title="Rename chat"
            >
              {sessionLabel(currentSession)}
            </button>
          ) : (
            <h1 className="font-semibold truncate text-base text-[#ececec]">New chat</h1>
          )}
        </div>

        {/* Messages - ChatGPT Style */}
        <div className="flex flex-1 overflow-y-auto overscroll-contain min-h-0 flex-col">
          {currentSession?.messages.length === 0 && !voice.transcript && (
            <div className="flex items-center justify-center min-h-full py-8">
              <div className="text-center max-w-2xl px-4">
                <div className="mb-3 md:mb-4">
                  <h1 className="md:hidden text-[28px] font-medium text-white">What&apos;s on the agenda today?</h1>
                  <Logo className="hidden md:inline-block h-12" />
                        </div>
                <p className="hidden md:block text-[#b4b4b4] text-lg mb-8">Ask me about hardware, software, or a service to get built.</p>
                <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        "What laptops do you have?",
                    "I need software to manage inventory",
                    budgetHint,
                    "Who can build a company website?"
                      ].map((suggestion) => (
                        <button
                          key={suggestion}
                      onClick={() => void handleSend(suggestion)}
                      className="p-3 min-h-11 bg-[#2f2f2f] hover:bg-[#3d3d3d] rounded-lg text-[#ececec] text-left text-sm transition-colors"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
              </div>
            </div>
          )}
          
          <div className="max-w-3xl mx-auto w-full">
            {currentSession?.messages.map((message, index, all) => {
              const isLatestAssistant =
                message.role === 'assistant' &&
                !all.slice(index + 1).some((item: any) => item.role === 'assistant')
              return (
              <div
                key={index}
                ref={isLatestAssistant ? latestReplyRef : undefined}
                className={isLatestAssistant ? 'scroll-mt-3' : undefined}
              >
              <ChatMessage
                message={message}
                onSpeak={voice.speakNow}
                showActions={isLatestAssistant}
                onFollowUp={
                  message.role === 'assistant' && index === all.length - 1
                    ? (text) => void handleSend(text)
                    : undefined
                }
                followUpDisabled={false}
              />
              </div>
              )
            })}

            {voice.transcript && (
              <div>
                <div className="max-w-3xl mx-auto px-4 py-2.5 md:py-5 flex justify-end md:block">
                  <div className="flex items-start md:space-x-4 max-w-[88%] md:max-w-none">
                    <div className="flex-shrink-0 hidden md:block">
                      <div className="w-8 h-8 rounded-full bg-[#3d3d3d] flex items-center justify-center">
                        <User className="w-5 h-5 text-white" />
                  </div>
                    </div>
                    <div className="flex-1 min-w-0 overflow-hidden">
                      <div className="text-[#ececec] text-[15px] md:text-base break-words bg-[#2f2f2f] md:bg-transparent rounded-[22px] md:rounded-none px-4 py-2.5 md:px-0 md:py-0 live-caption-caret">
                        {voice.transcript}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {waitingForReply && (
              <div className="px-4 py-6 md:py-8 bg-transparent">
                <div className="flex items-center max-w-3xl mx-auto">
                  <ProcureXLoader size={80} label="Waiting for ProcureX" />
                </div>
              </div>
            )}
            
            {productResults.length > 0 && (currentSession?.messages?.length ?? 0) > 0 && (
              <div className="px-4 py-6 bg-transparent">
                <div className="max-w-3xl mx-auto">
                  {(() => {
                    const exact = productResults.filter((product) => product.match_kind === 'exact' || product.match_kind === 'close')
                    const suggestions = productResults.filter((product) => product.match_kind === 'related')
                    const rest = exact.length ? [] : productResults.filter((product) => product.match_kind !== 'related')
                    return (
                      <>
                        {exact.length > 0 ? (
                          <>
                            <h3 className="text-sm font-semibold text-[#ececec] mb-4">Exact matches</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                              {exact.map((product) => (
                                <ProductCard
                                  key={product.id}
                                  product={product}
                                  onSelect={
                                    waitingForReply
                                      ? undefined
                                      : (item) => void handleSend(`Generate a formal procurement quote for ${item.name}`)
                                  }
                                />
                              ))}
                            </div>
                          </>
                        ) : rest.length > 0 ? (
                          <>
                            <h3 className="text-sm font-semibold text-[#ececec] mb-4">Matching products</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                              {rest.map((product) => (
                                <ProductCard
                                  key={product.id}
                                  product={product}
                                  onSelect={
                                    waitingForReply
                                      ? undefined
                                      : (item) => void handleSend(`Generate a formal procurement quote for ${item.name}`)
                                  }
                                />
                              ))}
                            </div>
                          </>
                        ) : null}
                        {suggestions.length > 0 && (
                          <>
                            <h3 className="text-sm font-semibold text-[#ececec] mb-4">
                              {exact.length ? 'Related suggestions' : 'Closest suggestions'}
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {suggestions.map((product) => (
                                <ProductCard
                                  key={product.id}
                                  product={product}
                                  onSelect={
                                    waitingForReply
                                      ? undefined
                                      : (item) => void handleSend(`Generate a formal procurement quote for ${item.name}`)
                                  }
                                />
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    )
                  })()}
                </div>
              </div>
            )}
          </div>
          
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="relative bg-black md:bg-[#212121] md:border-t md:border-[#2f2f2f] px-3 md:px-4 pt-2 md:pt-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] shrink-0">
          {showComposerMenu && (
            <div className="md:hidden absolute bottom-full left-3 right-3 mb-2 bg-[#2f2f2f] rounded-2xl overflow-hidden shadow-xl z-20">
              <Link
                href="/quotations"
                onClick={() => setShowComposerMenu(false)}
                className="flex items-center gap-3 px-4 py-3.5 text-sm text-white hover:bg-[#3d3d3d]"
              >
                <FileText className="w-4 h-4" />
                Quotations
              </Link>
            </div>
          )}

          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-2">
            <div className={`relative flex-1 min-w-0 flex items-end md:items-end bg-[#303030] md:bg-[#2f2f2f] rounded-full md:rounded-2xl border ${
              voice.listening ? 'border-[#19C37D]' : 'border-transparent'
            }`}>
              <button
                type="button"
                onClick={() => setShowComposerMenu((open) => !open)}
                className="md:hidden m-1 h-10 w-10 inline-flex items-center justify-center rounded-full text-white flex-shrink-0"
                aria-label="Add"
              >
                <Plus className="w-5 h-5" />
              </button>
              {voice.supported && (
                <button
                  type="button"
                  onClick={voice.toggleVoiceMode}
                  disabled={isLoading}
                  title={voice.voiceMode ? 'Close voice chat' : 'Chat with voice'}
                  className={`hidden md:inline-flex m-2 min-h-11 min-w-11 items-center justify-center rounded-lg flex-shrink-0 transition-colors ${
                    voice.voiceMode
                      ? 'bg-[#19C37D] text-white'
                      : 'text-[#8e8e8e] hover:bg-[#3d3d3d] hover:text-[#ececec]'
                  }`}
                  aria-label="Chat with voice"
                >
                  <AudioLines className="w-5 h-5" />
                </button>
              )}
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                enterKeyHint="send"
                placeholder={
                  voice.listening
                    ? 'Listening...'
                    : voice.speaking
                      ? 'Speaking...'
                      : 'Ask ProcureX'
                }
                className="flex-1 min-w-0 resize-none bg-transparent text-base text-[#ececec] placeholder-[#8e8e8e] px-1 md:px-2 py-3 focus:outline-none overflow-y-auto"
                rows={1}
                style={{ maxHeight: '120px' }}
              />
              {voice.supported && (
              <button
                  type="button"
                  onClick={voice.toggleListening}
                  disabled={isLoading || voice.speaking}
                  title={voice.listening ? 'Stop listening' : 'Speak'}
                  className={`m-1 md:m-2 h-10 w-10 md:min-h-11 md:min-w-11 inline-flex items-center justify-center rounded-full md:rounded-lg flex-shrink-0 transition-colors ${
                    voice.listening
                      ? 'bg-red-600 text-white animate-pulse'
                      : 'text-[#cfcfcf] hover:bg-[#3d3d3d] hover:text-[#ececec]'
                  }`}
                >
                  {voice.listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
              )}
              {(input || '').trim() ? (
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => void handleSend()}
                  className="hidden md:inline-flex m-2 min-h-11 min-w-11 items-center justify-center rounded-lg bg-primary-600 text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                  aria-label="Send"
                >
                  {waitingForReply ? (
                    <ProcureXLoader size={24} label="Waiting for ProcureX" />
                ) : (
                  <Send className="w-5 h-5 text-white" />
                )}
              </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={voice.toggleVoiceMode}
                    disabled={isLoading || !voice.supported}
                    className="md:hidden m-1 h-9 w-9 inline-flex items-center justify-center rounded-full bg-[#3b82f6] text-white disabled:opacity-50 flex-shrink-0"
                    aria-label="Chat with voice"
                  >
                    {waitingForReply ? <ProcureXLoader size={24} label="Waiting for ProcureX" /> : <AudioLines className="w-5 h-5" />}
                  </button>
                  <button
                    type="button"
                    disabled
                    className="hidden md:inline-flex m-2 min-h-11 min-w-11 items-center justify-center rounded-lg bg-primary-600 text-white opacity-50 cursor-not-allowed flex-shrink-0"
                    aria-label="Send"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
            {(input || '').trim() ? (
              <button
                type="button"
                onPointerDown={(e) => {
                  if (e.pointerType === 'touch') {
                    e.preventDefault()
                    void handleSend()
                  }
                }}
                onClick={() => void handleSend()}
                className="md:hidden h-12 w-12 rounded-full bg-white text-black inline-flex items-center justify-center flex-shrink-0 disabled:opacity-50"
                aria-label="Send"
              >
                {waitingForReply ? <ProcureXLoader size={24} label="Waiting for ProcureX" /> : <ArrowUp className="w-5 h-5" />}
              </button>
            ) : null}
            </div>
            <p className="hidden md:block text-xs text-[#8e8e8e] text-center mt-2 px-2">
              ProcureX can make mistakes. Check important info.
            </p>
          </div>
        </div>
      </div>
    </div>
    </>
  )
}


