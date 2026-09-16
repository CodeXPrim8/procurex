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

export function stopSpeaking() {
  speakToken += 1
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

function chunkForSpeech(text: string, maxLen = 220): string[] {
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

function whenVoicesReady(run: () => void) {
  if (window.speechSynthesis.getVoices().length) {
    run()
    return
  }
  const onChange = () => {
    window.speechSynthesis.removeEventListener('voiceschanged', onChange)
    run()
  }
  window.speechSynthesis.addEventListener('voiceschanged', onChange)
  window.setTimeout(() => {
    window.speechSynthesis.removeEventListener('voiceschanged', onChange)
    run()
  }, 500)
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

  const token = ++speakToken
  window.speechSynthesis.cancel()

  const finish = () => {
    if (token !== speakToken) return
    onEnd?.()
  }

  const start = () => {
    if (token !== speakToken) return
    const chunks = chunkForSpeech(text)
    const preferred = pickVoice()
    const lang = preferred?.lang || navigator.language || 'en-US'

    const speakChunk = (index: number) => {
      if (token !== speakToken) return
      if (index >= chunks.length) {
        finish()
        return
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index])
      utterance.rate = 1.04
      utterance.pitch = 1
      utterance.lang = lang
      if (preferred) utterance.voice = preferred
      utterance.onend = () => speakChunk(index + 1)
      utterance.onerror = () => finish()
      window.speechSynthesis.speak(utterance)
      try {
        window.speechSynthesis.resume()
      } catch {
        // ignore
      }
    }

    window.setTimeout(() => speakChunk(0), 40)
  }

  whenVoicesReady(start)
}
