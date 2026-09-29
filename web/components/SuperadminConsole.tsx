'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { adminAPI, apiErrorMessage } from '@/lib/api'
import { vendorStatus } from '@/lib/vendorOnboarding'
import { resolveMediaUrl, productImageList } from '@/lib/media'
import { showToast } from '@/lib/toast'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import PriceText from '@/components/PriceText'
import AdminVendorTaxPanel from '@/components/bisonbook/AdminVendorTaxPanel'
import {
  ArrowLeft,
  CheckCircle,
  EyeOff,
  Flag,
  MessageSquare,
  Package,
  ShieldCheck,
  Trash2,
} from 'lucide-react'

type AssessAction = 'approve' | 'flag' | 'hide'

function statusBadge(vendor: any) {
  const status = vendorStatus(vendor)
  return {
    status,
    label: status === 'revoked' ? 'Revoked' : status === 'rejected' ? 'Rejected' : status === 'verified' ? 'Verified' : 'Pending',
    variant: (status === 'verified' ? 'success' : status === 'rejected' || status === 'revoked' ? 'danger' : 'warning') as
      | 'success'
      | 'danger'
      | 'warning',
  }
}

function assessmentMeta(value?: string) {
  const assessment = String(value || 'pending').toLowerCase()
  if (assessment === 'approved') return { label: 'Approved', variant: 'success' as const }
  if (assessment === 'flagged') return { label: 'Needs changes', variant: 'warning' as const }
  if (assessment === 'hidden') return { label: 'Hidden', variant: 'danger' as const }
  return { label: 'Not assessed', variant: 'default' as const }
}

