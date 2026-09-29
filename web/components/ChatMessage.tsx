'use client'

import { useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import { User, Volume2, Copy, Share2, Check, ArrowUpRight } from 'lucide-react'
import Logo from '@/components/Logo'
import { ChatQuoteCard } from '@/components/QuotationCard'

interface ChatMessageProps {
 message: {
 role: 'user' | 'assistant' | 'system'
 content: string
 metadata?: string
 quotation?: any
 }
 onSpeak?: (content: string) => void
 showActions?: boolean
 onFollowUp?: (text: string) => void
 followUpDisabled?: boolean
}

function quotationFromMessage(message: ChatMessageProps['message']) {
 if (message?.quotation?.quotation_number) return message.quotation
 const raw = message?.metadata
 if (!raw) return null
 try {
  const payload = typeof raw === 'string' ? JSON.parse(raw) : raw
  return payload?.quotation || null
 } catch {
  return null
 }
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

const NEXT_STEP_LINE =
 /(?:^|\n)[ \t]*(?:\*\*)?next\s*step(?:s)?(?:\*\*)?[ \t]*[:\-]?[ \t]*(?:\*\*)?[ \t]*\n?[ \t]*(.+?)[ \t]*(?:\*\*)?[ \t]*(?=\n|$)/gi

function stripMarkdown(value: string) {
 return value.replace(/\*+/g, '').replace(/^[\s•\-]+/, '').replace(/["“”]+/g, '').trim()
}

function followUpSendText(step: string) {
 const cleaned = stripMarkdown(step).replace(/\s+/g, ' ')
 const match = cleaned.match(
 /^(?:shall i|should i|would you like me to|do you want me to|can i|may i)\s+(.+?)\??$/i
 )
 if (match?.[1]) {
 const action = match[1].trim().replace(/\?+$/, '')
 if (!action) return `Yes. ${cleaned}`
 return `Yes, ${action.charAt(0).toLowerCase()}${action.slice(1)}`
 }
 if (/\?$/.test(cleaned)) {
 return `Yes. ${cleaned.replace(/\?+$/, '.')}`
 }
 return cleaned
}

export function extractFollowUps(content: string) {
 const steps: { label: string; send: string }[] = []
 const seen = new Set<string>()
 const body = (content || '').replace(NEXT_STEP_LINE, (_full, raw: string) => {
 const label = stripMarkdown(String(raw || ''))
 if (!label || label.length < 8) return ''
 const send = followUpSendText(label)
 const key = send.toLowerCase()
 if (!seen.has(key)) {
 seen.add(key)
 steps.push({ label, send })
 }
 return ''
 })
 return {
 body: body.replace(/\n{3,}/g, '\n\n').trim(),
 steps,
 }
}

export default function ChatMessage({
 message,
 onSpeak,
 showActions = false,
 onFollowUp,
 followUpDisabled = false,
}: ChatMessageProps) {
 const isUser = message.role === 'user'
 const [copied, setCopied] = useState(false)
 const followUps = !isUser ? extractFollowUps(message.content) : { body: message.content, steps: [] }
 const displayContent = isUser ? message.content : followUps.body
 const quotation = !isUser ? quotationFromMessage(message) : null

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
 <div className="group">
 <div className={`max-w-3xl mx-auto px-4 py-2.5 md:py-5 ${isUser ? 'flex justify-end md:block' : ''}`}>
 <div className={`flex items-start ${isUser ? 'md:space-x-4 max-w-[88%] md:max-w-none' : 'space-x-0 md:space-x-4 w-full'}`}>
 <div className="flex-shrink-0 hidden md:block">
 {isUser ? (
 <div className="w-8 h-8 rounded-full bg-[#3d3d3d] flex items-center justify-center">
 <User className="w-5 h-5 text-white" />
 </div>
 ) : (
 <div className="w-8 h-8 rounded-full bg-[#111111] flex items-center justify-center overflow-hidden p-1.5">
 <Logo variant="mark" className="h-5 w-5" />
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
 {displayContent}
 </ReactMarkdown>
 </div>
 {quotation && <ChatQuoteCard quotation={quotation} />}
 {!isUser && onFollowUp && followUps.steps.length > 0 && (
 <div className="mt-3 flex flex-wrap gap-2">
 {followUps.steps.map((step) => (
 <button
 key={step.send}
 type="button"
 disabled={followUpDisabled}
 onClick={() => onFollowUp(step.send)}
 className="max-w-full inline-flex items-center gap-2 text-left text-sm px-3.5 py-2 rounded-full border border-[#3d3d3d] bg-[#212121] text-[#ececec] hover:bg-[#2f2f2f] hover:border-[#5a5a5a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
 >
 <span className="break-words">{step.label}</span>
 <ArrowUpRight className="w-3.5 h-3.5 shrink-0 text-[#8e8e8e]" />
 </button>
 ))}
 </div>
 )}
 {!isUser && message.content && (
 <div
 className={`mt-1.5 flex items-center gap-1 text-[#8e8e8e] transition-opacity ${
 showActions ? 'opacity-100' : 'opacity-0 md:group-hover:opacity-100'
 }`}
 >
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
 </div>
 )}
 </div>
 </div>
 </div>
 </div>
 )
}
