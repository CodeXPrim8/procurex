'use client'

import { useRequireAuth } from '@/lib/auth'
import { useStore } from '@/lib/store'
import Button from '@/components/ui/Button'
import { useRouter } from 'next/navigation'
import { User, Mail, Shield } from 'lucide-react'

export default function ProfilePage() {
 const { user } = useRequireAuth()
 const { logout } = useStore()
 const router = useRouter()

 const handleLogout = async () => {
 await logout()
 router.push('/login')
 }

 if (!user) return null

 return (
 <div className="max-w-4xl mx-auto">
 <h1 className="text-3xl font-bold text-[#ececec] mb-8">Profile</h1>
 
 <div className="bg-[#2f2f2f] rounded-lg shadow p-6 space-y-6">
 <div className="flex items-center space-x-4">
 <div className="w-16 h-16 bg-[#171717] rounded-full flex items-center justify-center">
 <User className="w-8 h-8 text-primary-600" />
 </div>
 <div>
 <h2 className="text-2xl font-semibold text-[#ececec]">
 {user.full_name || 'User'}
 </h2>
 <p className="text-[#b4b4b4]">{user.role}</p>
 </div>
 </div>

 <div className="space-y-4">
 <div className="flex items-center space-x-3">
 <Mail className="w-5 h-5 text-gray-400" />
 <div>
 <p className="text-sm text-[#8e8e8e]">Email</p>
 <p className="text-[#ececec]">{user.email}</p>
 </div>
 </div>

 <div className="flex items-center space-x-3">
 <Shield className="w-5 h-5 text-gray-400" />
 <div>
 <p className="text-sm text-[#8e8e8e]">Role</p>
 <p className="text-[#ececec] capitalize">{user.role}</p>
 </div>
 </div>
 </div>

 <div className="pt-4 border-t border-[#2f2f2f]">
 <Button variant="danger" onClick={handleLogout}>
 Logout
 </Button>
 </div>
 </div>
 </div>
 )
}


