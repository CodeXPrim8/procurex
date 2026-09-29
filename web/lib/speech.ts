export function getSpeechRecognitionCtor(): (new () => any) | null {
  if (typeof window === 'undefined') return null
  const w = window as any
  return w.SpeechRecognition || w.webkitSpeechRecognition || null
}

export function speechSupported() {
  return Boolean(getSpeechRecognitionCtor() && typeof window !== 'undefined' && 'speechSynthesis' in window)
}

export function textForSpeech(raw: string) {
  return (raw || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
    .replace(/[#*_`>]/g, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2500)
}

import { playSpeechBuffer, playSpeechUrl, resumeSpeechAudio, stopPlaybackAudio, stopVoiceCues, unlockSpeechAudio } from './speechPlayback'
import { getActiveTtsVoiceId, getTtsVoice, normalizeTtsVoiceId } from './ttsVoices'

let speakToken = 0
type SpokenClip = { data: ArrayBuffer; mime: string }
type QueueItem = { text: string; clip: Promise<SpokenClip | null> | null }
let streamQueue: QueueItem[] = []
let streamPlaying = false
let streamEnded = false
let streamOnEnd: (() => void) | undefined
let streamToken = 0
let analysableSpeech = false
let ttsAudioFailed = false

export function setAnalysableSpeech(enabled: boolean) {
  analysableSpeech = enabled
  if (enabled) unlockSpeechAudio()
  else ttsAudioFailed = false
}

export function stopSpeaking() {
  speakToken += 1
  streamQueue = []
  streamPlaying = false
  streamEnded = true
  streamOnEnd = undefined
  stopVoiceCues()
  stopPlaybackAudio()
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
}

/** Call from a user tap so iOS/Chrome allow TTS after the AI reply arrives. */
export function unlockSpeech(onReady?: () => void) {
  try {
    unlockSpeechAudio()
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.getVoices()
    }
  } catch {
    // ignore
  }
  onReady?.()
}

function pickVoice(voiceId?: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return undefined
  const chosen = getTtsVoice(voiceId || getActiveTtsVoiceId())
  const named = (pattern: RegExp) => voices.find((voice) => pattern.test(voice.name))
  if (chosen.gender === 'Female') {
    return (
      named(/zira|samantha|aria|jenny|sara|michelle|sonia|female/i) ||
      named(/zira/i) ||
      voices.find((voice) => /female/i.test(voice.name))
    )
  }
  if (chosen.gender === 'Male') {
    return (
      named(/david|mark|guy|christopher|andrew|george|male/i) ||
      named(/david|mark/i) ||
      voices.find((voice) => /male/i.test(voice.name))
    )
  }
  return named(/mark|david|guy/i) || voices[0]
}

function synthStyle(voiceId?: string) {
  const chosen = getTtsVoice(voiceId || getActiveTtsVoiceId())
  switch (chosen.id) {
    case 'nova':
      return { rate: 1.04, pitch: 1.08 }
    case 'shimmer':
      return { rate: 1.12, pitch: 1.2 }
    case 'kore':
      return { rate: 0.98, pitch: 1.05 }
    case 'zephyr':
      return { rate: 0.96, pitch: 1.1 }
    case 'alloy':
      return { rate: 1.02, pitch: 1 }
    case 'echo':
      return { rate: 1, pitch: 0.88 }
    case 'onyx':
      return { rate: 0.94, pitch: 0.78 }
    case 'puck':
      return { rate: 1.1, pitch: 0.92 }
    default:
      return { rate: 1.05, pitch: 1 }
  }
}

function chunkForSpeech(text: string, maxLen = 180): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text]
  const chunks: string[] = []
  let buf = ''
  for (const sentence of sentences) {
    const piece = sentence.trim()
    if (!piece) continue
    if (buf && `${buf} ${piece}`.length > maxLen) {
      chunks.push(buf)
      buf = piece
    } else {
      buf = buf ? `${buf} ${piece}` : piece
    }
  }
  if (buf) chunks.push(buf)
  return chunks
}

function speakSynth(text: string, onEnd: () => void, voiceId?: string) {
  const utterance = new SpeechSynthesisUtterance(text)
  const preferred = pickVoice(voiceId)
  const style = synthStyle(voiceId)
  utterance.rate = style.rate
  utterance.pitch = style.pitch
  utterance.lang = preferred?.lang || navigator.language || 'en-US'
  if (preferred) utterance.voice = preferred
  utterance.onend = onEnd
  utterance.onerror = onEnd
  window.speechSynthesis.speak(utterance)
  try {
    window.speechSynthesis.resume()
  } catch {
    // ignore
  }
}

