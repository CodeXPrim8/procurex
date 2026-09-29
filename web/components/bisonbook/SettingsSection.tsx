'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, FileCheck2, Upload } from 'lucide-react'
import Button from '@/components/ui/Button'
import { bisonbookAPI, vendorsAPI } from '@/lib/api'
import { resolveMediaUrl } from '@/lib/media'
import { vatStatusLabel } from '@/lib/vendorOnboarding'
import { Card, ErrorBox, Loading, Pill, SectionTitle, attempt, fieldClass, fmtDate, labelClass, useLoader } from './ui'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function VatPanel({ vendor, onVendorChange }: { vendor: any; onVendorChange: (vendor: any) => void }) {
  const [tin, setTin] = useState(vendor?.tin || '')
  const [expiry, setExpiry] = useState((vendor?.tax_clearance_expires_at || '').slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState('')

  useEffect(() => {
    setTin(vendor?.tin || '')
    setExpiry((vendor?.tax_clearance_expires_at || '').slice(0, 10))
  }, [vendor?.tin, vendor?.tax_clearance_expires_at])

  const refresh = async () => onVendorChange(await vendorsAPI.getMyVendor())

  const saveDetails = async () => {
    setSaving(true)
    await attempt(async () => {
      onVendorChange(await vendorsAPI.updateVatDetails({ tin, tax_clearance_expires_at: expiry || null }))
    }, 'Tax details saved')
    setSaving(false)
  }

  const upload = async (file: File | undefined, type: 'vat_certificate' | 'tax_clearance') => {
    if (!file) return
    setUploading(type)
    await attempt(async () => {
      const result = await vendorsAPI.uploadDocument(file, type)
      if (result.vendor) onVendorChange(result.vendor)
      else await refresh()
    }, 'Document uploaded')
    setUploading('')
  }

  const requestReview = async () => {
    setSaving(true)
    await attempt(async () => onVendorChange(await vendorsAPI.requestVatReview()), 'Sent to ProcureX for VAT review')
    setSaving(false)
  }

  const docs: Array<{ type: 'vat_certificate' | 'tax_clearance'; label: string; url?: string }> = [
    { type: 'vat_certificate', label: 'VAT registration certificate', url: vendor?.vat_certificate_url },
    { type: 'tax_clearance', label: 'Tax clearance certificate (TCC)', url: vendor?.tax_clearance_url },
  ]
  const missing: string[] = vendor?.vat_missing_requirements || []
  const status = vendor?.vat_status || 'none'

  return (
    <Card>
      <SectionTitle
        title="VAT registration"
        subtitle="Only vendors with an approved VAT certificate and a current tax clearance can charge VAT."
        actions={<Pill status={vendor?.can_charge_vat ? 'approved' : status} label={vatStatusLabel(status, vendor?.can_charge_vat)} />}
      />
      <p className={`text-sm mb-4 ${vendor?.can_charge_vat ? 'text-[#19C37D]' : status === 'rejected' ? 'text-red-300' : 'text-[#b4b4b4]'}`}>
        {vendor?.vat_message}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Tax Identification Number (TIN)</label>
          <input className={fieldClass} value={tin} onChange={(e) => setTin(e.target.value)} placeholder="12345678-0001" />
        </div>
        <div>
          <label className={labelClass}>Tax clearance expiry</label>
          <input className={fieldClass} type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        </div>
      </div>
      <div className="mt-3">
        <Button type="button" size="sm" variant="outline" onClick={saveDetails} isLoading={saving}>
          Save tax details
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-5">
        {docs.map((doc) => (
          <div key={doc.type} className="rounded-lg border border-[#3d3d3d] p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-[#ececec]">
                {doc.url ? <FileCheck2 className="w-4 h-4 text-[#19C37D]" /> : <Upload className="w-4 h-4 text-[#8e8e8e]" />}
                {doc.label}
              </div>
              {doc.url ? (
                <a href={resolveMediaUrl(doc.url)} target="_blank" rel="noreferrer" className="text-xs text-[#19C37D] hover:underline">
                  View
                </a>
              ) : null}
            </div>
            <label className="mt-2 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-[#2f2f2f] px-3 py-1.5 text-xs text-[#ececec] hover:bg-[#3d3d3d]">
              <Upload className="w-3.5 h-3.5" />
              {uploading === doc.type ? 'Uploading...' : doc.url ? 'Replace' : 'Upload'}
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className="hidden"
                disabled={Boolean(uploading)}
                onChange={(e) => {
                  void upload(e.target.files?.[0], doc.type)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        ))}
      </div>

      {missing.length ? (
        <div className="mt-4 text-sm text-[#b4b4b4]">
          <p className="text-[#ececec] font-medium mb-1">Still needed to charge VAT</p>
          <ul className="list-disc pl-5 space-y-0.5">
            {missing.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {vendor?.can_charge_vat ? (
          <span className="inline-flex items-center gap-1 text-sm text-[#19C37D]">
            <CheckCircle2 className="w-4 h-4" /> Charging VAT at {vendor?.vat_rate}%
          </span>
        ) : (
          <Button type="button" size="sm" onClick={requestReview} disabled={missing.length > 0 || status === 'pending'} isLoading={saving}>
            {status === 'pending' ? 'Waiting for ProcureX review' : status === 'rejected' ? 'Resubmit for VAT review' : 'Request VAT approval'}
          </Button>
        )}
        {vendor?.vat_reviewed_at ? (
          <span className="text-xs text-[#8e8e8e]">Last reviewed {fmtDate(vendor.vat_reviewed_at)}</span>
        ) : null}
      </div>
      {vendor?.vat_review_notes && status === 'rejected' ? (
        <p className="mt-3 text-sm text-red-300">ProcureX note: {vendor.vat_review_notes}</p>
      ) : null}
    </Card>
  )
}

function BookSettings() {
  const { data, error, loading, reload, setData } = useLoader(() => bisonbookAPI.get('/settings'))
  const [saving, setSaving] = useState(false)

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return null

  const update = (key: string, value: any) => setData({ ...data, [key]: value })
  const save = async () => {
    setSaving(true)
    await attempt(async () => setData(await bisonbookAPI.put('/settings', data)), 'Settings saved')
    setSaving(false)
  }

  return (
    <Card>
      <SectionTitle title="BisonBook settings" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Low-stock alert at</label>
          <input className={fieldClass} type="number" min={0} value={data.low_stock_threshold ?? 0}
            onChange={(e) => update('low_stock_threshold', Number(e.target.value))} />
        </div>
        <div>
          <label className={labelClass}>Invoice payment terms (days)</label>
          <input className={fieldClass} type="number" min={0} value={data.payment_terms_days ?? 14}
            onChange={(e) => update('payment_terms_days', Number(e.target.value))} />
        </div>
        <div>
          <label className={labelClass}>Quotes valid for (days)</label>
          <input className={fieldClass} type="number" min={1} value={data.quote_valid_days ?? 30}
            onChange={(e) => update('quote_valid_days', Number(e.target.value))} />
        </div>
        <div>
          <label className={labelClass}>Financial year ends</label>
          <select className={fieldClass} value={data.financial_year_end_month ?? 12}
            onChange={(e) => update('financial_year_end_month', Number(e.target.value))}>
            {MONTHS.map((month, index) => (
              <option key={month} value={index + 1}>{month}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Books locked through</label>
          <input className={fieldClass} type="date" value={data.locked_through || ''}
            onChange={(e) => update('locked_through', e.target.value || null)} />
          <p className="text-[11px] text-[#8e8e8e] mt-1">No entries can be posted on or before this date.</p>
        </div>
      </div>
      <div className="mt-4">
        <Button type="button" size="sm" onClick={save} isLoading={saving}>Save settings</Button>
      </div>
    </Card>
  )
}

export default function SettingsSection({ vendor, onVendorChange }: { vendor: any; onVendorChange: (vendor: any) => void }) {
  return (
    <div className="space-y-4">
      <VatPanel vendor={vendor} onVendorChange={onVendorChange} />
      <BookSettings />
    </div>
  )
}
