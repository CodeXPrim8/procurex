'use client'

import { useMemo, useState } from 'react'
import { ArrowDownCircle, ArrowUpCircle, History, SlidersHorizontal } from 'lucide-react'
import Button from '@/components/ui/Button'
import { bisonbookAPI } from '@/lib/api'
import { resolveMediaUrl } from '@/lib/media'
import {
  Empty,
  ErrorBox,
  Loading,
  Modalish,
  Pill,
  SectionTitle,
  Stat,
  Table,
  attempt,
  fieldClass,
  fmtDate,
  labelClass,
  ngn,
  useLoader,
} from './ui'

type MovementKind = 'in' | 'out' | 'adjust' | 'return'

const KIND_LABEL: Record<string, string> = {
  opening: 'Opening',
  in: 'Restock',
  out: 'Removed',
  adjust: 'Adjustment',
  sale: 'Sale',
  return: 'Customer return',
}

function MovementForm({ item, onDone }: { item: any; onDone: () => void }) {
  const [kind, setKind] = useState<MovementKind>('in')
  const [quantity, setQuantity] = useState('')
  const [unitCost, setUnitCost] = useState(item?.unit_cost ? String(item.unit_cost) : '')
  const [paidVia, setPaidVia] = useState('bank')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    const ok = await attempt(
      () =>
        bisonbookAPI.post(`/inventory/${item.vendor_product_id}/movements`, {
          movement_type: kind,
          quantity: Number(quantity),
          unit_cost: kind === 'in' || (kind === 'adjust' && Number(quantity) > 0) ? unitCost || null : null,
          paid_via: paidVia,
          reference,
          note,
        }),
      'Stock updated',
    )
    setSaving(false)
    if (ok) onDone()
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-[#b4b4b4]">
        <span className="text-[#ececec] font-medium">{item.name}</span> · {item.stock_quantity} in stock
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {(['in', 'out', 'adjust', 'return'] as MovementKind[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            className={`rounded-lg border px-2 py-2 text-xs ${kind === value ? 'border-[#19C37D] bg-[#19C37D]/10 text-white' : 'border-[#3d3d3d] text-[#b4b4b4]'}`}
          >
            {KIND_LABEL[value]}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>{kind === 'adjust' ? 'Change (+ or -)' : 'Quantity'}</label>
          <input className={fieldClass} type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>
        {kind === 'in' || kind === 'adjust' ? (
          <div>
            <label className={labelClass}>Unit cost (NGN)</label>
            <input className={fieldClass} type="number" min={0} value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
          </div>
        ) : null}
        {kind === 'in' ? (
          <div>
            <label className={labelClass}>Paid from</label>
            <select className={fieldClass} value={paidVia} onChange={(e) => setPaidVia(e.target.value)}>
              <option value="bank">Bank</option>
              <option value="cash">Cash</option>
              <option value="payable">On credit (supplier)</option>
            </select>
          </div>
        ) : null}
        <div>
          <label className={labelClass}>Reference</label>
          <input className={fieldClass} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="PO / waybill no." />
        </div>
      </div>
      <div>
        <label className={labelClass}>Note</label>
        <input className={fieldClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'out' ? 'Damaged, sample, internal use...' : ''} />
      </div>
      <p className="text-[11px] text-[#8e8e8e]">
        BisonBook posts the matching journal entry: restocks debit Inventory, removals and write-downs are expensed at average cost.
      </p>
      <Button type="button" onClick={submit} isLoading={saving} disabled={!Number(quantity)} className="w-full">
        Save movement
      </Button>
    </div>
  )
}

function HistoryPanel({ item }: { item: any }) {
  const { data, error, loading } = useLoader(
    () => bisonbookAPI.get('/inventory/movements', { vendor_product_id: item.vendor_product_id }),
    [item.vendor_product_id],
  )
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox message={error} />
  if (!data?.length) return <Empty>No stock movements yet.</Empty>
  return (
    <Table headers={['Date', 'Type', 'Qty', 'Unit cost', 'Reference']} align={['left', 'left', 'right', 'right', 'left']}>
      {data.map((move: any) => (
        <tr key={move.id}>
          <td className="px-3 py-2 whitespace-nowrap">{fmtDate(move.created_at)}</td>
          <td className="px-3 py-2">{KIND_LABEL[move.movement_type] || move.movement_type}</td>
          <td className={`px-3 py-2 text-right ${move.quantity < 0 ? 'text-red-300' : 'text-[#19C37D]'}`}>
            {move.quantity > 0 ? `+${move.quantity}` : move.quantity}
          </td>
          <td className="px-3 py-2 text-right">{move.unit_cost != null ? ngn(move.unit_cost) : '-'}</td>
          <td className="px-3 py-2 text-[#b4b4b4]">{move.reference || move.note || '-'}</td>
        </tr>
      ))}
    </Table>
  )
}

export default function InventorySection() {
  const [method, setMethod] = useState<'average' | 'fifo'>('average')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'low' | 'out'>('all')
  const [moving, setMoving] = useState<any>(null)
  const [history, setHistory] = useState<any>(null)
  const { data, error, loading, reload } = useLoader(() => bisonbookAPI.get('/inventory', { method }), [method])

  const items = useMemo(() => {
    const rows: any[] = data?.items || []
    const needle = query.trim().toLowerCase()
    return rows.filter((item) => {
      if (filter === 'low' && !(item.low_stock && !item.out_of_stock)) return false
      if (filter === 'out' && !item.out_of_stock) return false
      return !needle || `${item.name} ${item.sku || ''} ${item.category || ''}`.toLowerCase().includes(needle)
    })
  }, [data, query, filter])

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  if (!data) return null

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Stock value (cost)" value={ngn(data.total_value)} hint={method === 'fifo' ? 'FIFO valuation' : 'Weighted average cost'} />
        <Stat label="Retail value" value={ngn(data.total_retail_value)} />
        <Stat label="Low stock" value={data.low_stock_count} tone={data.low_stock_count ? 'warn' : 'default'} hint={`At or below ${data.low_stock_threshold}`} />
        <Stat label="Out of stock" value={data.out_of_stock_count} tone={data.out_of_stock_count ? 'bad' : 'default'} />
      </div>

      <SectionTitle
        title="Inventory"
        subtitle="Every stock change is a movement, so your stock count, valuation and books always agree."
        actions={
          <select className={`${fieldClass} w-auto`} value={method} onChange={(e) => setMethod(e.target.value as any)}>
            <option value="average">Average cost</option>
            <option value="fifo">FIFO</option>
          </select>
        }
      />

      <div className="flex flex-col sm:flex-row gap-2">
        <input className={fieldClass} placeholder="Search products" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="flex gap-1">
          {(['all', 'low', 'out'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-lg px-3 py-2 text-xs whitespace-nowrap ${filter === value ? 'bg-[#19C37D]/15 text-[#19C37D]' : 'text-[#b4b4b4] hover:bg-[#3d3d3d]'}`}
            >
              {value === 'all' ? 'All' : value === 'low' ? 'Low stock' : 'Out of stock'}
            </button>
          ))}
        </div>
      </div>

      {items.length ? (
        <Table
          headers={['Product', 'In stock', 'Avg cost', 'Price', 'Value', '']}
          align={['left', 'right', 'right', 'right', 'right', 'right']}
        >
          {items.map((item: any) => (
            <tr key={item.vendor_product_id}>
              <td className="px-3 py-2">
                <div className="flex items-center gap-3">
                  {item.image_url ? (
                    <img src={resolveMediaUrl(item.image_url)} alt="" className="h-9 w-9 rounded object-cover bg-[#2f2f2f]" />
                  ) : (
                    <div className="h-9 w-9 rounded bg-[#2f2f2f]" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate max-w-[220px]">{item.name}</p>
                    <p className="text-[11px] text-[#8e8e8e]">{item.sku || item.category}</p>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <span className="mr-2">{item.stock_quantity}</span>
                {item.out_of_stock ? <Pill status="void" label="out" /> : item.low_stock ? <Pill status="pending" label="low" /> : null}
              </td>
              <td className="px-3 py-2 text-right">{item.average_cost ? ngn(item.average_cost) : <span className="text-[#8e8e8e]">set cost</span>}</td>
              <td className="px-3 py-2 text-right">{item.price_mode === 'contact' ? <span className="text-[#8e8e8e]">on request</span> : ngn(item.price)}</td>
              <td className="px-3 py-2 text-right">{ngn(item.value)}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <button type="button" title="Restock / adjust" onClick={() => setMoving(item)} className="p-1.5 rounded hover:bg-[#3d3d3d]">
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
                <button type="button" title="Movement history" onClick={() => setHistory(item)} className="p-1.5 rounded hover:bg-[#3d3d3d]">
                  <History className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty>
          {data.items.length ? 'No products match this filter.' : 'Add products in the Products tab and they will appear here with stock tracking.'}
        </Empty>
      )}

      <div className="flex items-center gap-4 text-[11px] text-[#8e8e8e]">
        <span className="inline-flex items-center gap-1"><ArrowUpCircle className="w-3.5 h-3.5 text-[#19C37D]" /> Restocks add cost to Inventory</span>
        <span className="inline-flex items-center gap-1"><ArrowDownCircle className="w-3.5 h-3.5 text-red-300" /> Sales move cost to COGS when an invoice is paid</span>
      </div>

      <Modalish open={Boolean(moving)} title="Stock movement" onClose={() => setMoving(null)}>
        {moving ? (
          <MovementForm
            item={moving}
            onDone={() => {
              setMoving(null)
              void reload()
            }}
          />
        ) : null}
      </Modalish>
      <Modalish open={Boolean(history)} title={history ? `History: ${history.name}` : 'History'} onClose={() => setHistory(null)} wide>
        {history ? <HistoryPanel item={history} /> : null}
      </Modalish>
    </div>
  )
}
