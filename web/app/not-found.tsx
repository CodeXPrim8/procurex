import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import Button from '@/components/ui/Button'

export default function NotFound() {
 return (
 <div className="min-h-screen flex items-center justify-center bg-[#212121] px-4">
 <div className="max-w-md w-full bg-[#2f2f2f] rounded-lg shadow-lg p-8 text-center">
 <FileQuestion className="w-16 h-16 text-gray-400 mx-auto mb-4" />
 <h1 className="text-3xl font-bold text-[#ececec] mb-2">404</h1>
 <h2 className="text-xl font-semibold text-[#b4b4b4] mb-4">Page Not Found</h2>
 <p className="text-[#b4b4b4] mb-6">
 The page you're looking for doesn't exist or has been moved.
 </p>
 <div className="flex gap-4 justify-center">
 <Link href="/chat">
 <Button variant="primary">
 Go to Chat
 </Button>
 </Link>
 </div>
 </div>
 </div>
 )
}

















