import { create } from 'zustand'
import { supabase } from './supabaseClient'
import { rememberAccessToken } from './sessionToken'

export interface StoreUser {
  id: string
  email: string
  full_name?: string
  role?: string
}

interface ChatMessage {
  id?: number
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata?: string
}

interface ChatSession {
  id: number | string
  title?: string
  messages: ChatMessage[]
  legacy_id?: number | null
  created_at?: string
  updated_at?: string
}

interface AppState {
  user: StoreUser | null
  currentSession: ChatSession | null
  isAuthenticated: boolean
  authReady: boolean
  setAuthReady: (ready: boolean) => void
  setUser: (user: StoreUser | null) => void
  setCurrentSession: (session: ChatSession | null) => void
  addMessage: (message: ChatMessage) => void
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void
  logout: () => Promise<void>
}

export const useStore = create<AppState>((set) => ({
  user: null,
  currentSession: null,
  isAuthenticated: false,
  authReady: false,
  
  setUser: (user) => set((state) => {
    const prev = state.user
    if (prev === user) return state
    if (
      prev &&
      user &&
      prev.id === user.id &&
      prev.email === user.email &&
      prev.role === user.role &&
      prev.full_name === user.full_name
    ) {
      return state
    }
    if (!prev && !user) return state
    return { user, isAuthenticated: !!user }
  }),
  setAuthReady: (ready) => set({ authReady: ready }),
  
  setCurrentSession: (session) => set({
    currentSession: session
      ? { ...session, messages: session.messages || [] }
      : null,
  }),
  
  addMessage: (message) => set((state) => {
    if (!state.currentSession) return state
    return {
      currentSession: {
        ...state.currentSession,
        messages: [...(state.currentSession.messages || []), message],
      },
    }
  }),
  
  setMessages: (messages) => set((state) => {
    if (!state.currentSession) return state
    const existing = state.currentSession.messages || []
    const newMessages = typeof messages === 'function' 
      ? messages(existing)
      : messages
    return {
      currentSession: {
        ...state.currentSession,
        messages: newMessages,
      },
    }
  }),
  
  logout: async () => {
    rememberAccessToken(null)
    await supabase.auth.signOut()
    set({ user: null, currentSession: null, isAuthenticated: false })
  },
}))

