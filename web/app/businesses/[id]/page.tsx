'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useRequireAuth } from '@/lib/auth'
import { businessAPI } from '@/lib/api'
import { showToast } from '@/lib/toast'
import { resolveMediaUrl } from '@/lib/media'
import {
  setActiveBusinessId,
  setActiveClientId,
  setActiveRequestId,
} from '@/lib/businessContext'
import Button from '@/components/ui/Button'

const TEMPLATES = [
  { id: 'classic', label: 'Classic' },
  { id: 'modern', label: 'Modern' },
  { id: 'compact', label: 'Compact' },
]

export default function BusinessDetailPage() {
  const { user, isAuthenticated } = useRequireAuth()
  const params = useParams()
  const router = useRouter()
  const businessId = Number(params?.id)
  const [business, setBusiness] = useState<any>(null)
  const [tab, setTab] = useState<'brand' | 'customers' | 'requests'>('brand')
  const [form, setForm] = useState({ name: '', legal_name: '', email: '', phone: '', address: '', footer_note: '', template_kind: 'classic', vat_percent: 7.5 })
  const [clientForm, setClientForm] = useState({ name: '', email: '', phone: '', company: '', address: '' })
  const [requestForm, setRequestForm] = useState({ title: '', description: '', client_id: '' })
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const row = await businessAPI.get(businessId)
    setBusiness(row)
    setForm({
      name: row.name || '',
      legal_name: row.legal_name || '',
      email: row.email || '',
      phone: row.phone || '',
      address: row.address || '',
      footer_note: row.footer_note || '',
      template_kind: row.template_kind || 'classic',
      vat_percent: row.vat_percent == null ? 7.5 : Number(row.vat_percent),
    })
    setActiveBusinessId(row.id)
  }

  useEffect(() => {
    if (!isAuthenticated || !businessId) return
    void load().catch(() => showToast('Business not found.', 'error'))
  }, [isAuthenticated, businessId])

  if (!user || !business) return null

  const saveBrand = async () => {
    setBusy(true)
    try {
      await businessAPI.update(businessId, form)
      await load()
      showToast('Business saved.', 'success')
    } catch {
      showToast('Could not save that business.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const onFile = async (kind: 'logo' | 'letterhead', file?: File) => {
    if (!file) return
    setBusy(true)
    try {
      await businessAPI.uploadBrand(businessId, kind, file)
      await load()
    } catch (error: any) {
      showToast(error?.response?.data?.detail || 'Could not upload that image.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const addClient = async () => {
    if (!clientForm.name.trim()) return
    setBusy(true)
    try {
      await businessAPI.createClient(businessId, {
        name: clientForm.name.trim(),
        email: clientForm.email.trim() || undefined,
        phone: clientForm.phone.trim() || undefined,
        company: clientForm.company.trim() || undefined,
        address: clientForm.address.trim() || undefined,
      })
      setClientForm({ name: '', email: '', phone: '', company: '', address: '' })
      await load()
    } catch {
      showToast('Could not add that client.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const addRequest = async () => {
    if (!requestForm.title.trim()) return
    setBusy(true)
    try {
      await businessAPI.createRequest(businessId, {
        title: requestForm.title,
        description: requestForm.description,
        client_id: requestForm.client_id ? Number(requestForm.client_id) : null,
      })
      setRequestForm({ title: '', description: '', client_id: '' })
      await load()
    } catch {
      showToast('Could not add that request.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Link href="/businesses" className="text-sm text-[#19C37D] hover:underline">
        ← All businesses
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {business.logo_url ? (
            <img src={resolveMediaUrl(business.logo_url)} alt="" className="w-14 h-14 rounded-lg object-contain bg-[#2f2f2f]" />
          ) : null}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#ececec]">{business.name}</h1>
            <p className="text-[#8e8e8e] text-sm">{business.email || 'No business email yet'}</p>
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={async () => {
            if (!window.confirm('Delete this business? Quotes stay on your account.')) return
            await businessAPI.remove(businessId)
            router.push('/businesses')
          }}
        >
          Delete
        </Button>
      </div>

      <div className="flex gap-2">
        {(['brand', 'customers', 'requests'] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 py-2 rounded-lg text-sm capitalize ${tab === id ? 'bg-[#2f2f2f] text-white' : 'text-[#b4b4b4]'}`}
          >
            {id}
          </button>
        ))}
      </div>

      {tab === 'brand' && (
        <div className="space-y-4 bg-[#2f2f2f] border border-[#3d3d3d] rounded-lg p-4">
          <Field label="Business name" value={form.name} onChange={(value) => setForm({ ...form, name: value })} />
          <Field label="Legal name" value={form.legal_name} onChange={(value) => setForm({ ...form, legal_name: value })} />
          <Field label="Email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} />
          <Field label="Phone" value={form.phone} onChange={(value) => setForm({ ...form, phone: value })} />
          <Field label="Address" value={form.address} onChange={(value) => setForm({ ...form, address: value })} />
          <label className="block text-sm text-[#b4b4b4]">
            Quote template
            <select
              value={form.template_kind}
              onChange={(event) => setForm({ ...form, template_kind: event.target.value })}
              className="mt-1 w-full min-h-11 rounded-lg bg-[#171717] border border-[#3d3d3d] px-3 text-[#ececec]"
            >
              {TEMPLATES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <Field label="Footer note" value={form.footer_note} onChange={(value) => setForm({ ...form, footer_note: value })} />
          <label className="block text-sm text-[#b4b4b4]">
            Default VAT %
            <input
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={form.vat_percent}
              onChange={(event) => setForm({ ...form, vat_percent: Number(event.target.value) || 0 })}
              className="mt-1 w-full min-h-11 rounded-lg bg-[#171717] border border-[#3d3d3d] px-3 text-[#ececec]"
            />
          </label>
          <div className="grid sm:grid-cols-2 gap-4">
            <UploadBox label="Logo" url={business.logo_url} onFile={(file) => void onFile('logo', file)} />
            <UploadBox label="Letterhead / template image" url={business.letterhead_url} onFile={(file) => void onFile('letterhead', file)} />
          </div>
          <Button onClick={() => void saveBrand()} isLoading={busy}>
            Save branding
          </Button>
        </div>
      )}

      {tab === 'customers' && (
        <div className="space-y-4">
          <div className="bg-[#2f2f2f] border border-[#3d3d3d] rounded-lg p-4 grid sm:grid-cols-2 gap-2">
            <Field label="Customer name" value={clientForm.name} onChange={(value) => setClientForm({ ...clientForm, name: value })} />
            <Field label="Email" value={clientForm.email} onChange={(value) => setClientForm({ ...clientForm, email: value })} />
            <Field label="Phone" value={clientForm.phone} onChange={(value) => setClientForm({ ...clientForm, phone: value })} />
            <Field label="Company" value={clientForm.company} onChange={(value) => setClientForm({ ...clientForm, company: value })} />
            <div className="sm:col-span-2">
              <Field label="Address" value={clientForm.address} onChange={(value) => setClientForm({ ...clientForm, address: value })} />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={() => void addClient()} isLoading={busy}>
                Add customer
              </Button>
            </div>
          </div>
          {(business.clients || []).map((client: any) => (
            <div key={client.id} className="bg-[#2f2f2f] border border-[#3d3d3d] rounded-lg p-4 flex justify-between gap-3">
              <div>
                <p className="text-[#ececec] font-medium">{client.name}</p>
                <p className="text-sm text-[#8e8e8e]">{client.email || 'No email'} · {client.company || '—'}</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-sm text-[#19C37D]"
                  onClick={() => {
                    setActiveClientId(client.id)
                    setActiveBusinessId(businessId)
                    router.push('/chat')
                  }}
                >
                  Source for them
                </button>
                <button
                  type="button"
                  className="text-sm text-red-400"
                  onClick={async () => {
                    await businessAPI.removeClient(businessId, client.id)
                    await load()
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'requests' && (
        <div className="space-y-4">
          <div className="bg-[#2f2f2f] border border-[#3d3d3d] rounded-lg p-4 space-y-2">
            <Field label="Request title" value={requestForm.title} onChange={(value) => setRequestForm({ ...requestForm, title: value })} />
            <Field label="What they need" value={requestForm.description} onChange={(value) => setRequestForm({ ...requestForm, description: value })} />
            <label className="block text-sm text-[#b4b4b4]">
              Customer
              <select
                value={requestForm.client_id}
                onChange={(event) => setRequestForm({ ...requestForm, client_id: event.target.value })}
                className="mt-1 w-full min-h-11 rounded-lg bg-[#171717] border border-[#3d3d3d] px-3 text-[#ececec]"
              >
                <option value="">No customer yet</option>
                {(business.clients || []).map((client: any) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={() => void addRequest()} isLoading={busy}>
              Add request
            </Button>
          </div>
          {(business.requests || []).map((item: any) => (
            <div key={item.id} className="bg-[#2f2f2f] border border-[#3d3d3d] rounded-lg p-4 flex justify-between gap-3">
              <div>
                <p className="text-[#ececec] font-medium">{item.title}</p>
                <p className="text-sm text-[#8e8e8e]">
                  {item.status} · {item.client?.name || 'No customer'}
                </p>
                {item.description && <p className="text-sm text-[#b4b4b4] mt-1">{item.description}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-sm text-[#19C37D]"
                  onClick={() => {
                    setActiveBusinessId(businessId)
                    setActiveRequestId(item.id)
                    if (item.client_id) setActiveClientId(item.client_id)
                    router.push('/chat')
                  }}
                >
                  Source in chat
                </button>
                <button
                  type="button"
                  className="text-sm text-red-400"
                  onClick={async () => {
                    await businessAPI.removeRequest(businessId, item.id)
                    await load()
                  }}
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="block text-sm text-[#b4b4b4]">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full min-h-11 rounded-lg bg-[#171717] border border-[#3d3d3d] px-3 text-[#ececec]"
      />
    </label>
  )
}

function UploadBox({
  label,
  url,
  onFile,
}: {
  label: string
  url?: string
  onFile: (file?: File) => void
}) {
  return (
    <label className="block text-sm text-[#b4b4b4]">
      {label}
      {url ? <img src={resolveMediaUrl(url)} alt="" className="mt-2 h-20 object-contain bg-[#171717] rounded-lg w-full" /> : null}
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="mt-2 block w-full text-sm"
        onChange={(event) => onFile(event.target.files?.[0])}
      />
    </label>
  )
}
