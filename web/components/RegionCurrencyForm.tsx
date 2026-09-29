'use client'

import { useMemo, useState } from 'react'
import { Globe2 } from 'lucide-react'
import Button from '@/components/ui/Button'
import { accountAPI } from '@/lib/api'
import {
  defaultCurrencyForCountry,
  getRegionPreference,
  listCountries,
  listCurrencies,
  setRegionPreference,
} from '@/lib/currency'
import { useStore } from '@/lib/store'
import { showToast } from '@/lib/toast'

const selectClass =
  'w-full px-3 py-2 text-sm rounded-lg bg-[#171717] text-[#ececec] border border-[#3d3d3d] focus:outline-none focus:ring-2 focus:ring-[#19C37D]'

/** Save region + currency locally and, when signed in, on the account. Reloads so every price re-renders. */
export async function saveRegionPreference(country: string, currency: string, signedIn: boolean) {
  setRegionPreference(country, currency)
  if (signedIn) {
    try {
      await accountAPI.updatePreferences({ country, preferred_currency: currency })
    } catch {
      showToast('Saved on this device. We could not sync it to your account yet.', 'warning')
    }
  }
  window.location.reload()
}

export default function RegionCurrencyForm({ onSaved, compact = false }: { onSaved?: () => void; compact?: boolean }) {
  const { isAuthenticated } = useStore()
  const initial = useMemo(() => getRegionPreference(), [])
  const countries = useMemo(() => listCountries(), [])
  const currencies = useMemo(() => listCurrencies(), [])
  const [country, setCountry] = useState(initial.country)
  const [currency, setCurrency] = useState(initial.currency)
  const [currencyTouched, setCurrencyTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    onSaved?.()
    await saveRegionPreference(country, currency, isAuthenticated)
  }

  return (
    <div className="space-y-4">
      {!compact ? (
        <div className="flex items-start gap-3">
          <Globe2 className="w-5 h-5 text-[#19C37D] mt-0.5 shrink-0" />
          <div>
            <h3 className="text-base font-semibold text-[#ececec]">Region &amp; currency</h3>
            <p className="text-sm text-[#8e8e8e]">
              Your region decides which listings you see. Physical products and onsite services are shown to buyers in the
              vendor&apos;s country; software and remote services are available worldwide.
            </p>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[#b4b4b4] mb-1" htmlFor="region-country">Country / region</label>
          <select
            id="region-country"
            className={selectClass}
            value={country}
            onChange={(e) => {
              setCountry(e.target.value)
              if (!currencyTouched) setCurrency(defaultCurrencyForCountry(e.target.value))
            }}
          >
            {countries.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[#b4b4b4] mb-1" htmlFor="region-currency">Preferred currency</label>
          <select
            id="region-currency"
            className={selectClass}
            value={currency}
            onChange={(e) => {
              setCurrency(e.target.value)
              setCurrencyTouched(true)
            }}
          >
            {currencies.map((c) => (
              <option key={c.code} value={c.code}>{c.code} · {c.name}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-xs text-[#8e8e8e]">Prices are converted at live exchange rates for display. Vendors are paid in their own currency.</p>
      <Button type="button" onClick={save} isLoading={saving} className={compact ? 'w-full' : ''}>
        Save region &amp; currency
      </Button>
    </div>
  )
}
