'use client'

import { AlertTriangle, CalendarClock } from 'lucide-react'
import { bisonbookAPI } from '@/lib/api'
import type { BisonSection } from './BisonBookShell'
import { Card, ErrorBox, Loading, Pill, SectionTitle, Stat, fmtBytes, fmtDate, ngn, useLoader } from './ui'

export default function OverviewSection({ onNavigate }: { onNavigate: (section: BisonSection) => void }) {
  const { data, error, loading, reload } = useLoader(() => bisonbookAPI.get('/overview'))

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return null

  const storagePct = data.storage.quota_bytes ? Math.min(100, (data.storage.used_bytes / data.storage.quota_bytes) * 100) : 0

  return (
    <div className="space-y-5">
      {!data.can_sell ? (
        <div className="rounded-lg border border-amber-600/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200 flex gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          Your vendor account is not verified yet. You can keep your books, inventory and files, but issuing quotes and invoices unlocks after ProcureX approval.
        </div>
      ) : null}

      {!data.vat.can_charge_vat ? (
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className="w-full text-left rounded-lg border border-[#3d3d3d] bg-[#171717] px-4 py-3 text-sm text-[#b4b4b4] hover:border-[#19C37D]/60"
        >
          <span className="text-[#ececec] font-medium">VAT: </span>
          {data.vat.vat_message}
        </button>
      ) : null}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Cash and bank" value={ngn(data.cash_and_bank)} />
        <Stat
          label="Receivable"
          value={ngn(data.sales.receivable)}
          hint={`${data.sales.open_invoices} open invoice${data.sales.open_invoices === 1 ? '' : 's'}`}
        />
        <Stat
          label="Overdue"
          value={ngn(data.sales.overdue_amount)}
          tone={data.sales.overdue_invoices ? 'bad' : 'default'}
          hint={`${data.sales.overdue_invoices} overdue`}
        />
        <Stat label="Net profit this month" value={ngn(data.month.net_profit)} tone={data.month.net_profit >= 0 ? 'good' : 'bad'}
          hint={`Income ${ngn(data.month.income)} · Expenses ${ngn(data.month.expenses)}`} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Stock value (cost)" value={ngn(data.inventory.total_value)} hint={`${data.inventory.sku_count} products`} />
        <Stat label="Stock value (retail)" value={ngn(data.inventory.total_retail_value)} />
        <Stat
          label="Low / out of stock"
          value={`${data.inventory.low_stock_count} / ${data.inventory.out_of_stock_count}`}
          tone={data.inventory.low_stock_count || data.inventory.out_of_stock_count ? 'warn' : 'default'}
        />
        <Stat label="Open quotes" value={data.sales.open_quotes} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <SectionTitle
            title="Tax deadlines"
            subtitle="Prepared by BisonBook. You file on FIRS TaxPro-Max."
            actions={
              <button type="button" className="text-sm text-[#19C37D] hover:underline" onClick={() => onNavigate('tax')}>
                Open tax
              </button>
            }
          />
          {data.deadlines.length ? (
            <ul className="divide-y divide-[#2f2f2f]">
              {data.deadlines.map((item: any) => (
                <li key={`${item.tax_type}-${item.period_start}`} className="flex items-center justify-between py-2 text-sm">
                  <div className="flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-[#8e8e8e]" />
                    <span className="text-[#ececec]">{item.label}</span>
                    <span className="text-[#8e8e8e]">{item.period_label}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#8e8e8e]">Due {fmtDate(item.due_date)}</span>
                    <Pill status={item.overdue ? 'overdue' : item.status} label={item.overdue ? 'overdue' : undefined} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[#8e8e8e]">No returns due right now.</p>
          )}
        </Card>

        <Card>
          <SectionTitle title="Cloud storage" />
          <p className="text-sm text-[#ececec]">
            {fmtBytes(data.storage.used_bytes)} of {fmtBytes(data.storage.quota_bytes)}
          </p>
          <div className="mt-2 h-2 rounded-full bg-[#3d3d3d]">
            <div className="h-2 rounded-full bg-[#19C37D]" style={{ width: `${storagePct}%` }} />
          </div>
          <button type="button" className="mt-3 text-sm text-[#19C37D] hover:underline" onClick={() => onNavigate('files')}>
            Open files
          </button>
        </Card>
      </div>
    </div>
  )
}
