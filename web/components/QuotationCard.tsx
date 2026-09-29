'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileText, Calendar, User, Download } from 'lucide-react'
import Badge from './ui/Badge'
import { formatPrice } from '@/lib/currency'
import { quotationAPI } from '@/lib/api'
import { showToast } from '@/lib/toast'
import { productImageList, resolveMediaUrl } from '@/lib/media'

export type QuotationSummary = {
  id: number
  quotation_number: string
  customer_name?: string
  total_amount: number
  status?: string
  document_kind?: string
  paid_at?: string
  created_at?: string
  item_name?: string
  vendor_name?: string
  quantity?: number
  image_url?: string
  image_urls?: string[]
  items?: any[]
}

function quotationCover(quotation: QuotationSummary) {
  const first = quotation.items?.[0] || {}
  return productImageList({
    image_url: quotation.image_url || first.image_url,
    image_urls: quotation.image_urls || first.image_urls,
  })[0]
}

export async function downloadQuotationPdf(quotation: { id: number; quotation_number?: string }) {
  const blob = await quotationAPI.getPDF(quotation.id)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${quotation.quotation_number || 'quotation'}.pdf`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export async function viewQuotationPdf(quotation: { id: number }) {
  const blob = await quotationAPI.getPDF(quotation.id, true)
  const pdf = blob instanceof Blob && blob.type === 'application/pdf'
    ? blob
    : new Blob([blob], { type: 'application/pdf' })
  const url = URL.createObjectURL(pdf)
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (!opened) {
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function documentKind(quotation?: { document_kind?: string }) {
  const kind = String(quotation?.document_kind || 'quote').toLowerCase()
  return kind === 'invoice' || kind === 'receipt' ? kind : 'quote'
}

export function documentNoun(quotation?: { document_kind?: string }) {
  const kind = documentKind(quotation)
  if (kind === 'invoice') return 'invoice'
  if (kind === 'receipt') return 'receipt'
  return 'quote'
}

interface QuotationCardProps {
  quotation: QuotationSummary
}

export function ChatQuoteCard({ quotation }: QuotationCardProps) {
  const [totalLabel, setTotalLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [cover, setCover] = useState(() => quotationCover(quotation))
  const itemName = quotation.item_name || quotation.items?.[0]?.product_name
  const quantity = quotation.quantity || quotation.items?.[0]?.quantity || 1

  useEffect(() => {
    void formatPrice(Number(quotation.total_amount) || 0).then(setTotalLabel)
  }, [quotation.total_amount])

  useEffect(() => {
    const next = quotationCover(quotation)
    if (next) {
      setCover(next)
      return
    }
    if (!quotation.id) return
    let cancelled = false
    quotationAPI
      .getQuotation(quotation.id)
      .then((row) => {
        if (cancelled) return
        const found = quotationCover(row)
        if (found) setCover(found)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [quotation])

  const onDownload = async () => {
    setBusy(true)
    try {
      await downloadQuotationPdf(quotation)
    } catch {
      showToast('Could not download that quotation PDF.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-[#3d3d3d] bg-[#2f2f2f] p-3 sm:p-4">
      <div className="flex items-start gap-3">
        {cover ? (
          <img
            src={resolveMediaUrl(cover)}
            alt={itemName || 'Quoted product'}
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover bg-[#171717] shrink-0"
          />
        ) : (
          <div className="w-16 h-16 sm:w-20 sm:h-20 bg-[#171717] rounded-xl flex items-center justify-center shrink-0">
            <FileText className="w-6 h-6 text-[#19C37D]" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-[#8e8e8e]">Formal {documentNoun(quotation)}</p>
              <h3 className="font-semibold text-[#ececec] truncate">{quotation.quotation_number}</h3>
              {itemName && (
                <p className="text-sm text-[#b4b4b4] mt-1 break-words">
                  {itemName} × {quantity}
                </p>
              )}
            </div>
            <p className="text-lg font-bold text-[#ececec] shrink-0">{totalLabel || '…'}</p>
          </div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void onDownload()}
          disabled={busy}
          className="inline-flex items-center gap-2 min-h-11 px-3.5 py-2 rounded-lg bg-[#19C37D] text-[#0b0b0b] text-sm font-medium hover:bg-[#16b375] disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          {busy ? 'Preparing PDF…' : 'Download PDF'}
        </button>
        <Link
          href={Boolean(quotation.paid_at) || documentKind(quotation) !== 'quote' ? `/quotations/${quotation.id}#deal` : `/quotations/${quotation.id}`}
          className="inline-flex items-center min-h-11 px-3.5 py-2 rounded-lg border border-[#3d3d3d] text-sm text-[#ececec] hover:bg-[#353535]"
        >
          View {documentNoun(quotation)}
        </Link>
      </div>
    </div>
  )
}

export default function QuotationCard({ quotation }: QuotationCardProps) {
  const [totalLabel, setTotalLabel] = useState('')
  const kind = documentKind(quotation)
  const paid = Boolean(quotation.paid_at) || kind !== 'quote'
  const badge = kind !== 'quote' ? kind : quotation.status
  const statusColors = {
    draft: 'default',
    sent: 'info',
    accepted: 'success',
    rejected: 'danger',
    paid: 'success',
    invoice: 'success',
    receipt: 'success',
  } as const

  useEffect(() => {
    void formatPrice(Number(quotation.total_amount) || 0).then(setTotalLabel)
  }, [quotation.total_amount])

  return (
    <Link href={paid ? `/quotations/${quotation.id}#deal` : `/quotations/${quotation.id}`}>
      <div className="bg-[#2f2f2f] border border-[#3d3d3d] rounded-lg p-6 hover:bg-[#353535] transition-all cursor-pointer">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-[#171717] rounded-lg flex items-center justify-center">
              <FileText className="w-6 h-6 text-[#19C37D]" />
            </div>
            <div>
              <h3 className="font-semibold text-[#ececec]">{quotation.quotation_number}</h3>
              <div className="flex items-center space-x-2 mt-1">
                <User className="w-4 h-4 text-[#8e8e8e]" />
                <span className="text-sm text-[#b4b4b4]">{quotation.customer_name}</span>
              </div>
            </div>
          </div>
          <Badge variant={statusColors[badge as keyof typeof statusColors] || 'default'}>
            {badge}
          </Badge>
        </div>

        <div className="flex items-center justify-between pt-4 border-t border-[#3d3d3d]">
          <div>
            <p className="text-2xl font-bold text-[#ececec]">{totalLabel || '…'}</p>
            <div className="flex items-center space-x-1 text-[#8e8e8e] text-sm mt-1">
              <Calendar className="w-4 h-4" />
              <span>
                {quotation.created_at ? new Date(quotation.created_at).toLocaleDateString() : ''}
              </span>
            </div>
          </div>
          {quotation.items && (
            <div className="text-right">
              <p className="text-sm text-[#b4b4b4]">
                {quotation.items.length} item{quotation.items.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
