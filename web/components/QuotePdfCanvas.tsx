'use client'

import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatPrice, getDisplayCurrency } from '@/lib/currency'
import { resolveMediaUrl } from '@/lib/media'
import { documentKind } from '@/components/QuotationCard'

function naira(value: any) {
  return Math.round(Number(value) || 0)
}

function digits(raw: string) {
  return raw.replace(/[^\d]/g, '')
}

function PaperMoney({ amount, className = '' }: { amount: number; className?: string }) {
  const [text, setText] = useState(`₦${amount.toLocaleString('en-NG')}`)
  useEffect(() => {
    setText(`₦${amount.toLocaleString('en-NG')}`)
    void formatPrice(amount).then(setText)
  }, [amount])
  return <span className={className}>{text}</span>
}

type Theme = {
  ink: string
  muted: string
  accent: string
  card: string
  line: string
  badgeBg: string
  badgeFg: string
  totalBg: string
  totalFg: string
  tight?: boolean
}

const THEMES: Record<string, Theme> = {
  modern: {
    ink: '#12241c',
    muted: '#6d7f76',
    accent: '#12a06a',
    card: '#f2f8f5',
    line: '#e2ece7',
    badgeBg: '#d7f4e6',
    badgeFg: '#0b6b45',
    totalBg: '#12241c',
    totalFg: '#ffffff',
  },
  classic: {
    ink: '#1b2434',
    muted: '#6b7380',
    accent: '#1f4e79',
    card: '#f4f7fb',
    line: '#e4eaf1',
    badgeBg: '#e7eef6',
    badgeFg: '#1f4e79',
    totalBg: '#1b2434',
    totalFg: '#ffffff',
  },
  compact: {
    ink: '#141414',
    muted: '#737373',
    accent: '#171717',
    card: '#f6f6f6',
    line: '#ececec',
    badgeBg: '#171717',
    badgeFg: '#ffffff',
    totalBg: '#171717',
    totalFg: '#ffffff',
    tight: true,
  },
}

const TITLES = { quote: 'Quotation', invoice: 'Invoice', receipt: 'Receipt' } as const

const paperInput =
  'w-full bg-transparent outline-none border-b border-dashed border-transparent hover:border-black/15 focus:border-current [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

type QuotePdfCanvasProps = {
  quotation: any
  business?: any
  money: { subtotal: number; vat: number; total: number }
  onPatch: (patch: Record<string, any>) => void
  onUpdateItem: (index: number, patch: any) => void
  onUpdateUnitPrice: (index: number, raw: string) => void
  onRemoveLine: (index: number) => void
  onAddLine: () => void
}

