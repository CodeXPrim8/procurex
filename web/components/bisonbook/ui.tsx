'use client'

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { apiErrorMessage } from '@/lib/api'
import { showToast } from '@/lib/toast'
import ProcureXLoader from '@/components/ProcureXLoader'

const NGN = new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 2 })

/** BisonBook keeps books in Naira regardless of the buyer display currency. */
export function ngn(value?: number | null) {
  return NGN.format(Number(value || 0))
}

export function fmtDate(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function todayIso() {
  const now = new Date()
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function fmtBytes(bytes?: number) {
  const value = Number(bytes || 0)
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`
}

export const fieldClass =
  'w-full px-3 py-2 text-sm rounded-lg bg-[#171717] text-[#ececec] placeholder-[#8e8e8e] border border-[#3d3d3d] focus:outline-none focus:ring-2 focus:ring-[#19C37D]'

export const labelClass = 'block text-xs font-medium text-[#b4b4b4] mb-1'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-[#3d3d3d] bg-[#171717] p-4 ${className}`}>{children}</div>
}

export function Stat({ label, value, hint, tone = 'default' }: {
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'default' | 'good' | 'warn' | 'bad'
}) {
  const toneClass = {
    default: 'text-[#ececec]',
    good: 'text-[#19C37D]',
    warn: 'text-amber-400',
    bad: 'text-red-400',
  }[tone]
  return (
    <Card>
      <p className="text-xs uppercase tracking-wide text-[#8e8e8e]">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-[#8e8e8e]">{hint}</p> : null}
    </Card>
  )
}

export function SectionTitle({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
      <div>
        <h3 className="text-lg font-semibold text-[#ececec]">{title}</h3>
        {subtitle ? <p className="text-sm text-[#8e8e8e] mt-0.5">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

const PILL_TONES: Record<string, string> = {
  paid: 'bg-[#19C37D]/15 text-[#19C37D]',
  filed: 'bg-[#19C37D]/15 text-[#19C37D]',
  approved: 'bg-[#19C37D]/15 text-[#19C37D]',
  accepted: 'bg-[#19C37D]/15 text-[#19C37D]',
  converted: 'bg-sky-500/15 text-sky-300',
  issued: 'bg-sky-500/15 text-sky-300',
  sent: 'bg-sky-500/15 text-sky-300',
  ready: 'bg-sky-500/15 text-sky-300',
  partially_paid: 'bg-amber-500/15 text-amber-300',
  pending: 'bg-amber-500/15 text-amber-300',
  unpaid: 'bg-amber-500/15 text-amber-300',
  draft: 'bg-[#3d3d3d] text-[#b4b4b4]',
  not_started: 'bg-[#3d3d3d] text-[#b4b4b4]',
  none: 'bg-[#3d3d3d] text-[#b4b4b4]',
  void: 'bg-red-500/15 text-red-300',
  declined: 'bg-red-500/15 text-red-300',
  rejected: 'bg-red-500/15 text-red-300',
  overdue: 'bg-red-500/15 text-red-300',
}

export function Pill({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${PILL_TONES[status] || PILL_TONES.draft}`}>
      {label || status.replace(/_/g, ' ')}
    </span>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-[#3d3d3d] px-4 py-10 text-center text-sm text-[#8e8e8e]">{children}</div>
}

export function Loading() {
  return (
    <div className="flex justify-center py-12">
      <ProcureXLoader size={80} />
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-red-700/50 bg-red-950/30 px-4 py-3 text-sm text-red-300 flex items-center justify-between gap-3">
      <span>{message}</span>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="text-xs underline">
          Retry
        </button>
      ) : null}
    </div>
  )
}

/** Load data on mount / when deps change; returns reload for after mutations. */
export function useLoader<T>(fn: () => Promise<T>, deps: any[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const reload = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await fnRef.current())
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not load BisonBook data'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return { data, error, loading, reload, setData }
}

/** Run a mutation with toast feedback; returns true on success. */
export async function attempt(action: () => Promise<unknown>, success?: string) {
  try {
    await action()
    if (success) showToast(success, 'success')
    return true
  } catch (err) {
    showToast(apiErrorMessage(err, 'That did not work'), 'error')
    return false
  }
}

export function Modalish({ open, title, onClose, children, wide = false }: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[70] flex items-start sm:items-center justify-center bg-black/60 p-3 overflow-y-auto" onMouseDown={onClose}>
      <div
        className={`w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} rounded-2xl border border-[#3d3d3d] bg-[#212121] shadow-2xl my-6`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#3d3d3d] px-5 py-3">
          <h4 className="text-base font-semibold text-[#ececec]">{title}</h4>
          <button type="button" onClick={onClose} className="text-[#8e8e8e] hover:text-white text-xl leading-none" aria-label="Close">
            &times;
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Table({ headers, children, align }: { headers: string[]; children: ReactNode; align?: ('left' | 'right')[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#3d3d3d]">
      <table className="min-w-full text-sm">
        <thead className="bg-[#171717] text-[#8e8e8e] text-xs uppercase tracking-wide">
          <tr>
            {headers.map((header, index) => (
              <th key={header + index} className={`px-3 py-2 font-medium ${align?.[index] === 'right' ? 'text-right' : 'text-left'}`}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#2f2f2f] text-[#ececec]">{children}</tbody>
      </table>
    </div>
  )
}
