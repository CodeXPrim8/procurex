export function debugAuthLog(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string
) {
  // #region agent log
  fetch('http://127.0.0.1:7822/ingest/99b396db-6f63-4207-97c0-0286dee5a836', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '53a75c',
    },
    body: JSON.stringify({
      sessionId: '53a75c',
      runId: 'conv-logout-post2',
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {})
  // #endregion
}

export function debugAuthStorageSnapshot() {
  if (typeof window === 'undefined') {
    return { hasWindow: false }
  }
  const keys = Object.keys(window.localStorage).filter(
    (key) => key.startsWith('sb-') && key.includes('auth-token')
  )
  const cookieNames = document.cookie
    .split(';')
    .map((part) => part.split('=')[0]?.trim())
    .filter((name) => name.startsWith('sb-') && name.includes('auth-token'))
  return {
    hasWindow: true,
    localAuthKeys: keys.length,
    cookieAuthKeys: cookieNames.length,
    path: window.location.pathname,
    visible: document.visibilityState,
  }
}
