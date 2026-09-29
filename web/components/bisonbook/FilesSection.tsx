'use client'

import { useRef, useState } from 'react'
import { Cloud, Download, File as FileIcon, FileImage, FileText, Folder, HardDrive, Pencil, Search, Trash2, Upload } from 'lucide-react'
import Button from '@/components/ui/Button'
import { bisonbookAPI } from '@/lib/api'
import { showToast } from '@/lib/toast'
import {
  Card,
  Empty,
  ErrorBox,
  Loading,
  Modalish,
  SectionTitle,
  attempt,
  fieldClass,
  fmtBytes,
  fmtDate,
  labelClass,
  useLoader,
} from './ui'

type VendorFile = {
  id: number
  folder: string
  name: string
  url: string
  mime?: string | null
  size: number
  storage_backend: 'local' | 'supabase'
  source_type: string
  created_at: string
}

type FilesResponse = {
  files: VendorFile[]
  folders: string[]
  used_bytes: number
  quota_bytes: number
}

const DEFAULT_FOLDERS = ['General', 'Receipts', 'Invoices', 'Tax returns', 'KYC & Tax', 'Contracts']

function iconFor(file: VendorFile) {
  const mime = file.mime || ''
  if (mime.startsWith('image/')) return FileImage
  if (mime.includes('pdf') || mime.startsWith('text/')) return FileText
  return FileIcon
}

function EditFile({ file, folders, onDone }: { file: VendorFile; folders: string[]; onDone: () => void }) {
  const [name, setName] = useState(file.name)
  const [folder, setFolder] = useState(file.folder)
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    const ok = await attempt(() => bisonbookAPI.patch(`/files/${file.id}`, { name, folder }), 'File updated')
    setSaving(false)
    if (ok) onDone()
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={labelClass}>Name</label>
        <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className={labelClass}>Folder</label>
        <input className={fieldClass} list="bb-folder-options" value={folder} onChange={(e) => setFolder(e.target.value)} />
        <datalist id="bb-folder-options">
          {folders.map((f) => <option key={f} value={f} />)}
        </datalist>
      </div>
      <Button type="button" onClick={save} isLoading={saving} disabled={!name.trim() || !folder.trim()} className="w-full">
        Save
      </Button>
    </div>
  )
}