export async function previewTtsVoice(voiceId: string, text: string) {
  const spoken = (text || '').trim()
  if (!spoken) return
  unlockSpeechAudio()
  await resumeSpeechAudio()
  stopPlaybackAudio()
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel()
  }

  const id = normalizeTtsVoiceId(voiceId)
  const localPlayed = await playSpeechUrl(`/tts/${id}.mp3?v=2`, true)
  if (localPlayed) return

  try {
    const { chatAPI } = await import('./api')
    const clip = await chatAPI.speak(spoken, id)
    const played = await playSpeechBuffer(clip.data, clip.mime, undefined, true)
    if (played) return
  } catch {
    // Fall through to a last-resort device voice.
  }

  if (typeof window === 'undefined' || !window.speechSynthesis) {
    throw new Error('Speech preview is not available in this browser')
  }
  await new Promise<void>((resolve, reject) => {
    try {
      speakSynth(spoken, resolve, id)
    } catch (error) {
      reject(error)
    }
  })
}

async function fetchSpeechClip(text: string): Promise<SpokenClip | null> {
  if (!analysableSpeech || ttsAudioFailed) return null
  try {
    const { chatAPI } = await import('./api')
    return await chatAPI.speak(text, getActiveTtsVoiceId())
  } catch (error: any) {
    if (error?.response?.status === 501) ttsAudioFailed = true
    return null
  }
}

function enqueueSpoken(text: string) {
  const item: QueueItem = {
    text,
    clip: analysableSpeech && !ttsAudioFailed ? fetchSpeechClip(text) : null,
  }
  streamQueue.push(item)
}

async function speakViaPlayback(text: string, onEnd: () => void) {
  if (!analysableSpeech || ttsAudioFailed) return false
  const token = speakToken
  const clip = await fetchSpeechClip(text)
  if (token !== speakToken) return true
  if (!clip) return false
  return await playSpeechBuffer(clip.data, clip.mime, onEnd, true)
}

function speakUtterance(text: string, onEnd: () => void) {
  if (!analysableSpeech || ttsAudioFailed) {
    speakSynth(text, onEnd)
    return
  }
  void speakViaPlayback(text, onEnd).then((played) => {
    if (!played) speakSynth(text, onEnd)
  })
}

function playStreamNext() {
  if (streamToken !== speakToken) return
  const next = streamQueue.shift()
  // #region agent log
  fetch('http://127.0.0.1:7822/ingest/99b396db-6f63-4207-97c0-0286dee5a836',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53a75c'},body:JSON.stringify({sessionId:'53a75c',location:'speech.ts:playStreamNext',message:next?'speak chunk':'queue empty',data:{queueLeft:streamQueue.length,streamEnded,synthSpeaking:Boolean(window.speechSynthesis?.speaking),preview:(next?.text||'').slice(0,80)},timestamp:Date.now(),hypothesisId:'D'})}).catch(()=>{})
  // #endregion
  if (!next) {
    streamPlaying = false
    if (streamEnded) {
      const done = streamOnEnd
      streamOnEnd = undefined
      done?.()
    }
    return
  }
  streamPlaying = true
  const following = streamQueue[0]
  if (following && !following.clip && analysableSpeech && !ttsAudioFailed) {
    following.clip = fetchSpeechClip(following.text)
  }
  const token = speakToken
  const playNext = () => {
    if (streamToken !== speakToken) return
    playStreamNext()
  }
  void (async () => {
    const clip = next.clip ? await next.clip : null
    if (token !== speakToken) return
    if (clip) {
      const played = await playSpeechBuffer(clip.data, clip.mime, undefined, true)
      if (token !== speakToken) return
      if (played) {
        playNext()
        return
      }
    }
    speakSynth(next.text, playNext)
  })()
}

export function beginSpokenReply(onEnd?: () => void) {
  stopSpeaking()
  stopVoiceCues()
  streamToken = speakToken
  streamQueue = []
  streamPlaying = false
  streamEnded = false
  streamOnEnd = onEnd
}

export function pushSpokenText(raw: string) {
  const text = textForSpeech(raw)
  if (!text || streamToken !== speakToken) return
  enqueueSpoken(text)
  if (!streamPlaying) playStreamNext()
}

export function endSpokenReply() {
  if (streamToken !== speakToken) return
  streamEnded = true
  if (!streamPlaying && streamQueue.length === 0) {
    const done = streamOnEnd
    streamOnEnd = undefined
    done?.()
  }
}

export function speakText(raw: string, onEnd?: () => void) {
  if (typeof window === 'undefined') {
    onEnd?.()
    return
  }
  const text = textForSpeech(raw)
  if (!text) {
    onEnd?.()
    return
  }

  beginSpokenReply(onEnd)
  const chunks = analysableSpeech ? chunkForSpeech(text, 900) : chunkForSpeech(text)
  for (const chunk of chunks) {
    pushSpokenText(chunk)
  }
  endSpokenReply()
}
