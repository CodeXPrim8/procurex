import { useState, useEffect, useRef } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { chatAPI } from '@/services/api'
import ChatBubble from '@/components/ChatBubble'
import ProductCard from '@/components/ProductCard'

export default function ChatScreen() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Array<{ role: string; content: string }>>([])
  const [isLoading, setIsLoading] = useState(false)
  const [productResults, setProductResults] = useState<any[]>([])
  const [sessionId, setSessionId] = useState<number | null>(null)
  const scrollViewRef = useRef<ScrollView>(null)

  useEffect(() => {
    // Initialize chat session
    const initSession = async () => {
      try {
        const session = await chatAPI.createSession()
        setSessionId(session.id)
        if (session.messages) {
          setMessages(session.messages)
        }
      } catch (error) {
        console.error('Failed to create session:', error)
      }
    }
    initSession()
  }, [])

  const handleSend = async () => {
    if (!input.trim() || !sessionId || isLoading) return

    const userMessage = input.trim()
    setInput('')
    setIsLoading(true)
    setProductResults([])

    // Add user message
    const userMsg = { role: 'user', content: userMessage }
    setMessages((prev) => [...prev, userMsg])

    try {
      await chatAPI.createMessage(sessionId, userMessage)

      // Connect WebSocket for streaming response
      const AsyncStorage = require('@react-native-async-storage/async-storage').default
      const token = await AsyncStorage.getItem('access_token') || ''
      const wsUrl = `ws://localhost:8000/api/v1/chat/ws/${sessionId}?token=${token}`
      const ws = new WebSocket(wsUrl)

      let assistantContent = ''

      ws.onopen = () => {
        ws.send(JSON.stringify({ message: userMessage }))
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)

        if (data.type === 'chunk') {
          assistantContent += data.content
          setMessages((prev) => {
            const updated = [...prev]
            const lastMsg = updated[updated.length - 1]
            if (lastMsg && lastMsg.role === 'assistant') {
              lastMsg.content = assistantContent
              return updated
            } else {
              return [...updated, { role: 'assistant', content: assistantContent }]
            }
          })
        } else if (data.type === 'done') {
          setIsLoading(false)
          if (data.product_results) {
            setProductResults(data.product_results)
          }
          ws.close()
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setIsLoading(false)
      }
    } catch (error) {
      console.error('Failed to send message:', error)
      setIsLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Welcome to AI Procurement Assistant</Text>
            <Text style={styles.emptySubtext}>Ask me about IT products, prices, and availability!</Text>
          </View>
        )}

        {messages.map((message, index) => (
          <ChatBubble key={index} message={message} />
        ))}

        {isLoading && (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Thinking...</Text>
          </View>
        )}

        {productResults.length > 0 && (
          <View style={styles.productsContainer}>
            <Text style={styles.productsTitle}>Available Products:</Text>
            {productResults.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Ask about IT products..."
          multiline
          editable={!isLoading}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!input.trim() || isLoading) && styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!input.trim() || isLoading}
        >
          <Ionicons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  loadingContainer: {
    padding: 16,
    alignItems: 'center',
  },
  loadingText: {
    color: '#666',
  },
  productsContainer: {
    marginTop: 16,
  },
  productsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    backgroundColor: '#0ea5e9',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
})

