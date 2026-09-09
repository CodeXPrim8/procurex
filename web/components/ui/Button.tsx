'use client'

import { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
 variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'ghost'
 size?: 'sm' | 'md' | 'lg'
 isLoading?: boolean
 children: ReactNode
}

export default function Button({
 variant = 'primary',
 size = 'md',
 isLoading = false,
 children,
 className = '',
 disabled,
 ...props
}: ButtonProps) {
 const baseStyles = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#212121] disabled:opacity-50 disabled:cursor-not-allowed'
 
 const variants = {
 primary: 'bg-primary-600 text-white hover:bg-primary-700 focus:ring-primary-500',
 secondary: 'bg-[#2f2f2f] text-[#ececec] hover:bg-[#3d3d3d] focus:ring-gray-500',
 danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
 outline: 'border-2 border-[#3d3d3d] text-[#ececec] hover:bg-[#2f2f2f] focus:ring-gray-500',
 ghost: 'text-[#ececec] hover:bg-[#2f2f2f] focus:ring-gray-500',
 }
 
 const sizes = {
 sm: 'px-3 py-1.5 text-sm',
 md: 'px-4 py-2 text-base',
 lg: 'px-6 py-3 text-lg',
 }
 
 return (
 <button
 className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
 disabled={disabled || isLoading}
 {...props}
 >
 {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
 {children}
 </button>
 )
}