export default function QuotePdfCanvas({
  quotation,
  business,
  money,
  onPatch,
  onUpdateItem,
  onUpdateUnitPrice,
  onRemoveLine,
  onAddLine,
}: QuotePdfCanvasProps) {
  const [symbol, setSymbol] = useState('₦')
  useEffect(() => {
    void getDisplayCurrency().then(({ currency, symbol: next }) => {
      setSymbol(currency === 'NGN' ? '₦' : next || '₦')
    })
  }, [])

  const kind = documentKind(quotation)
  const theme = THEMES[quotation.template_kind || business?.template_kind || 'modern'] || THEMES.modern
  const brand = (business?.legal_name || business?.name || quotation.business_name || 'ProcureX') as string
  const logo = resolveMediaUrl(business?.logo_url || quotation.logo_url)
  const letterhead = resolveMediaUrl(business?.letterhead_url)
  const created = quotation.created_at ? new Date(quotation.created_at) : new Date()
  const validDays = Math.max(1, Number(quotation.valid_days) || 14)
  const validUntil = new Date(created.getTime() + validDays * 24 * 60 * 60 * 1000)
  const paid = quotation.paid_at ? new Date(quotation.paid_at) : null
  const vatPct = Number(quotation.vat_percent)
  const vatValue = Number.isFinite(vatPct) ? vatPct : 7.5
  const footer =
    business?.footer_note ||
    `Unit prices are in Naira and exclude VAT. VAT is shown separately. Prepared with ProcureX.`
  const dateLabel = created.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const validLabel = validUntil.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const paidLabel = paid
    ? paid.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : null
  const pad = theme.tight ? 'px-9 py-9' : 'px-11 py-12 sm:px-12 sm:py-14'
  const contacts = [business?.email, business?.phone, business?.address].filter(Boolean) as string[]

  return (
    <div className="rounded-2xl border border-[#3d3d3d] bg-[#171717] p-3 sm:p-5 overflow-x-auto">
      <article
        className={`relative mx-auto bg-white shadow-2xl w-full max-w-[820px] min-w-[680px] overflow-hidden ${pad}`}
        style={{ color: theme.ink, fontFeatureSettings: '"tnum"' }}
      >
        <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: theme.accent }} />
        {letterhead ? (
          <img src={letterhead} alt="" className="w-full h-24 object-cover object-left rounded-xl mb-8" />
        ) : null}

        <header className="flex items-start justify-between gap-8">
          <div className="flex items-start gap-3 min-w-0">
            {logo ? (
              <img src={logo} alt="" className="w-12 h-12 object-contain rounded-lg" />
            ) : (
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-semibold shrink-0"
                style={{ background: theme.card, color: theme.accent }}
              >
                {String(brand).slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[22px] font-semibold tracking-tight leading-none">{brand}</p>
              <div className="mt-2 space-y-0.5 text-[12px]" style={{ color: theme.muted }}>
                {contacts.map((line) => (
                  <p key={line} className="break-words">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          </div>
          <div className="text-right shrink-0">
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em]"
              style={{ background: theme.badgeBg, color: theme.badgeFg }}
            >
              {TITLES[kind]}
            </span>
            <p className="mt-3 text-[20px] font-semibold tracking-tight">{quotation.quotation_number}</p>
            <p className="mt-1 text-[12px]" style={{ color: theme.muted }}>
              {dateLabel}
            </p>
          </div>
        </header>

        <section className="mt-10 grid grid-cols-2 gap-4">
          <div className="rounded-2xl p-5" style={{ background: theme.card }}>
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-3"
              style={{ color: theme.muted }}
            >
              Bill to
            </p>
            <input
              aria-label="Customer name"
              value={quotation.customer_name || ''}
              onChange={(event) => onPatch({ customer_name: event.target.value })}
              placeholder="Customer name"
              className={`${paperInput} text-[15px] font-semibold`}
            />
            <input
              aria-label="Phone"
              value={quotation.customer_phone || ''}
              onChange={(event) => onPatch({ customer_phone: event.target.value })}
              placeholder="Phone"
              className={`${paperInput} text-[13px] mt-1.5`}
              style={{ color: theme.muted }}
            />
            <input
              aria-label="Address"
              value={quotation.customer_address || ''}
              onChange={(event) => onPatch({ customer_address: event.target.value })}
              placeholder="Address"
              className={`${paperInput} text-[13px] mt-1.5`}
              style={{ color: theme.muted }}
            />
          </div>
          <div className="rounded-2xl p-5" style={{ background: theme.card }}>
            <p
              className="text-[10px] font-semibold uppercase tracking-[0.18em] mb-3"
              style={{ color: theme.muted }}
            >
              Details
            </p>
            <dl className="space-y-2.5 text-[13px]">
              <div className="flex items-baseline justify-between gap-4">
                <dt style={{ color: theme.muted }}>Issue date</dt>
                <dd className="font-medium">{dateLabel}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt style={{ color: theme.muted }}>{kind === 'quote' ? 'Valid until' : 'Paid'}</dt>
                <dd className="font-medium">{kind === 'quote' ? validLabel : paidLabel || '—'}</dd>
              </div>
              {kind === 'quote' ? (
                <label className="flex items-center justify-between gap-3" style={{ color: theme.muted }}>
                  <span>Valid for</span>
                  <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: theme.ink }}>
                    <input
                      aria-label="Valid for days"
                      type="number"
                      min={1}
                      max={365}
                      value={validDays}
                      onChange={(event) => onPatch({ valid_days: Math.max(1, naira(event.target.value) || 14) })}
                      className={`${paperInput} w-12 text-center`}
                    />
                    <span>days</span>
                  </span>
                </label>
              ) : (
                <div className="flex items-baseline justify-between gap-4">
                  <dt style={{ color: theme.muted }}>Source</dt>
                  <dd className="font-medium">{quotation.source_number || quotation.quotation_number}</dd>
                </div>
              )}
            </dl>
          </div>
        </section>

        <table className="w-full mt-10 text-[13px]">
          <thead>
            <tr
              className="text-[10px] font-semibold uppercase tracking-[0.16em]"
              style={{ color: theme.muted, borderBottom: `1px solid ${theme.line}` }}
            >
              <th className="text-left font-semibold pb-3 pr-3">Description</th>
              <th className="text-right font-semibold pb-3 px-3 w-16">Qty</th>
              <th className="text-right font-semibold pb-3 px-3 w-40">Unit price</th>
              <th className="text-right font-semibold pb-3 pl-3 w-36">Amount</th>
              <th className="w-8 pb-3" />
            </tr>
          </thead>
          <tbody>
            {(quotation.items || []).map((item: any, index: number) => {
              const qty = Number(item.quantity) || 1
              const unit = naira(item.unit_price)
              return (
                <tr key={item.id || index} style={{ borderBottom: `1px solid ${theme.line}` }}>
                  <td className="py-3.5 pr-3">
                    <input
                      value={item.product_name || ''}
                      onChange={(event) => onUpdateItem(index, { product_name: event.target.value })}
                      className={`${paperInput} font-medium text-[14px]`}
                    />
                  </td>
                  <td className="py-3.5 px-3">
                    <input
                      type="number"
                      min={1}
                      value={qty}
                      onChange={(event) => onUpdateItem(index, { quantity: Math.max(1, naira(event.target.value) || 1) })}
                      className={`${paperInput} text-right tabular-nums`}
                    />
                  </td>
                  <td className="py-3.5 px-3">
                    <label className="flex items-center justify-end gap-0.5 tabular-nums">
                      <span className="text-[13px] font-medium">{symbol}</span>
                      <input
                        aria-label="Unit price"
                        inputMode="numeric"
                        value={unit.toLocaleString('en-NG')}
                        onChange={(event) => onUpdateUnitPrice(index, digits(event.target.value))}
                        className={`${paperInput} text-right w-[7.5rem] font-medium`}
                      />
                    </label>
                  </td>
                  <td className="py-3.5 pl-3 text-right font-medium tabular-nums">
                    <PaperMoney amount={qty * unit} />
                  </td>
                  <td className="pl-2">
                    <button
                      type="button"
                      aria-label="Remove line"
                      onClick={() => onRemoveLine(index)}
                      className="text-black/25 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <button
          type="button"
          onClick={onAddLine}
          className="mt-3 text-[13px] inline-flex items-center gap-1 font-medium"
          style={{ color: theme.accent }}
        >
          <Plus className="w-4 h-4" />
          Add line
        </button>

        <div className="mt-8 flex items-end justify-between gap-6">
          <div className="min-w-0">
            {kind !== 'quote' && (
              <p
                className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold"
                style={{ background: theme.badgeBg, color: theme.badgeFg }}
              >
                Paid in full{paidLabel ? ` · ${paidLabel}` : ''}
              </p>
            )}
          </div>
          <div className="w-full max-w-[280px] rounded-2xl overflow-hidden text-[13px]" style={{ background: theme.card }}>
            <div className="flex justify-between px-5 py-2.5" style={{ color: theme.muted }}>
              <span>Subtotal</span>
              <PaperMoney amount={money.subtotal} className="tabular-nums" />
            </div>
            <div className="flex justify-between items-center px-5 py-2.5 gap-3" style={{ color: theme.muted }}>
              <label className="inline-flex items-center gap-1.5">
                <span>VAT</span>
                <input
                  aria-label="VAT %"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={vatValue}
                  onChange={(event) => onPatch({ vat_percent: Number(event.target.value) || 0 })}
                  className={`${paperInput} w-12 text-right`}
                />
                <span>%</span>
              </label>
              <PaperMoney amount={money.vat} className="tabular-nums" />
            </div>
            <div
              className="flex justify-between px-5 py-3.5 text-[15px] font-semibold"
              style={{ background: theme.totalBg, color: theme.totalFg }}
            >
              <span>Total</span>
              <PaperMoney amount={money.total} className="tabular-nums" />
            </div>
          </div>
        </div>

        <p className="mt-10 text-[11px] leading-relaxed" style={{ color: theme.muted }}>
          {footer}
        </p>
      </article>
    </div>
  )
}
