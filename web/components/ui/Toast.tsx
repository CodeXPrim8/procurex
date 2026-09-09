'use client'

import { useEffect } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastProps {
 message: string
 type: ToastType
 onClose: () => void
 duration?: number
}

export default function Toast({ message, type, onClose, duration = 5000 }: ToastProps) {
 useEffect(() => {
 const timer = setTimeout(onClose, duration)
 return () => clearTimeout(timer)
 }, [duration, onClose])

 const icons = {
 success: <CheckCircle className="w-5 h-5 text-green-400" />,
 error: <XCircle className="w-5 h-5 text-red-400" />,
 info: <Info className="w-5 h-5 text-blue-400" />,
 warning: <AlertTriangle className="w-5 h-5 text-yellow-400" />,
 }

 const styles = {
 success: 'bg-[#171717] border-green-700',
 error: 'bg-[#171717] border-red-700',
 info: 'bg-[#171717] border-blue-700',
 warning: 'bg-[#171717] border-yellow-700',
 }

 return (
 <div
 className={`fixed top-4 right-4 z-50 flex items-center space-x-3 px-4 py-3 rounded-lg shadow-lg border ${styles[type]} animate-slide-in`}
 >
 {icons[type]}
 <p className="text-sm font-medium text-[#ececec]">{message}</p>
 <button
 onClick={onClose}
 className="text-[#8e8e8e] hover:text-[#ececec] focus:outline-none"
 >
 <X className="w-4 h-4" />
 </button>
 </div>
 )
}

// Toast Container Component
interface ToastContainerProps {
 toasts: Array<{ id: string; message: string; type: ToastType }>
 onRemove: (id: string) => void
}

export function ToastContainer({ toasts, onRemove }: ToastContainerProps) {
 return (
 <div className="fixed top-4 right-4 z-50 space-y-2">
 {toasts.map((toast) => (
 <Toast
 key={toast.id}
 message={toast.message}
 type={toast.type}
 onClose={() => onRemove(toast.id)}
 />
 ))}
 </div>
 )
}
