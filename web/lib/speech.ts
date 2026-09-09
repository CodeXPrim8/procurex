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

export function stopSpeaking() {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
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
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 1.04
  utterance.pitch = 1
  utterance.lang = navigator.language || 'en-US'
  const voices = window.speechSynthesis.getVoices()
  const preferred =
    voices.find((v) => /en-NG|en-GB|en-US/i.test(v.lang) && /female|google|samantha|natural/i.test(v.name)) ||
    voices.find((v) => /^en/i.test(v.lang))
  if (preferred) utterance.voice = preferred
  utterance.onend = () => onEnd?.()
  utterance.onerror = () => onEnd?.()
  window.speechSynthesis.speak(utterance)
}
