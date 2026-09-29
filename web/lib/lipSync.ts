export type VisemeId = 'rest' | 'closed' | 'open' | 'wide' | 'round' | 'labiodental' | 'mid'

export type MouthShape = {
  jaw: number
  open: number
  width: number
  round: number
  fv: number
}

const SHAPES: Record<VisemeId, MouthShape> = {
  rest: { jaw: 0, open: 0, width: 0.18, round: 0, fv: 0 },
  closed: { jaw: 0.02, open: 0, width: 0.22, round: 0, fv: 0 },
  mid: { jaw: 0.22, open: 0.24, width: 0.38, round: 0.08, fv: 0 },
  open: { jaw: 0.72, open: 0.78, width: 0.48, round: 0.12, fv: 0 },
  wide: { jaw: 0.32, open: 0.4, width: 0.86, round: 0, fv: 0 },
  round: { jaw: 0.42, open: 0.5, width: 0.08, round: 1, fv: 0 },
  labiodental: { jaw: 0.14, open: 0.1, width: 0.34, round: 0.05, fv: 1 },
}

export function visemeFromSpokenText(text: string, charIndex: number): VisemeId {
  if (!text) return 'rest'
  const i = Math.max(0, Math.min(text.length - 1, charIndex))
  const ch = (text[i] || ' ').toLowerCase()
  const next = (text[i + 1] || '').toLowerCase()
  const pair = ch + next
  if (pair === 'th') return 'mid'
  if ('mbp'.includes(ch)) return 'closed'
  if ('fv'.includes(ch)) return 'labiodental'
  if (pair === 'oo' || pair === 'ou' || pair === 'oh' || 'uwq'.includes(ch) || ch === 'o') return 'round'
  if (ch === 'a' || pair === 'ah' || pair === 'ar') return 'open'
  if (ch === 'e' || ch === 'i' || pair === 'ee' || pair === 'ea' || pair === 'ey') return 'wide'
  if (' \n\t.,!?;:\'"-'.includes(ch)) return 'rest'
  return 'mid'
}

export function mouthShapeForViseme(id: VisemeId): MouthShape {
  return SHAPES[id]
}

export function mixMouth(from: MouthShape, to: MouthShape, t: number): MouthShape {
  const u = Math.max(0, Math.min(1, t))
  return {
    jaw: from.jaw + (to.jaw - from.jaw) * u,
    open: from.open + (to.open - from.open) * u,
    width: from.width + (to.width - from.width) * u,
    round: from.round + (to.round - from.round) * u,
    fv: from.fv + (to.fv - from.fv) * u,
  }
}

export function approachMouth(current: MouthShape, target: MouthShape, dt: number, rate: number): MouthShape {
  const t = 1 - Math.exp(-Math.max(0, dt) * rate)
  return mixMouth(current, target, t)
}
