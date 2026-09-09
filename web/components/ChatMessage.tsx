'use client'

import { useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import { User, MessageSquare, Volume2, Copy, Share2, Check } from 'lucide-react'

interface ChatMessageProps {
 message: {
 role: 'user' | 'assistant' | 'system'
 content: string
 }
 onSpeak?: (content: string) => void
}

const markdownComponents = {
 p: ({ children }: { children?: ReactNode }) => <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>,
 ul: ({ children }: { children?: ReactNode }) => <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>,
 ol: ({ children }: { children?: ReactNode }) => <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>,
 li: ({ children }: { children?: ReactNode }) => <li className="ml-4">{children}</li>,
 code: ({ children }: { children?: ReactNode }) => (
 <code className="bg-[#171717] text-[#ececec] px-1.5 py-0.5 rounded text-sm font-mono">
 {children}
 </code>
 ),
 pre: ({ children }: { children?: ReactNode }) => (
 <pre className="bg-[#171717] p-4 rounded-lg overflow-x-auto mb-3 border border-[#2f2f2f]">
 {children}
 </pre>
 ),
 strong: ({ children }: { children?: ReactNode }) => <strong className="font-semibold text-white">{children}</strong>,
 a: ({ children, href }: { children?: ReactNode; href?: string }) => (
 <a href={href} className="text-[#19C37D] hover:underline" target="_blank" rel="noopener noreferrer">
 {children}
 </a>
 ),
}

export default function ChatMessage({ message, onSpeak }: ChatMessageProps) {
 const isUser = message.role === 'user'
 const [copied, setCopied] = useState(false)

 const copyText = async () => {
 try {
 await navigator.clipboard.writeText(message.content)
 setCopied(true)
 setTimeout(() => setCopied(false), 1600)
 } catch {
 // ignore
 }
 }

 const shareText = async () => {
 try {
 if (navigator.share) {
 await navigator.share({ text: message.content })
 return
 }
 await copyText()
 } catch {
 // user cancelled share
 }
 }

 return (
 <div className={`${isUser ? 'md:bg-[#212121]' : 'md:bg-[#2f2f2f]'} md:border-b md:border-[#2f2f2f]`}>
 <div className={`max-w-3xl mx-auto px-4 py-3 md:py-6 ${isUser ? 'flex justify-end md:block' : ''}`}>
 <div className={`flex items-start ${isUser ? 'md:space-x-4 max-w-[88%] md:max-w-none' : 'space-x-0 md:space-x-4 w-full'}`}>
 <div className="flex-shrink-0 hidden md:block">
 {isUser ? (
 <div className="w-8 h-8 rounded-full bg-[#3d3d3d] flex items-center justify-center">
 <User className="w-5 h-5 text-white" />
 </div>
 ) : (
 <div className="w-8 h-8 rounded-full bg-[#19C37D] flex items-center justify-center">
 <MessageSquare className="w-5 h-5 text-white" />
 </div>
 )}
 </div>

 <div className={`flex-1 min-w-0 overflow-hidden ${isUser ? 'md:flex-1' : ''}`}>
 <div
 className={`prose prose-invert max-w-none text-[#ececec] text-[15px] md:text-base break-words ${
 isUser
 ? 'bg-[#2f2f2f] md:bg-transparent rounded-[22px] md:rounded-none px-4 py-2.5 md:px-0 md:py-0'
 : ''
 }`}
 >
 <ReactMarkdown components={markdownComponents}>
 {message.content}
 </ReactMarkdown>
 </div>
 {!isUser && message.content && (
 <div className="mt-3 flex items-center gap-3 text-[#8e8e8e]">
 <button
 type="button"
 onClick={() => void copyText()}
 className="p-1.5 rounded-lg hover:text-white hover:bg-white/5"
 title="Copy"
 aria-label="Copy"
 >
 {copied ? <Check className="w-4 h-4 text-[#19C37D]" /> : <Copy className="w-4 h-4" />}
 </button>
 {onSpeak && (
 <button
 type="button"
 onClick={() => onSpeak(message.content)}
 className="p-1.5 rounded-lg hover:text-white hover:bg-white/5"
 title="Listen"
 aria-label="Listen"
 >
 <Volume2 className="w-4 h-4" />
 </button>
 )}
 <button
 type="button"
 onClick={() => void shareText()}
 className="p-1.5 rounded-lg hover:text-white hover:bg-white/5"
 title="Share"
 aria-label="Share"
 >
 <Share2 className="w-4 h-4" />
 </button>
 <span className="hidden md:inline-flex items-center space-x-1 text-xs ml-1">
 {onSpeak && <span>Listen</span>}
 </span>
 </div>
 )}
 </div>
 </div>
 </div>
 </div>
 )
}
