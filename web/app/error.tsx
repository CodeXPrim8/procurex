'use client'

import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import Button from '@/components/ui/Button'

export default function Error({
 error,
 reset,
}: {
 error: Error & { digest?: string }
 reset: () => void
}) {
 useEffect(() => {
 // Log the error to an error reporting service
 console.error('Application error:', error)
 }, [error])

 return (
 <div className="min-h-screen flex items-center justify-center bg-[#212121] px-4">
 <div className="max-w-md w-full bg-[#2f2f2f] rounded-lg shadow-lg p-8 text-center">
 <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
 <h1 className="text-2xl font-bold text-[#ececec] mb-2">Something went wrong!</h1>
 <p className="text-[#b4b4b4] mb-6">
 {error.message || 'An unexpected error occurred. Please try again.'}
 </p>
 <div className="flex gap-4 justify-center">
 <Button onClick={reset} variant="primary">
 Try again
 </Button>
 <Button onClick={() => window.location.href = '/'} variant="secondary">
 Go home
 </Button>
 </div>
 </div>
 </div>
 )
}

















