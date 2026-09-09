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
 className={`pointer-events-auto flex items-start space-x-3 px-4 py-3 rounded-lg shadow-lg border w-full sm:min-w-[18rem] ${styles[type]} animate-slide-in`}
 >
 {icons[type]}
 <p className="text-sm font-medium text-[#ececec] flex-1 break-words">{message}</p>
 <button
 onClick={onClose}
 className="text-[#8e8e8e] hover:text-[#ececec] focus:outline-none min-h-11 min-w-11 inline-flex items-center justify-center -mr-2 -mt-1"
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
 <div className="fixed top-[max(1rem,env(safe-area-inset-top))] inset-x-3 sm:inset-x-auto sm:right-4 z-50 space-y-2 max-w-md pointer-events-none">
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
