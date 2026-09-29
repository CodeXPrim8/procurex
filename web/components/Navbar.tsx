'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, X, User, LogOut, MessageSquare, FileText, Package, Star, ShieldCheck, Building2, type LucideIcon } from 'lucide-react'
import { useStore, type AccountView } from '@/lib/store'
import { isAdminUser, isSuperAdmin, useIsVendor } from '@/lib/auth'
import Logo from '@/components/Logo'
import SuperadminPagesMenu, { SUPERADMIN_PAGES } from '@/components/SuperadminPagesMenu'

type NavLink = {
  href: string
  label: string
  icon: LucideIcon
  view?: AccountView
}

const vendorLinks: NavLink[] = [
  { href: '/vendor', label: 'Dashboard', icon: Package, view: 'vendor' },
  { href: '/chat', label: 'Chat', icon: MessageSquare, view: 'buyer' },
  { href: '/businesses', label: 'Businesses', icon: Building2 },
  { href: '/quotations', label: 'Quotations', icon: FileText },
]

const buyerLinks: NavLink[] = [
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/businesses', label: 'Businesses', icon: Building2 },
  { href: '/quotations', label: 'Quotations', icon: FileText },
  { href: '/upgrade', label: 'Plans', icon: Star },
]

const superAdminLinks: NavLink[] = [
  { href: '/chat', label: 'Chat', icon: MessageSquare },
  { href: '/businesses', label: 'Businesses', icon: Building2 },
  { href: '/quotations', label: 'Quotations', icon: FileText },
  { href: '/vendor', label: 'Dashboard', icon: Package },
  { href: '/admin/vendors', label: 'Vendor review', icon: ShieldCheck },
]

