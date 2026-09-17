'use client'

const STORAGE_COUNTRY = 'procurex_country'
const STORAGE_RATES = 'procurex_fx_usd'
const RATES_TTL_MS = 6 * 60 * 60 * 1000

const ZERO_DECIMAL = new Set([
  'JPY', 'KRW', 'VND', 'CLP', 'ISK', 'PYG', 'UGX', 'RWF', 'XAF', 'XOF', 'BIF',
])

const COUNTRY_CURRENCY: Record<string, string> = {
  US: 'USD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN',
  GB: 'GBP', IE: 'EUR', FR: 'EUR', DE: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR',
  PT: 'EUR', AT: 'EUR', FI: 'EUR', GR: 'EUR', LU: 'EUR', SK: 'EUR', SI: 'EUR', EE: 'EUR',
  LV: 'EUR', LT: 'EUR', MT: 'EUR', CY: 'EUR', HR: 'EUR', CH: 'CHF', SE: 'SEK', NO: 'NOK',
  DK: 'DKK', PL: 'PLN', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'EUR', UA: 'UAH', TR: 'TRY',
  NG: 'NGN', GH: 'GHS', KE: 'KES', ZA: 'ZAR', TZ: 'TZS', UG: 'UGX', RW: 'RWF', ET: 'ETB',
  EG: 'EGP', MA: 'MAD', DZ: 'DZD', TN: 'TND', CM: 'XAF', SN: 'XOF', CI: 'XOF', NE: 'XOF',
  ML: 'XOF', BF: 'XOF', TG: 'XOF', BJ: 'XOF', GW: 'XOF', GA: 'XAF', CG: 'XAF', TD: 'XAF',
  CF: 'XAF', GQ: 'XAF', AO: 'AOA', MZ: 'MZN', ZM: 'ZMW', ZW: 'USD', BW: 'BWP', NA: 'NAD',
  AE: 'AED', SA: 'SAR', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR', IL: 'ILS', JO: 'JOD',
  LB: 'LBP', IQ: 'IQD', IR: 'IRR', PK: 'PKR', IN: 'INR', BD: 'BDT', LK: 'LKR', NP: 'NPR',
  CN: 'CNY', HK: 'HKD', TW: 'TWD', JP: 'JPY', KR: 'KRW', SG: 'SGD', MY: 'MYR', ID: 'IDR',
  PH: 'PHP', TH: 'THB', VN: 'VND', AU: 'AUD', NZ: 'NZD', FJ: 'FJD',
  RU: 'RUB', KZ: 'KZT', UZ: 'UZS',
}

const TIMEZONE_COUNTRY: Record<string, string> = {
  'Africa/Lagos': 'NG',
  'Africa/Accra': 'GH',
  'Africa/Nairobi': 'KE',
  'Africa/Johannesburg': 'ZA',
  'Africa/Cairo': 'EG',
  'Africa/Casablanca': 'MA',
  'Africa/Addis_Ababa': 'ET',
  'Africa/Dar_es_Salaam': 'TZ',
  'Africa/Kampala': 'UG',
  'Africa/Kigali': 'RW',
  'America/New_York': 'US',
  'America/Chicago': 'US',
  'America/Denver': 'US',
  'America/Los_Angeles': 'US',
  'America/Phoenix': 'US',
  'America/Toronto': 'CA',
  'America/Vancouver': 'CA',
  'America/Mexico_City': 'MX',
  'America/Sao_Paulo': 'BR',
  'America/Argentina/Buenos_Aires': 'AR',
  'America/Bogota': 'CO',
  'America/Lima': 'PE',
  'Europe/London': 'GB',
  'Europe/Dublin': 'IE',
  'Europe/Paris': 'FR',
  'Europe/Berlin': 'DE',
  'Europe/Madrid': 'ES',
  'Europe/Rome': 'IT',
  'Europe/Amsterdam': 'NL',
  'Europe/Brussels': 'BE',
  'Europe/Zurich': 'CH',
  'Europe/Stockholm': 'SE',
  'Europe/Oslo': 'NO',
  'Europe/Copenhagen': 'DK',
  'Europe/Warsaw': 'PL',
  'Europe/Istanbul': 'TR',
  'Asia/Dubai': 'AE',
  'Asia/Riyadh': 'SA',
  'Asia/Kolkata': 'IN',
  'Asia/Karachi': 'PK',
  'Asia/Dhaka': 'BD',
  'Asia/Shanghai': 'CN',
  'Asia/Hong_Kong': 'HK',
  'Asia/Tokyo': 'JP',
  'Asia/Seoul': 'KR',
  'Asia/Singapore': 'SG',
  'Asia/Kuala_Lumpur': 'MY',
  'Asia/Jakarta': 'ID',
  'Asia/Manila': 'PH',
  'Asia/Bangkok': 'TH',
  'Asia/Ho_Chi_Minh': 'VN',
  'Australia/Sydney': 'AU',
  'Australia/Melbourne': 'AU',
  'Pacific/Auckland': 'NZ',
}

