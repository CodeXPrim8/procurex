'use client'

import { supabase, isSupabaseConfigured } from './supabaseClient'
import { WORKSPACE_SESSION_TITLE } from './cloudMessage'

const SESSION_TABLE = 'procurex_chat_sessions'
const MESSAGE_TABLE = 'procurex_chat_messages'
const LAST_CHAT_KEY = 'procurex_last_chat_id'
const META_KEY = 'procurex_sync'

export type AccountWorkspace = {
  last_chat_id?: string | number | null
  active_business_id?: number | null
  businesses?: any[]
  quotations?: any[]
  chats?: any[]
  updated_at?: string
}

type Cache = { userId: string; at: number; data: AccountWorkspace }

let cache: Cache | null = null
let writeQueue: Promise<void> = Promise.resolve()

function clone<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return value
  }
}

function asList(value: any): any[] {
  return Array.isArray(value) ? value : []
}

function mergeById(current: any[], incoming: any[], removeIds?: Iterable<number | string>) {
  const dropped = new Set(Array.from(removeIds || []).map((id) => String(id)))
  const map = new Map<string, any>()
  for (const item of current) {
    if (item?.id == null || dropped.has(String(item.id))) continue
    map.set(String(item.id), item)
  }
  for (const item of incoming) {
    if (item?.id == null || dropped.has(String(item.id))) continue
    map.set(String(item.id), { ...(map.get(String(item.id)) || {}), ...item })
  }
  return Array.from(map.values())
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('timeout')), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

async function currentUser() {
  if (!isSupabaseConfigured) return null
  try {
    const { data, error } = await withTimeout(supabase.auth.getSession(), 6000)
    if (error || !data.session?.user?.id) return null
    return data.session.user
  } catch {
    return null
  }
}

function emptyWorkspace(): AccountWorkspace {
  return { businesses: [], quotations: [], chats: [], last_chat_id: null, active_business_id: null }
}

function richerList(left: any[], right: any[]) {
  const leftCount = left.reduce((sum, item) => sum + (item?.messages?.length || 1), 0)
  const rightCount = right.reduce((sum, item) => sum + (item?.messages?.length || 1), 0)
  if (left.length > right.length || leftCount >= rightCount) return left
  return right
}

function parseWorkspace(raw: any): AccountWorkspace {
  if (!raw || typeof raw !== 'object') return emptyWorkspace()
  return {
    last_chat_id: raw.last_chat_id ?? null,
    active_business_id:
      raw.active_business_id == null ? null : Number(raw.active_business_id) || null,
    businesses: asList(raw.businesses),
    quotations: asList(raw.quotations),
    chats: asList(raw.chats),
    updated_at: raw.updated_at,
  }
}

export function readLastChatId(): string | number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(LAST_CHAT_KEY)
    if (!raw) return null
    if (/^[0-9a-f-]{36}$/i.test(raw)) return raw
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : raw
  } catch {
    return null
  }
}

export function rememberLastChatId(id: number | string | undefined, syncCloud = true) {
  if (id == null || id === '' || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LAST_CHAT_KEY, String(id))
  } catch {
    // ignore storage errors
  }
  if (syncCloud) void patchWorkspace({ last_chat_id: id })
}

