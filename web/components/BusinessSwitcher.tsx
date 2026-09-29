'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Building2 } from 'lucide-react'
import { businessAPI } from '@/lib/api'
import {
  getActiveBusinessId,
  setActiveBusinessId,
  subscribeBusiness,
} from '@/lib/businessContext'

export default function BusinessSwitcher({ compact = false }: { compact?: boolean }) {
  const [businesses, setBusinesses] = useState<any[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)

  const load = async () => {
    try {
      const rows = await businessAPI.list()
      const list = Array.isArray(rows) ? rows : []
      setBusinesses(list)
      const stored = getActiveBusinessId()
      const chosen = list.find((item) => item.id === stored) || list.find((item) => item.is_default) || list[0]
      if (chosen && chosen.id !== stored) setActiveBusinessId(chosen.id)
      setActiveId(chosen?.id || null)
    } catch {
      setBusinesses([])
    }
  }

  useEffect(() => {
    void load()
    return subscribeBusiness(() => setActiveId(getActiveBusinessId()))
  }, [])

  if (!businesses.length) {
    return (
      <Link
        href="/businesses"
        className="inline-flex items-center gap-2 text-sm text-[#b4b4b4] hover:text-[#ececec]"
      >
        <Building2 className="w-4 h-4" />
        Add a business
      </Link>
    )
  }

  return (
    <div className={`flex items-center gap-2 min-w-0 ${compact ? '' : 'w-full'}`}>
      <Building2 className="w-4 h-4 text-[#8e8e8e] shrink-0" />
      <select
        value={activeId || ''}
        onChange={(event) => {
          const id = Number(event.target.value)
          setActiveId(id)
          setActiveBusinessId(id)
        }}
        className="min-w-0 flex-1 bg-transparent text-sm text-[#ececec] border border-[#3d3d3d] rounded-lg px-2 py-1.5"
        aria-label="Active business"
      >
        {businesses.map((item) => (
          <option key={item.id} value={item.id} className="bg-[#171717]">
            {item.name}
          </option>
        ))}
      </select>
      <Link href="/businesses" className="text-xs text-[#19C37D] hover:underline shrink-0">
        Manage
      </Link>
    </div>
  )
}