const FALLBACK_USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.78,
  NGN: 1500,
  GHS: 15.7,
  KES: 129,
  ZAR: 18.2,
  CAD: 1.36,
  AUD: 1.53,
  NZD: 1.67,
  INR: 83,
  PKR: 278,
  BDT: 110,
  AED: 3.67,
  SAR: 3.75,
  EGP: 48,
  MAD: 10,
  JPY: 149,
  CNY: 7.2,
  KRW: 1350,
  SGD: 1.34,
  MYR: 4.7,
  IDR: 15800,
  PHP: 58,
  THB: 36,
  VND: 25400,
  CHF: 0.88,
  SEK: 10.4,
  NOK: 10.6,
  DKK: 6.9,
  PLN: 3.9,
  BRL: 5.1,
  MXN: 17.2,
  TRY: 34,
  TZS: 2600,
  UGX: 3700,
  XOF: 605,
  XAF: 605,
}

let countryCache: string | null = null
let ratesCache: Record<string, number> | null = null
let locationPromise: Promise<string> | null = null

function currencyForCountry(country: string) {
  return COUNTRY_CURRENCY[country] || 'USD'
}

function localeForCountry(country: string) {
  const language = (typeof navigator !== 'undefined' && navigator.language) || 'en'
  const base = language.split('-')[0] || 'en'
  return `${base}-${country}`
}

function countryFromLocale() {
  if (typeof navigator === 'undefined') return null
  const locale = navigator.language || (navigator as any).userLanguage || ''
  const region = locale.split('-')[1]?.toUpperCase()
  if (region && region.length === 2) return region
  return null
}

function countryFromTimezone() {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (zone && TIMEZONE_COUNTRY[zone]) return TIMEZONE_COUNTRY[zone]
  } catch {
    // ignore
  }
  return null
}

async function countryFromIp() {
  const endpoints = ['https://ipwho.is/', 'https://ipapi.co/json/']
  for (const url of endpoints) {
    try {
      const response = await fetch(url)
      if (!response.ok) continue
      const data = await response.json()
      const code = String(data.country_code || data.countryCode || '').toUpperCase()
      if (code.length === 2) return code
    } catch {
      // try next
    }
  }
  return null
}

export async function detectUserLocation(): Promise<string> {
  if (countryCache) return countryCache
  if (typeof window !== 'undefined') {
    const stored = window.localStorage.getItem(STORAGE_COUNTRY)
    if (stored && stored.length === 2) {
      countryCache = stored
      return stored
    }
  }
  if (!locationPromise) {
    locationPromise = (async () => {
      const quick = countryFromTimezone() || countryFromLocale() || 'NG'
      countryCache = quick
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_COUNTRY, quick)
      }
      const fromIp = await countryFromIp()
      if (fromIp) {
        countryCache = fromIp
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(STORAGE_COUNTRY, fromIp)
        }
        return fromIp
      }
      return quick
    })()
  }
  return locationPromise
}