export default function FilesSection() {
  const [folder, setFolder] = useState('')
  const [query, setQuery] = useState('')
  const [search, setSearch] = useState('')
  const [uploadFolder, setUploadFolder] = useState('General')
  const [uploading, setUploading] = useState(false)
  const [editing, setEditing] = useState<VendorFile | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const loader = useLoader<FilesResponse>(
    () => bisonbookAPI.get('/files', { folder: folder || undefined, q: search || undefined }),
    [folder, search],
  )

  const data = loader.data
  const folders = Array.from(new Set([...DEFAULT_FOLDERS, ...(data?.folders || [])])).sort()
  const used = data?.used_bytes || 0
  const quota = data?.quota_bytes || 1
  const pct = Math.min(100, Math.round((used / quota) * 100))

  const upload = async (files: FileList | null) => {
    if (!files?.length) return
    setUploading(true)
    let okCount = 0
    for (const file of Array.from(files)) {
      const form = new FormData()
      form.append('file', file)
      form.append('folder', uploadFolder)
      if (await attempt(() => bisonbookAPI.upload('/files', form))) okCount += 1
    }
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
    if (okCount) {
      showToast(`Uploaded ${okCount} file${okCount === 1 ? '' : 's'}`, 'success')
      void loader.reload()
    }
  }

  const remove = async (file: VendorFile) => {
    if (!window.confirm(`Delete ${file.name}? This cannot be undone.`)) return
    if (await attempt(() => bisonbookAPI.del(`/files/${file.id}`), 'File deleted')) void loader.reload()
  }

  const open = (file: VendorFile) =>
    attempt(() => bisonbookAPI.open(`/files/${file.id}/download`, undefined, file.name))

  return (
    <div className="space-y-5">
      <Card>
        <SectionTitle
          title="Cloud storage"
          subtitle="Receipts, invoices, tax returns and verification documents in one place. Generated PDFs are saved here automatically."
        />
        <div className="flex items-center justify-between text-xs text-[#b4b4b4] mb-1">
          <span>{fmtBytes(used)} of {fmtBytes(quota)} used</span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 rounded-full bg-[#2f2f2f] overflow-hidden">
          <div className={`h-full ${pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-amber-500' : 'bg-[#19C37D]'}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <div>
            <label className={labelClass}>Upload to folder</label>
            <input className={fieldClass} list="bb-upload-folders" value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)} />
            <datalist id="bb-upload-folders">
              {folders.filter((f) => f !== 'KYC & Tax').map((f) => <option key={f} value={f} />)}
            </datalist>
          </div>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => upload(e.target.files)} />
          <Button size="sm" isLoading={uploading} disabled={!uploadFolder.trim()} onClick={() => inputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1" /> Upload files
          </Button>
          <span className="text-xs text-[#8e8e8e]">Up to 25 MB per file.</span>
        </div>
      </Card>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="md:w-56 shrink-0 space-y-1">
          <button type="button" onClick={() => setFolder('')}
            className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left ${folder === '' ? 'bg-[#2f2f2f] text-white' : 'text-[#b4b4b4] hover:bg-[#2a2a2a]'}`}>
            <Folder className="w-4 h-4" /> All files
          </button>
          {folders.map((f) => (
            <button key={f} type="button" onClick={() => setFolder(f)}
              className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-left ${folder === f ? 'bg-[#2f2f2f] text-white' : 'text-[#b4b4b4] hover:bg-[#2a2a2a]'}`}>
              <Folder className="w-4 h-4" /> <span className="truncate">{f}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0 space-y-3">
          <form className="relative" onSubmit={(e) => { e.preventDefault(); setSearch(query.trim()) }}>
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8e8e8e]" />
            <input className={`${fieldClass} pl-9`} placeholder="Search file names and press Enter" value={query} onChange={(e) => setQuery(e.target.value)} />
          </form>

          {loader.loading && !data ? <Loading /> : null}
          {loader.error ? <ErrorBox message={loader.error} onRetry={loader.reload} /> : null}

          {data ? (
            data.files.length ? (
              <div className="overflow-x-auto rounded-xl border border-[#3d3d3d]">
                <table className="min-w-full text-sm">
                  <thead className="bg-[#171717] text-[#8e8e8e] text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Name</th>
                      <th className="px-3 py-2 text-left font-medium">Folder</th>
                      <th className="px-3 py-2 text-right font-medium">Size</th>
                      <th className="px-3 py-2 text-left font-medium">Added</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#2f2f2f] text-[#ececec]">
                    {data.files.map((file) => {
                      const Icon = iconFor(file)
                      const locked = file.source_type === 'kyc'
                      return (
                        <tr key={file.id}>
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => open(file)} className="flex items-center gap-2 text-left hover:text-[#19C37D] min-w-0">
                              <Icon className="w-4 h-4 shrink-0 text-[#8e8e8e]" />
                              <span className="truncate max-w-[18rem]">{file.name}</span>
                              {file.storage_backend === 'supabase'
                                ? <Cloud className="w-3.5 h-3.5 shrink-0 text-sky-400" aria-label="Cloud" />
                                : <HardDrive className="w-3.5 h-3.5 shrink-0 text-[#8e8e8e]" aria-label="Server" />}
                            </button>
                          </td>
                          <td className="px-3 py-2 text-[#b4b4b4]">{file.folder}</td>
                          <td className="px-3 py-2 text-right text-[#b4b4b4] whitespace-nowrap">{fmtBytes(file.size)}</td>
                          <td className="px-3 py-2 text-[#b4b4b4] whitespace-nowrap">{fmtDate(file.created_at)}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <button type="button" title="Download" onClick={() => open(file)} className="p-1 text-[#b4b4b4] hover:text-white">
                              <Download className="w-4 h-4" />
                            </button>
                            {!locked ? (
                              <>
                                <button type="button" title="Rename or move" onClick={() => setEditing(file)} className="p-1 text-[#b4b4b4] hover:text-white">
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button type="button" title="Delete" onClick={() => remove(file)} className="p-1 text-[#b4b4b4] hover:text-red-400">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <span className="ml-1 text-[10px] uppercase tracking-wide text-[#8e8e8e]">verification</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <Empty>{search || folder ? 'No files match.' : 'No files yet. Upload receipts or generate an invoice to get started.'}</Empty>
            )
          ) : null}
        </div>
      </div>

      <Modalish open={Boolean(editing)} title="Rename or move file" onClose={() => setEditing(null)}>
        {editing ? (
          <EditFile file={editing} folders={folders} onDone={() => { setEditing(null); void loader.reload() }} />
        ) : null}
      </Modalish>
    </div>
  )
}
