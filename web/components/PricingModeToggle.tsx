'use client'

import { Phone, Tag } from 'lucide-react'
import type { PriceMode } from '@/lib/productCategories'

export default function PricingModeToggle({
  value,
  onChange,
  category,
}: {
  value: PriceMode
  onChange: (mode: PriceMode) => void
  category: string
}) {
  const noun = category === 'Service' ? 'service' : 'software'
  const options: { mode: PriceMode; label: string; hint: string; icon: typeof Tag }[] = [
    { mode: 'fixed', label: 'Show price', hint: `Buyers see your price for this ${noun}.`, icon: Tag },
    { mode: 'contact', label: 'Contact for price', hint: 'Buyers see "Contact for price" and reach you for a quote.', icon: Phone },
  ]

  return (
    <div>
      <p className="block text-sm font-medium text-[#b4b4b4] mb-2">Pricing</p>
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Pricing">
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
