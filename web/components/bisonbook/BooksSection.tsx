'use client'

import { useState } from 'react'
import { FileDown, Paperclip, Plus, RotateCcw, Trash2 } from 'lucide-react'
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
  Table,
  attempt,
  fieldClass,
  fmtDate,
  labelClass,
  ngn,
  todayIso,
  useLoader,
} from './ui'

type BooksTab = 'reports' | 'expenses' | 'journal' | 'accounts'

const TYPE_ORDER = ['asset', 'liability', 'equity', 'income', 'expense']

function AccountsPanel() {
  const { data, error, loading, reload } = useLoader(() => bisonbookAPI.get('/accounts'))
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ code: '', name: '', account_type: 'expense' })

  if (loading && !data) return <Loading />
  if (error) return <ErrorBox message={error} onRetry={reload} />

  const save = async () => {
    const ok = await attempt(() => bisonbookAPI.post('/accounts', form), 'Account added')
    if (ok) {
      setOpen(false)
      setForm({ code: '', name: '', account_type: 'expense' })
      void reload()
    }
  }

  return (
    <div className="space-y-3">
      <SectionTitle
        title="Chart of accounts"
        subtitle="Seeded with Nigerian SME defaults. Add your own categories as you need them."
        actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add account</Button>}
      />
      {TYPE_ORDER.map((type) => {
        const rows = (data || []).filter((a: any) => a.account_type === type)
        if (!rows.length) return null
        return (
          <div key={type}>
            <p className="text-xs uppercase tracking-wide text-[#8e8e8e] mb-1">{type}</p>
            <Table headers={['Code', 'Account', 'Balance']} align={['left', 'left', 'right']}>
              {rows.map((a: any) => (
                <tr key={a.id}>
                  <td className="px-3 py-2 w-20 text-[#8e8e8e]">{a.code}</td>
                  <td className="px-3 py-2">{a.name}</td>
                  <td className="px-3 py-2 text-right">{ngn(a.balance)}</td>
                </tr>
              ))}
            </Table>
          </div>
        )
      })}
      <Modalish open={open} title="New account" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <div>
            <label className={labelClass}>Code (4 digits)</label>
            <input className={fieldClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="6150" />
          </div>
          <div>
            <label className={labelClass}>Name</label>
            <input className={fieldClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className={labelClass}>Type</label>
            <select className={fieldClass} value={form.account_type} onChange={(e) => setForm({ ...form, account_type: e.target.value })}>
              {TYPE_ORDER.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <Button type="button" onClick={save} className="w-full">Save account</Button>
        </div>
      </Modalish>
    </div>
  )
}

function ManualEntryForm({ accounts, onDone }: { accounts: any[]; onDone: () => void }) {
  const [date, setDate] = useState(todayIso())
  const [memo, setMemo] = useState('')
  const [lines, setLines] = useState([
    { account_id: '', debit: '', credit: '', description: '' },
    { account_id: '', debit: '', credit: '', description: '' },
  ])
  const debits = lines.reduce((s, l) => s + Number(l.debit || 0), 0)
  const credits = lines.reduce((s, l) => s + Number(l.credit || 0), 0)
  const balanced = debits > 0 && Math.abs(debits - credits) < 0.005

  const setLine = (index: number, patch: any) => setLines((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)))

  const save = async () => {
    const ok = await attempt(
      () => bisonbookAPI.post('/journal', {
        date, memo,
        lines: lines.filter((l) => l.account_id).map((l) => ({ ...l, account_id: Number(l.account_id) })),
      }),
      'Journal entry posted',
    )
    if (ok) onDone()
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Date</label>
          <input className={fieldClass} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className={labelClass}>Memo</label>
          <input className={fieldClass} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. Owner capital injection" />
        </div>
      </div>
      {lines.map((line, index) => (
        <div key={index} className="grid grid-cols-12 gap-2">
          <select className={`${fieldClass} col-span-12 sm:col-span-5`} value={line.account_id} onChange={(e) => setLine(index, { account_id: e.target.value })}>
            <option value="">Account</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
          </select>
          <input className={`${fieldClass} col-span-5 sm:col-span-3`} type="number" placeholder="Debit" value={line.debit}
            onChange={(e) => setLine(index, { debit: e.target.value, credit: e.target.value ? '' : line.credit })} />
          <input className={`${fieldClass} col-span-5 sm:col-span-3`} type="number" placeholder="Credit" value={line.credit}
            onChange={(e) => setLine(index, { credit: e.target.value, debit: e.target.value ? '' : line.debit })} />
          <button type="button" className="col-span-2 sm:col-span-1 p-2 rounded hover:bg-[#3d3d3d]" aria-label="Remove line"
            onClick={() => setLines((rows) => (rows.length > 2 ? rows.filter((_, i) => i !== index) : rows))}>
            <Trash2 className="w-4 h-4 text-[#8e8e8e]" />
          </button>
        </div>
      ))}
      <button type="button" className="text-sm text-[#19C37D] hover:underline"
        onClick={() => setLines((rows) => [...rows, { account_id: '', debit: '', credit: '', description: '' }])}>
        + Add line
      </button>
      <div className={`text-sm ${balanced ? 'text-[#19C37D]' : 'text-amber-300'}`}>
        Debits {ngn(debits)} · Credits {ngn(credits)} {balanced ? '· Balanced' : '· Must balance'}
      </div>
      <Button type="button" onClick={save} disabled={!balanced} className="w-full">Post entry</Button>
    </div>
  )
}

