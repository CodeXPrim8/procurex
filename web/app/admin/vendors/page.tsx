'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { adminAPI } from '@/lib/api'
import { isSuperAdmin, useAuth } from '@/lib/auth'
import { showToast } from '@/lib/toast'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { ShieldCheck } from 'lucide-react'
import { vendorStatus } from '@/lib/vendorOnboarding'

export default function AdminVendorsPage() {
  const { user, authReady } = useAuth()
  const router = useRouter()
  const [vendors, setVendors] = useState<any[]>([])
  const [status, setStatus] = useState('pending')
  const [loading, setLoading] = useState(true)
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [busyId, setBusyId] = useState<number | null>(null)

  useEffect(() => {
    if (!authReady) return
    if (!isSuperAdmin(user)) {
      router.replace('/chat')
      return
    }
    let cancelled = false
    setLoading(true)
    void adminAPI
      .listVendors(status === 'all' ? undefined : status)
      .then((rows) => {
        if (!cancelled) setVendors(Array.isArray(rows) ? rows : [])
      })
      .catch((error) => {
        showToast(error?.response?.data?.detail || 'Could not load vendor applications.', 'error')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [authReady, status, user, router])

  const review = async (vendorId: number, action: 'approve' | 'reject' | 'revoke') => {
    const reason = (notes[vendorId] || '').trim()
    if ((action === 'reject' || action === 'revoke') && reason.length < 8) {
      showToast('Add a reason of at least 8 characters.', 'error')
      return
    }
    if (action === 'revoke') {
      const confirmed = window.confirm('Revoke this vendor? Their products will be hidden from buyers until they are approved again.')
      if (!confirmed) return
    }
    setBusyId(vendorId)
    try {
      await adminAPI.reviewVendor(vendorId, action, reason)
      setVendors((prev) => prev.filter((item) => item.id !== vendorId))
      showToast(
        action === 'approve' ? 'Vendor approved.' : action === 'revoke' ? 'Verification revoked.' : 'Vendor rejected.',
        'success'
      )
    } catch (error: any) {
      showToast(error?.response?.data?.detail || 'Could not save that review.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-dvh bg-[#212121] text-[#ececec]">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-6">
          <ShieldCheck className="w-7 h-7 text-[#19C37D]" />
          <div>
            <h1 className="text-2xl font-bold">Vendor review</h1>
            <p className="text-sm text-[#8e8e8e]">Approve only businesses with real identity documents.</p>
          </div>
        </div>
        <div className="flex gap-2 mb-6">
          {['pending', 'verified', 'rejected', 'revoked', 'all'].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              className={`px-3 py-1.5 rounded-lg text-sm capitalize ${
                status === value ? 'bg-[#19C37D] text-black' : 'bg-[#2f2f2f] text-[#b4b4b4]'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
        {loading ? (
          <p className="text-[#8e8e8e]">Loading applications...</p>
        ) : vendors.length === 0 ? (
          <p className="text-[#8e8e8e]">No vendors in this queue.</p>
        ) : (
          <div className="space-y-4">
            {vendors.map((vendor) => {
              const status = vendorStatus(vendor)
              return (
              <div key={vendor.id} className="rounded-xl border border-[#3d3d3d] bg-[#2f2f2f] p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold">{vendor.company_name}</h2>
                    <p className="text-sm text-[#8e8e8e]">{vendor.email || 'No email on file'}</p>
                  </div>
                  <Badge variant={status === 'verified' ? 'success' : status === 'rejected' || status === 'revoked' ? 'danger' : 'warning'}>
                    {status === 'revoked' ? 'Revoked' : status === 'rejected' ? 'Rejected' : status === 'verified' ? 'Verified' : vendor.submitted ? 'In review' : 'Pending'}
                  </Badge>
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 text-sm">
                  <div><dt className="text-[#8e8e8e]">Officer</dt><dd>{vendor.personal_name || '—'}</dd></div>
                  <div><dt className="text-[#8e8e8e]">CAC</dt><dd>{vendor.business_registration_number || '—'}</dd></div>
                  <div><dt className="text-[#8e8e8e]">Phone</dt><dd>{vendor.phone || '—'}</dd></div>
                  <div><dt className="text-[#8e8e8e]">ID</dt><dd>{vendor.id_type || '—'} {vendor.id_number || ''}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-[#8e8e8e]">Address</dt><dd>{vendor.business_address || vendor.address || '—'}</dd></div>
                </dl>
                {(status === 'rejected' || status === 'revoked') && vendor.verification_notes ? (
                  <p className="mt-3 text-sm text-red-400">{vendor.verification_notes}</p>
                ) : null}
                {status === 'verified' && vendor.verification_notes ? (
                  <p className="mt-3 text-sm text-[#8e8e8e]">{vendor.verification_notes}</p>
                ) : null}
                <div className="flex flex-wrap gap-3 mt-3 text-sm">
                  {vendor.id_document_url ? <a className="text-[#19C37D]" href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${vendor.id_document_url}`} target="_blank" rel="noreferrer">ID document</a> : <span className="text-red-400">Missing ID document</span>}
                  {vendor.company_certificate_url ? <a className="text-[#19C37D]" href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${vendor.company_certificate_url}`} target="_blank" rel="noreferrer">Certificate</a> : <span className="text-red-400">Missing certificate</span>}
                  {vendor.address_verification_bill_url ? <a className="text-[#19C37D]" href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${vendor.address_verification_bill_url}`} target="_blank" rel="noreferrer">Address proof</a> : <span className="text-red-400">Missing address proof</span>}
                </div>
                <div className="mt-4 space-y-3">
                    <textarea
                      value={notes[vendor.id] || ''}
                      onChange={(event) => setNotes((prev) => ({ ...prev, [vendor.id]: event.target.value }))}
                      className="w-full rounded-lg bg-[#171717] border border-[#3d3d3d] px-3 py-2 text-sm"
                      rows={2}
                      placeholder={
                        status === 'verified'
                          ? 'Reason to revoke verification (required)'
                          : status === 'revoked' || status === 'rejected'
                            ? 'Update notes or approve after they fix this'
                            : 'Review notes (required to reject)'
                      }
                    />
                    <div className="flex gap-2">
                      {status !== 'verified' ? (
                      <Button
                        type="button"
                        onClick={() => void review(vendor.id, 'approve')}
                        isLoading={busyId === vendor.id}
                        disabled={!vendor.onboarding_complete}
                      >
                        Approve
                      </Button>
                      ) : null}
                      {status === 'pending' ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void review(vendor.id, 'reject')}
                        disabled={busyId === vendor.id}
                      >
                        Reject
                      </Button>
                      ) : null}
                      {status === 'verified' ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => void review(vendor.id, 'revoke')}
                        disabled={busyId === vendor.id}
                      >
                        Revoke verification
                      </Button>
                      ) : null}
                    </div>
                  </div>
              </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
