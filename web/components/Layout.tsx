'use client'

import { ReactNode, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Navbar from './Navbar'
import { ToastContainer } from './ui/Toast'
import { subscribe, getToasts, removeToast, Toast } from '@/lib/toast'

interface LayoutProps {
 children: ReactNode
}

export default function Layout({ children }: LayoutProps) {
 const [toasts, setToasts] = useState<Toast[]>([])

 useEffect(() => {
 setToasts(getToasts())
 const unsubscribe = subscribe((newToasts) => {
 setToasts(newToasts)
 })
 return unsubscribe
 }, [])

 const pathname = usePathname()
 const isChatPage = pathname === '/chat'
 const isAuthPage = pathname === '/login' || pathname === '/register'

 return (
 <div className="min-h-dvh bg-[#212121] text-[#ececec]">
 {!isChatPage && <Navbar />}
 <main
 className={
 isChatPage
 ? 'min-h-0'
 : isAuthPage
 ? ''
 : 'max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8'
 }
 >
 {children}
 </main>
 <ToastContainer
 toasts={toasts}
 onRemove={removeToast}
 />
 </div>
 )
}