function JournalPanel() {
  const journal = useLoader(() => bisonbookAPI.get('/journal', { limit: 200 }))
  const accounts = useLoader(() => bisonbookAPI.get('/accounts'))
  const [open, setOpen] = useState(false)

  if (journal.loading && !journal.data) return <Loading />
  if (journal.error) return <ErrorBox message={journal.error} onRetry={journal.reload} />

  const reverse = async (entry: any) => {
    if (!window.confirm(`Reverse entry #${entry.id}?`)) return
    const ok = await attempt(() => bisonbookAPI.post(`/journal/${entry.id}/reverse`), 'Reversing entry posted')
    if (ok) void journal.reload()
  }

  return (
    <div className="space-y-3">
      <SectionTitle
        title="General journal"
        subtitle="Invoices, payments, stock and expenses post here automatically. Use manual entries for capital, loans and corrections."
        actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" /> Manual entry</Button>}
      />
      {journal.data?.length ? (
        <div className="space-y-2">
          {journal.data.map((entry: any) => (
            <div key={entry.id} className="rounded-lg border border-[#3d3d3d] bg-[#171717] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-[#8e8e8e]">#{entry.id}</span>
                  <span className="text-[#ececec]">{entry.memo}</span>
                  <Pill status={entry.source_type === 'reversal' ? 'void' : 'draft'} label={entry.source_type} />
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-[#8e8e8e]">{fmtDate(entry.date)}</span>
                  {entry.source_type === 'manual' ? (
                    <button type="button" onClick={() => reverse(entry)} className="text-xs text-[#b4b4b4] hover:text-white inline-flex items-center gap-1">
                      <RotateCcw className="w-3 h-3" /> Reverse
                    </button>
                  ) : null}
                </div>
              </div>
              <table className="mt-2 w-full text-xs">
                <tbody>
                  {entry.lines.map((line: any, index: number) => (
                    <tr key={index} className="text-[#b4b4b4]">
                      <td className={`py-0.5 ${line.credit ? 'pl-6' : ''}`}>{line.account_code} {line.account_name}</td>
                      <td className="py-0.5 text-right w-32">{line.debit ? ngn(line.debit) : ''}</td>
                      <td className="py-0.5 text-right w-32">{line.credit ? ngn(line.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      ) : (
        <Empty>No journal entries yet. Issue an invoice, record stock or add an expense to get started.</Empty>
      )}
      <Modalish open={open} title="Manual journal entry" onClose={() => setOpen(false)} wide>
        <ManualEntryForm
          accounts={accounts.data || []}
          onDone={() => {
            setOpen(false)
            void journal.reload()
          }}
        />
      </Modalish>
    </div>
  )
}

function ExpensesPanel({ vendor }: { vendor: any }) {
  const expenses = useLoader(() => bisonbookAPI.get('/expenses'))
  const accounts = useLoader(() => bisonbookAPI.get('/accounts'))
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    expense_date: todayIso(), account_id: '', supplier: '', description: '', amount: '', vat_amount: '', wht_amount: '', paid_via: 'bank',
  })
  const [receipt, setReceipt] = useState<File | null>(null)
  const expenseAccounts = (accounts.data || []).filter((a: any) => a.account_type === 'expense' && a.system_key !== 'cogs')

  const save = async () => {
    let created: any = null
    const ok = await attempt(async () => {
      created = await bisonbookAPI.post('/expenses', {
        ...form,
        account_id: Number(form.account_id),
        amount: Number(form.amount),
        vat_amount: Number(form.vat_amount || 0),
        wht_amount: Number(form.wht_amount || 0),
      })
      if (receipt && created?.id) {
        const data = new FormData()
        data.append('file', receipt)
        await bisonbookAPI.upload(`/expenses/${created.id}/receipt`, data)
      }
    }, 'Expense recorded')
    if (ok) {
      setOpen(false)
      setReceipt(null)
      setForm({ ...form, supplier: '', description: '', amount: '', vat_amount: '', wht_amount: '' })
      void expenses.reload()
    }
  }

  const attach = async (row: any, file?: File) => {
    if (!file) return
    const data = new FormData()
    data.append('file', file)
    const ok = await attempt(() => bisonbookAPI.upload(`/expenses/${row.id}/receipt`, data), 'Receipt attached')
    if (ok) void expenses.reload()
  }

  if (expenses.loading && !expenses.data) return <Loading />
  if (expenses.error) return <ErrorBox message={expenses.error} onRetry={expenses.reload} />

  return (
    <div className="space-y-3">
      <SectionTitle
        title="Expenses and supplier bills"
        subtitle={vendor?.can_charge_vat ? 'Input VAT on expenses is recoverable and reduces your VAT return.' : 'You are not VAT registered, so VAT paid on expenses is part of the cost.'}
        actions={<Button size="sm" onClick={() => setOpen(true)}><Plus className="w-4 h-4 mr-1" /> Add expense</Button>}
      />
      {expenses.data?.length ? (
        <Table headers={['Date', 'Category', 'Supplier', 'Total', 'VAT', 'WHT', 'Status', '']} align={['left', 'left', 'left', 'right', 'right', 'right', 'left', 'right']}>
          {expenses.data.map((row: any) => (
            <tr key={row.id}>
              <td className="px-3 py-2 whitespace-nowrap">{fmtDate(row.expense_date)}</td>
              <td className="px-3 py-2">{row.account_name}</td>
              <td className="px-3 py-2">{row.supplier || row.description || '-'}</td>
              <td className="px-3 py-2 text-right">{ngn(row.total)}</td>
              <td className="px-3 py-2 text-right">{row.vat_amount ? ngn(row.vat_amount) : '-'}</td>
              <td className="px-3 py-2 text-right">{row.wht_amount ? ngn(row.wht_amount) : '-'}</td>
              <td className="px-3 py-2"><Pill status={row.status} /></td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                {row.receipt_url ? (
                  <a href={resolveMediaUrl(row.receipt_url)} target="_blank" rel="noreferrer" className="text-xs text-[#19C37D] mr-2">Receipt</a>
                ) : (
                  <label className="text-xs text-[#b4b4b4] mr-2 cursor-pointer inline-flex items-center gap-1">
                    <Paperclip className="w-3 h-3" /> Attach
                    <input type="file" className="hidden" onChange={(e) => { void attach(row, e.target.files?.[0]); e.target.value = '' }} />
                  </label>
                )}
                {row.status === 'unpaid' ? (
                  <button type="button" className="text-xs text-[#19C37D] mr-2"
                    onClick={async () => { if (await attempt(() => bisonbookAPI.post(`/expenses/${row.id}/pay`, { method: 'bank' }), 'Marked as paid')) void expenses.reload() }}>
                    Pay
                  </button>
                ) : null}
                <button type="button" className="text-xs text-[#8e8e8e] hover:text-red-300"
                  onClick={async () => {
                    if (!window.confirm('Delete this expense? A reversing entry will be posted.')) return
                    if (await attempt(() => bisonbookAPI.del(`/expenses/${row.id}`), 'Expense deleted')) void expenses.reload()
                  }}>
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </Table>
      ) : (
        <Empty>No expenses yet.</Empty>
      )}

      <Modalish open={open} title="New expense" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Date</label>
              <input className={fieldClass} type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <select className={fieldClass} value={form.account_id} onChange={(e) => setForm({ ...form, account_id: e.target.value })}>
                <option value="">Choose</option>
                {expenseAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Supplier</label>
              <input className={fieldClass} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Description</label>
              <input className={fieldClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Amount before VAT</label>
              <input className={fieldClass} type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>VAT on bill</label>
              <input className={fieldClass} type="number" value={form.vat_amount} onChange={(e) => setForm({ ...form, vat_amount: e.target.value })} placeholder="0" />
            </div>
            <div>
              <label className={labelClass}>WHT you withheld</label>
              <input className={fieldClass} type="number" value={form.wht_amount} onChange={(e) => setForm({ ...form, wht_amount: e.target.value })} placeholder="0" />
            </div>
            <div>
              <label className={labelClass}>Paid via</label>
              <select className={fieldClass} value={form.paid_via} onChange={(e) => setForm({ ...form, paid_via: e.target.value })}>
                <option value="bank">Bank</option>
                <option value="cash">Cash</option>
                <option value="payable">Not paid yet (bill)</option>
              </select>
            </div>
          </div>
          <div>
            <label className={labelClass}>Receipt (optional)</label>
            <input type="file" onChange={(e) => setReceipt(e.target.files?.[0] || null)}
              className="block w-full text-sm text-[#b4b4b4] file:mr-3 file:rounded-lg file:border-0 file:bg-[#3d3d3d] file:px-3 file:py-2 file:text-[#ececec]" />
          </div>
          <p className="text-[11px] text-[#8e8e8e]">WHT you withheld from a supplier (rent, professional fees, contracts) must be remitted to FIRS. It appears on your WHT return.</p>
          <Button type="button" onClick={save} className="w-full" disabled={!form.account_id || !Number(form.amount)}>Save expense</Button>
        </div>
      </Modalish>
    </div>
  )
}

const REPORTS = [
  { id: 'profit-loss', label: 'Profit and loss', range: true },
  { id: 'balance-sheet', label: 'Balance sheet', range: false },
  { id: 'trial-balance', label: 'Trial balance', range: false },
  { id: 'ar-aging', label: 'Receivables aging', range: false },
  { id: 'ap-aging', label: 'Payables aging', range: false },
  { id: 'general-ledger', label: 'General ledger', range: true },
]

function ReportBody({ name, data }: { name: string; data: any }) {
  if (name === 'profit-loss') {
    return (
      <div className="space-y-3 text-sm">
        <Table headers={['Income', 'Amount']} align={['left', 'right']}>
          {data.income.map((i: any) => <tr key={i.code}><td className="px-3 py-2">{i.name}</td><td className="px-3 py-2 text-right">{ngn(i.amount)}</td></tr>)}
          <tr className="font-semibold"><td className="px-3 py-2">Total income</td><td className="px-3 py-2 text-right">{ngn(data.total_income)}</td></tr>
        </Table>
        <Table headers={['Expenses', 'Amount']} align={['left', 'right']}>
          {data.expenses.map((i: any) => <tr key={i.code}><td className="px-3 py-2">{i.name}</td><td className="px-3 py-2 text-right">{ngn(i.amount)}</td></tr>)}
          <tr className="font-semibold"><td className="px-3 py-2">Total expenses</td><td className="px-3 py-2 text-right">{ngn(data.total_expenses)}</td></tr>
        </Table>
        <div className="flex justify-between rounded-lg bg-[#171717] border border-[#3d3d3d] px-3 py-2">
          <span>Gross profit {ngn(data.gross_profit)}</span>
          <span className={`font-semibold ${data.net_profit >= 0 ? 'text-[#19C37D]' : 'text-red-300'}`}>Net profit {ngn(data.net_profit)}</span>
        </div>
      </div>
    )
  }
  if (name === 'balance-sheet') {
    const section = (title: string, rows: any[], total: number) => (
      <Table headers={[title, 'Amount']} align={['left', 'right']}>
        {rows.map((r: any) => <tr key={r.name}><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2 text-right">{ngn(r.amount)}</td></tr>)}
        <tr className="font-semibold"><td className="px-3 py-2">Total</td><td className="px-3 py-2 text-right">{ngn(total)}</td></tr>
      </Table>
    )
    return (
      <div className="space-y-3 text-sm">
        {section('Assets', data.assets, data.total_assets)}
        {section('Liabilities', data.liabilities, data.total_liabilities)}
        {section('Equity', data.equity, data.total_equity)}
        <p className={data.balanced ? 'text-[#19C37D]' : 'text-red-300'}>{data.balanced ? 'Balanced: assets = liabilities + equity' : 'Out of balance'}</p>
      </div>
    )
  }
  if (name === 'trial-balance') {
    return (
      <Table headers={['Code', 'Account', 'Debit', 'Credit']} align={['left', 'left', 'right', 'right']}>
        {data.rows.map((r: any) => (
          <tr key={r.code}><td className="px-3 py-2 text-[#8e8e8e]">{r.code}</td><td className="px-3 py-2">{r.name}</td>
            <td className="px-3 py-2 text-right">{r.debit ? ngn(r.debit) : ''}</td><td className="px-3 py-2 text-right">{r.credit ? ngn(r.credit) : ''}</td></tr>
        ))}
        <tr className="font-semibold"><td /><td className="px-3 py-2">Total</td><td className="px-3 py-2 text-right">{ngn(data.total_debit)}</td><td className="px-3 py-2 text-right">{ngn(data.total_credit)}</td></tr>
      </Table>
    )
  }
  if (name === 'ar-aging' || name === 'ap-aging') {
    const labels: Record<string, string> = { current: 'Current', '1_30': '1-30 days', '31_60': '31-60', '61_90': '61-90', over_90: '90+' }
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-5 gap-2 text-center text-xs">
          {Object.entries(data.buckets).map(([key, value]) => (
            <div key={key} className="rounded-lg bg-[#171717] border border-[#3d3d3d] p-2">
              <p className="text-[#8e8e8e]">{labels[key]}</p>
              <p className="text-sm text-[#ececec]">{ngn(value as number)}</p>
            </div>
          ))}
        </div>
        {data.rows.length ? (
          <Table headers={['Ref', 'Party', 'Due', 'Days overdue', 'Outstanding']} align={['left', 'left', 'left', 'right', 'right']}>
            {data.rows.map((r: any) => (
              <tr key={r.number}><td className="px-3 py-2">{r.number}</td><td className="px-3 py-2">{r.party}</td><td className="px-3 py-2">{fmtDate(r.due_date)}</td>
                <td className="px-3 py-2 text-right">{r.days_overdue}</td><td className="px-3 py-2 text-right">{ngn(r.outstanding)}</td></tr>
            ))}
          </Table>
        ) : <Empty>Nothing outstanding.</Empty>}
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-sm text-[#b4b4b4]">Opening balance {ngn(data.opening_balance)} · Closing balance {ngn(data.closing_balance)}</p>
      {data.rows.length ? (
        <Table headers={['Date', 'Memo', 'Debit', 'Credit', 'Balance']} align={['left', 'left', 'right', 'right', 'right']}>
          {data.rows.map((r: any, i: number) => (
            <tr key={i}><td className="px-3 py-2 whitespace-nowrap">{fmtDate(r.date)}</td><td className="px-3 py-2">{r.memo}</td>
              <td className="px-3 py-2 text-right">{r.debit ? ngn(r.debit) : ''}</td><td className="px-3 py-2 text-right">{r.credit ? ngn(r.credit) : ''}</td>
              <td className="px-3 py-2 text-right">{ngn(r.balance)}</td></tr>
          ))}
        </Table>
      ) : <Empty>No activity in this period.</Empty>}
    </div>
  )
}

function ReportsPanel() {
  const now = new Date()
  const [name, setName] = useState('profit-loss')
  const [start, setStart] = useState(`${now.getFullYear()}-01-01`)
  const [end, setEnd] = useState(todayIso())
  const [accountId, setAccountId] = useState('')
  const accounts = useLoader(() => bisonbookAPI.get('/accounts'))
  const meta = REPORTS.find((r) => r.id === name)!
  const params = () => ({
    ...(meta.range ? { start } : {}),
    end,
    ...(name === 'general-ledger' ? { account_id: accountId || undefined } : {}),
  })
  const report = useLoader(
    () => (name === 'general-ledger' && !accountId ? Promise.resolve(null) : bisonbookAPI.get(`/reports/${name}`, params())),
    [name, start, end, accountId],
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className={labelClass}>Report</label>
          <select className={fieldClass} value={name} onChange={(e) => setName(e.target.value)}>
            {REPORTS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </div>
        {meta.range ? (
          <div>
            <label className={labelClass}>From</label>
            <input className={fieldClass} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
        ) : null}
        <div>
          <label className={labelClass}>{meta.range ? 'To' : 'As of'}</label>
          <input className={fieldClass} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
        {name === 'general-ledger' ? (
          <div>
            <label className={labelClass}>Account</label>
            <select className={fieldClass} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">Choose account</option>
              {(accounts.data || []).map((a: any) => <option key={a.id} value={a.id}>{a.code} {a.name}</option>)}
            </select>
          </div>
        ) : null}
        <div className="flex gap-2 ml-auto">
          <Button size="sm" variant="outline" onClick={() => bisonbookAPI.open(`/reports/${name}`, { ...params(), format: 'csv' }, `${name}.csv`)}>
            <FileDown className="w-4 h-4 mr-1" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => bisonbookAPI.open(`/reports/${name}`, { ...params(), format: 'pdf' })}>
            <FileDown className="w-4 h-4 mr-1" /> PDF
          </Button>
        </div>
      </div>
      {report.loading && !report.data ? <Loading /> : report.error ? <ErrorBox message={report.error} onRetry={report.reload} />
        : report.data ? <ReportBody name={name} data={report.data} /> : <Empty>Choose an account to see its ledger.</Empty>}
    </div>
  )
}

export default function BooksSection({ vendor }: { vendor: any }) {
  const [tab, setTab] = useState<BooksTab>('reports')
  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {([['reports', 'Reports'], ['expenses', 'Expenses'], ['journal', 'Journal'], ['accounts', 'Chart of accounts']] as const).map(([value, label]) => (
          <button key={value} type="button" onClick={() => setTab(value)}
            className={`rounded-lg px-3 py-2 text-sm whitespace-nowrap ${tab === value ? 'bg-[#19C37D]/15 text-[#19C37D]' : 'text-[#b4b4b4] hover:bg-[#3d3d3d]'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'reports' && <ReportsPanel />}
      {tab === 'expenses' && <ExpensesPanel vendor={vendor} />}
      {tab === 'journal' && <JournalPanel />}
      {tab === 'accounts' && <AccountsPanel />}
    </div>
  )
}
