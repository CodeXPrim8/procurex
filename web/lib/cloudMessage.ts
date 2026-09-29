export const WORKSPACE_SESSION_TITLE = '__procurex_workspace__'

const META_MARK = '\n<!--PX:'

export type CloudMessageExtra = {
  quotation?: any
  product_results?: any[]
}

function stripMeta(text: string) {
  const idx = text.lastIndexOf(META_MARK)
  if (idx < 0) return text
  return text.slice(0, idx)
}

export function decodeCloudContent(raw: string | null | undefined): {
  content: string
} & CloudMessageExtra {
  const text = String(raw || '')
  const idx = text.lastIndexOf(META_MARK)
  if (idx < 0) return { content: text }
  const payload = text.slice(idx + META_MARK.length).replace(/-->\s*$/, '')
  try {
    const extra = JSON.parse(payload) as CloudMessageExtra
    return {
      content: text.slice(0, idx),
      quotation: extra?.quotation,
      product_results: extra?.product_results,
    }
  } catch {
    return { content: text }
  }
}

export function encodeCloudContent(content: string, extra?: CloudMessageExtra | null) {
  const text = String(content || '')
  if (!extra?.quotation && !extra?.product_results?.length) return text
  try {
    return `${text}${META_MARK}${JSON.stringify({
      quotation: extra.quotation || undefined,
      product_results: extra.product_results || undefined,
    })}-->`
  } catch {
    return text
  }
}

export function extraFromApiMessage(message: any): CloudMessageExtra {
  const raw = message?.metadata ?? message?.message_metadata
  if (!raw) {
    return {
      quotation: message?.quotation,
      product_results: message?.product_results,
    }
  }
  try {
    const meta = typeof raw === 'string' ? JSON.parse(raw) : raw
    return {
      quotation: meta?.quotation || message?.quotation,
      product_results: meta?.product_results || message?.product_results,
    }
  } catch {
    return {
      quotation: message?.quotation,
      product_results: message?.product_results,
    }
  }
}

export function messageSyncKey(item: { role?: string; content?: string } | null | undefined) {
  const decoded = decodeCloudContent(item?.content)
  return `${item?.role || ''}::${decoded.content.trim()}`
}

export function isWorkspaceSessionTitle(title?: string | null) {
  return String(title || '').trim() === WORKSPACE_SESSION_TITLE
}

export function visibleChatText(content?: string | null) {
  return stripMeta(String(content || '')).trim()
}
