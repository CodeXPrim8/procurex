'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2, Plus } from 'lucide-react'
import { useRequireAuth } from '@/lib/auth'
import { businessAPI } from '@/lib/api'
import { showToast } from '@/lib/toast'
import { setActiveBusinessId } from '@/lib/businessContext'
import { resolveMediaUrl } from '@/lib/media'
import Button from '@/components/ui/Button'

export default function BusinessesPage() {
  const { user, isAuthenticated } = useRequireAuth()
  const [rows, setRows] = useState<any[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const load = async () => {
    const list = await businessAPI.list()
    setRows(Array.isArray(list) ? list : [])
  }

  useEffect(() => {
    if (!isAuthenticated) return
    void load().catch(() => showToast('Could not load businesses.', 'error'))
  }, [isAuthenticated])

  if (!user) return null

  const create = async () => {
    const value = name.trim()
    if (!value) return
    setBusy(true)
    try {
      const created = await businessAPI.create({ name: value, is_default: rows.length === 0 })
      setActiveBusinessId(created.id)
      setName('')
      await load()
    } catch {
      showToast('Could not create that business.', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#ececec]">Businesses</h1>
        <p className="text-[#b4b4b4] mt-1">
          Each business has its own logo, quote template, clients, and procurement requests.
        </p>
      </div>

      <div className="bg-[#2f2f2f] border border-[#3d3d3d] rounded-lg p-4 flex flex-col sm:flex-row gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New business name"
          className="flex-1 min-h-11 rounded-lg bg-[#171717] border border-[#3d3d3d] px-3 text-[#ececec]"
        />
        <Button onClick={() => void create()} isLoading={busy}>
          <Plus className="w-4 h-4 mr-2" />
          Create business
        </Button>
      </div>

      <div className="grid gap-4">
        {rows.map((item) => (
          <Link
            key={item.id}
            href={`/businesses/${item.id}`}
            onClick={() => setActiveBusinessId(item.id)}
            className="bg-[#2f2f2f] border border-[#3d3d3d] rounded-lg p-5 hover:bg-[#353535] flex items-center gap-4"
          >
            {item.logo_url ? (
              <img src={resolveMediaUrl(item.logo_url)} alt="" className="w-12 h-12 rounded-lg object-contain bg-[#171717]" />
            ) : (
              <div className="w-12 h-12 rounded-lg bg-[#171717] flex items-center justify-center">
                <Building2 className="w-6 h-6 text-[#19C37D]" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[#ececec]">{item.name}</p>
              <p className="text-sm text-[#8e8e8e]">
                {(item.clients || []).length} clients · {(item.requests || []).length} requests · {item.template_kind || 'classic'} template
              </p>
            </div>
            {item.is_default && <span className="text-xs text-[#19C37D]">Default</span>}
          </Link>
        ))}
      </div>
    </div>
  )
}
