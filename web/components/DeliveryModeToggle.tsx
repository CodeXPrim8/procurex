'use client'

import { Globe2, MapPin } from 'lucide-react'
import { countryName } from '@/lib/currency'

export type DeliveryMode = 'remote' | 'onsite'

export function availabilityLabel(category?: string | null, deliveryMode?: string | null, country?: string | null) {
  const where = countryName(country || 'NG')
  if (category === 'Software') return 'Available worldwide'
  if (category === 'Service') return deliveryMode === 'remote' ? 'Remote · worldwide' : `Onsite · ${where}`
  return `Available in ${where}`
}

export default function DeliveryModeToggle({
  value,
  onChange,
  vendorCountry,
}: {
  value: DeliveryMode | '' | null | undefined
  onChange: (mode: DeliveryMode) => void
  vendorCountry?: string | null
}) {
  const where = countryName(vendorCountry || 'NG')
  const options: { mode: DeliveryMode; label: string; hint: string; icon: typeof Globe2 }[] = [
    { mode: 'remote', label: 'Remote', hint: 'Delivered online. Shown to buyers worldwide.', icon: Globe2 },
    { mode: 'onsite', label: 'Onsite', hint: `Needs you on location. Shown to buyers in ${where} only.`, icon: MapPin },
  ]

  return (
    <div>
      <p className="block text-sm font-medium text-[#b4b4b4] mb-2">
        How is this service delivered? <span className="text-red-500">*</span>
      </p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Service delivery">
        {options.map(({ mode, label, hint, icon: Icon }) => {
          const active = value === mode
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(mode)}
              className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                active
                  ? 'border-[#19C37D] bg-[#19C37D]/10 text-[#ececec]'
                  : 'border-[#3d3d3d] bg-[#171717] text-[#b4b4b4] hover:border-[#565656]'
              }`}
            >
              <span className="flex items-center gap-2 text-sm font-medium">
                <Icon className={`w-4 h-4 ${active ? 'text-[#19C37D]' : ''}`} />
                {label}
              </span>
              <span className="block text-xs text-[#8e8e8e] mt-1">{hint}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
