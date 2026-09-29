'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  BookOpen,
  ChevronDown,
  LayoutGrid,
  MessageSquare,
  Package,
  Settings,
  ShieldCheck,
  Star,
  User,
  type LucideIcon,
} from 'lucide-react'

export const SUPERADMIN_PAGES: Array<{
  href: string
  label: string
  icon: LucideIcon
  group: 'Platform' | 'Account'
}> = [
  { href: '/chat', label: 'Chat', icon: MessageSquare, group: 'Platform' },
  { href: '/vendor', label: 'Dashboard', icon: Package, group: 'Platform' },
  { href: '/admin/vendors', label: 'Vendor review', icon: ShieldCheck, group: 'Platform' },
  { href: '/vendor?tab=bisonbook', label: 'BisonBook (vendor books)', icon: BookOpen, group: 'Platform' },
  { href: '/profile', label: 'Profile', icon: User, group: 'Account' },
  { href: '/profile#voice', label: 'Voice settings', icon: Settings, group: 'Account' },
  { href: '/upgrade', label: 'Plans', icon: Star, group: 'Account' },
]

function isActivePath(pathname: string, href: string) {
  const path = href.split('#')[0]
  return pathname === path
}

export default function SuperadminPagesMenu({
  align = 'left',
  compact = false,
}: {
  align?: 'left' | 'right'
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const groups = ['Platform', 'Account'] as const

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={
          compact
            ? 'h-10 w-10 inline-flex items-center justify-center rounded-full bg-[#2a2a2a] text-white'
            : `flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                open ? 'bg-[#2f2f2f] text-[#ececec]' : 'text-[#b4b4b4] hover:bg-[#2f2f2f] hover:text-[#ececec]'
              }`
        }
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Pages"
      >
        <LayoutGrid className={compact ? 'w-5 h-5' : 'w-4 h-4'} />
        {compact ? null : <span>Pages</span>}
        {compact ? null : <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />}
      </button>
      {open ? (
        <div
          role="menu"
          className={`absolute top-full mt-2 w-56 rounded-xl border border-[#3d3d3d] bg-[#171717] shadow-xl py-2 z-50 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {groups.map((group) => (
            <div key={group}>
              <p className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-[#8e8e8e]">{group}</p>
              {SUPERADMIN_PAGES.filter((page) => page.group === group).map((page) => {
                const Icon = page.icon
                const active = isActivePath(pathname, page.href)
                return (
                  <Link
                    key={page.href}
                    href={page.href}
                    role="menuitem"
                    onClick={() => setOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2 text-sm ${
                      active ? 'bg-[#2f2f2f] text-[#ececec]' : 'text-[#ececec] hover:bg-[#2f2f2f]'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-[#19C37D]" />
                    {page.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
