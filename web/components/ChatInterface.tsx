'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, Loader2 } from 'lucide-react'
import { useStore } from '@/lib/store'
import { chatAPI } from '@/lib/api'
import ChatMessage from './ChatMessage'
import ProductCard from './ProductCard'
import { supabase } from '@/lib/supabaseClient'

export default function ChatInterface() {
 const [input, setInput] = useState('')
 const [isLoading, setIsLoading] = useState(false)
 const [productResults, setProductResults] = useState<any[]>([])
 const messagesEndRef = useRef<HTMLDivElement>(null)
 const wsRef = useRef<WebSocket | null>(null)
 
 const { currentSession, setCurrentSession, addMessage, setMessages } = useStore()

 useEffect(() => {
 // Initialize chat session
 const initSession = async () => {
 try {
 const session = await chatAPI.createSession()
 setCurrentSession({ ...session, messages: [] })
 } catch (error) {
 console.error('Failed to create session:', error)
 }
 }
 
 if (!currentSession) {
 initSession()
 }
 }, [])

 useEffect(() => {
 // Load session messages
 const loadMessages = async () => {
 if (currentSession?.id) {
 try {
 const session = await chatAPI.getSession(currentSession.id)
 setMessages(session.messages || [])
 } catch (error) {
 console.error('Failed to load messages:', error)
 }
 }
 }
 
 if (currentSession?.id) {
 loadMessages()
 }
 }, [currentSession?.id])

 useEffect(() => {
 messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
 }, [currentSession?.messages])

 const connectWebSocket = async (sessionId: number) => {
 const { data } = await supabase.auth.getSession()
 const token = data.session?.access_token || ''
 const wsUrl = `ws://localhost:8000/api/v1/chat/ws/${sessionId}?token=${token}`
 
 const ws = new WebSocket(wsUrl)
 wsRef.current = ws

 ws.onopen = () => {
 console.log('WebSocket connected')
 }

 ws.onmessage = (event) => {
 const data = JSON.parse(event.data)
 
 if (data.type === 'chunk') {
 // Update last message with streaming content
 setMessages((prev) => {
 const updated = [...prev]
 const lastMsg = updated[updated.length - 1]
 if (lastMsg && lastMsg.role === 'assistant') {
 lastMsg.content += data.content
 return updated
 } else {
 return [...updated, { role: 'assistant', content: data.content }]
 }
 })
 } else if (data.type === 'done') {
 setIsLoading(false)
 if (data.product_results) {
 setProductResults(data.product_results)
 }
 } else if (data.error) {
 setIsLoading(false)
 console.error('WebSocket error:', data.error)
 }
 }

 ws.onerror = (error) => {
 console.error('WebSocket error:', error)
 setIsLoading(false)
 }

 ws.onclose = () => {
 console.log('WebSocket disconnected')
 }
 }

 const handleSend = async () => {
 if (!input.trim() || !currentSession || isLoading) return

 const userMessage = input.trim()
 setInput('')
 setIsLoading(true)
 setProductResults([])

 // Add user message
 const userMsg = { role: 'user' as const, content: userMessage }
 addMessage(userMsg)

 try {
 // Save user message to backend
 await chatAPI.createMessage(currentSession.id, userMessage)

 // Connect WebSocket if not connected
 if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
 await connectWebSocket(currentSession.id)
 }

 // Wait a bit for WebSocket to connect, then send message
 setTimeout(() => {
 if (wsRef.current?.readyState === WebSocket.OPEN) {
 wsRef.current.send(JSON.stringify({ message: userMessage }))
 } else {
 // Fallback to HTTP if WebSocket fails
 handleSendHTTP(userMessage)
 }
 }, 100)
 } catch (error) {
 console.error('Failed to send message:', error)
 setIsLoading(false)
 }
 }

 const handleSendHTTP = async (message: string) => {
 // Fallback HTTP implementation would go here
 setIsLoading(false)
 }

 const handleKeyPress = (e: React.KeyboardEvent) => {
 if (e.key === 'Enter' && !e.shiftKey) {
 e.preventDefault()
 handleSend()
 }
 }

 return (
 <div className="flex flex-col h-[calc(100vh-200px)] max-h-[800px] bg-[#2f2f2f] rounded-lg shadow-lg border border-[#2f2f2f]">
 {/* Messages */}
 <div className="flex-1 overflow-y-auto p-4 space-y-4">
 {currentSession?.messages.length === 0 && (
 <div className="text-center text-[#8e8e8e] mt-8">
 <p className="text-lg mb-2">Welcome to ProcureX</p>
 <p className="text-sm">Ask me about IT products, prices, and availability!</p>
 </div>
 )}
 
 {currentSession?.messages.map((message, index) => (
 <ChatMessage key={index} message={message} />
 ))}
 
 {isLoading && (
 <div className="flex items-center space-x-2 text-[#8e8e8e]">
 <Loader2 className="w-5 h-5 animate-spin" />
 <span>Thinking...</span>
 </div>
 )}
 
 {/* Product Results */}
 {productResults.length > 0 && (
 <div className="mt-4 space-y-2">
 <h3 className="font-semibold text-[#b4b4b4]">Available Products:</h3>
 {productResults.map((product) => (
 <ProductCard key={product.id} product={product} />
 ))}
 </div>
 )}
 
 <div ref={messagesEndRef} />
 </div>

 {/* Input */}
 <div className="border-t border-[#2f2f2f] p-4">
 <div className="flex space-x-2">
 <textarea
 value={input}
 onChange={(e) => setInput(e.target.value)}
 onKeyPress={handleKeyPress}
 placeholder="Ask about IT products, prices, or availability..."
 className="flex-1 resize-none border border-[#3d3d3d] rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary-500"
 rows={1}
 disabled={isLoading}
 />
 <button
 onClick={handleSend}
 disabled={isLoading || !input.trim()}
 className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
 >
 {isLoading ? (
 <Loader2 className="w-5 h-5 animate-spin" />
 ) : (
 <Send className="w-5 h-5" />
 )}
 </button>
 </div>
 </div>
 </div>
 )
}


