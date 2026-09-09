'use client'

// USD to NGN conversion rate (approximate)
const USD_TO_NGN_RATE = 1500

// Cache for user location
let userLocation: string | null = null
let locationDetected = false

/**
 * Detect user's country based on browser locale or IP geolocation
 */
export async function detectUserLocation(): Promise<string> {
  if (locationDetected && userLocation) {
    return userLocation
  }

  try {
    // Method 1: Check browser locale
    const locale = navigator.language || (navigator as any).userLanguage
    if (locale) {
      const countryCode = locale.split('-')[1]?.toUpperCase()
      if (countryCode === 'NG') {
        userLocation = 'NG'
        locationDetected = true
        return 'NG'
      }
    }

    // Method 2: Try to get location from timezone
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (timezone.includes('Lagos') || timezone.includes('Africa/Lagos')) {
      userLocation = 'NG'
      locationDetected = true
        return 'NG'
    }

    // Method 3: Use IP geolocation (fallback to API)
    try {
      const response = await fetch('https://ipapi.co/json/')
      const data = await response.json()
      if (data.country_code === 'NG') {
        userLocation = 'NG'
        locationDetected = true
        return 'NG'
      }
      userLocation = data.country_code || 'US'
      locationDetected = true
      return userLocation || 'US'
    } catch (e) {
      // Fallback: Default to NG if detection fails (for Nigerian users)
      userLocation = 'NG'
      locationDetected = true
      return 'NG'
    }
  } catch (error) {
    console.error('Error detecting location:', error)
    // Default to Nigeria for this application
    userLocation = 'NG'
    locationDetected = true
    return 'NG'
  }
}

/**
 * Convert USD price to NGN if user is in Nigeria
 */
export async function convertPrice(usdPriceInCents: number): Promise<{ amount: number; currency: string; symbol: string }> {
  const location = await detectUserLocation()
  
  if (location === 'NG') {
    const usdAmount = usdPriceInCents / 100
    const ngnAmount = usdAmount * USD_TO_NGN_RATE
    return {
      amount: ngnAmount,
      currency: 'NGN',
      symbol: '₦'
    }
  }

  return {
    amount: usdPriceInCents / 100,
    currency: 'USD',
    symbol: '$'
  }
}

/**
 * Format price based on user location
 */
export async function formatPrice(usdPriceInCents: number, options?: { decimals?: number }): Promise<string> {
  const { amount, currency, symbol } = await convertPrice(usdPriceInCents)
  const decimals = options?.decimals ?? 2
  
  if (currency === 'NGN') {
    // Format NGN with commas
    return `${symbol}${amount.toLocaleString('en-NG', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
  }
  
  return `${symbol}${amount.toFixed(decimals)}`
}

/**
 * Get currency symbol based on location
 */
export async function getCurrencySymbol(): Promise<string> {
  const location = await detectUserLocation()
  return location === 'NG' ? '₦' : '$'
}

/**
 * Get currency code based on location
 */
export async function getCurrencyCode(): Promise<string> {
  const location = await detectUserLocation()
  return location === 'NG' ? 'NGN' : 'USD'
}

/**
 * Format price range (e.g., "$300-$800" or "₦450,000-₦1,200,000")
 */
export async function formatPriceRange(minUsdInCents: number, maxUsdInCents: number): Promise<string> {
  const min = await formatPrice(minUsdInCents)
  const max = await formatPrice(maxUsdInCents)
  return `${min}-${max}`
}


