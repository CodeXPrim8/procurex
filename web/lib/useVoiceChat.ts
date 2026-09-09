'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSpeechRecognitionCtor, speakText, speechSupported, stopSpeaking } from './speech'

type VoiceChatOptions = {
  onFinalTranscript: (text: string) => void
  onInterim?: (text: string) => void
  onError?: (message: string) => void
  busy?: boolean
}

export function useVoiceChat({ onFinalTranscript, onInterim, onError, busy }: VoiceChatOptions) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)

  const recognitionRef = useRef<any>(null)
  const voiceModeRef = useRef(false)
  const listeningRef = useRef(false)
  const busyRef = useRef(Boolean(busy))
  const speakReplyRef = useRef(false)
  const lastSpokenRef = useRef('')
  const onFinalRef = useRef(onFinalTranscript)
  const onInterimRef = useRef(onInterim)
  const onErrorRef = useRef(onError)

  onFinalRef.current = onFinalTranscript
  onInterimRef.current = onInterim
  onErrorRef.current = onError
  busyRef.current = Boolean(busy)
  voiceModeRef.current = voiceMode

  useEffect(() => {
    setSupported(speechSupported())
  }, [])

  const stopListening = useCallback(() => {
    listeningRef.current = false
    setListening(false)
    try {
      recognitionRef.current?.stop()
    } catch {
      // already stopped
    }
  }, [])

  const stopVoice = useCallback(() => {
    voiceModeRef.current = false
    speakReplyRef.current = false
    setVoiceMode(false)
    stopListening()
    stopSpeaking()
    setSpeaking(false)
  }, [stopListening])

  const startListening = useCallback(() => {
    if (busyRef.current) return
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      onErrorRef.current?.('Voice chat needs Chrome or Edge.')
      return
    }
    stopSpeaking()
    setSpeaking(false)
    try {
      recognitionRef.current?.abort()
    } catch {
      // ignore
    }
    const recognition = new Ctor()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'
    recognitionRef.current = recognition

    recognition.onresult = (event: any) => {
      let interim = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const piece = event.results[i][0]?.transcript || ''
        if (event.results[i].isFinal) finalText += piece
        else interim += piece
      }
      const live = (finalText || interim).trim()
      if (live) onInterimRef.current?.(live)
      if (finalText.trim()) {
        speakReplyRef.current = true
        stopListening()
        onFinalRef.current(finalText.trim())
      }
    }

    recognition.onerror = (event: any) => {
      listeningRef.current = false
      setListening(false)
      if (event.error === 'not-allowed') {
        onErrorRef.current?.('Microphone permission is blocked. Allow the mic and try again.')
        stopVoice()
        return
      }
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        onErrorRef.current?.('Could not hear that. Try again.')
      }
    }

    recognition.onend = () => {
      listeningRef.current = false
      setListening(false)
    }

    try {
      recognition.start()
      listeningRef.current = true
      setListening(true)
    } catch {
      onErrorRef.current?.('Could not start the microphone.')
    }
  }, [stopListening, stopVoice])

  const toggleListening = useCallback(() => {
    if (listeningRef.current) {
      stopListening()
      return
    }
    startListening()
  }, [startListening, stopListening])

  const toggleVoiceMode = useCallback(() => {
    if (voiceModeRef.current) {
      stopVoice()
      return
    }
    setVoiceMode(true)
    voiceModeRef.current = true
    speakReplyRef.current = true
    startListening()
  }, [startListening, stopVoice])

  const speakReply = useCallback(
    (content: string) => {
      if (!content || content === lastSpokenRef.current) return
      if (!speakReplyRef.current && !voiceModeRef.current) return
      lastSpokenRef.current = content
      setSpeaking(true)
      stopListening()
      speakText(content, () => {
        setSpeaking(false)
        if (voiceModeRef.current && !busyRef.current) {
          startListening()
        }
      })
    },
    [startListening, stopListening]
  )

  const speakNow = useCallback((content: string) => {
    lastSpokenRef.current = content
    setSpeaking(true)
    stopListening()
    speakText(content, () => setSpeaking(false))
  }, [stopListening])

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.abort()
      } catch {
        // ignore
      }
      stopSpeaking()
    }
  }, [])

  return {
    supported,
    listening,
    speaking,
    voiceMode,
    toggleListening,
    toggleVoiceMode,
    stopVoice,
    speakReply,
    speakNow,
  }
}
