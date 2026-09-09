'use client'

import { supabase, isSupabaseConfigured } from './supabaseClient'

export type CloudMessage = {
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at?: string
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

function isMissingTable(error: any) {
  const code = error?.code || ''
  const message = String(error?.message || '')
  return code === 'PGRST205' || message.includes('schema cache') || message.includes('does not exist')
}

async function currentUserId() {
  try {
    const { data, error } = await withTimeout(supabase.auth.getUser(), 6000)
    if (error || !data.user?.id) return null
    return data.user.id
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

export async function cloudChatsReady() {
  if (!isSupabaseConfigured) return false
  try {
    const { error } = await withTimeout(supabase.from(SESSION_TABLE).select('id').limit(1), 6000)
    if (!error) return true
    if (isMissingTable(error)) return false
    return error.code !== 'PGRST116'
  } catch {
    return false
  }
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

export async function listCloudSessions(): Promise<CloudSession[]> {
  const userId = await currentUserId()
  if (!userId) return []
  const { data, error } = await withTimeout(
    supabase
      .from(SESSION_TABLE)
      .select('id, title, created_at, updated_at, legacy_id')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }),
    8000
  )
  if (error) throw error
  return (data || []).map((row) => mapSessionRow(row))
}

export async function getCloudSession(sessionId: string): Promise<CloudSession | null> {
  const userId = await currentUserId()
  if (!userId) return null
  const { data: session, error } = await supabase
    .from(SESSION_TABLE)
    .select('id, title, created_at, updated_at, legacy_id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!session) return null
  const { data: messages, error: messageError } = await supabase
    .from(MESSAGE_TABLE)
    .select('role, content, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
  if (messageError) throw messageError
  return mapSessionRow(
    session,
    (messages || []).map((item) => ({
      role: item.role,
      content: item.content,
      created_at: item.created_at,
    }))
  )
}

export async function createCloudSession(title = 'New chat', legacyId?: number | null): Promise<CloudSession> {
  const userId = await currentUserId()
  if (!userId) throw new Error('Not signed in')
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

export async function saveCloudMessage(
  sessionId: string,
  role: CloudMessage['role'],
  content: string,
  title?: string
) {
  const { error } = await supabase.from(MESSAGE_TABLE).insert({
    session_id: sessionId,
    role,
    content,
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
  const { data: existing } = await supabase
    .from(SESSION_TABLE)
    .select('id, title, created_at, updated_at, legacy_id')
    .eq('user_id', userId)
    .eq('legacy_id', session.id)
    .maybeSingle()
  if (existing) {
    const full = await getCloudSession(existing.id)
    return full || mapSessionRow(existing)
  }
  const created = await createCloudSession(session.title || 'New chat', session.id)
  const messages = session.messages || []
  if (messages.length) {
    const { error } = await supabase.from(MESSAGE_TABLE).insert(
      messages.map((message) => ({
        session_id: created.id,
        role: message.role,
        content: message.content,
      }))
    )
    if (error) throw error
    await supabase
      .from(SESSION_TABLE)
      .update({
        updated_at: session.updated_at || new Date().toISOString(),
        title: session.title || created.title,
      })
      .eq('id', created.id)
  }
  return {
    ...created,
    title: session.title || created.title,
    messages,
    created_at: session.created_at || created.created_at,
    updated_at: session.updated_at || created.updated_at,
    legacy_id: session.id,
  }
}

export function subscribeCloudChats(userId: string, onChange: () => void) {
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
