'use client'

import { useState } from 'react'
import {
  BookOpen,
  Boxes,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Landmark,
  Receipt,
  Settings,
} from 'lucide-react'
import { vatStatusLabel } from '@/lib/vendorOnboarding'
import OverviewSection from './OverviewSection'
import InventorySection from './InventorySection'
import SalesSection from './SalesSection'
import BooksSection from './BooksSection'
import TaxSection from './TaxSection'
import FilesSection from './FilesSection'
import SettingsSection from './SettingsSection'
import { Pill } from './ui'

export type BisonSection = 'overview' | 'inventory' | 'sales' | 'books' | 'tax' | 'files' | 'settings'

const SECTIONS: Array<{ id: BisonSection; label: string; icon: typeof BookOpen }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'sales', label: 'Invoices & quotes', icon: Receipt },
  { id: 'books', label: 'Books', icon: BookOpen },
  { id: 'tax', label: 'Tax', icon: Landmark },
  { id: 'files', label: 'Files', icon: FolderOpen },
  { id: 'settings', label: 'Settings & VAT', icon: Settings },
]

export default function BisonBookShell({
  vendor,
  onVendorChange,
}: {
  vendor: any
  onVendorChange: (vendor: any) => void
}) {
  const [section, setSection] = useState<BisonSection>('overview')
  const vatStatus = vendor?.vat_status || 'none'

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#19C37D]/15 flex items-center justify-center">
            <FileText className="w-5 h-5 text-[#19C37D]" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#ececec]">BisonBook</h2>
            <p className="text-xs text-[#8e8e8e]">Inventory, invoicing, bookkeeping, tax and files for {vendor?.company_name}</p>
          </div>
        </div>
        <button type="button" onClick={() => setSection('settings')} className="self-start md:self-auto">
          <Pill
            status={vendor?.can_charge_vat ? 'approved' : vatStatus}
            label={`${vatStatusLabel(vatStatus, vendor?.can_charge_vat)}${vendor?.can_charge_vat ? ` · ${vendor?.vat_rate}%` : ''}`}
          />
        </button>
      </div>

      <div className="overflow-x-auto no-scrollbar -mx-1">
        <div className="flex gap-1 min-w-max px-1">
          {SECTIONS.map((item) => {
            const Icon = item.icon
            const active = section === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active ? 'bg-[#19C37D]/15 text-[#19C37D]' : 'text-[#b4b4b4] hover:bg-[#3d3d3d]'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            )
          })}
        </div>
      </div>

      {section === 'overview' && <OverviewSection onNavigate={setSection} />}
      {section === 'inventory' && <InventorySection />}
      {section === 'sales' && <SalesSection vendor={vendor} />}
      {section === 'books' && <BooksSection vendor={vendor} />}
      {section === 'tax' && <TaxSection vendor={vendor} onNavigate={setSection} />}
      {section === 'files' && <FilesSection />}
      {section === 'settings' && <SettingsSection vendor={vendor} onVendorChange={onVendorChange} />}
    </div>
  )
}
