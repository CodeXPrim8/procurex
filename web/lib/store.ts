import { create } from 'zustand'
import { supabase } from './supabaseClient'

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
  id: number
  title?: string
  messages: ChatMessage[]
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
  
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setAuthReady: (ready) => set({ authReady: ready }),
  
  setCurrentSession: (session) => set({ currentSession: session }),
  
  addMessage: (message) => set((state) => {
    if (!state.currentSession) return state
    return {
      currentSession: {
        ...state.currentSession,
        messages: [...state.currentSession.messages, message],
      },
    }
  }),
  
  setMessages: (messages) => set((state) => {
    if (!state.currentSession) return state
    const newMessages = typeof messages === 'function' 
      ? messages(state.currentSession.messages)
      : messages
    return {
      currentSession: {
        ...state.currentSession,
        messages: newMessages,
      },
    }
  }),
  
  logout: async () => {
    await supabase.auth.signOut()
    set({ user: null, currentSession: null, isAuthenticated: false })
  },
}))

