'use client'

import { ReactNode, useEffect } from 'react'
import { X } from 'lucide-react'

interface ModalProps {
 isOpen: boolean
 onClose: () => void
 title?: string
 children: ReactNode
 footer?: ReactNode
 size?: 'sm' | 'md' | 'lg' | 'xl'
}

export default function Modal({
 isOpen,
 onClose,
 title,
 children,
 footer,
 size = 'md',
}: ModalProps) {
 useEffect(() => {
 if (isOpen) {
 document.body.style.overflow = 'hidden'
 } else {
 document.body.style.overflow = 'unset'
 }
 return () => {
 document.body.style.overflow = 'unset'
 }
 }, [isOpen])

 if (!isOpen) return null

 const sizes = {
 sm: 'max-w-md',
 md: 'max-w-lg',
 lg: 'max-w-2xl',
 xl: 'max-w-4xl',
 }

 return (
 <div className="fixed inset-0 z-50 overflow-y-auto">
 <div className="flex items-end sm:items-center justify-center min-h-dvh px-0 sm:px-4 pt-4 pb-0 sm:pb-20 text-center">
 <div
 className="fixed inset-0 transition-opacity bg-black bg-opacity-70"
 onClick={onClose}
 />
 
 <div className={`relative w-full inline-block align-bottom bg-[#2f2f2f] rounded-t-2xl sm:rounded-lg text-left shadow-xl transform transition-all sm:my-8 sm:align-middle max-h-[92dvh] overflow-y-auto overflow-x-hidden border border-[#3d3d3d] ${sizes[size]}`}>
 <div className="bg-[#2f2f2f] px-4 pt-5 pb-4 sm:p-6">
 {title && (
 <div className="flex items-center justify-between mb-4">
 <h3 className="text-lg font-medium text-[#ececec]">{title}</h3>
 <button
 onClick={onClose}
 className="text-[#8e8e8e] hover:text-[#ececec] focus:outline-none"
 >
 <X className="w-6 h-6" />
 </button>
 </div>
 )}
 {!title && (
 <button
 onClick={onClose}
 className="absolute top-4 right-4 text-[#8e8e8e] hover:text-[#ececec] focus:outline-none"
 >
 <X className="w-6 h-6" />
 </button>
 )}
 <div className="text-[#ececec]">{children}</div>
 </div>
 {footer && (
 <div className="bg-[#171717] px-4 py-3 sm:px-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end border-t border-[#3d3d3d] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
 {footer}
 </div>
 )}
 </div>
 </div>
 </div>
 )
}
