'use client'

import { ReactNode } from 'react'

interface BadgeProps {
 children: ReactNode
 variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
 size?: 'sm' | 'md'
 className?: string
}

export default function Badge({
 children,
 variant = 'default',
 size = 'md',
 className = '',
}: BadgeProps) {
 const variants = {
 default: 'bg-[#3d3d3d] text-[#ececec]',
 success: 'bg-green-900/40 text-green-300',
 warning: 'bg-yellow-900/40 text-yellow-300',
 danger: 'bg-red-900/40 text-red-300',
 info: 'bg-blue-900/40 text-blue-300',
 }

 const sizes = {
 sm: 'px-2 py-0.5 text-xs',
 md: 'px-2.5 py-1 text-sm',
 }

 return (
 <span
 className={`inline-flex items-center font-medium rounded-full ${variants[variant]} ${sizes[size]} ${className}`}
 >
 {children}
 </span>
 )
}
