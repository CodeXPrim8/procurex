import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

interface ChatBubbleProps {
  message: {
    role: string
    content: string
  }
}

export default function ChatBubble({ message }: ChatBubbleProps) {
  const isUser = message.role === 'user'

  return (
    <View style={[styles.container, isUser && styles.userContainer]}>
      <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
        {!isUser && (
          <View style={styles.iconContainer}>
            <Ionicons name="chatbubble-ellipses" size={20} color="#fff" />
          </View>
        )}
        <Text style={[styles.text, isUser && styles.userText]}>{message.content}</Text>
        {isUser && (
          <View style={styles.iconContainer}>
            <Ionicons name="person" size={20} color="#fff" />
          </View>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  userContainer: {
    alignItems: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  userBubble: {
    backgroundColor: '#0ea5e9',
  },
  assistantBubble: {
    backgroundColor: '#e5e7eb',
  },
  text: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  userText: {
    color: '#fff',
  },
  iconContainer: {
    marginHorizontal: 8,
  },
})


