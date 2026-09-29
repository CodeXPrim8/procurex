'use client'

import { useMemo, useState } from 'react'
import { FileDown, Mail, Plus, Trash2, UserPlus } from 'lucide-react'
import Button from '@/components/ui/Button'
import { bisonbookAPI } from '@/lib/api'
import { vendorCanList } from '@/lib/vendorOnboarding'
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
  todayIso,
  useLoader,
} from './ui'

type Kind = 'invoice' | 'quote'
type Line = { vendor_product_id: number | null; description: string; quantity: string; unit_price: string }

const blankLine = (): Line => ({ vendor_product_id: null, description: '', quantity: '1', unit_price: '' })

function DocumentEditor({
  kind,
  existing,
  vendor,
  onSaved,
}: {
  kind: Kind
  existing?: any
  vendor: any
  onSaved: (doc: any) => void
}) {
  const customers = useLoader(() => bisonbookAPI.get('/customers'))
  const stock = useLoader(() => bisonbookAPI.get('/inventory'))
  const [customerId, setCustomerId] = useState<number | ''>(existing?.customer_id || '')
  const [customer, setCustomer] = useState({
    customer_name: existing?.customer_name || '',
    customer_email: existing?.customer_email || '',
    customer_phone: existing?.customer_phone || '',
    customer_address: existing?.customer_address || '',
    customer_tin: existing?.customer_tin || '',
  })
  const [saveCustomer, setSaveCustomer] = useState(true)
  const [issueDate, setIssueDate] = useState(existing?.issue_date || todayIso())
  const [dueDate, setDueDate] = useState(existing?.due_date || '')
  const [notes, setNotes] = useState(existing?.notes || '')
  const [lines, setLines] = useState<Line[]>(
    existing?.lines?.length
      ? existing.lines.map((l: any) => ({
          vendor_product_id: l.vendor_product_id,
          description: l.description,
          quantity: String(l.quantity),
          unit_price: String(l.unit_price),
        }))
      : [blankLine()],
  )
  const [saving, setSaving] = useState(false)

  const vatRate = vendor?.can_charge_vat ? Number(vendor?.vat_rate || 0) : 0
  const subtotal = lines.reduce((sum, l) => sum + Number(l.quantity || 0) * Number(l.unit_price || 0), 0)
  const vat = Math.round(subtotal * vatRate) / 100
  const products: any[] = stock.data?.items || []

  const setLine = (index: number, patch: Partial<Line>) =>
    setLines((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const pickProduct = (index: number, value: string) => {
    if (!value) {
      setLine(index, { vendor_product_id: null })
      return
    }
    const item = products.find((p) => String(p.vendor_product_id) === value)
    if (item) setLine(index, { vendor_product_id: item.vendor_product_id, description: item.name, unit_price: String(item.price || '') })
  }

  const save = async () => {
    setSaving(true)
    const payload = {
      kind,
      customer_id: customerId || null,
      ...(customerId ? {} : { ...customer, save_customer: saveCustomer }),
      issue_date: issueDate,
      due_date: dueDate || null,
      notes,
      lines: lines
        .filter((l) => l.description.trim() || l.vendor_product_id)
        .map((l) => ({
          vendor_product_id: l.vendor_product_id,
          description: l.description,
          quantity: Number(l.quantity),
          unit_price: Number(l.unit_price),
        })),
    }
    let saved: any = null
    const ok = await attempt(async () => {
      saved = existing
        ? await bisonbookAPI.put(`/sales/${existing.id}`, payload)
        : await bisonbookAPI.post('/sales', payload)
    }, existing ? 'Saved' : `${kind === 'quote' ? 'Quote' : 'Invoice'} draft created`)
    setSaving(false)
    if (ok && saved) onSaved(saved)
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-lg px-3 py-2 text-xs ${vatRate ? 'bg-[#19C37D]/10 text-[#19C37D]' : 'bg-[#2f2f2f] text-[#b4b4b4]'}`}>
        {vatRate
          ? `VAT registered: ${vatRate}% VAT is added automatically.`
          : 'Not VAT registered: this document is issued without VAT. Upload your VAT certificate and tax clearance in Settings to charge VAT.'}
      </div>

      <div>
        <label className={labelClass}>Customer</label>
        <select className={fieldClass} value={customerId} onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}>
          <option value="">New customer</option>
          {(customers.data || []).map((c: any) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      {!customerId ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([
            ['customer_name', 'Name'],
            ['customer_email', 'Email'],
            ['customer_phone', 'Phone'],
            ['customer_tin', 'Customer TIN (optional)'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <label className={labelClass}>{label}</label>
              <input className={fieldClass} value={(customer as any)[key]} onChange={(e) => setCustomer({ ...customer, [key]: e.target.value })} />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className={labelClass}>Address</label>
            <input className={fieldClass} value={customer.customer_address} onChange={(e) => setCustomer({ ...customer, customer_address: e.target.value })} />
          </div>
          <label className="sm:col-span-2 flex items-center gap-2 text-xs text-[#b4b4b4]">
            <input type="checkbox" checked={saveCustomer} onChange={(e) => setSaveCustomer(e.target.checked)} />
            Save to my customers
          </label>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Date</label>
          <input className={fieldClass} type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>{kind === 'quote' ? 'Valid until' : 'Due date'} (optional)</label>
          <input className={fieldClass} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <p className={labelClass}>Items</p>
        {lines.map((line, index) => (
          <div key={index} className="grid grid-cols-12 gap-2 items-end">
            <div className="col-span-12 sm:col-span-4">
              <select className={fieldClass} value={line.vendor_product_id || ''} onChange={(e) => pickProduct(index, e.target.value)}>
                <option value="">Service / other item</option>
                {products.map((p) => (
                  <option key={p.vendor_product_id} value={p.vendor_product_id}>
                    {p.name} ({p.stock_quantity} in stock)
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-12 sm:col-span-4">
              <input className={fieldClass} placeholder="Description" value={line.description} onChange={(e) => setLine(index, { description: e.target.value })} />
            </div>
            <div className="col-span-4 sm:col-span-1">
              <input className={fieldClass} type="number" min={0} placeholder="Qty" value={line.quantity} onChange={(e) => setLine(index, { quantity: e.target.value })} />
            </div>
            <div className="col-span-6 sm:col-span-2">
              <input className={fieldClass} type="number" min={0} placeholder="Unit price" value={line.unit_price} onChange={(e) => setLine(index, { unit_price: e.target.value })} />
            </div>
            <div className="col-span-2 sm:col-span-1 flex justify-end">
              <button type="button" onClick={() => setLines((rows) => (rows.length > 1 ? rows.filter((_, i) => i !== index) : rows))}
                className="p-2 rounded hover:bg-[#3d3d3d]" aria-label="Remove line">
                <Trash2 className="w-4 h-4 text-[#8e8e8e]" />
              </button>
            </div>
          </div>
        ))}
        <button type="button" onClick={() => setLines((rows) => [...rows, blankLine()])} className="inline-flex items-center gap-1 text-sm text-[#19C37D] hover:underline">
          <Plus className="w-4 h-4" /> Add line
        </button>
      </div>

      <div>
        <label className={labelClass}>Notes / payment instructions</label>
        <textarea className={fieldClass} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bank details, delivery terms..." />
      </div>

      <div className="rounded-lg bg-[#171717] border border-[#3d3d3d] p-3 text-sm space-y-1">
        <div className="flex justify-between"><span className="text-[#8e8e8e]">Subtotal</span><span>{ngn(subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-[#8e8e8e]">VAT {vatRate ? `(${vatRate}%)` : '(not registered)'}</span><span>{ngn(vat)}</span></div>
        <div className="flex justify-between font-semibold"><span>Total</span><span>{ngn(subtotal + vat)}</span></div>
      </div>

      <Button type="button" onClick={save} isLoading={saving} className="w-full">
        {existing ? 'Save changes' : `Create ${kind} draft`}
      </Button>
    </div>
  )
}

function PaymentForm({ doc, onDone }: { doc: any; onDone: (doc: any) => void }) {
  const [amount, setAmount] = useState(String(doc.balance_due || ''))
  const [wht, setWht] = useState('')
  const [method, setMethod] = useState('bank')
  const [paidAt, setPaidAt] = useState(todayIso())
  const [reference, setReference] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    let updated: any = null
    const ok = await attempt(async () => {
      updated = await bisonbookAPI.post(`/sales/${doc.id}/payments`, {
        amount: Number(amount), wht_amount: Number(wht || 0), method, paid_at: paidAt, reference,
      })
    }, 'Payment recorded')
    setSaving(false)
    if (ok && updated) onDone(updated)
  }

  return (
    <div className="rounded-lg border border-[#3d3d3d] p-3 space-y-3">
      <p className="text-sm font-medium text-[#ececec]">Record payment</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Amount settled</label>
          <input className={fieldClass} type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label className={labelClass}>WHT deducted by customer</label>
          <input className={fieldClass} type="number" value={wht} onChange={(e) => setWht(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label className={labelClass}>Received into</label>
          <select className={fieldClass} value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="bank">Bank</option>
            <option value="cash">Cash</option>
          </select>
        </div>
        <div>
          <label className={labelClass}>Date</label>
          <input className={fieldClass} type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Reference</label>
          <input className={fieldClass} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transfer ref / receipt no." />
        </div>
      </div>
      <p className="text-[11px] text-[#8e8e8e]">If the customer deducted WHT, include it in the amount settled. BisonBook records it as a tax credit you can use against company income tax.</p>
      <Button type="button" size="sm" onClick={submit} isLoading={saving}>Save payment</Button>
    </div>
  )
}

function DocumentView({ doc, canSell, onChange, onEdit, onClose }: {
  doc: any
  canSell: boolean
  onChange: (doc: any) => void
  onEdit: () => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState('')
  const [showPay, setShowPay] = useState(false)

  const act = async (key: string, fn: () => Promise<any>, message: string) => {
    setBusy(key)
    let result: any = null
    const ok = await attempt(async () => {
      result = await fn()
    }, message)
    setBusy('')
    if (ok && result) onChange(result)
    return ok
  }

  const isInvoice = doc.kind === 'invoice'
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-lg font-semibold text-[#ececec]">{doc.number}</p>
          <p className="text-sm text-[#8e8e8e]">{doc.customer_name} · {fmtDate(doc.issue_date)}</p>
        </div>
        <Pill status={doc.status} />
      </div>

      <Table headers={['Item', 'Qty', 'Price', 'Amount']} align={['left', 'right', 'right', 'right']}>
        {doc.lines.map((line: any) => (
          <tr key={line.id}>
            <td className="px-3 py-2">{line.description}</td>
            <td className="px-3 py-2 text-right">{line.quantity}</td>
            <td className="px-3 py-2 text-right">{ngn(line.unit_price)}</td>
            <td className="px-3 py-2 text-right">{ngn(line.line_total)}</td>
          </tr>
        ))}
      </Table>
      <div className="text-sm space-y-1 ml-auto max-w-xs">
        <div className="flex justify-between"><span className="text-[#8e8e8e]">Subtotal</span><span>{ngn(doc.subtotal)}</span></div>
        <div className="flex justify-between"><span className="text-[#8e8e8e]">VAT {doc.vat_rate ? `(${doc.vat_rate}%)` : '(not registered)'}</span><span>{ngn(doc.vat_amount)}</span></div>
        <div className="flex justify-between font-semibold"><span>Total</span><span>{ngn(doc.total)}</span></div>
        {isInvoice ? (
          <>
            <div className="flex justify-between"><span className="text-[#8e8e8e]">Paid</span><span>{ngn(doc.amount_paid)}</span></div>
            <div className="flex justify-between font-semibold"><span>Balance due</span><span>{ngn(doc.balance_due)}</span></div>
          </>
        ) : null}
      </div>

      {doc.payments?.length ? (
        <div className="text-sm">
          <p className="text-xs text-[#8e8e8e] mb-1">Payments</p>
          {doc.payments.map((p: any) => (
            <p key={p.id} className="text-[#b4b4b4]">
              {fmtDate(p.paid_at)} · {ngn(p.amount)} via {p.method}{p.wht_amount ? ` (WHT ${ngn(p.wht_amount)})` : ''}{p.reference ? ` · ${p.reference}` : ''}
            </p>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => bisonbookAPI.open(`/sales/${doc.id}/pdf`)}>
          <FileDown className="w-4 h-4 mr-1" /> PDF
        </Button>
        {canSell && doc.status !== 'void' ? (
          <Button size="sm" variant="outline" isLoading={busy === 'email'}
            onClick={() => act('email', async () => (await bisonbookAPI.post(`/sales/${doc.id}/email`, {})).document, 'Emailed to customer')}>
            <Mail className="w-4 h-4 mr-1" /> Email
          </Button>
        ) : null}
        {doc.status === 'draft' || (doc.kind === 'quote' && doc.status === 'sent') ? (
          <Button size="sm" variant="outline" onClick={onEdit} disabled={!canSell}>Edit</Button>
        ) : null}
        {isInvoice && doc.status === 'draft' ? (
          <Button size="sm" isLoading={busy === 'issue'} disabled={!canSell}
            onClick={() => act('issue', () => bisonbookAPI.post(`/sales/${doc.id}/issue`), 'Invoice issued and posted to your books')}>
            Issue invoice
          </Button>
        ) : null}
        {!isInvoice && !['converted', 'declined'].includes(doc.status) ? (
          <>
            {doc.status === 'draft' ? (
              <Button size="sm" variant="outline" isLoading={busy === 'sent'}
                onClick={() => act('sent', () => bisonbookAPI.post(`/sales/${doc.id}/status`, { status: 'sent' }), 'Marked as sent')}>
                Mark sent
              </Button>
            ) : null}
            <Button size="sm" variant="outline" isLoading={busy === 'accepted'}
              onClick={() => act('accepted', () => bisonbookAPI.post(`/sales/${doc.id}/status`, { status: 'accepted' }), 'Marked as accepted')}>
              Accepted
            </Button>
            <Button size="sm" variant="outline" isLoading={busy === 'declined'}
              onClick={() => act('declined', () => bisonbookAPI.post(`/sales/${doc.id}/status`, { status: 'declined' }), 'Marked as declined')}>
              Declined
            </Button>
            <Button size="sm" isLoading={busy === 'convert'} disabled={!canSell}
              onClick={() => act('convert', () => bisonbookAPI.post(`/sales/${doc.id}/convert`), 'Invoice draft created from quote')}>
              Convert to invoice
            </Button>
          </>
        ) : null}
        {isInvoice && ['issued', 'partially_paid'].includes(doc.status) ? (
          <>
            <Button size="sm" onClick={() => setShowPay((v) => !v)}>Record payment</Button>
            {!doc.payments?.length ? (
              <Button size="sm" variant="danger" isLoading={busy === 'void'}
                onClick={() => {
                  if (window.confirm(`Void ${doc.number}? A reversing entry will be posted.`)) {
                    void act('void', () => bisonbookAPI.post(`/sales/${doc.id}/void`), 'Invoice voided')
                  }
                }}>
                Void
              </Button>
            ) : null}
          </>
        ) : null}
        {doc.status === 'draft' ? (
          <Button size="sm" variant="ghost" isLoading={busy === 'delete'}
            onClick={async () => {
              if (!window.confirm(`Delete draft ${doc.number}?`)) return
              setBusy('delete')
              const ok = await attempt(() => bisonbookAPI.del(`/sales/${doc.id}`), 'Draft deleted')
              setBusy('')
              if (ok) onClose()
            }}>
            <Trash2 className="w-4 h-4 mr-1" /> Delete
          </Button>
        ) : null}
      </div>

      {showPay ? (
        <PaymentForm
          doc={doc}
          onDone={(updated) => {
            setShowPay(false)
            onChange(updated)
          }}
        />
      ) : null}
    </div>
  )
}

function CustomersPanel() {
  const { data, error, loading, reload } = useLoader(() => bisonbookAPI.get('/customers'))
  const [form, setForm] = useState({ name: '', email: '', phone: '', address: '', tin: '' })
  const [editing, setEditing] = useState<number | null>(null)
  const [open, setOpen] = useState(false)

  const save = async () => {
    const ok = await attempt(
      () => (editing ? bisonbookAPI.put(`/customers/${editing}`, form) : bisonbookAPI.post('/customers', form)),
      'Customer saved',
    )
    if (ok) {
      setOpen(false)
      void reload()
    }
  }

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={reload} />
  return (
    <div className="space-y-3">
      <SectionTitle
        title="Customers"
        actions={
          <Button size="sm" onClick={() => { setEditing(null); setForm({ name: '', email: '', phone: '', address: '', tin: '' }); setOpen(true) }}>
            <UserPlus className="w-4 h-4 mr-1" /> Add customer
          </Button>
        }
      />
      {data?.length ? (
        <Table headers={['Name', 'Email', 'Phone', 'TIN', '']}>
          {data.map((c: any) => (
            <tr key={c.id}>
              <td className="px-3 py-2">{c.name}</td>
              <td className="px-3 py-2 text-[#b4b4b4]">{c.email || '-'}</td>
              <td className="px-3 py-2 text-[#b4b4b4]">{c.phone || '-'}</td>
              <td className="px-3 py-2 text-[#b4b4b4]">{c.tin || '-'}</td>
              <td className="px-3 py-2 text-right">
                <button type="button" className="text-xs text-[#19C37D] hover:underline"
                  onClick={() => { setEditing(c.id); setForm({ name: c.name, email: c.email || '', phone: c.phone || '', address: c.address || '', tin: c.tin || '' }); setOpen(true) }}>
                  Edit
                </button>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty>No customers yet. They are saved automatically when you create quotes and invoices.</Empty>
      )}
      <Modalish open={open} title={editing ? 'Edit customer' : 'New customer'} onClose={() => setOpen(false)}>
        <div className="space-y-3">
          {(['name', 'email', 'phone', 'address', 'tin'] as const).map((key) => (
            <div key={key}>
              <label className={labelClass}>{key === 'tin' ? 'TIN' : key[0].toUpperCase() + key.slice(1)}</label>
              <input className={fieldClass} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
            </div>
          ))}
          <Button type="button" onClick={save} className="w-full">Save</Button>
        </div>
      </Modalish>
    </div>
  )
}

export default function SalesSection({ vendor }: { vendor: any }) {
  const [tab, setTab] = useState<'invoice' | 'quote' | 'customers'>('invoice')
  const [statusFilter, setStatusFilter] = useState('')
  const [editor, setEditor] = useState<{ kind: Kind; existing?: any } | null>(null)
  const [viewing, setViewing] = useState<any>(null)
  const canSell = vendorCanList(vendor)
  const { data, error, loading, reload, setData } = useLoader(
    () => (tab === 'customers' ? Promise.resolve([]) : bisonbookAPI.get('/sales', { kind: tab })),
    [tab],
  )

  const docs = useMemo(() => (data || []).filter((d: any) => !statusFilter || d.status === statusFilter), [data, statusFilter])
  const statuses = tab === 'invoice' ? ['draft', 'issued', 'partially_paid', 'paid', 'void'] : ['draft', 'sent', 'accepted', 'declined', 'converted']

  const upsertDoc = (doc: any) => {
    if (doc.kind !== tab) {
      void reload()
    } else {
      setData((rows: any) => {
        const list = rows || []
        return list.some((r: any) => r.id === doc.id) ? list.map((r: any) => (r.id === doc.id ? doc : r)) : [doc, ...list]
      })
    }
    setViewing(doc)
  }

  return (
    <div className="space-y-4">
      {!canSell ? (
        <div className="rounded-lg border border-amber-600/40 bg-amber-950/20 px-4 py-3 text-sm text-amber-200">
          Quotes and invoices unlock after ProcureX verifies your vendor account. You can still view past documents.
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {([['invoice', 'Invoices'], ['quote', 'Quotes'], ['customers', 'Customers']] as const).map(([value, label]) => (
            <button key={value} type="button" onClick={() => { setTab(value); setStatusFilter('') }}
              className={`rounded-lg px-3 py-2 text-sm ${tab === value ? 'bg-[#19C37D]/15 text-[#19C37D]' : 'text-[#b4b4b4] hover:bg-[#3d3d3d]'}`}>
              {label}
            </button>
          ))}
        </div>
        {tab !== 'customers' ? (
          <div className="flex gap-2">
            <select className={`${fieldClass} w-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {statuses.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            <Button size="sm" disabled={!canSell} onClick={() => setEditor({ kind: tab as Kind })}>
              <Plus className="w-4 h-4 mr-1" /> New {tab}
            </Button>
          </div>
        ) : null}
      </div>

      {tab === 'customers' ? (
        <CustomersPanel />
      ) : loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} onRetry={reload} />
      ) : docs.length ? (
        <Table
          headers={['Number', 'Customer', 'Date', tab === 'invoice' ? 'Due' : 'Valid until', 'Total', tab === 'invoice' ? 'Balance' : '', 'Status']}
          align={['left', 'left', 'left', 'left', 'right', 'right', 'left']}
        >
          {docs.map((doc: any) => (
            <tr key={doc.id} className="cursor-pointer hover:bg-[#2a2a2a]" onClick={() => setViewing(doc)}>
              <td className="px-3 py-2 font-medium">{doc.number}</td>
              <td className="px-3 py-2">{doc.customer_name}</td>
              <td className="px-3 py-2 whitespace-nowrap">{fmtDate(doc.issue_date)}</td>
              <td className="px-3 py-2 whitespace-nowrap">{fmtDate(doc.due_date)}</td>
              <td className="px-3 py-2 text-right">{ngn(doc.total)}</td>
              <td className="px-3 py-2 text-right">{tab === 'invoice' ? ngn(doc.balance_due) : ''}</td>
              <td className="px-3 py-2"><Pill status={doc.status} /></td>
            </tr>
          ))}
        </Table>
      ) : (
        <Card>
          <Empty>No {tab === 'invoice' ? 'invoices' : 'quotes'} yet.</Empty>
        </Card>
      )}

      <Modalish open={Boolean(editor)} title={editor?.existing ? `Edit ${editor.existing.number}` : `New ${editor?.kind}`} onClose={() => setEditor(null)} wide>
        {editor ? (
          <DocumentEditor
            kind={editor.kind}
            existing={editor.existing}
            vendor={vendor}
            onSaved={(doc) => {
              setEditor(null)
              upsertDoc(doc)
            }}
          />
        ) : null}
      </Modalish>
      <Modalish open={Boolean(viewing) && !editor} title={viewing?.kind === 'quote' ? 'Quote' : 'Invoice'} onClose={() => setViewing(null)} wide>
        {viewing ? (
          <DocumentView
            doc={viewing}
            canSell={canSell}
            onChange={upsertDoc}
            onEdit={() => setEditor({ kind: viewing.kind, existing: viewing })}
            onClose={() => {
              setViewing(null)
              void reload()
            }}
          />
        ) : null}
      </Modalish>
    </div>
  )
}
