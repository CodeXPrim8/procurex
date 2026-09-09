'use client'

import Link from 'next/link'
import { FileText, Calendar, User } from 'lucide-react'
import Badge from './ui/Badge'

interface QuotationCardProps {
 quotation: {
 id: number
 quotation_number: string
 customer_name: string
 total_amount: number
 status: string
 created_at: string
 items?: any[]
 }
}

export default function QuotationCard({ quotation }: QuotationCardProps) {
 const statusColors = {
 draft: 'default',
 sent: 'info',
 accepted: 'success',
 rejected: 'danger',
 } as const

 return (
 <Link href={`/quotations/${quotation.id}`}>
 <div className="bg-[#2f2f2f] border border-[#3d3d3d] rounded-lg p-6 hover:bg-[#353535] transition-all cursor-pointer">
 <div className="flex items-start justify-between mb-4">
 <div className="flex items-center space-x-3">
 <div className="w-12 h-12 bg-[#171717] rounded-lg flex items-center justify-center">
 <FileText className="w-6 h-6 text-[#19C37D]" />
 </div>
 <div>
 <h3 className="font-semibold text-[#ececec]">{quotation.quotation_number}</h3>
 <div className="flex items-center space-x-2 mt-1">
 <User className="w-4 h-4 text-[#8e8e8e]" />
 <span className="text-sm text-[#b4b4b4]">{quotation.customer_name}</span>
 </div>
 </div>
 </div>
 <Badge variant={statusColors[quotation.status as keyof typeof statusColors] || 'default'}>
 {quotation.status}
 </Badge>
 </div>

 <div className="flex items-center justify-between pt-4 border-t border-[#3d3d3d]">
 <div>
 <p className="text-2xl font-bold text-[#ececec]">
 ${Number(quotation.total_amount).toFixed(2)}
 </p>
 <div className="flex items-center space-x-1 text-[#8e8e8e] text-sm mt-1">
 <Calendar className="w-4 h-4" />
 <span>{new Date(quotation.created_at).toLocaleDateString()}</span>
 </div>
 </div>
 {quotation.items && (
 <div className="text-right">
 <p className="text-sm text-[#b4b4b4]">
 {quotation.items.length} item{quotation.items.length !== 1 ? 's' : ''}
 </p>
 </div>
 )}
 </div>
 </div>
 </Link>
 )
}