export default function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { user, isAuthenticated, logout, setAccountView } = useStore()
  const isVendor = useIsVendor()
  const isAdmin = isAdminUser(user)
  const isSuper = isSuperAdmin(user)
  const navLinks = isSuper ? superAdminLinks : isVendor ? vendorLinks : buyerLinks

  useEffect(() => {
    setIsMobileMenuOpen(false)
    setIsUserMenuOpen(false)
  }, [pathname])

  const handleLogout = async () => {
    await logout()
    router.push('/login')
  }

  const openLink = (link: NavLink) => {
    if (link.view) setAccountView(link.view)
  }

  return (
    <nav className="bg-[#171717] border-[#2f2f2f] border-b sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center h-14 sm:h-16 gap-2">
          <Link
            href={isVendor && !isSuper ? '/vendor' : '/chat'}
            className="flex items-center min-w-0"
            onClick={() => {
              if (isVendor && !isSuper) setAccountView('vendor')
            }}
          >
            <Logo className="h-7 sm:h-8" />
          </Link>

          <div className="hidden md:flex md:items-center md:space-x-4 md:ml-6">
            {navLinks.map((link) => {
              const Icon = link.icon
              const isActive = pathname === link.href
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => openLink(link)}
                  className={`flex items-center space-x-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[#2f2f2f] text-[#ececec]'
                      : 'text-[#b4b4b4] hover:bg-[#2f2f2f] hover:text-[#ececec]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{link.label}</span>
                </Link>
              )
            })}
            {isSuper ? <SuperadminPagesMenu /> : null}
          </div>

          <div className="ml-auto flex items-center space-x-1 sm:space-x-2">
            {isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center space-x-2 min-h-11 px-2 sm:px-3 py-2 rounded-md text-sm font-medium focus:outline-none text-[#ececec] hover:bg-[#2f2f2f]"
                >
                  <User className="w-5 h-5 flex-shrink-0" />
                  <span className="hidden sm:inline max-w-[10rem] truncate">{user?.full_name || user?.email}</span>
                </button>
                {isUserMenuOpen && (
                  <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 border bg-[#171717] border-[#2f2f2f]">
                    {isAdmin && (
                      <Link
                        href="/admin/vendors"
                        className="block px-4 py-2.5 text-sm text-[#ececec] hover:bg-[#2f2f2f]"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        Vendor review
                      </Link>
                    )}
                    {isSuper && (
                      <Link
                        href="/vendor"
                        className="block px-4 py-2.5 text-sm text-[#ececec] hover:bg-[#2f2f2f]"
                        onClick={() => setIsUserMenuOpen(false)}
                      >
                        Dashboard
                      </Link>
                    )}
                    {isVendor && !isSuper && (
                      <>
                        <Link
                          href="/vendor"
                          className="block px-4 py-2.5 text-sm text-[#ececec] hover:bg-[#2f2f2f]"
                          onClick={() => {
                            setAccountView('vendor')
                            setIsUserMenuOpen(false)
                          }}
                        >
                          Vendor dashboard
                        </Link>
                        <Link
                          href="/chat"
                          className="block px-4 py-2.5 text-sm text-[#ececec] hover:bg-[#2f2f2f]"
                          onClick={() => {
                            setAccountView('buyer')
                            setIsUserMenuOpen(false)
                          }}
                        >
                          Procurement chat
                        </Link>
                      </>
                    )}
                    <Link
                      href="/profile#voice"
                      className="block px-4 py-2.5 text-sm text-[#ececec] hover:bg-[#2f2f2f]"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      Voice settings
                    </Link>
                    <Link
                      href="/profile"
                      className="block px-4 py-2.5 text-sm text-[#ececec] hover:bg-[#2f2f2f]"
                      onClick={() => setIsUserMenuOpen(false)}
                    >
                      Profile
                    </Link>
                    <button
                      onClick={() => {
                        handleLogout()
                        setIsUserMenuOpen(false)
                      }}
                      className="block w-full text-left px-4 py-2.5 text-sm text-[#ececec] hover:bg-[#2f2f2f]"
                    >
                      <LogOut className="w-4 h-4 inline mr-2" />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link
                href="/login"
                className="hidden sm:inline-flex px-3 py-2 text-sm font-medium text-[#19C37D] hover:text-[#16A66F]"
              >
                Login
              </Link>
            )}

            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden min-h-11 min-w-11 inline-flex items-center justify-center rounded-md text-[#ececec] hover:bg-[#2f2f2f]"
              aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-[#2f2f2f] bg-[#171717]">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {(isSuper ? SUPERADMIN_PAGES : navLinks).map((link) => {
              const Icon = link.icon
              const isActive = pathname === link.href.split('#')[0]
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => {
                    if ('view' in link) openLink(link as NavLink)
                    setIsMobileMenuOpen(false)
                  }}
                  className={`flex items-center space-x-2 min-h-11 px-3 py-2 rounded-md text-base font-medium ${
                    isActive
                      ? 'bg-[#2f2f2f] text-[#ececec]'
                      : 'text-[#b4b4b4] hover:bg-[#2f2f2f] hover:text-[#ececec]'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{link.label}</span>
                </Link>
              )
            })}
            <div className="border-t border-[#2f2f2f] pt-2 mt-2">
              {isAuthenticated ? (
                <>
                  {isVendor && (
                    <Link
                      href="/vendor"
                      onClick={() => {
                        setAccountView('vendor')
                        setIsMobileMenuOpen(false)
                      }}
                      className="flex items-center space-x-2 min-h-11 px-3 py-2 rounded-md text-base font-medium text-[#ececec] hover:bg-[#2f2f2f]"
                    >
                      <Package className="w-5 h-5" />
                      <span>Vendor dashboard</span>
                    </Link>
                  )}
                  <Link
                    href="/profile"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="flex items-center space-x-2 min-h-11 px-3 py-2 rounded-md text-base font-medium text-[#ececec] hover:bg-[#2f2f2f]"
                  >
                    <User className="w-5 h-5" />
                    <span>Profile</span>
                  </Link>
                  <button
                    onClick={() => {
                      handleLogout()
                      setIsMobileMenuOpen(false)
                    }}
                    className="flex items-center space-x-2 min-h-11 w-full px-3 py-2 rounded-md text-base font-medium text-[#ececec] hover:bg-[#2f2f2f]"
                  >
                    <LogOut className="w-5 h-5" />
                    <span>Logout</span>
                  </button>
                </>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center space-x-2 min-h-11 px-3 py-2 rounded-md text-base font-medium text-[#19C37D] hover:bg-[#2f2f2f]"
                >
                  <span>Login</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
