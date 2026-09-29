'use client'

import { useEffect, useState } from 'react'
import { BookOpen, FileCheck2, Landmark } from 'lucide-react'
import Button from '@/components/ui/Button'
import { adminAPI, apiErrorMessage } from '@/lib/api'
import { resolveMediaUrl } from '@/lib/media'
import { showToast } from '@/lib/toast'
import { vatStatusLabel } from '@/lib/vendorOnboarding'
import { Pill, fmtDate, ngn } from './ui'

/** Superadmin: review a vendor's VAT documents and peek at their BisonBook (read-only). */
export default function AdminVendorTaxPanel({ vendor, onChange }: { vendor: any; onChange: (payload: any) => void }) {
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [books, setBooks] = useState<any>(null)
  const [booksError, setBooksError] = useState('')
  const [showBooks, setShowBooks] = useState(false)

  useEffect(() => {
    setNotes('')
    setBooks(null)
    setShowBooks(false)
  }, [vendor?.id])

  const review = async (action: 'approve' | 'reject') => {
    if (action === 'reject' && notes.trim().length < 8) {
      showToast('Add a reason so the vendor can fix their VAT documents.', 'error')
      return
    }
    setBusy(action)
    try {
      const payload = await adminAPI.reviewVendorVat(vendor.id, action, notes.trim() || undefined)
      onChange(payload)
      setNotes('')
      showToast(action === 'approve' ? 'VAT approved. The vendor can now charge VAT.' : 'VAT rejected and the vendor was notified.', 'success')
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not save the VAT review.'), 'error')
    } finally {
      setBusy(null)
    }
  }

  const loadBooks = async () => {
    setShowBooks(true)
    if (books) return
    setBooksError('')
    try {
      setBooks(await adminAPI.getVendorBooks(vendor.id))
    } catch (error) {
      setBooksError(apiErrorMessage(error, 'Could not load this vendor\'s books.'))
    }
  }

  const status = vendor?.vat_status || 'none'
  const docs = [
    { label: 'VAT certificate', url: vendor?.vat_certificate_url },
    { label: 'Tax clearance', url: vendor?.tax_clearance_url },
  ]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="rounded-xl border border-[#3d3d3d] bg-[#2f2f2f] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-[#19C37D]" />
            <h3 className="font-semibold">VAT compliance</h3>
          </div>
          <Pill status={vendor?.can_charge_vat ? 'approved' : status} label={vatStatusLabel(status, vendor?.can_charge_vat)} />
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-[#8e8e8e]">TIN</dt>
          <dd>{vendor?.tin || '-'}</dd>
          <dt className="text-[#8e8e8e]">TCC expires</dt>
          <dd>{fmtDate(vendor?.tax_clearance_expires_at)}</dd>
          {docs.map((doc) => (
            <div key={doc.label} className="contents">
              <dt className="text-[#8e8e8e]">{doc.label}</dt>
              <dd>
                {doc.url ? (
                  <a href={resolveMediaUrl(doc.url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#19C37D] hover:underline">
                    <FileCheck2 className="w-3.5 h-3.5" /> Open
                  </a>
                ) : (
                  <span className="text-[#8e8e8e]">Not uploaded</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
        {vendor?.vat_missing_requirements?.length ? (
          <p className="text-xs text-amber-300">Missing: {vendor.vat_missing_requirements.join(', ')}</p>
        ) : null}
        {vendor?.vat_review_notes ? <p className="text-xs text-[#8e8e8e]">Last note: {vendor.vat_review_notes}</p> : null}
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Notes for the vendor (required to reject)"
          className="w-full rounded-lg border border-[#3d3d3d] bg-[#171717] px-3 py-2 text-sm text-[#ececec] placeholder-[#8e8e8e] focus:outline-none focus:ring-2 focus:ring-[#19C37D]"
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => review('approve')} isLoading={busy === 'approve'}
            disabled={Boolean(busy) || Boolean(vendor?.vat_missing_requirements?.length)}>
            Approve VAT
          </Button>
          <Button size="sm" variant="danger" onClick={() => review('reject')} isLoading={busy === 'reject'}
            disabled={Boolean(busy) || status === 'none'}>
            Reject
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-[#3d3d3d] bg-[#2f2f2f] p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[#19C37D]" />
            <h3 className="font-semibold">BisonBook (read-only)</h3>
          </div>
          {!showBooks ? (
            <Button size="sm" variant="outline" onClick={loadBooks}>View books</Button>
          ) : null}
        </div>
        {!showBooks ? (
          <p className="text-sm text-[#8e8e8e]">See this vendor&apos;s stock value, receivables, recent invoices and tax returns.</p>
        ) : booksError ? (
          <p className="text-sm text-red-300">{booksError}</p>
        ) : !books ? (
          <p className="text-sm text-[#8e8e8e]">Loading books...</p>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              <div><p className="text-[#8e8e8e] text-xs">Cash and bank</p><p>{ngn(books.cash_and_bank)}</p></div>
              <div><p className="text-[#8e8e8e] text-xs">Receivable</p><p>{ngn(books.sales.receivable)}</p></div>
              <div><p className="text-[#8e8e8e] text-xs">Stock value</p><p>{ngn(books.inventory.total_value)}</p></div>
              <div><p className="text-[#8e8e8e] text-xs">Net profit (month)</p><p>{ngn(books.month.net_profit)}</p></div>
            </div>
            <div>
              <p className="text-xs text-[#8e8e8e] mb-1">Recent documents</p>
              {books.recent_documents.length ? (
                <ul className="space-y-1">
                  {books.recent_documents.map((doc: any) => (
                    <li key={doc.id} className="flex items-center justify-between gap-2">
                      <span>{doc.number} · {doc.customer_name}</span>
                      <span className="flex items-center gap-2">{ngn(doc.total)} <Pill status={doc.status} /></span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[#8e8e8e]">None yet.</p>}
            </div>
            <div>
              <p className="text-xs text-[#8e8e8e] mb-1">Tax returns</p>
              {books.tax_returns.length ? (
                <ul className="space-y-1">
                  {books.tax_returns.map((row: any) => (
                    <li key={row.id} className="flex items-center justify-between gap-2">
                      <span>{row.label} · {fmtDate(row.period_start)}</span>
                      <span className="flex items-center gap-2">{ngn(row.amount_payable)} <Pill status={row.overdue ? 'overdue' : row.status} /></span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[#8e8e8e]">None prepared yet.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
