'use client'

import { useEffect, useState } from 'react'
import { Globe2, X } from 'lucide-react'
import RegionCurrencyForm from '@/components/RegionCurrencyForm'
import { accountAPI } from '@/lib/api'
import { countryName, getRegionPreference, setRegionPreference } from '@/lib/currency'
import { useStore } from '@/lib/store'

const DISMISSED_KEY = 'procurex_region_prompt_dismissed'

/**
 * Asks first-time visitors for their region and currency, and keeps the choice in sync with their account:
 * an account preference is applied on a new device; a device-only choice is pushed up after login.
 */
export default function RegionPrompt() {
  const { isAuthenticated, authReady } = useStore()
  const [open, setOpen] = useState(false)
  const [detected, setDetected] = useState('')

  useEffect(() => {
    const pref = getRegionPreference()
    setDetected(pref.country)
    if (!pref.confirmed && window.localStorage.getItem(DISMISSED_KEY) !== '1') setOpen(true)
  }, [])

  useEffect(() => {
    if (!authReady || !isAuthenticated) return
    let cancelled = false
    void (async () => {
      try {
        const me = await accountAPI.me()
        if (cancelled) return
        const local = getRegionPreference()
        if (me.country && me.preferred_currency) {
          if (!local.confirmed || local.country !== me.country || local.currency !== me.preferred_currency) {
            setRegionPreference(me.country, me.preferred_currency)
            window.location.reload()
          }
        } else if (local.confirmed) {
          await accountAPI.updatePreferences({ country: local.country, preferred_currency: local.currency })
        }
      } catch {
        // offline or backend down: keep the device preference
      }
    })()
    return () => {
      cancelled = true
    }
  }, [authReady, isAuthenticated])

  if (!open) return null

  const dismiss = () => {
    window.localStorage.setItem(DISMISSED_KEY, '1')
    setOpen(false)
  }

  return (
    <div className="fixed inset-x-3 bottom-3 sm:inset-x-auto sm:right-4 sm:bottom-4 z-[80] sm:w-[26rem] rounded-2xl border border-[#3d3d3d] bg-[#212121] shadow-2xl p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2">
          <Globe2 className="w-5 h-5 text-[#19C37D] mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-[#ececec]">Where are you buying from?</p>
            <p className="text-xs text-[#8e8e8e]">
              We think you&apos;re in {countryName(detected || 'NG')}. Confirm so we show listings available to you, priced in your currency.
            </p>
          </div>
        </div>
        <button type="button" onClick={dismiss} className="text-[#8e8e8e] hover:text-white" aria-label="Not now">
          <X className="w-4 h-4" />
        </button>
      </div>
      <RegionCurrencyForm compact />
    </div>
  )
}
