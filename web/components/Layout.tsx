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
 
 return (
 <div className="min-h-screen bg-[#212121] text-[#ececec]">
 {!isChatPage && <Navbar />}
 <main className={isChatPage ? 'min-h-screen' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8'}>
 {children}
 </main>
 <ToastContainer
 toasts={toasts}
 onRemove={removeToast}
 />
 </div>
 )
}
