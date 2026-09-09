'use client' 

import { InputHTMLAttributes, TextareaHTMLAttributes, forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
 label?: string
 error?: string
 helperText?: string
 type?: string
}

const Input = forwardRef<HTMLInputElement | HTMLTextAreaElement, InputProps>(
 ({ label, error, helperText, className = '', type = 'text', ...props }, ref) => {
 const [showPassword, setShowPassword] = useState(false)
 const isPassword = type === 'password'
 const inputType = isPassword && showPassword ? 'text' : type
 
 const inputClasses = `w-full px-4 py-3 sm:py-2 text-base border rounded-lg bg-[#2f2f2f] text-[#ececec] placeholder-[#8e8e8e] focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent ${
 error ? 'border-red-500' : 'border-[#3d3d3d]'
 } ${isPassword ? 'pr-10' : ''} ${className}`

 if (type === 'textarea' || className?.includes('min-h')) {
 return (
 <div className="w-full">
 {label && (
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">
 {label}
 {props.required && <span className="text-red-500 ml-1">*</span>}
 </label>
 )}
 <textarea
 ref={ref as any}
 className={inputClasses}
 {...(props as any)}
 rows={className?.includes('min-h-[100px]') ? 4 : undefined}
 />
 {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
 {helperText && !error && <p className="mt-1 text-sm text-[#8e8e8e]">{helperText}</p>}
 </div>
 )
 }

 return (
 <div className="w-full">
 {label && (
 <label className="block text-sm font-medium text-[#b4b4b4] mb-1">
 {label}
 {props.required && <span className="text-red-500 ml-1">*</span>}
 </label>
 )}
 <div className="relative">
 <input
 ref={ref as any}
 type={inputType}
 className={inputClasses}
 autoComplete={
 props.autoComplete !== undefined 
 ? props.autoComplete 
 : isPassword 
 ? (props.name === 'password' ? 'current-password' : 'new-password')
 : type === 'email'
 ? (props.name === 'email' ? 'username' : 'email')
 : props.name === 'fullName' || props.name === 'name'
 ? 'name'
 : undefined
 }
 {...props}
 />
 {isPassword && (
 <button
 type="button"
 onClick={() => setShowPassword(!showPassword)}
 className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8e8e8e] hover:text-[#ececec] focus:outline-none transition-colors"
 aria-label={showPassword ? 'Hide password' : 'Show password'}
 tabIndex={-1}
 >
 {showPassword ? (
 <EyeOff className="w-5 h-5" />
 ) : (
 <Eye className="w-5 h-5" />
 )}
 </button>
 )}
 </div>
 {error && <p className="mt-1 text-sm text-red-400">{error}</p>}
 {helperText && !error && <p className="mt-1 text-sm text-[#8e8e8e]">{helperText}</p>}
 </div>
 )
 }
)

Input.displayName = 'Input'

export default Input
