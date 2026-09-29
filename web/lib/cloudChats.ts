'use client'

import { supabase, isSupabaseConfigured } from './supabaseClient'
import {
  decodeCloudContent,
  encodeCloudContent,
  extraFromApiMessage,
  isWorkspaceSessionTitle,
  messageSyncKey,
  type CloudMessageExtra,
} from './cloudMessage'
import {
  deleteWorkspaceChat,
  getWorkspaceChat,
  listWorkspaceChats,
  saveWorkspaceChat,
} from './cloudWorkspace'

export type CloudMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at?: string
  quotation?: any
  product_results?: any[]
}

export type CloudSession = {
  id: string
  title: string
  messages: CloudMessage[]
  created_at: string
  updated_at: string
  legacy_id?: number | null
}

const SESSION_TABLE = 'procurex_chat_sessions'
const MESSAGE_TABLE = 'procurex_chat_messages'

export function isCloudSessionId(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

function withDecodedExtras<T extends CloudMessage>(item: T): T {
  const decoded = decodeCloudContent(item?.content)
  return {
    ...item,
    content: decoded.content,
    quotation: item.quotation || decoded.quotation,
    product_results: item.product_results || decoded.product_results,
  }
}

export function mergeChatHistory<T extends { role?: string; content?: string; quotation?: any; product_results?: any[] }>(
  local: T[] | null | undefined,
  remote: T[] | null | undefined
): T[] {
  const clean = (list: T[] | null | undefined) =>
    (list || [])
      .map((item) => withDecodedExtras(item as any) as T)
      .filter((item) => {
        const text = String(item?.content || '').trim()
        return Boolean(text) && text !== '...'
      })
  const loc = clean(local)
  const rem = clean(remote)
  const locAssist = loc.filter((item) => item.role === 'assistant').length
  const remAssist = rem.filter((item) => item.role === 'assistant').length
  const overlay = (primary: T[], secondary: T[]) => {
    const extras = new Map(secondary.map((item) => [messageSyncKey(item), item]))
    const used = new Set<string>()
    const out = primary.map((item) => {
      const key = messageSyncKey(item)
      used.add(key)
      const other = extras.get(key)
      if (item.quotation || !other) return item
      return {
        ...item,
        quotation: other.quotation,
        product_results: item.product_results || other.product_results,
      }
    })
    for (const item of secondary) {
      const key = messageSyncKey(item)
      if (!used.has(key)) out.push(item)
    }
    return out
  }
  if (locAssist > remAssist || loc.length > rem.length) return overlay(loc, rem)
  return overlay(rem, loc)
}

function isMissingTable(error: any) {
  const code = error?.code || ''
  const message = String(error?.message || '')
  return code === 'PGRST205' || message.includes('schema cache') || message.includes('does not exist')
}

async function currentUserId() {
  try {
    const { data, error } = await withTimeout(supabase.auth.getSession(), 6000)
    if (error || !data.session?.user?.id) return null
    return data.session.user.id
  } catch {
    return null
  }
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

let tableProbe: boolean | null = null

async function chatTablesReady() {
  if (!isSupabaseConfigured) return false
  if (tableProbe != null) return tableProbe
  try {
    const { error } = await withTimeout(supabase.from(SESSION_TABLE).select('id').limit(1), 6000)
    if (!error) {
      tableProbe = true
      return true
    }
    if (isMissingTable(error)) {
      tableProbe = false
      return false
    }
    tableProbe = error.code !== 'PGRST116'
    return tableProbe
  } catch {
    tableProbe = false
    return false
  }
}

export async function cloudChatsReady() {
  if (!isSupabaseConfigured) return false
  if (await chatTablesReady()) return true
  return Boolean(await currentUserId())
}

function mapSessionRow(row: any, messages: CloudMessage[] = []): CloudSession {
  return {
    id: row.id,
    title: row.title || 'New chat',
    messages,
    created_at: row.created_at,
    updated_at: row.updated_at,
    legacy_id: row.legacy_id ?? null,
  }
}

const PAGE_SIZE = 1000

async function fetchAllRows<T>(
  query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const all: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await withTimeout(query(from, from + PAGE_SIZE - 1), 12000)
    if (error) throw error
    const rows = data || []
    all.push(...rows)
    if (rows.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  return all
}

export async function listCloudSessions(): Promise<CloudSession[]> {
  const userId = await currentUserId()
  if (!userId) return []
  if (!(await chatTablesReady())) {
    return (await listWorkspaceChats()).map((row) => mapSessionRow(row, row.messages || []))
  }
  const data = await fetchAllRows<any>((from, to) =>
    supabase
      .from(SESSION_TABLE)
      .select('id, title, created_at, updated_at, legacy_id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .range(from, to)
  )
  return data.filter((row) => !isWorkspaceSessionTitle(row.title)).map((row) => mapSessionRow(row))
}

export async function getCloudSession(sessionId: string): Promise<CloudSession | null> {
  const userId = await currentUserId()
  if (!userId) return null
  if (!(await chatTablesReady())) {
    const chat = await getWorkspaceChat(sessionId)
    return chat ? mapSessionRow(chat, (chat.messages || []).map((item: any) => withDecodedExtras(item))) : null
  }
  const { data: session, error } = await supabase
    .from(SESSION_TABLE)
    .select('id, title, created_at, updated_at, legacy_id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!session) return null
  const messages = await fetchAllRows<any>((from, to) =>
    supabase
      .from(MESSAGE_TABLE)
      .select('role, content, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
      .range(from, to)
  )
  return mapSessionRow(
    session,
    messages.map((item) => withDecodedExtras({
      role: item.role,
      content: item.content,
      created_at: item.created_at,
    }))
  )
}

export async function createCloudSession(title = 'New chat', legacyId?: number | null): Promise<CloudSession> {
  const userId = await currentUserId()
  if (!userId) throw new Error('Not signed in')
  if (!(await chatTablesReady())) {
    const created = await saveWorkspaceChat({
      title: title.trim() || 'New chat',
      legacy_id: legacyId ?? null,
      messages: [],
    })
    return mapSessionRow(created, [])
  }
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from(SESSION_TABLE)
    .insert({
      user_id: userId,
      title: title.trim() || 'New chat',
      legacy_id: legacyId ?? null,
      created_at: now,
      updated_at: now,
    })
    .select('id, title, created_at, updated_at, legacy_id')
    .single()
  if (error) throw error
  return mapSessionRow(data, [])
}

export async function deleteCloudSession(sessionId: string) {
  const userId = await currentUserId()
  if (!userId) throw new Error('Not signed in')
  if (!(await chatTablesReady())) {
    await deleteWorkspaceChat(sessionId)
    return
  }
  const existing = await getCloudSession(sessionId)
  if (existing && isWorkspaceSessionTitle(existing.title)) return
  const { error: messageError } = await supabase
    .from(MESSAGE_TABLE)
    .delete()
    .eq('session_id', sessionId)
  if (messageError && !isMissingTable(messageError)) throw messageError
  const { error } = await supabase
    .from(SESSION_TABLE)
    .delete()
    .eq('id', sessionId)
    .eq('user_id', userId)
  if (error && !isMissingTable(error)) throw error
}

export async function saveCloudMessage(
  sessionId: string,
  role: CloudMessage['role'],
  content: string,
  title?: string,
  extra?: CloudMessageExtra | null
) {
  const text = (content || '').trim()
  if (!text || text === '...') return
  const stored = encodeCloudContent(text, extra)
  if (!(await chatTablesReady())) {
    const existing = (await getWorkspaceChat(sessionId)) || {
      id: sessionId,
      title: title || 'New chat',
      messages: [] as CloudMessage[],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const messages = [...(existing.messages || [])]
    const last = messages[messages.length - 1]
    const lastText = decodeCloudContent(last?.content).content.trim()
    const nextMessage = withDecodedExtras({
      role,
      content: stored,
      quotation: extra?.quotation,
      product_results: extra?.product_results,
      created_at: new Date().toISOString(),
    })
    if (last?.role === role && lastText === text) {
      const lastHasMeta = Boolean(last.quotation) || String(last.content || '').includes('<!--PX:')
      if (extra?.quotation || !lastHasMeta) messages[messages.length - 1] = nextMessage
    } else {
      messages.push(nextMessage)
    }
    await saveWorkspaceChat({
      ...existing,
      title: title?.trim() || existing.title,
      messages,
      updated_at: new Date().toISOString(),
    })
    return
  }
  const { data: last } = await supabase
    .from(MESSAGE_TABLE)
    .select('id, role, content')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const lastText = decodeCloudContent(last?.content).content.trim()
  if (last?.role === role && lastText === text) {
    const lastHasMeta = String(last.content || '').includes('<!--PX:')
    const nextHasMeta = stored.includes('<!--PX:')
    if (last.content !== stored && (nextHasMeta || !lastHasMeta)) {
      const { error: replaceError } = await supabase
        .from(MESSAGE_TABLE)
        .update({ content: stored })
        .eq('id', last.id)
      if (replaceError) throw replaceError
    }
    if (title && title.trim()) {
      const { error: titleError } = await supabase
        .from(SESSION_TABLE)
        .update({ title: title.trim(), updated_at: new Date().toISOString() })
        .eq('id', sessionId)
      if (titleError) throw titleError
    } else if (last.content !== stored) {
      const { error: touchError } = await supabase
        .from(SESSION_TABLE)
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId)
      if (touchError) throw touchError
    }
    return
  }
  const { error } = await supabase.from(MESSAGE_TABLE).insert({
    session_id: sessionId,
    role,
    content: stored,
  })
  if (error) throw error
  const patch: Record<string, string> = { updated_at: new Date().toISOString() }
  if (title && title.trim()) patch.title = title.trim()
  const { error: updateError } = await supabase.from(SESSION_TABLE).update(patch).eq('id', sessionId)
  if (updateError) throw updateError
}

export async function updateCloudSession(
  sessionId: string,
  patch: { title?: string; legacy_id?: number | null }
) {
  if (!(await chatTablesReady())) {
    const existing = await getWorkspaceChat(sessionId)
    if (!existing) return
    await saveWorkspaceChat({
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    })
    return
  }
  const { error } = await supabase
    .from(SESSION_TABLE)
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId)
  if (error) throw error
}

export async function importApiSessionToCloud(session: {
  id: number
  title?: string
  created_at?: string
  updated_at?: string
  messages?: CloudMessage[]
}): Promise<CloudSession> {
  const userId = await currentUserId()
  if (!userId) throw new Error('Not signed in')
  if (!(await chatTablesReady())) {
    const chats = await listWorkspaceChats()
    const existing = chats.find((item) => Number(item.legacy_id) === Number(session.id))
    const messages = (session.messages || []).map((item) => withDecodedExtras(item))
    const saved = await saveWorkspaceChat({
      id: existing?.id,
      title: session.title || existing?.title || 'New chat',
      messages: messages.length ? messages : existing?.messages || [],
      legacy_id: session.id,
      created_at: session.created_at || existing?.created_at,
      updated_at: session.updated_at || new Date().toISOString(),
    })
    return mapSessionRow(saved, saved.messages || [])
  }
  const { data: existing } = await supabase
    .from(SESSION_TABLE)
    .select('id, title, created_at, updated_at, legacy_id')
    .eq('user_id', userId)
    .eq('legacy_id', session.id)
    .maybeSingle()
  if (existing) {
    return appendMissingMessages(existing, session.messages || [])
  }
  const created = await createCloudSession(session.title || 'New chat', session.id)
  return appendMissingMessages(created, session.messages || [], {
    title: session.title || created.title,
    created_at: session.created_at || created.created_at,
    updated_at: session.updated_at || created.updated_at,
  })
}

function packedCloudMessage(message: CloudMessage) {
  const extra = extraFromApiMessage(message)
  return encodeCloudContent(decodeCloudContent(message.content).content, {
    quotation: message.quotation || extra.quotation,
    product_results: message.product_results || extra.product_results,
  })
}

async function appendMissingMessages(
  session: { id: string; title?: string; created_at?: string; updated_at?: string; legacy_id?: number | null },
  incoming: CloudMessage[],
  meta?: { title?: string; created_at?: string; updated_at?: string }
): Promise<CloudSession> {
  if (!(await chatTablesReady())) {
    const existing = await getWorkspaceChat(session.id)
    const saved = await saveWorkspaceChat({
      id: session.id,
      title: meta?.title || session.title || existing?.title || 'New chat',
      messages: mergeChatHistory(existing?.messages, incoming.map((item) => withDecodedExtras(item))),
      legacy_id: session.legacy_id ?? existing?.legacy_id ?? null,
      created_at: meta?.created_at || session.created_at || existing?.created_at,
      updated_at: meta?.updated_at || new Date().toISOString(),
    })
    return mapSessionRow(saved, saved.messages || [])
  }
  const full = (await getCloudSession(session.id)) || mapSessionRow(session)
  const have = full.messages?.length || 0
  const extra = incoming.slice(have)
  if (extra.length) {
    const { error } = await supabase.from(MESSAGE_TABLE).insert(
      extra.map((message) => ({
        session_id: session.id,
        role: message.role,
        content: packedCloudMessage(message),
      }))
    )
    if (error) throw error
  }
  if (incoming.some((item) => extraFromApiMessage(item).quotation || item.quotation)) {
    const { data: rows } = await supabase
      .from(MESSAGE_TABLE)
      .select('id, content')
      .eq('session_id', session.id)
      .order('created_at', { ascending: true })
    for (let index = 0; index < Math.min(rows?.length || 0, incoming.length); index += 1) {
      const packed = packedCloudMessage(incoming[index])
      if (rows?.[index] && rows[index].content !== packed) {
        await supabase.from(MESSAGE_TABLE).update({ content: packed }).eq('id', rows[index].id)
      }
    }
  }
  const title = meta?.title || full.title
  const updated_at = meta?.updated_at || (extra.length ? new Date().toISOString() : full.updated_at)
  if (extra.length || (title && title !== full.title)) {
    await supabase
      .from(SESSION_TABLE)
      .update({ updated_at, title })
      .eq('id', session.id)
  }
  return {
    ...full,
    title,
    messages: mergeChatHistory(full.messages, incoming.map((item) => withDecodedExtras(item))),
    created_at: meta?.created_at || full.created_at,
    updated_at,
    legacy_id: full.legacy_id ?? session.legacy_id ?? null,
  }
}

export async function importLocalChatToCloud(session: {
  id?: number | string
  title?: string
  created_at?: string
  updated_at?: string
  messages?: CloudMessage[]
}): Promise<CloudSession> {
  const numericId = typeof session.id === 'number' ? session.id : Number(session.id)
  const legacyId =
    Number.isFinite(numericId) && numericId > 0 && !isCloudSessionId(session.id) ? numericId : null
  if (legacyId != null) {
    return importApiSessionToCloud({
      id: legacyId,
      title: session.title,
      created_at: session.created_at,
      updated_at: session.updated_at,
      messages: session.messages,
    })
  }
  const created = await createCloudSession(session.title || 'New chat')
  return appendMissingMessages(created, session.messages || [], {
    title: session.title || created.title,
    created_at: session.created_at || created.created_at,
    updated_at: session.updated_at || created.updated_at,
  })
}

export function subscribeCloudChats(userId: string, onChange: () => void) {
  if (tableProbe === false) return () => {}
  const channel = supabase
    .channel(`procurex-chats-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: SESSION_TABLE, filter: `user_id=eq.${userId}` },
      () => onChange()
    )
    .subscribe()
  return () => {
    void supabase.removeChannel(channel)
  }
}
