'use client'

const BUSINESS_KEY = 'procurex_active_business'
const REQUEST_KEY = 'procurex_active_request'
const CLIENT_KEY = 'procurex_active_client'

function readId(key: string) {
  if (typeof window === 'undefined') return null
  const id = Number(window.localStorage.getItem(key) || '')
  return Number.isFinite(id) && id > 0 ? id : null
}

function writeId(key: string, id: number | null) {
  if (typeof window === 'undefined') return
  if (id) window.localStorage.setItem(key, String(id))
  else window.localStorage.removeItem(key)
  window.dispatchEvent(new Event('procurex-business'))
}

export function getActiveBusinessId() {
  return readId(BUSINESS_KEY)
}

export function setActiveBusinessId(
  id: number | null,
  options?: { skipCloud?: boolean }
) {
  writeId(BUSINESS_KEY, id)
  if (!options?.skipCloud) {
    void import('./cloudWorkspace')
      .then(({ patchWorkspace }) => patchWorkspace({ active_business_id: id }))
      .catch(() => {})
  }
}

export function getActiveClientId() {
  return readId(CLIENT_KEY)
}

export function setActiveClientId(id: number | null) {
  writeId(CLIENT_KEY, id)
}

export function getActiveRequestId() {
  return readId(REQUEST_KEY)
}

export function setActiveRequestId(id: number | null) {
  writeId(REQUEST_KEY, id)
}

export function quoteScopePayload() {
  return {
    business_id: getActiveBusinessId() || undefined,
    client_id: getActiveClientId() || undefined,
    request_id: getActiveRequestId() || undefined,
  }
}

export function subscribeBusiness(onChange: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener('procurex-business', onChange)
  window.addEventListener('storage', onChange)
  return () => {
    window.removeEventListener('procurex-business', onChange)
    window.removeEventListener('storage', onChange)
  }
}
