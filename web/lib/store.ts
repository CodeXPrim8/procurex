import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { supabase } from './supabaseClient'
import { rememberAccessToken } from './sessionToken'
import { debugAuthLog, debugAuthStorageSnapshot } from './debugAuthLog'

export type AccountView = 'buyer' | 'vendor'

export interface StoreUser {
  id: string
  email: string
  full_name?: string
  role?: string
  tts_voice?: string
}

interface ChatMessage {
  id?: number
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata?: string
  quotation?: any
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
  accountView: AccountView
  hasVendorAccount: boolean
  currentSession: ChatSession | null
  isAuthenticated: boolean
  authReady: boolean
  setAuthReady: (ready: boolean) => void
  setUser: (user: StoreUser | null) => void
  setAccountView: (view: AccountView) => void
  setHasVendorAccount: (value: boolean) => void
  setCurrentSession: (session: ChatSession | null) => void
  addMessage: (message: ChatMessage) => void
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void
  logout: () => Promise<void>
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
  user: null,
  accountView: 'buyer',
  hasVendorAccount: false,
  currentSession: null,
  isAuthenticated: false,
  authReady: false,
  
  setUser: (user) => set((state) => {
    const prev = state.user
    if (prev && !user) {
      // #region agent log
      debugAuthLog('store.ts:setUser', 'clearing authenticated user', debugAuthStorageSnapshot(), 'A')
      // #endregion
    }
    if (prev === user) return state
    const sameAccount =
      prev &&
      user &&
      prev.id === user.id &&
      prev.email === user.email &&
      prev.role === user.role &&
      prev.full_name === user.full_name &&
      prev.tts_voice === user.tts_voice
    if (sameAccount) return state
    if (!prev && !user) return state
    const switchedAccount = !user || prev?.id !== user.id
    const vendorFromRole = user?.role === 'vendor'
    return {
      user,
      isAuthenticated: !!user,
      accountView: switchedAccount ? 'buyer' : state.accountView,
      hasVendorAccount: switchedAccount
        ? vendorFromRole
        : Boolean(vendorFromRole || state.hasVendorAccount),
    }
  }),
  setAccountView: (accountView) => set((state) => {
    if (!state.hasVendorAccount) return { accountView: 'buyer' }
    return { accountView }
  }),
  setHasVendorAccount: (hasVendorAccount) => set((state) => ({
    hasVendorAccount,
    accountView: hasVendorAccount ? state.accountView : 'buyer',
  })),
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
    // #region agent log
    debugAuthLog('store.ts:logout', 'explicit logout called', debugAuthStorageSnapshot(), 'E')
    // #endregion
    rememberAccessToken(null)
    await supabase.auth.signOut()
    set({ user: null, currentSession: null, isAuthenticated: false, accountView: 'buyer', hasVendorAccount: false })
  },
}),
    {
      name: 'procurex-user',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: Boolean(state.user),
        accountView: state.hasVendorAccount ? state.accountView : 'buyer',
      }),
      onRehydrateStorage: () => (state, error) => {
        if (state?.user?.role === 'vendor') {
          state.hasVendorAccount = true
        }
        // #region agent log
        debugAuthLog(
          'store.ts:rehydrate',
          'persist rehydrate',
          {
            hasUser: Boolean(state?.user),
            isAuthenticated: Boolean(state?.isAuthenticated),
            error: error ? String(error) : null,
          },
          'E'
        )
        // #endregion
      },
    }
  )
)

