import { supabase } from './supabaseClient'
import { useStore, type StoreUser } from './store'

export type TtsVoiceId =
  | 'nova'
  | 'shimmer'
  | 'kore'
  | 'zephyr'
  | 'alloy'
  | 'echo'
  | 'onyx'
  | 'puck'

export type ProcurexVoice = {
  id: TtsVoiceId
  name: string
  description: string
  gender: 'Female' | 'Male' | 'Neutral'
  openai: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'
  gemini: string
  prefer: 'openai' | 'gemini'
}

export const DEFAULT_TTS_VOICE: TtsVoiceId = 'nova'

export const PROCUREX_VOICES: ProcurexVoice[] = [
  {
    id: 'nova',
    name: 'Nova',
    description: 'Warm, professional',
    gender: 'Female',
    openai: 'nova',
    gemini: 'Kore',
    prefer: 'openai',
  },
  {
    id: 'shimmer',
    name: 'Shimmer',
    description: 'Bright and clear',
    gender: 'Female',
    openai: 'shimmer',
    gemini: 'Aoede',
    prefer: 'openai',
  },
  {
    id: 'kore',
    name: 'Kore',
    description: 'Soft and natural',
    gender: 'Female',
    openai: 'nova',
    gemini: 'Kore',
    prefer: 'gemini',
  },
  {
    id: 'zephyr',
    name: 'Zephyr',
    description: 'Gentle and calm',
    gender: 'Female',
    openai: 'nova',
    gemini: 'Zephyr',
    prefer: 'gemini',
  },
  {
    id: 'alloy',
    name: 'Alloy',
    description: 'Neutral and even',
    gender: 'Neutral',
    openai: 'alloy',
    gemini: 'Puck',
    prefer: 'openai',
  },
  {
    id: 'echo',
    name: 'Echo',
    description: 'Calm and composed',
    gender: 'Male',
    openai: 'echo',
    gemini: 'Charon',
    prefer: 'openai',
  },
  {
    id: 'onyx',
    name: 'Onyx',
    description: 'Deep and steady',
    gender: 'Male',
    openai: 'onyx',
    gemini: 'Orus',
    prefer: 'openai',
  },
  {
    id: 'puck',
    name: 'Puck',
    description: 'Friendly and upbeat',
    gender: 'Male',
    openai: 'echo',
    gemini: 'Puck',
    prefer: 'gemini',
  },
]

const VOICE_IDS = new Set(PROCUREX_VOICES.map((voice) => voice.id))

export function normalizeTtsVoiceId(value: unknown): TtsVoiceId {
  const id = String(value || '').trim().toLowerCase()
  return VOICE_IDS.has(id as TtsVoiceId) ? (id as TtsVoiceId) : DEFAULT_TTS_VOICE
}

export function getTtsVoice(id?: string | null): ProcurexVoice {
  const normalized = normalizeTtsVoiceId(id)
  return PROCUREX_VOICES.find((voice) => voice.id === normalized) || PROCUREX_VOICES[0]
}

function storageKey(userId?: string | null) {
  return `procurex-tts-voice:${userId || 'guest'}`
}

export function readStoredTtsVoice(userId?: string | null): TtsVoiceId {
  if (typeof window === 'undefined') return DEFAULT_TTS_VOICE
  try {
    return normalizeTtsVoiceId(window.localStorage.getItem(storageKey(userId)))
  } catch {
    return DEFAULT_TTS_VOICE
  }
}

export function writeStoredTtsVoice(id: TtsVoiceId, userId?: string | null) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(userId), id)
  } catch {
    // ignore quota / private mode
  }
}

export function getActiveTtsVoiceId(): TtsVoiceId {
  const user = useStore.getState().user
  if (user?.tts_voice) return normalizeTtsVoiceId(user.tts_voice)
  return readStoredTtsVoice(user?.id)
}

export function hydrateTtsVoiceFromAccount(user: StoreUser | null) {
  if (!user?.id) return
  if (user.tts_voice) {
    writeStoredTtsVoice(normalizeTtsVoiceId(user.tts_voice), user.id)
    return
  }
  const forUser = readStoredTtsVoice(user.id)
  const guest = readStoredTtsVoice(null)
  writeStoredTtsVoice(forUser !== DEFAULT_TTS_VOICE ? forUser : guest, user.id)
}

export async function saveTtsVoice(id: string): Promise<TtsVoiceId> {
  const voice = normalizeTtsVoiceId(id)
  const user = useStore.getState().user
  writeStoredTtsVoice(voice, user?.id)
  if (user?.id) {
    useStore.getState().setUser({ ...user, tts_voice: voice })
    const { error } = await supabase.auth.updateUser({ data: { tts_voice: voice } })
    if (error) throw error
  }
  return voice
}
