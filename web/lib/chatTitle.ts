const SMALLTALK = new Set([
  'hello',
  'hi',
  'hey',
  'hiya',
  'yo',
  'sup',
  'howdy',
  'hola',
  'thanks',
  'thank you',
  'thx',
  'ok',
  'okay',
  'k',
  'yes',
  'no',
  'please',
  'cool',
  'great',
  'nice',
  'sure',
  'yeah',
  'yep',
  'good morning',
  'good afternoon',
  'good evening',
  'how are you',
  "how's it going",
  "what's up",
  'whats up',
])

const FILLERS = [
  /^(please\s+)?(can you|could you|would you|will you)\s+/i,
  /^(i(?:'m| am)?\s+)?(need|want|looking for|gonna need|wanna)\s+/i,
  /^(show me|find me|find|get me|give me|help me(?: find| with)?|search(?: for)?)\s+/i,
  /^(what(?:'s| is| are)|whats)\s+/i,
  /^(how much(?: is| are)?|how many)\s+/i,
  /^(tell me about|recommend|suggest)\s+/i,
  /^(yes|yeah|yep|ok|okay)[,.\s]+/i,
  /^(please\s+)?(generate|create|make)\s+(a |an |me )?/i,
]

const BRANDS = [
  'dell',
  'hp',
  'lenovo',
  'apple',
  'macbook',
  'samsung',
  'asus',
  'acer',
  'microsoft',
  'surface',
  'toshiba',
  'cisco',
  'logitech',
  'huawei',
  'xiaomi',
  'infinix',
  'tecno',
  'itel',
]

const PRODUCTS = new Set([
  'laptop',
  'laptops',
  'notebook',
  'notebooks',
  'computer',
  'computers',
  'phone',
  'phones',
  'smartphone',
  'smartphones',
  'tablet',
  'tablets',
  'monitor',
  'monitors',
  'printer',
  'printers',
  'quotation',
  'quote',
  'quotes',
])

const TOPIC_RULES: Array<[RegExp, string]> = [
  [/\bquot(?:e|es|ation|ations)\b/i, 'Quotation'],
  [/\b(?:vendor|vendors|supplier|suppliers)\b/i, 'Vendors'],
  [/\b(?:stock|availability|in stock|available)\b/i, 'Product availability'],
  [/\b(?:price|prices|pricing|cost|budget)\b/i, 'Pricing'],
  [/\b(?:laptops?|notebooks?|computers?)\b/i, 'Laptops'],
  [/\b(?:phones?|smartphones?|mobiles?)\b/i, 'Phones'],
  [/\b(?:tablets?|ipads?)\b/i, 'Tablets'],
  [/\b(?:monitors?|screens?)\b/i, 'Monitors'],
  [/\b(?:software|saas|crm|erp|apps?)\b/i, 'Software'],
  [/\b(?:website|web development|app development|services?)\b/i, 'Services'],
]

const WEAK_TITLES = new Set(['new chat', 'newchat', 'chat', 'greeting', 'untitled'])
const TITLE_LOCK_KEY = 'procurex_title_locked'

const GENERIC_LABELS = new Set([
  'quotation',
  'vendors',
  'product availability',
  'pricing',
  'laptops',
  'phones',
  'tablets',
  'monitors',
  'software',
  'services',
])
const SMALL_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'for', 'of', 'in', 'on', 'to', 'with', 'under'])
const ACRONYMS = new Set(['hp', 'ibm', 'ram', 'ssd', 'hdd', 'it', 'rfq', 'gpu', 'cpu', 'usb'])
const STOP_WORDS = new Set(['a', 'an', 'the', 'me', 'my', 'some', 'any', 'please', 'just', 'this', 'that', 'those', 'these'])

function normalize(text: string) {
  return (text || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
}

function plain(text: string) {
  return normalize(text).toLowerCase().replace(/[^\w\s$]/g, '').trim()
}

export function isSmalltalk(text: string) {
  const cleaned = plain(text)
  if (!cleaned) return true
  if (SMALLTALK.has(cleaned)) return true
  const words = cleaned.split(' ')
  return words.length <= 4 && SMALLTALK.has(words[0])
}

export function isWeakTitle(title?: string) {
  const cleaned = plain(title || '')
  if (!cleaned) return true
  if (WEAK_TITLES.has(cleaned) || cleaned.startsWith('chat ')) return true
  if (/^greeting(?:\s+\d+)?$/.test(cleaned)) return true
  if (isSmalltalk(title || '')) return true
  return false
}

function readTitleLocks(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(TITLE_LOCK_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function isChatTitleLocked(sessionId: string | number | undefined) {
  if (sessionId == null) return false
  return Boolean(readTitleLocks()[String(sessionId)])
}

export function lockChatTitle(sessionId: string | number | undefined) {
  if (sessionId == null || typeof window === 'undefined') return
  try {
    const locks = readTitleLocks()
    locks[String(sessionId)] = true
    localStorage.setItem(TITLE_LOCK_KEY, JSON.stringify(locks))
  } catch {
    // ignore
  }
}

export function uniqueChatTitle(base: string, existing: string[] = []) {
  const wanted = (base || 'New chat').trim() || 'New chat'
  const taken = new Set(
    existing
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
  )
  if (!taken.has(wanted.toLowerCase())) return wanted.slice(0, 60)
  for (let n = 2; n < 100; n++) {
    const candidate = `${wanted} ${n}`.slice(0, 60)
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
  return `${wanted} ${Date.now().toString().slice(-3)}`.slice(0, 60)
}

export function uniquifySessionTitles<T extends { id?: string | number; title?: string; created_at?: string }>(
  sessions: T[]
): T[] {
  if (!sessions.length) return sessions
  const chronological = [...sessions].sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime()
    const tb = new Date(b.created_at || 0).getTime()
    if (ta !== tb) return ta - tb
    return String(a.id ?? '').localeCompare(String(b.id ?? ''))
  })
  const used: string[] = []
  const nextById = new Map<string, string>()
  for (const session of chronological) {
    const id = String(session.id ?? '')
    const base = (session.title || 'New chat').trim() || 'New chat'
    if (isChatTitleLocked(session.id)) {
      used.push(base)
      nextById.set(id, base)
      continue
    }
    const next = uniqueChatTitle(base, used)
    used.push(next)
    nextById.set(id, next)
  }
  let changed = false
  const next = sessions.map((session) => {
    const title = nextById.get(String(session.id ?? ''))
    if (!title || title === session.title) return session
    changed = true
    return { ...session, title }
  })
  return changed ? next : sessions
}

function prettyWord(word: string, index: number) {
  const spec = word.match(/^(\d+)(gb|tb|mb|ghz)$/i)
  if (spec) return spec[1] + spec[2].toUpperCase()
  const lower = word.toLowerCase()
  if (ACRONYMS.has(lower)) return lower.toUpperCase()
  if (SMALL_WORDS.has(lower) && index > 0) return lower
  return word.charAt(0).toUpperCase() + word.slice(1)
}

function titleCase(text: string) {
  return text
    .split(' ')
    .filter(Boolean)
    .map((word, index) => prettyWord(word, index))
    .join(' ')
}

function stripFillers(text: string) {
  let cleaned = normalize(text).replace(/\s+(?:with|that has|that have|which has|which have)\b.*$/i, '')
  let changed = true
  while (changed) {
    changed = false
    for (const pattern of FILLERS) {
      const next = cleaned.replace(pattern, '').trim()
      if (next !== cleaned) {
        cleaned = next
        changed = true
      }
    }
  }
  return cleaned.replace(/[?!.]+$/, '').replace(/^[-:,\s]+|[-:,\s]+$/g, '')
}

function compactPhrase(text: string) {
  const words: string[] = []
  for (const raw of text.split(' ')) {
    const token = raw.replace(/[^\w$%.-]/g, '')
    if (!token) continue
    if (STOP_WORDS.has(token.toLowerCase()) && words.length > 0) continue
    words.push(token)
    if (words.length >= 6) break
  }
  let phrase = words.join(' ').replace(/^-+|-+$/g, '')
  if (phrase.length > 42) {
    phrase = phrase.slice(0, 42).replace(/\s+\S*$/, '')
  }
  return phrase
}

function namedProductTitle(text: string) {
  const match = text.match(/\b([a-z0-9][\w-]*\.(?:ng|com|io|app|ai|co|net|org|dev))\b/i)
  return match ? match[1] : null
}

function brandProductTitle(text: string) {
  const lower = text.toLowerCase()
  const brand = BRANDS.find((name) => new RegExp(`\\b${name}\\b`, 'i').test(lower))
  const productTokens = text.split(' ').filter((word) => PRODUCTS.has(word.replace(/[^\w]/g, '').toLowerCase()))
  const concrete = productTokens.find((word) => !['quotation', 'quote', 'quotes'].includes(word.replace(/[^\w]/g, '').toLowerCase()))
  const product = concrete || productTokens[0]
  const qty = text.match(/\b(\d+)\s+(?!gb|tb|mb|ghz\b)/i)
  if (!brand || !product) return null
  const parts: string[] = []
  if (qty) {
    const count = Number(qty[1])
    if (count > 1 && count <= 200) parts.push(qty[1])
  }
  parts.push(brand, product)
  return titleCase(parts.join(' '))
}

export function naturalChatTitle(
  text: string,
  currentTitle?: string,
  options?: { existingTitles?: string[]; locked?: boolean }
) {
  const current = (currentTitle || '').trim()
  const existing = options?.existingTitles || []
  if (options?.locked && current && !isWeakTitle(current)) {
    return uniqueChatTitle(current, existing)
  }

  if (isSmalltalk(text)) {
    if (current && !isWeakTitle(current)) return uniqueChatTitle(current, existing)
    return uniqueChatTitle('Greeting', existing)
  }

  const stripped = stripFillers(text)
  const named = namedProductTitle(stripped || text)
  const branded = brandProductTitle(stripped || text)
  let generated = named || branded || ''
  if (!generated) {
    const compact = compactPhrase(stripped || text).replace(/^(a|an)\s+/i, '').trim()
    if (compact && !isSmalltalk(compact) && compact.split(' ').length >= 2) {
      generated = titleCase(compact)
    } else {
      for (const [pattern, label] of TOPIC_RULES) {
        if (pattern.test(text)) {
          generated = label
          break
        }
      }
      if (!generated && compact && !isSmalltalk(compact) && compact.length >= 3) {
        generated = titleCase(compact)
      }
    }
  }

  if (!generated) {
    if (current) return uniqueChatTitle(current, existing)
    return uniqueChatTitle('Greeting', existing)
  }

  const currentKey = current.toLowerCase()
  const genericCurrent = GENERIC_LABELS.has(currentKey)
  const genericNew = GENERIC_LABELS.has(generated.toLowerCase())
  if (current && !isWeakTitle(current) && !genericCurrent && genericNew) {
    return uniqueChatTitle(current, existing)
  }

  return uniqueChatTitle(generated, existing)
}
