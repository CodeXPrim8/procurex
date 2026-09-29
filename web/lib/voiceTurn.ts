export type BackchannelId = 'mmhmm' | 'yeah' | 'oh' | 'right' | 'okay' | 'listening'

function normalizeSpeech(text: string) {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isCommitableSpeech(text: string) {
  const spoken = cleanTranscript(text)
  if (spoken.length < 2) return false
  return !/^(um+|uh+|er+|ah+|hmm+|mm+|mhm+|uh-huh|mm-hmm)$/i.test(spoken)
}

export function cleanTranscript(text: string) {
  return (text || '')
    .replace(/^(thought|thinking)\s*[:.\-]*\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isLikelyEcho(spoken: string, heard: string) {
  const said = normalizeSpeech(spoken)
  const got = normalizeSpeech(cleanTranscript(heard))
  if (!got) return true
  if (got.length < 5) return Boolean(said)
  if (!said) return false
  if (said.includes(got)) return true
  if (got.length < 40) return false
  if (got.includes(said.slice(0, Math.min(said.length, 80)))) return true
  const heardWords = got.split(' ').filter((word) => word.length > 4)
  if (!heardWords.length) return false
  const saidWords = new Set(said.split(' ').filter((word) => word.length > 4))
  const overlap = heardWords.filter((word) => saidWords.has(word)).length
  return overlap / heardWords.length >= 0.75
}

export function novelUserSpeech(spoken: string, heard: string) {
  const raw = (heard || '').replace(/\s+/g, ' ').trim()
  if (!raw) return ''
  if (!isLikelyEcho(spoken, raw)) return raw
  const said = normalizeSpeech(spoken).split(' ').filter(Boolean)
  const got = normalizeSpeech(raw).split(' ').filter(Boolean)
  const leftover: string[] = []
  for (const word of got) {
    if (word.length > 2 && said.includes(word) && leftover.length === 0) continue
    leftover.push(word)
  }
  const novel = leftover.join(' ').trim()
  if (!novel || isLikelyEcho(spoken, novel)) return ''
  return novel
}

export function isReadyToThink(text: string) {
  const spoken = cleanTranscript(text)
  const words = spoken.split(/\s+/).filter(Boolean)
  return words.length >= 4 || (spoken.length >= 16 && words.length >= 3)
}

export function pauseDelayFor(text: string) {
  const spoken = (text || '').replace(/\s+/g, ' ').trim()
  const words = spoken.split(' ').filter(Boolean).length
  if (!spoken) return 560
  if (/[.!?]$/.test(spoken) || words >= 8) return 360
  if (words <= 2) return 560
  return 420
}

export function pickBackchannel(live: string, previous?: string | null): BackchannelId | null {
  const text = (live || '').toLowerCase()
  const words = text.split(/\s+/).filter(Boolean).length
  if (words < 8 || /[.!?]$/.test(text.trim())) return null
  if (/\b(thank|thanks|appreciate)\b/.test(text)) return previous === 'yeah' ? null : 'yeah'
  if (/\b(so |and then|also|because|another|plus )\b/.test(text)) {
    return previous === 'mmhmm' ? 'okay' : 'mmhmm'
  }
  return null
}
