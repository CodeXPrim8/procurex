'use client'

import { useState } from 'react'
import { ExternalLink, FileDown, Info } from 'lucide-react'
import Button from '@/components/ui/Button'
import { bisonbookAPI } from '@/lib/api'
import { resolveMediaUrl } from '@/lib/media'
import type { BisonSection } from './BisonBookShell'
import {
  Card,
  Empty,
  ErrorBox,
  Loading,
  Modalish,
  Pill,
  SectionTitle,
  Table,
  attempt,
  fieldClass,
  fmtDate,
  labelClass,
  ngn,
  useLoader,
} from './ui'

const TAXPRO_MAX_URL = 'https://taxpromax.firs.gov.ng'

function label(key: string) {
  return key.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

function FigureList({ figures }: { figures: Record<string, any> }) {
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      {Object.entries(figures)
        .filter(([key]) => key !== 'schedule')
        .map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-[#8e8e8e]">{label(key)}</dt>
            <dd className="text-right text-[#ececec]">
              {typeof value === 'number' ? (key.endsWith('rate') ? `${value}%` : ngn(value)) : String(value)}
            </dd>
          </div>
        ))}
    </dl>
  )
}

function FileForm({ row, onDone }: { row: any; onDone: () => void }) {
  const [reference, setReference] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const form = new FormData()
    form.append('reference', reference)
    if (receipt) form.append('receipt', receipt)
    const ok = await attempt(() => bisonbookAPI.upload(`/tax/returns/${row.id}/file`, form), 'Return marked as filed')
    setSaving(false)
    if (ok) onDone()
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[#b4b4b4]">
        File <span className="text-[#ececec]">{row.label}</span> for {fmtDate(row.period_start)} to {fmtDate(row.period_end)} on TaxPro-Max, pay{' '}
        <span className="text-[#ececec]">{ngn(row.amount_payable)}</span>, then record it here.
      </p>
      <a href={TAXPRO_MAX_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-[#19C37D] hover:underline">
        Open TaxPro-Max <ExternalLink className="w-3.5 h-3.5" />
      </a>
      <div>
        <label className={labelClass}>TaxPro-Max reference / payment ref</label>
        <input className={fieldClass} value={reference} onChange={(e) => setReference(e.target.value)} />
      </div>
      <div>
        <label className={labelClass}>Filing or payment receipt</label>
        <input type="file" onChange={(e) => setReceipt(e.target.files?.[0] || null)}
          className="block w-full text-sm text-[#b4b4b4] file:mr-3 file:rounded-lg file:border-0 file:bg-[#3d3d3d] file:px-3 file:py-2 file:text-[#ececec]" />
      </div>
      <Button type="button" onClick={submit} isLoading={saving} disabled={!reference.trim() && !receipt} className="w-full">
        Mark as filed
      </Button>
    </div>
  )
}

export default function TaxSection({ vendor, onNavigate }: { vendor: any; onNavigate: (section: BisonSection) => void }) {
  const calendar = useLoader(() => bisonbookAPI.get('/tax/calendar'))
  const returns = useLoader(() => bisonbookAPI.get('/tax/returns'))
  const [busy, setBusy] = useState('')
  const [viewing, setViewing] = useState<any>(null)
  const [filing, setFiling] = useState<any>(null)
  const now = new Date()
  const [custom, setCustom] = useState({ tax_type: 'wht', year: now.getFullYear(), month: now.getMonth() || 12 })

  const reloadAll = () => {
    void calendar.reload()
    void returns.reload()
  }

  const generate = async (taxType: string, year: number, month: number | null, key: string) => {
    setBusy(key)
    let row: any = null
    const ok = await attempt(async () => {
      row = await bisonbookAPI.post('/tax/returns/generate', { tax_type: taxType, year, month })
    }, 'Return prepared. Review the figures, then file on TaxPro-Max.')
    setBusy('')
    if (ok) {
      reloadAll()
      setViewing(row)
    }
  }

  if (calendar.loading && !calendar.data) return <Loading />
  if (calendar.error) return <ErrorBox message={calendar.error} onRetry={calendar.reload} />

  const items: any[] = calendar.data?.items || []
  const vat = calendar.data?.vat

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-[#3d3d3d] bg-[#171717] px-4 py-3 text-sm text-[#b4b4b4] flex gap-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0 text-[#19C37D]" />
        <span>
          BisonBook prepares your VAT, WHT and company income tax figures from your books and generates ready-to-file PDFs and CSVs.
          FIRS does not allow third-party filing yet, so you submit on TaxPro-Max and mark the return as filed here. VAT and WHT are due on the 21st of the following month.
        </span>
      </div>

      {!vat?.can_charge_vat ? (
        <button type="button" onClick={() => onNavigate('settings')}
          className="w-full text-left rounded-lg border border-amber-600/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
          VAT returns are only prepared for VAT-approved vendors. {vat?.vat_message}
        </button>
      ) : null}

      <Card>
        <SectionTitle title="Deadlines" subtitle="Last six months plus your most recent financial year." />
        {items.length ? (
          <Table headers={['Return', 'Period', 'Due', 'Payable', 'Status', '']} align={['left', 'left', 'left', 'right', 'left', 'right']}>
            {items.map((item) => {
              const key = `${item.tax_type}-${item.period_start}`
              const existing = (returns.data || []).find((r: any) => r.id === item.return_id)
              return (
                <tr key={key}>
                  <td className="px-3 py-2">{item.label}</td>
                  <td className="px-3 py-2">{item.period_label}</td>
                  <td className={`px-3 py-2 whitespace-nowrap ${item.overdue ? 'text-red-300' : item.due_soon ? 'text-amber-300' : ''}`}>{fmtDate(item.due_date)}</td>
                  <td className="px-3 py-2 text-right">{item.amount_payable != null ? ngn(item.amount_payable) : '-'}</td>
                  <td className="px-3 py-2"><Pill status={item.overdue ? 'overdue' : item.status} label={item.overdue ? `overdue · ${item.status.replace('_', ' ')}` : undefined} /></td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {item.status !== 'filed' ? (
                      <button type="button" className="text-xs text-[#19C37D] hover:underline mr-3" disabled={busy === key}
                        onClick={() => generate(item.tax_type, item.year, item.month, key)}>
                        {busy === key ? 'Preparing...' : item.status === 'not_started' ? 'Prepare' : 'Recalculate'}
                      </button>
                    ) : null}
                    {existing ? (
                      <button type="button" className="text-xs text-[#b4b4b4] hover:text-white" onClick={() => setViewing(existing)}>View</button>
                    ) : null}
                  </td>
                </tr>
              )
            })}
          </Table>
        ) : (
          <Empty>No returns due yet.</Empty>
        )}
      </Card>

      <Card>
        <SectionTitle title="Prepare another period" />
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className={labelClass}>Tax</label>
            <select className={fieldClass} value={custom.tax_type} onChange={(e) => setCustom({ ...custom, tax_type: e.target.value })}>
              <option value="vat" disabled={!vat?.can_charge_vat}>VAT</option>
              <option value="wht">WHT</option>
              <option value="cit">Company income tax (annual)</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>{custom.tax_type === 'cit' ? 'Financial year ending in' : 'Year'}</label>
            <input className={fieldClass} type="number" value={custom.year} onChange={(e) => setCustom({ ...custom, year: Number(e.target.value) })} />
          </div>
          {custom.tax_type !== 'cit' ? (
            <div>
              <label className={labelClass}>Month</label>
              <select className={fieldClass} value={custom.month} onChange={(e) => setCustom({ ...custom, month: Number(e.target.value) })}>
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>{new Date(2000, i, 1).toLocaleString('en', { month: 'long' })}</option>
                ))}
              </select>
            </div>
          ) : null}
          <Button size="sm" isLoading={busy === 'custom'}
            onClick={() => generate(custom.tax_type, custom.year, custom.tax_type === 'cit' ? null : custom.month, 'custom')}>
            Prepare return
          </Button>
        </div>
      </Card>

      <Card>
        <SectionTitle title="Prepared returns" />
        {returns.data?.length ? (
          <Table headers={['Return', 'Period', 'Payable', 'Status', 'Filed', '']} align={['left', 'left', 'right', 'left', 'left', 'right']}>
            {returns.data.map((row: any) => (
              <tr key={row.id}>
                <td className="px-3 py-2">{row.label}</td>
                <td className="px-3 py-2 whitespace-nowrap">{fmtDate(row.period_start)} - {fmtDate(row.period_end)}</td>
                <td className="px-3 py-2 text-right">{ngn(row.amount_payable)}</td>
                <td className="px-3 py-2"><Pill status={row.overdue ? 'overdue' : row.status} /></td>
                <td className="px-3 py-2 text-[#b4b4b4]">{row.filed_at ? `${fmtDate(row.filed_at)}${row.filing_reference ? ` · ${row.filing_reference}` : ''}` : '-'}</td>
                <td className="px-3 py-2 text-right"><button type="button" className="text-xs text-[#19C37D] hover:underline" onClick={() => setViewing(row)}>Open</button></td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No returns prepared yet.</Empty>
        )}
      </Card>

      <Modalish open={Boolean(viewing) && !filing} title={viewing ? `${viewing.label} · ${fmtDate(viewing.period_start)} to ${fmtDate(viewing.period_end)}` : ''} onClose={() => setViewing(null)}>
        {viewing ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Pill status={viewing.overdue ? 'overdue' : viewing.status} />
              <span className="text-xs text-[#8e8e8e]">Due {fmtDate(viewing.due_date)}</span>
            </div>
            <FigureList figures={viewing.figures || {}} />
            {viewing.figures?.schedule?.length ? (
              <Table headers={['Date', 'Supplier', 'WHT']} align={['left', 'left', 'right']}>
                {viewing.figures.schedule.map((s: any, i: number) => (
                  <tr key={i}><td className="px-3 py-2">{fmtDate(s.date)}</td><td className="px-3 py-2">{s.supplier}</td><td className="px-3 py-2 text-right">{ngn(s.wht)}</td></tr>
                ))}
              </Table>
            ) : null}
            <div className="flex justify-between rounded-lg bg-[#171717] border border-[#3d3d3d] px-3 py-2 text-sm font-semibold">
              <span>Amount payable</span>
              <span>{ngn(viewing.amount_payable)}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {viewing.pdf_url ? (
                <a href={resolveMediaUrl(viewing.pdf_url)} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline"><FileDown className="w-4 h-4 mr-1" /> PDF</Button>
                </a>
              ) : null}
              {viewing.csv_url ? (
                <a href={resolveMediaUrl(viewing.csv_url)} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline"><FileDown className="w-4 h-4 mr-1" /> CSV</Button>
                </a>
              ) : null}
              {viewing.receipt_url ? (
                <a href={resolveMediaUrl(viewing.receipt_url)} target="_blank" rel="noreferrer">
                  <Button size="sm" variant="outline">Filing receipt</Button>
                </a>
              ) : null}
              {viewing.status === 'ready' ? (
                <Button size="sm" onClick={() => setFiling(viewing)}>Mark as filed</Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modalish>

      <Modalish open={Boolean(filing)} title="Record filing" onClose={() => setFiling(null)}>
        {filing ? (
          <FileForm
            row={filing}
            onDone={() => {
              setFiling(null)
              setViewing(null)
              reloadAll()
            }}
          />
        ) : null}
      </Modalish>
    </div>
  )
}