async function readFromSession(userId: string): Promise<AccountWorkspace | null> {
  const { data: session, error } = await supabase
    .from(SESSION_TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('title', WORKSPACE_SESSION_TITLE)
    .maybeSingle()
  if (error || !session?.id) return null
  const { data: messages, error: messageError } = await supabase
    .from(MESSAGE_TABLE)
    .select('content')
    .eq('session_id', session.id)
    .order('created_at', { ascending: false })
    .limit(1)
  if (messageError) return null
  const raw = messages?.[0]?.content
  if (!raw) return emptyWorkspace()
  try {
    return parseWorkspace(JSON.parse(raw))
  } catch {
    return emptyWorkspace()
  }
}

function readFromMetadata(user: { user_metadata?: Record<string, any> }): AccountWorkspace {
  return parseWorkspace(user.user_metadata?.[META_KEY])
}

export async function loadWorkspace(force = false): Promise<AccountWorkspace> {
  const user = await currentUser()
  if (!user) return emptyWorkspace()
  if (!force && cache && cache.userId === user.id && Date.now() - cache.at < 4000) {
    return clone(cache.data)
  }
  let data = emptyWorkspace()
  try {
    const fromSession = await readFromSession(user.id)
    const fromMeta = readFromMetadata(user)
    data = {
      last_chat_id: fromSession?.last_chat_id ?? fromMeta.last_chat_id ?? null,
      active_business_id: fromSession?.active_business_id ?? fromMeta.active_business_id ?? null,
      businesses:
        (fromSession?.businesses?.length ? fromSession.businesses : fromMeta.businesses) || [],
      quotations:
        (fromSession?.quotations?.length ? fromSession.quotations : fromMeta.quotations) || [],
      chats: richerList(asList(fromSession?.chats), asList(fromMeta.chats)),
      updated_at: fromSession?.updated_at || fromMeta.updated_at,
    }
  } catch (error) {
    console.error('Failed to load synced account data:', error)
  }
  cache = { userId: user.id, at: Date.now(), data: clone(data) }
  return clone(data)
}

async function writeSession(userId: string, data: AccountWorkspace) {
  const payload = JSON.stringify(data)
  const { data: existing } = await supabase
    .from(SESSION_TABLE)
    .select('id')
    .eq('user_id', userId)
    .eq('title', WORKSPACE_SESSION_TITLE)
    .maybeSingle()
  let sessionId = existing?.id as string | undefined
  const now = new Date().toISOString()
  if (!sessionId) {
    const { data: created, error } = await supabase
      .from(SESSION_TABLE)
      .insert({
        user_id: userId,
        title: WORKSPACE_SESSION_TITLE,
        created_at: now,
        updated_at: now,
      })
      .select('id')
      .single()
    if (error) throw error
    sessionId = created.id
  } else {
    const { error } = await supabase
      .from(SESSION_TABLE)
      .update({ updated_at: now })
      .eq('id', sessionId)
    if (error) throw error
  }
  await supabase.from(MESSAGE_TABLE).delete().eq('session_id', sessionId)
  const { error: insertError } = await supabase.from(MESSAGE_TABLE).insert({
    session_id: sessionId,
    role: 'system',
    content: payload,
  })
  if (insertError) throw insertError
}

function compactChats(chats: any[]) {
  return (chats || [])
    .slice()
    .sort((a, b) => Date.parse(b?.updated_at || 0) - Date.parse(a?.updated_at || 0))
    .slice(0, 24)
    .map((chat) => ({
      id: chat.id,
      title: chat.title || 'New chat',
      legacy_id: chat.legacy_id ?? null,
      created_at: chat.created_at,
      updated_at: chat.updated_at,
      messages: (chat.messages || []).slice(-80).map((message: any) => ({
        role: message.role,
        content: message.content,
        quotation: message.quotation || undefined,
        created_at: message.created_at,
      })),
    }))
}

async function writeMetadata(data: AccountWorkspace) {
  const compact: AccountWorkspace = {
    last_chat_id: data.last_chat_id ?? null,
    active_business_id: data.active_business_id ?? null,
    businesses: data.businesses || [],
    quotations: data.quotations || [],
    chats: compactChats(data.chats || []),
    updated_at: data.updated_at,
  }
  const encoded = JSON.stringify(compact)
  if (encoded.length > 180_000) {
    compact.businesses = (compact.businesses || []).map((item) => ({
      ...item,
      logo_url: String(item?.logo_url || '').startsWith('data:') ? undefined : item?.logo_url,
      letterhead_url: String(item?.letterhead_url || '').startsWith('data:')
        ? undefined
        : item?.letterhead_url,
    }))
    compact.chats = compactChats(compact.chats || []).slice(0, 12)
  }
  const { error } = await supabase.auth.updateUser({
    data: { [META_KEY]: compact },
  })
  if (error) throw error
}

export async function patchWorkspace(patch: Partial<AccountWorkspace> & {
  removeBusinessIds?: Array<number | string>
  removeQuotationIds?: Array<number | string>
  removeChatIds?: Array<number | string>
}) {
  writeQueue = writeQueue.then(async () => {
    const user = await currentUser()
    if (!user) return
    const current = await loadWorkspace(true)
    const next: AccountWorkspace = {
      last_chat_id: patch.last_chat_id !== undefined ? patch.last_chat_id : current.last_chat_id,
      active_business_id:
        patch.active_business_id !== undefined ? patch.active_business_id : current.active_business_id,
      businesses: mergeById(
        current.businesses || [],
        patch.businesses || [],
        patch.removeBusinessIds
      ),
      quotations: mergeById(
        current.quotations || [],
        patch.quotations || [],
        patch.removeQuotationIds
      ),
      chats: compactChats(
        mergeById(current.chats || [], patch.chats || [], patch.removeChatIds)
      ),
      updated_at: new Date().toISOString(),
    }
    cache = { userId: user.id, at: Date.now(), data: clone(next) }
    const fingerprint = (row: AccountWorkspace) =>
      JSON.stringify({
        last_chat_id: row.last_chat_id ?? null,
        active_business_id: row.active_business_id ?? null,
        businesses: row.businesses || [],
        quotations: row.quotations || [],
        chats: row.chats || [],
      })
    if (fingerprint(next) === fingerprint(current)) return
    try {
      await writeSession(user.id, next)
    } catch {
      // Chat tables may not exist yet; auth metadata still syncs across devices.
    }
    try {
      await writeMetadata(next)
    } catch (error) {
      console.error('Failed to sync account workspace:', error)
    }
  })
  return writeQueue
}

export async function replaceBusinesses(businesses: any[]) {
  const user = await currentUser()
  if (!user) return
  const current = await loadWorkspace(true)
  await patchWorkspace({
    businesses,
    removeBusinessIds: (current.businesses || [])
      .map((item) => item?.id)
      .filter((id) => id != null && !(businesses || []).some((row) => String(row?.id) === String(id))),
  })
}

export async function upsertBusinesses(businesses: any[]) {
  if (!businesses?.length) return
  await patchWorkspace({ businesses: clone(businesses) })
}

export async function removeBusiness(id: number | string) {
  await patchWorkspace({ removeBusinessIds: [id] })
}

export async function upsertQuotations(quotations: any[]) {
  if (!quotations?.length) return
  await patchWorkspace({ quotations: clone(quotations) })
}

export async function replaceQuotations(quotations: any[]) {
  const current = await loadWorkspace(true)
  await patchWorkspace({
    quotations,
    removeQuotationIds: (current.quotations || [])
      .map((item) => item?.id)
      .filter((id) => id != null && !(quotations || []).some((row) => String(row?.id) === String(id))),
  })
}

export async function hydrateAccountWorkspace() {
  const data = await loadWorkspace(true)
  if (typeof window === 'undefined') return data
  if (data.last_chat_id && !readLastChatId()) {
    rememberLastChatId(data.last_chat_id, false)
  }
  if (data.active_business_id) {
    const { setActiveBusinessId } = await import('./businessContext')
    if (!window.localStorage.getItem('procurex_active_business')) {
      setActiveBusinessId(data.active_business_id, { skipCloud: true })
    }
  }
  return data
}

export function quotationsForBusiness(quotations: any[], businessId?: number | null) {
  if (!businessId) return quotations
  return quotations.filter((item) => !item?.business_id || Number(item.business_id) === Number(businessId))
}

function newChatId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8
    return value.toString(16)
  })
}

export async function listWorkspaceChats() {
  const data = await loadWorkspace()
  return compactChats(data.chats || []).sort(
    (a, b) => Date.parse(b.updated_at || 0) - Date.parse(a.updated_at || 0)
  )
}

export async function getWorkspaceChat(id: string) {
  const chats = await listWorkspaceChats()
  return chats.find((item) => String(item.id) === String(id)) || null
}

export async function saveWorkspaceChat(session: {
  id?: string
  title?: string
  messages?: any[]
  legacy_id?: number | null
  created_at?: string
  updated_at?: string
}) {
  const now = new Date().toISOString()
  const next = {
    id: session.id || newChatId(),
    title: session.title || 'New chat',
    messages: session.messages || [],
    legacy_id: session.legacy_id ?? null,
    created_at: session.created_at || now,
    updated_at: session.updated_at || now,
  }
  await patchWorkspace({ chats: [next], last_chat_id: next.id })
  return next
}

export async function deleteWorkspaceChat(id: string) {
  await patchWorkspace({ removeChatIds: [id] })
}