async function loadUsdRates(): Promise<Record<string, number>> {
  if (ratesCache) return ratesCache
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_RATES)
      if (raw) {
        const parsed = JSON.parse(raw) as { at: number; rates: Record<string, number> }
        if (parsed?.rates && Date.now() - parsed.at < RATES_TTL_MS) {
          ratesCache = { ...FALLBACK_USD_RATES, ...parsed.rates, USD: 1 }
          return ratesCache
        }
      }
    } catch {
      // ignore
    }
  }

  try {
    const response = await fetch('https://open.er-api.com/v6/latest/USD')
    const data = await response.json()
    if (data?.result === 'success' && data.rates) {
      const next = { ...FALLBACK_USD_RATES, ...data.rates, USD: 1 }
      ratesCache = next
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_RATES, JSON.stringify({ at: Date.now(), rates: data.rates }))
      }
      return next
    }
  } catch {
    // fallback below
  }

  ratesCache = { ...FALLBACK_USD_RATES }
  return ratesCache
}

export function getDisplayCurrencyNow() {
  const country =
    countryCache ||
    (typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_COUNTRY) : null) ||
    countryFromTimezone() ||
    countryFromLocale() ||
    'NG'
  const currency = currencyForCountry(country)
  const rates = ratesCache || FALLBACK_USD_RATES
  const ngnPerUsd = rates.NGN || FALLBACK_USD_RATES.NGN
  const localPerUsd = rates[currency] || 1
  const localPerNgn = localPerUsd / ngnPerUsd
  const locale = localeForCountry(country)
  const symbol =
    new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value || currency
  return { country, currency, symbol, locale, localPerNgn }
}

export async function getDisplayCurrency() {
  const country = await detectUserLocation()
  const currency = currencyForCountry(country)
  const rates = await loadUsdRates()
  const ngnPerUsd = rates.NGN || FALLBACK_USD_RATES.NGN
  const localPerUsd = rates[currency] || 1
  const localPerNgn = localPerUsd / ngnPerUsd
  const locale = localeForCountry(country)
  const symbol =
    new Intl.NumberFormat(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find((part) => part.type === 'currency')?.value || currency
  return { country, currency, symbol, locale, localPerNgn }
}

function formatAmount(amount: number, currency: string, locale: string) {
  const zero = ZERO_DECIMAL.has(currency) || currency === 'NGN'
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: zero ? 0 : 2,
    maximumFractionDigits: zero ? 0 : 2,
  }).format(amount)
}

/**
 * Format a catalog price. Catalog amounts are stored in Nigerian Naira.
 */
export async function formatPrice(catalogNgn: number): Promise<string> {
  const { currency, locale, localPerNgn } = await getDisplayCurrency()
  const amount = (Number(catalogNgn) || 0) * localPerNgn
  return formatAmount(amount, currency, locale)
}

export async function formatFromUsd(usdAmount: number): Promise<string> {
  const country = await detectUserLocation()
  const currency = currencyForCountry(country)
  const rates = await loadUsdRates()
  const locale = localeForCountry(country)
  const amount = (Number(usdAmount) || 0) * (rates[currency] || 1)
  return formatAmount(amount, currency, locale)
}

export async function convertPrice(catalogNgn: number) {
  const display = await getDisplayCurrency()
  return {
    amount: (Number(catalogNgn) || 0) * display.localPerNgn,
    currency: display.currency,
    symbol: display.symbol,
  }
}

export async function getCurrencySymbol(): Promise<string> {
  const { symbol } = await getDisplayCurrency()
  return symbol
}

export async function getCurrencyCode(): Promise<string> {
  const { currency } = await getDisplayCurrency()
  return currency
}

export async function formatPriceRange(minCatalogNgn: number, maxCatalogNgn: number): Promise<string> {
  const min = await formatPrice(minCatalogNgn)
  const max = await formatPrice(maxCatalogNgn)
  return `${min}–${max}`
}
