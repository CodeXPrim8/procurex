'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'

export default function GlobalError({
 error,
 reset,
}: {
 error: Error & { digest?: string }
 reset: () => void
}) {
 useEffect(() => {
 // Log the error to an error reporting service
 console.error('Global application error:', error)
 }, [error])

 return (
 <html>
 <body>
 <div className="min-h-screen flex items-center justify-center bg-[#212121] px-4">
 <div className="max-w-md w-full bg-[#2f2f2f] rounded-lg shadow-lg p-8 text-center">
 <AlertTriangle className="w-16 h-16 text-red-500 mx-auto mb-4" />
 <h1 className="text-2xl font-bold text-[#ececec] mb-2">Application Error</h1>
 <p className="text-[#b4b4b4] mb-6">
 A critical error occurred. Please refresh the page or contact support.
 </p>
 <button
 onClick={reset}
 className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
 >
 Try again
 </button>
 </div>
 </div>
 </body>
 </html>
 )
}

















