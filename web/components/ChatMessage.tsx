'use client'

import ReactMarkdown from 'react-markdown'
import { User, MessageSquare, Volume2 } from 'lucide-react'

interface ChatMessageProps {
 message: {
 role: 'user' | 'assistant' | 'system'
 content: string
 }
 onSpeak?: (content: string) => void
}

export default function ChatMessage({ message, onSpeak }: ChatMessageProps) {
 const isUser = message.role === 'user'
 
 return (
 <div className={`${isUser ? 'bg-[#212121]' : 'bg-[#2f2f2f]'} border-b border-[#2f2f2f]`}>
 <div className="max-w-3xl mx-auto px-4 py-6">
 <div className="flex items-start space-x-4">
 {/* Avatar */}
 <div className="flex-shrink-0">
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
 
 {/* Message Content */}
 <div className="flex-1 min-w-0">
 <div className="prose prose-invert max-w-none text-[#ececec]">
 <ReactMarkdown
 components={{
 p: ({ children }) => <p className="mb-4 last:mb-0 leading-relaxed">{children}</p>,
 ul: ({ children }) => <ul className="list-disc list-inside mb-4 space-y-1">{children}</ul>,
 ol: ({ children }) => <ol className="list-decimal list-inside mb-4 space-y-1">{children}</ol>,
 li: ({ children }) => <li className="ml-4">{children}</li>,
 code: ({ children }) => (
 <code className="bg-[#171717] text-[#ececec] px-1.5 py-0.5 rounded text-sm font-mono">
 {children}
 </code>
 ),
 pre: ({ children }) => (
 <pre className="bg-[#171717] p-4 rounded-lg overflow-x-auto mb-4 border border-[#2f2f2f]">
 {children}
 </pre>
 ),
 strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
 a: ({ children, href }) => (
 <a href={href} className="text-[#19C37D] hover:underline" target="_blank" rel="noopener noreferrer">
 {children}
 </a>
 ),
 }}
 >
 {message.content}
 </ReactMarkdown>
 </div>
 {!isUser && onSpeak && message.content && (
 <button
 type="button"
 onClick={() => onSpeak(message.content)}
 className="mt-3 inline-flex items-center space-x-1 text-xs text-[#8e8e8e] hover:text-[#ececec]"
 title="Listen"
 >
 <Volume2 className="w-3.5 h-3.5" />
 <span>Listen</span>
 </button>
 )}
 </div>
 </div>
 </div>
 </div>
 )
}
