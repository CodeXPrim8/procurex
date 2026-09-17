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

let speakToken = 0
let streamQueue: string[] = []
let streamPlaying = false
let streamEnded = false
let streamOnEnd: (() => void) | undefined
let streamToken = 0

export function stopSpeaking() {
  speakToken += 1
  streamQueue = []
  streamPlaying = false
  streamEnded = true
  streamOnEnd = undefined
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
}

/** Call from a user tap so iOS/Chrome allow TTS after the AI reply arrives. */
export function unlockSpeech() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  try {
    window.speechSynthesis.getVoices()
    const warm = new SpeechSynthesisUtterance(' ')
    warm.volume = 0
    warm.rate = 1
    warm.lang = navigator.language || 'en-US'
    window.speechSynthesis.speak(warm)
    window.speechSynthesis.resume()
    window.setTimeout(() => {
      try {
        window.speechSynthesis.cancel()
      } catch {
        // ignore
      }
    }, 0)
  } catch {
    // ignore
  }
}

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  if (!voices.length) return undefined
  const lang = (navigator.language || 'en-US').toLowerCase()
  const prefix = lang.split('-')[0]
  const natural = (voice: SpeechSynthesisVoice) =>
    /female|google|samantha|natural|aria|jenny|zira|microsoft/i.test(voice.name)
  return (
    voices.find((voice) => voice.lang.toLowerCase() === lang && natural(voice)) ||
    voices.find((voice) => voice.lang.toLowerCase() === lang) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith(prefix) && natural(voice)) ||
    voices.find((voice) => /en-ng|en-gb|en-us/i.test(voice.lang) && natural(voice)) ||
    voices.find((voice) => /^en/i.test(voice.lang)) ||
    voices[0]
  )
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

function speakUtterance(text: string, onEnd: () => void) {
  const utterance = new SpeechSynthesisUtterance(text)
  const preferred = pickVoice()
  utterance.rate = 1.12
  utterance.pitch = 1
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

function playStreamNext() {
  if (streamToken !== speakToken) return
  const next = streamQueue.shift()
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
  speakUtterance(next, () => {
    if (streamToken !== speakToken) return
    playStreamNext()
  })
}

export function beginSpokenReply(onEnd?: () => void) {
  stopSpeaking()
  streamToken = speakToken
  streamQueue = []
  streamPlaying = false
  streamEnded = false
  streamOnEnd = onEnd
}

export function pushSpokenText(raw: string) {
  const text = textForSpeech(raw)
  if (!text || streamToken !== speakToken) return
  streamQueue.push(text)
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
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    onEnd?.()
    return
  }
  const text = textForSpeech(raw)
  if (!text) {
    onEnd?.()
    return
  }

  beginSpokenReply(onEnd)
  for (const chunk of chunkForSpeech(text)) {
    pushSpokenText(chunk)
  }
  endSpokenReply()
}
