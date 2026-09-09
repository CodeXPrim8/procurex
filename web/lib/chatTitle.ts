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
]

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
    const token = raw.replace(/[^\w$%-]/g, '')
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

export function naturalChatTitle(text: string, currentTitle?: string) {
  const current = (currentTitle || '').trim()
  const currentKey = current.toLowerCase()
  const locked =
    current &&
    currentKey !== 'new chat' &&
    currentKey !== 'newchat' &&
    !isSmalltalk(current) &&
    current.length <= 42 &&
    currentKey !== normalize(text).slice(0, current.length).toLowerCase()

  if (locked) return current
  if (isSmalltalk(text)) return current && currentKey !== 'new chat' ? current : null

  const stripped = stripFillers(text)
  const branded = brandProductTitle(stripped || text)
  if (branded) return branded

  const compact = compactPhrase(stripped || text).replace(/^(a|an)\s+/i, '').trim()
  if (compact && !isSmalltalk(compact) && compact.split(' ').length >= 2) {
    return titleCase(compact)
  }

  for (const [pattern, label] of TOPIC_RULES) {
    if (pattern.test(text)) return label
  }

  if (compact && !isSmalltalk(compact) && compact.length >= 3) {
    return titleCase(compact)
  }
  return null
}