function formatWhen(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

export default function SuperadminConsole() {
  const [vendors, setVendors] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [advice, setAdvice] = useState('')
  const [adviceProductId, setAdviceProductId] = useState<number | 0>(0)
  const [notesById, setNotesById] = useState<Record<number, string>>({})
  const [productQuery, setProductQuery] = useState('')

  const loadVendors = useCallback(async () => {
    const rows = await adminAPI.listVendors()
    setVendors(Array.isArray(rows) ? rows : [])
  }, [])

  const loadDetail = useCallback(async (vendorId: number) => {
    setDetailLoading(true)
    setLoadError(null)
    try {
      const payload = await adminAPI.getVendor(vendorId)
      setDetail(payload)
      setNotesById((current) => {
        const next = { ...current }
        for (const listing of payload?.products || []) {
          if (listing?.id && next[listing.id] == null) {
            next[listing.id] = listing.admin_assessment_notes || ''
          }
        }
        return next
      })
    } catch (error) {
      const message = apiErrorMessage(error, 'Could not load this vendor.')
      setLoadError(message)
      setDetail(null)
      showToast(message, 'error')
    } finally {
      setDetailLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    void loadVendors()
      .catch((error) => {
        if (!cancelled) showToast(apiErrorMessage(error, 'Could not load platform vendors.'), 'error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loadVendors])

  useEffect(() => {
    if (!selectedId) {
      setDetail(null)
      setLoadError(null)
      setAdvice('')
      setAdviceProductId(0)
      setProductQuery('')
      return
    }
    void loadDetail(selectedId)
  }, [selectedId, loadDetail])

  const counts = useMemo(() => {
    const summary = { pending: 0, verified: 0, rejected: 0, revoked: 0 }
    for (const vendor of vendors) {
      const status = vendorStatus(vendor)
      if (status === 'verified') summary.verified += 1
      else if (status === 'revoked') summary.revoked += 1
      else if (status === 'rejected') summary.rejected += 1
      else summary.pending += 1
    }
    return summary
  }, [vendors])

  const openVendor = (vendorId: number) => {
    setSelectedId(vendorId)
    setDetail(null)
    setLoadError(null)
    setDetailLoading(true)
  }

  const closeVendor = () => {
    setSelectedId(null)
    setDetail(null)
    setLoadError(null)
  }

  const applyDetail = (payload: any) => {
    setDetail(payload)
    setVendors((rows) =>
      rows.map((row) => (row.id === payload.id ? { ...row, ...payload, products: undefined } : row)),
    )
  }

  const handleAssess = async (listing: any, action: AssessAction) => {
    if (!selectedId) return
    const notes = String(notesById[listing.id] || '').trim()
    if ((action === 'flag' || action === 'hide') && notes.length < 8) {
      showToast('Add a short note so the vendor knows what to change.', 'error')
      return
    }
    const key = `${action}-${listing.id}`
    setBusy(key)
    try {
      const payload = await adminAPI.assessVendorProduct(selectedId, listing.id, action, notes || undefined)
      applyDetail(payload)
      showToast(
        action === 'approve'
          ? 'Listing approved.'
          : action === 'flag'
            ? 'Vendor was asked to fix this listing.'
            : 'Listing hidden from buyers.',
        'success',
      )
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not save that assessment.'), 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleDelete = async (listing: any) => {
    if (!selectedId) return
    const ok = window.confirm(`Remove "${listing.name}" from this vendor's catalog? This cannot be undone.`)
    if (!ok) return
    setBusy(`delete-${listing.id}`)
    try {
      const payload = await adminAPI.deleteVendorProduct(selectedId, listing.id)
      applyDetail(payload)
      showToast('Product removed from this vendor.', 'success')
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not delete that product.'), 'error')
    } finally {
      setBusy(null)
    }
  }

  const handleAdvice = async () => {
    if (!selectedId) return
    const message = advice.trim()
    if (message.length < 8) {
      showToast('Advice must be at least 8 characters.', 'error')
      return
    }
    setBusy('advice')
    try {
      const payload = await adminAPI.adviseVendor(selectedId, message, adviceProductId || null)
      applyDetail(payload)
      setAdvice('')
      setAdviceProductId(0)
      showToast('Advice sent to the vendor.', 'success')
    } catch (error) {
      showToast(apiErrorMessage(error, 'Could not send advice.'), 'error')
    } finally {
      setBusy(null)
    }
  }

  const listings = Array.isArray(detail?.products) ? detail.products : []
  const filteredListings = listings.filter((listing: any) => {
    const haystack = `${listing.name || ''} ${listing.sku || ''} ${listing.category || ''}`.toLowerCase()
    return haystack.includes(productQuery.trim().toLowerCase())
  })
  const adviceItems = Array.isArray(detail?.admin_advice) ? detail.admin_advice : []
  const selectedMeta = detail ? statusBadge(detail) : null

  return (
    <div className="min-h-dvh bg-[#212121] text-[#ececec]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-[#19C37D] font-semibold">Superadmin</p>
          <h1 className="text-2xl sm:text-3xl font-bold mt-1">Platform control</h1>
          <p className="text-sm text-[#8e8e8e] mt-2">
            This workspace is exclusive to the superadmin account. Open any vendor to inspect listings, assess products, send advice, or remove a listing.
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl bg-[#2f2f2f] p-4">
            <p className="text-xs text-[#8e8e8e] uppercase">Pending</p>
            <p className="text-2xl font-bold mt-1">{counts.pending}</p>
          </div>
          <div className="rounded-xl bg-[#2f2f2f] p-4">
            <p className="text-xs text-[#8e8e8e] uppercase">Verified</p>
            <p className="text-2xl font-bold mt-1">{counts.verified}</p>
          </div>
          <div className="rounded-xl bg-[#2f2f2f] p-4">
            <p className="text-xs text-[#8e8e8e] uppercase">Rejected</p>
            <p className="text-2xl font-bold mt-1">{counts.rejected}</p>
          </div>
          <div className="rounded-xl bg-[#2f2f2f] p-4">
            <p className="text-xs text-[#8e8e8e] uppercase">Revoked</p>
            <p className="text-2xl font-bold mt-1">{counts.revoked}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/chat" className="inline-flex items-center gap-2 rounded-lg bg-[#19C37D] text-black px-4 py-2 text-sm font-medium">
            <MessageSquare className="w-4 h-4" />
            Chat
          </Link>
          <Link href="/admin/vendors" className="inline-flex items-center gap-2 rounded-lg bg-[#2f2f2f] px-4 py-2 text-sm font-medium">
            <ShieldCheck className="w-4 h-4" />
            Vendor review
          </Link>
        </div>

        {selectedId ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={closeVendor}
              className="inline-flex items-center gap-2 text-sm text-[#b4b4b4] hover:text-[#ececec]"
            >
              <ArrowLeft className="w-4 h-4" />
              All vendors
            </button>

            {detailLoading ? (
              <p className="rounded-xl border border-[#3d3d3d] bg-[#2f2f2f] px-4 py-6 text-sm text-[#8e8e8e]">Loading vendor listings...</p>
            ) : loadError || !detail ? (
              <p className="rounded-xl border border-[#3d3d3d] bg-[#2f2f2f] px-4 py-6 text-sm text-[#8e8e8e]">{loadError || 'Vendor not found.'}</p>
            ) : (
              <>
                <div className="rounded-xl border border-[#3d3d3d] bg-[#2f2f2f] px-4 py-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold">{detail.company_name}</h2>
                    <p className="text-sm text-[#8e8e8e] mt-1">{detail.email || 'No email'}</p>
                    <p className="text-sm text-[#8e8e8e]">{detail.phone || 'No phone'}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={selectedMeta?.variant}>{selectedMeta?.label}</Badge>
                    <Badge>{listings.length} product{listings.length === 1 ? '' : 's'}</Badge>
                  </div>
                </div>

                <AdminVendorTaxPanel vendor={detail} onChange={applyDetail} />

                <div className="rounded-xl border border-[#3d3d3d] bg-[#2f2f2f] p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-[#19C37D]" />
                    <h3 className="font-semibold">Advise this vendor</h3>
                  </div>
                  <textarea
                    value={advice}
                    onChange={(event) => setAdvice(event.target.value)}
                    rows={3}
                    placeholder="Tell the vendor what to fix, improve, or stop listing."
                    className="w-full rounded-lg bg-[#171717] border border-[#3d3d3d] px-3 py-2 text-sm text-[#ececec] placeholder-[#8e8e8e] focus:outline-none focus:ring-2 focus:ring-[#19C37D]"
                  />
                  <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                    <select
                      value={adviceProductId}
                      onChange={(event) => setAdviceProductId(Number(event.target.value) || 0)}
                      className="rounded-lg bg-[#171717] border border-[#3d3d3d] px-3 py-2 text-sm text-[#ececec] focus:outline-none focus:ring-2 focus:ring-[#19C37D]"
                    >
                      <option value={0}>Whole account</option>
                      {listings.map((listing: any) => (
                        <option key={listing.id} value={listing.id}>
                          {listing.name}
                        </option>
                      ))}
                    </select>
                    <Button onClick={() => void handleAdvice()} isLoading={busy === 'advice'} disabled={Boolean(busy)}>
                      Send advice
                    </Button>
                  </div>
                  {adviceItems.length > 0 ? (
                    <div className="space-y-2 max-h-56 overflow-y-auto">
                      {adviceItems.map((item: any) => (
                        <div key={item.id} className="rounded-lg bg-[#171717] px-3 py-2 text-sm">
                          <p className="text-[#ececec]">{item.message}</p>
                          <p className="text-xs text-[#8e8e8e] mt-1">
                            {item.product_name ? `${item.product_name} · ` : ''}
                            {formatWhen(item.created_at)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-[#8e8e8e]">No advice sent yet.</p>
                  )}
                </div>

                <div className="rounded-xl border border-[#3d3d3d] bg-[#2f2f2f] overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#3d3d3d] flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-[#19C37D]" />
                      <h3 className="font-semibold">Listed products</h3>
                    </div>
                    <input
                      value={productQuery}
                      onChange={(event) => setProductQuery(event.target.value)}
                      placeholder="Search listings"
                      className="w-full sm:w-64 rounded-lg bg-[#171717] border border-[#3d3d3d] px-3 py-2 text-sm text-[#ececec] placeholder-[#8e8e8e] focus:outline-none focus:ring-2 focus:ring-[#19C37D]"
                    />
                  </div>
                  {filteredListings.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-[#8e8e8e]">
                      {listings.length === 0 ? 'This vendor has no listed products.' : 'No listings match that search.'}
                    </p>
                  ) : (
                    <div className="divide-y divide-[#3d3d3d]">
                      {filteredListings.map((listing: any) => {
                        const cover = productImageList(listing)[0]
                        const meta = assessmentMeta(listing.admin_assessment)
                        return (
                          <div key={listing.id} className="p-4 grid grid-cols-1 lg:grid-cols-[112px_1fr] gap-4">
                            <div className="w-full h-28 rounded-lg bg-[#171717] overflow-hidden">
                              {cover ? (
                                <img src={resolveMediaUrl(cover)} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[#8e8e8e]">
                                  <Package className="w-8 h-8" />
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 space-y-3">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <h4 className="font-semibold">{listing.name}</h4>
                                  <p className="text-sm text-[#8e8e8e]">
                                    {listing.sku || 'No SKU'}
                                    {listing.category ? ` · ${listing.category}` : ''}
                                    {` · Stock ${listing.stock_quantity ?? 0}`}
                                  </p>
                                  <p className="text-sm font-medium mt-1">
                                    <PriceText amount={listing.price} contact={listing.price_mode === 'contact'} />
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <Badge variant={meta.variant}>{meta.label}</Badge>
                                  <Badge variant={listing.is_active ? 'success' : 'danger'}>
                                    {listing.is_active ? 'Visible' : 'Hidden from buyers'}
                                  </Badge>
                                </div>
                              </div>
                              {listing.description ? (
                                <p className="text-sm text-[#b4b4b4] line-clamp-2">{listing.description}</p>
                              ) : null}
                              <textarea
                                value={notesById[listing.id] ?? ''}
                                onChange={(event) =>
                                  setNotesById((current) => ({ ...current, [listing.id]: event.target.value }))
                                }
                                rows={2}
                                placeholder="Assessment notes for this product"
                                className="w-full rounded-lg bg-[#171717] border border-[#3d3d3d] px-3 py-2 text-sm text-[#ececec] placeholder-[#8e8e8e] focus:outline-none focus:ring-2 focus:ring-[#19C37D]"
                              />
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => void handleAssess(listing, 'approve')}
                                  isLoading={busy === `approve-${listing.id}`}
                                  disabled={Boolean(busy)}
                                >
                                  <CheckCircle className="w-4 h-4 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => void handleAssess(listing, 'flag')}
                                  isLoading={busy === `flag-${listing.id}`}
                                  disabled={Boolean(busy)}
                                >
                                  <Flag className="w-4 h-4 mr-1" />
                                  Flag
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => void handleAssess(listing, 'hide')}
                                  isLoading={busy === `hide-${listing.id}`}
                                  disabled={Boolean(busy)}
                                >
                                  <EyeOff className="w-4 h-4 mr-1" />
                                  Hide
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  onClick={() => void handleDelete(listing)}
                                  isLoading={busy === `delete-${listing.id}`}
                                  disabled={Boolean(busy)}
                                >
                                  <Trash2 className="w-4 h-4 mr-1" />
                                  Delete
                                </Button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="rounded-xl border border-[#3d3d3d] bg-[#2f2f2f] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#3d3d3d] flex items-center gap-2">
              <Package className="w-4 h-4 text-[#19C37D]" />
              <h2 className="font-semibold">All vendors</h2>
            </div>
            {loading ? (
              <p className="px-4 py-6 text-sm text-[#8e8e8e]">Loading vendors...</p>
            ) : vendors.length === 0 ? (
              <p className="px-4 py-6 text-sm text-[#8e8e8e]">No vendor accounts yet.</p>
            ) : (
              <div className="divide-y divide-[#3d3d3d]">
                {vendors.map((vendor) => {
                  const meta = statusBadge(vendor)
                  const productCount = Number(vendor.product_count || 0)
                  return (
                    <button
                      key={vendor.id}
                      type="button"
                      onClick={() => openVendor(vendor.id)}
                      className="w-full text-left px-4 py-3 flex flex-wrap items-center justify-between gap-2 hover:bg-[#353535] transition-colors"
                    >
                      <div>
                        <p className="font-medium">{vendor.company_name}</p>
                        <p className="text-sm text-[#8e8e8e]">
                          {vendor.email || 'No email'}
                          {` · ${productCount} product${productCount === 1 ? '' : 's'}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {vendor.vat_status === 'pending' ? <Badge variant="warning">VAT review</Badge> : null}
                        {vendor.can_charge_vat ? <Badge variant="success">VAT</Badge> : null}
                        <Badge variant={meta.variant}>{meta.label}</Badge>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
