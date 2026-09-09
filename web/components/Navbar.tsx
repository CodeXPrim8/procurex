'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, X, User, LogOut, ShoppingCart, MessageSquare, FileText, Package, Star } from 'lucide-react'
import { useStore } from '@/lib/store'
import SpeedTest from './SpeedTest'

export default function Navbar() {
 const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
 const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
 const pathname = usePathname()
 const router = useRouter()
 const { user, isAuthenticated, logout } = useStore()

 const handleLogout = async () => {
 await logout()
 router.push('/login')
 }

 const navLinks = [
 { href: '/chat', label: 'Chat', icon: MessageSquare },
 { href: '/products', label: 'Products', icon: ShoppingCart },
 { href: '/quotations', label: 'Quotations', icon: FileText },
 { href: '/upgrade', label: 'Plans', icon: Star },
 ]

 if (user?.role === 'vendor') {
 navLinks.push({ href: '/vendor', label: 'Vendor', icon: Package })
 }

 return (
 <nav className="bg-[#171717] border-[#2f2f2f] border-b sticky top-0 z-40">
 <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
 <div className="flex justify-between items-center h-16">
 {/* Logo */}
 <Link href="/" className="flex items-center space-x-2">
 <Package className="w-8 h-8 text-[#19C37D]" />
 <span className="text-xl font-bold text-[#ececec]">ProcureX</span>
 </Link>

 {/* Desktop Navigation */}
 <div className="hidden md:flex md:items-center md:space-x-4">
 {navLinks.map((link) => {
 const Icon = link.icon
 const isActive = pathname === link.href
 return (
 <Link
 key={link.href}
 href={link.href}
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
 </div>

 {/* Right Side: Speed Test & User Menu */}
 <div className="flex items-center space-x-2 md:space-x-4">
 <SpeedTest />
 
 {isAuthenticated ? (
 <div className="relative">
 <button
 onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
 className="flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium focus:outline-none text-[#ececec] hover:bg-[#2f2f2f]"
 >
 <User className="w-5 h-5" />
 <span>{user?.full_name || user?.email}</span>
 </button>
 {isUserMenuOpen && (
 <div className="absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 border bg-[#171717] border-[#2f2f2f]">
 <Link
 href="/profile"
 className="block px-4 py-2 text-sm text-[#ececec] hover:bg-[#2f2f2f]"
 onClick={() => setIsUserMenuOpen(false)}
 >
 Profile
 </Link>
 <button
 onClick={() => {
 handleLogout()
 setIsUserMenuOpen(false)
 }}
 className="block w-full text-left px-4 py-2 text-sm text-[#ececec] hover:bg-[#2f2f2f]"
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
 className="px-4 py-2 text-sm font-medium text-[#19C37D] hover:text-[#16A66F]"
 >
 Login
 </Link>
 )}
 </div>

 {/* Mobile Menu Button */}
 <button
 onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
 className="md:hidden p-2 rounded-md focus:outline-none text-[#ececec] hover:bg-[#2f2f2f]"
 >
 {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
 </button>
 </div>
 </div>

 {/* Mobile Menu */}
 {isMobileMenuOpen && (
 <div className="md:hidden border-t border-[#2f2f2f] bg-[#171717]">
 <div className="px-2 pt-2 pb-3 space-y-1">
 {navLinks.map((link) => {
 const Icon = link.icon
 const isActive = pathname === link.href
 return (
 <Link
 key={link.href}
 href={link.href}
 onClick={() => setIsMobileMenuOpen(false)}
 className={`flex items-center space-x-2 px-3 py-2 rounded-md text-base font-medium ${
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
 <Link
 href="/profile"
 onClick={() => setIsMobileMenuOpen(false)}
 className="flex items-center space-x-2 px-3 py-2 rounded-md text-base font-medium text-[#ececec] hover:bg-[#2f2f2f]"
 >
 <User className="w-5 h-5" />
 <span>Profile</span>
 </Link>
 <button
 onClick={() => {
 handleLogout()
 setIsMobileMenuOpen(false)
 }}
 className="flex items-center space-x-2 w-full px-3 py-2 rounded-md text-base font-medium text-[#ececec] hover:bg-[#2f2f2f]"
 >
 <LogOut className="w-5 h-5" />
 <span>Logout</span>
 </button>
 </>
 ) : (
 <Link
 href="/login"
 onClick={() => setIsMobileMenuOpen(false)}
 className="flex items-center space-x-2 px-3 py-2 rounded-md text-base font-medium text-[#19C37D] hover:bg-[#2f2f2f]"
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
