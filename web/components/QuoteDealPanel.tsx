'use client'

import { useEffect, useState } from 'react'
import { Building2, ChevronDown } from 'lucide-react'
import { formatPrice } from '@/lib/currency'

function naira(value: any) {
  return Math.round(Number(value) || 0)
}

function roundPct(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.round(value * 100) / 100
}

function Money({ amount }: { amount: number }) {
  const [text, setText] = useState(`₦${amount.toLocaleString('en-NG')}`)
  useEffect(() => {
    setText(`₦${amount.toLocaleString('en-NG')}`)
    void formatPrice(amount).then(setText)
  }, [amount])
  return <span>{text}</span>
}

type QuoteDealPanelProps = {
  quotation: any
  paid: boolean
  open: boolean
  onToggle: () => void
  internals: { cost: number; profit: number; sell: number }
  onUpdateLinePrices: (index: number, kind: 'percent' | 'sell', raw: string) => void
}

export default function QuoteDealPanel({
  quotation,
  paid,
  open,
  onToggle,
  internals,
  onUpdateLinePrices,
}: QuoteDealPanelProps) {
  return (
    <div id="deal" className="bg-[#2f2f2f] border border-[#3d3d3d] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="inline-flex items-center gap-2 text-[#ececec] font-medium">
          <Building2 className="w-4 h-4 text-[#19C37D]" />
          Deal
        </span>
        <span className="inline-flex items-center gap-2 text-sm text-[#8e8e8e]">
          {paid ? 'Vendor details' : 'Internal — not on the quote'}
          <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-[#3d3d3d]">
          <p className="text-sm text-[#b4b4b4] pt-3">
            {paid
              ? 'The customer has paid. This is who supplied each price, with your cost and profit.'
              : 'Vendor price and profit stay here. After the customer pays, open this deal to see the supplier and their contact details.'}
          </p>
          {(quotation.items || []).map((item: any, index: number) => {
            const vendor = item.vendor && typeof item.vendor === 'object' ? item.vendor : null
            const contact = [vendor?.phone, vendor?.email, vendor?.domain].filter(Boolean).join(' · ')
            return (
              <div key={item.id || index} className="rounded-lg border border-[#3d3d3d] bg-[#171717] p-3 space-y-2">
                <p className="text-[#ececec] font-medium">{item.product_name || 'Item'}</p>
                <div className="grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <p className="text-[#8e8e8e]">Vendor price</p>
                    <p className="text-[#ececec]">
                      <Money amount={naira(item.cost_price ?? item.unit_price)} />
                    </p>
                  </div>
                  <label className="text-[#8e8e8e]">
                    Profit %
                    <input
                      type="number"
                      step="0.01"
                      value={roundPct(Number(item.profit_percent) || 0)}
                      onChange={(event) => onUpdateLinePrices(index, 'percent', event.target.value)}
                      className="mt-1 w-full bg-transparent text-[#ececec] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </label>
                  <label className="text-[#8e8e8e]">
                    Your sell
                    <input
                      type="number"
                      min={0}
                      step="1"
                      value={naira(item.unit_price)}
                      onChange={(event) => onUpdateLinePrices(index, 'sell', event.target.value)}
                      className="mt-1 w-full bg-transparent text-[#ececec] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </label>
                </div>
                {paid ? (
                  <div className="text-sm pt-1">
                    <p className="text-[#ececec]">{vendor?.name || 'No vendor on file'}</p>
                    {contact ? <p className="text-[#b4b4b4]">{contact}</p> : null}
                    {vendor?.address ? <p className="text-[#8e8e8e]">{vendor.address}</p> : null}
                  </div>
                ) : (
                  <p className="text-xs text-[#8e8e8e]">Supplier name and contacts appear here after payment.</p>
                )}
              </div>
            )
          })}
          <div className="grid grid-cols-3 gap-2 text-sm pt-1">
            <div>
              <p className="text-[#8e8e8e]">Your cost</p>
              <p className="text-[#ececec] font-medium">
                <Money amount={internals.cost} />
              </p>
            </div>
            <div>
              <p className="text-[#8e8e8e]">Profit</p>
              <p className="text-[#ececec] font-medium">
                <Money amount={internals.profit} />
              </p>
            </div>
            <div>
              <p className="text-[#8e8e8e]">Customer total (ex VAT)</p>
              <p className="text-[#ececec] font-medium">
                <Money amount={internals.sell} />
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
