'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  beginSpokenReply,
  endSpokenReply,
  getSpeechRecognitionCtor,
  pushSpokenText,
  speakText,
  speechSupported,
  stopSpeaking,
  textForSpeech,
  unlockSpeech,
} from './speech'

type VoiceChatOptions = {
  onFinalTranscript: (text: string) => void
  onInterim?: (text: string) => void
  onError?: (message: string) => void
  busy?: boolean
}

const TRANSIENT_ERRORS = new Set(['no-speech', 'aborted', 'network', 'audio-capture'])
const PAUSE_TO_SEND_MS = 620
const PAUSE_AFTER_FINAL_MS = 380
const PAUSE_AFTER_PUNCT_MS = 180

function bestPhrase(result: any) {
  let best = result[0]
  for (let i = 1; i < result.length; i += 1) {
    if ((result[i]?.confidence || 0) > (best?.confidence || 0)) best = result[i]
  }
  return (best?.transcript || '').replace(/\s+/g, ' ').trim()
}

function joinPhrases(left: string, right: string) {
  const a = left.trim()
  const b = right.trim()
  if (!a) return b
  if (!b) return a
  const aLow = a.toLowerCase()
  const bLow = b.toLowerCase()
  if (aLow === bLow || aLow.endsWith(bLow)) return a
  if (bLow.startsWith(aLow)) return b
  return `${a} ${b}`
}

function readTranscript(event: any) {
  let committed = ''
  let interim = ''
  for (let i = 0; i < event.results.length; i += 1) {
    const phrase = bestPhrase(event.results[i])
    if (!phrase) continue
    if (event.results[i].isFinal) committed = joinPhrases(committed, phrase)
    else interim = joinPhrases(interim, phrase)
  }
  return {
    committed,
    live: joinPhrases(committed, interim),
  }
}

export function useVoiceChat({ onFinalTranscript, onInterim, onError, busy }: VoiceChatOptions) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [transcript, setTranscript] = useState('')

  const recognitionRef = useRef<any>(null)
  const voiceModeRef = useRef(false)
  const listeningRef = useRef(false)
  const busyRef = useRef(Boolean(busy))
  const pendingReplySpeechRef = useRef(false)
  const mutedRef = useRef(false)
  const lastSpokenRef = useRef('')
  const listenGenRef = useRef(0)
  const retryRef = useRef(0)
  const startTimerRef = useRef<number | null>(null)
  const pauseTimerRef = useRef<number | null>(null)
  const liveRef = useRef('')
  const spokenOffsetRef = useRef(0)
  const streamActiveRef = useRef(false)
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

  const clearTimer = (ref: { current: number | null }) => {
    if (ref.current != null) {
      window.clearTimeout(ref.current)
      ref.current = null
    }
  }

  const publishLive = (text: string) => {
    liveRef.current = text
    setTranscript(text)
    if (text) onInterimRef.current?.(text)
  }

  const takeTranscript = () => {
    const text = liveRef.current.trim()
    liveRef.current = ''
    setTranscript('')
    clearTimer(pauseTimerRef)
    return text
  }

  const stopListening = useCallback(() => {
    listenGenRef.current += 1
    listeningRef.current = false
    setListening(false)
    clearTimer(startTimerRef)
    clearTimer(pauseTimerRef)
    try {
      recognitionRef.current?.stop()
    } catch {
      // already stopped
    }
  }, [])

  const stopCapture = useCallback(() => {
    liveRef.current = ''
    setTranscript('')
    retryRef.current = 0
    stopListening()
  }, [stopListening])

  const commitSpeech = useCallback(
    (fromGen?: number) => {
      if (fromGen != null && listenGenRef.current !== fromGen && listeningRef.current) return
      const text = takeTranscript()
      if (!text || busyRef.current) return
      pendingReplySpeechRef.current = true
      stopListening()
      onFinalRef.current(text)
    },
    [stopListening]
  )

  const stopVoice = useCallback(() => {
    const leftover = liveRef.current.trim()
    voiceModeRef.current = false
    pendingReplySpeechRef.current = false
    retryRef.current = 0
    spokenOffsetRef.current = 0
    streamActiveRef.current = false
    setVoiceMode(false)
    stopListening()
    stopSpeaking()
    setSpeaking(false)
    if (leftover && !busyRef.current) {
      pendingReplySpeechRef.current = true
      liveRef.current = ''
      setTranscript('')
      onFinalRef.current(leftover)
    }
  }, [stopListening])

  const startListening = useCallback(() => {
    if (busyRef.current || listeningRef.current) return
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      onErrorRef.current?.('Voice chat needs Chrome or Edge.')
      return
    }

    const gen = ++listenGenRef.current
    clearTimer(startTimerRef)
    clearTimer(pauseTimerRef)
    liveRef.current = ''
    setTranscript('')
    if (window.speechSynthesis?.speaking || window.speechSynthesis?.pending) {
      stopSpeaking()
      setSpeaking(false)
    }
    try {
      recognitionRef.current?.stop()
    } catch {
      // ignore
    }
    recognitionRef.current = null

    const recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 3
    recognition.lang = navigator.language || 'en-US'

    recognition.onresult = (event: any) => {
      if (listenGenRef.current !== gen) return
      retryRef.current = 0
      const { committed, live } = readTranscript(event)
      if (live) publishLive(live)
      clearTimer(pauseTimerRef)
      const last = event.results[event.results.length - 1]
      const interim = live.slice(committed.length).trim()
      const punctuated = /[.!?]\s*$/.test(live)
      const wait =
        punctuated && last?.isFinal
          ? PAUSE_AFTER_PUNCT_MS
          : last?.isFinal && !interim
            ? PAUSE_AFTER_FINAL_MS
            : PAUSE_TO_SEND_MS
      pauseTimerRef.current = window.setTimeout(() => commitSpeech(gen), wait)
    }

    recognition.onerror = (event: any) => {
      if (listenGenRef.current !== gen) return
      const err = String(event.error || '')
      if (TRANSIENT_ERRORS.has(err)) {
        listeningRef.current = false
        setListening(false)
        if (liveRef.current.trim()) {
          pauseTimerRef.current = window.setTimeout(() => commitSpeech(gen), 400)
          return
        }
        if (voiceModeRef.current) return
        if ((err === 'network' || err === 'audio-capture') && retryRef.current < 2) {
          retryRef.current += 1
          startTimerRef.current = window.setTimeout(() => {
            if (listenGenRef.current !== gen || busyRef.current || mutedRef.current) return
            startListening()
          }, 500 * retryRef.current)
        }
        return
      }
      listeningRef.current = false
      setListening(false)
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        onErrorRef.current?.('Microphone permission is blocked. Allow the mic and try again.')
        stopVoice()
      }
    }

    recognition.onend = () => {
      if (listenGenRef.current !== gen) return
      listeningRef.current = false
      setListening(false)
      if (liveRef.current.trim() && !busyRef.current) {
        pauseTimerRef.current = window.setTimeout(() => commitSpeech(gen), 350)
      }
    }

    recognitionRef.current = recognition
    startTimerRef.current = window.setTimeout(() => {
      if (listenGenRef.current !== gen || busyRef.current || recognitionRef.current !== recognition) return
      try {
        recognition.start()
        listeningRef.current = true
        setListening(true)
      } catch {
        if (!voiceModeRef.current) onErrorRef.current?.('Could not start the microphone.')
      }
    }, 40)
  }, [commitSpeech, stopVoice])

  const toggleListening = useCallback(() => {
    if (listeningRef.current || liveRef.current.trim()) {
      mutedRef.current = true
      retryRef.current = 0
      commitSpeech()
      return
    }
    mutedRef.current = false
    retryRef.current = 0
    unlockSpeech()
    startListening()
  }, [commitSpeech, startListening])

  const toggleVoiceMode = useCallback(() => {
    if (voiceModeRef.current) {
      stopVoice()
      return
    }
    unlockSpeech()
    setVoiceMode(true)
    voiceModeRef.current = true
    pendingReplySpeechRef.current = false
    mutedRef.current = false
    retryRef.current = 0
    startListening()
  }, [startListening, stopVoice])

  useEffect(() => {
    if (!voiceMode || busy || listening || speaking || mutedRef.current) return
    if (liveRef.current.trim()) return
    const timer = window.setTimeout(() => {
      if (voiceModeRef.current && !busyRef.current && !listeningRef.current && !mutedRef.current) {
        startListening()
      }
    }, 180)
    return () => window.clearTimeout(timer)
  }, [voiceMode, busy, listening, speaking, startListening])

  const speakReply = useCallback(
    (content: string) => {
      if (!pendingReplySpeechRef.current && !voiceModeRef.current) return
      pendingReplySpeechRef.current = false
      const clean = (content || '').trim()
      if (!clean || clean === '...' || clean.startsWith('❌')) return
      lastSpokenRef.current = clean
      retryRef.current = 0
      setSpeaking(true)
      stopListening()
      speakText(clean, () => setSpeaking(false))
    },
    [stopListening]
  )

  const speakNow = useCallback((content: string) => {
    lastSpokenRef.current = content
    spokenOffsetRef.current = 0
    streamActiveRef.current = false
    setSpeaking(true)
    stopListening()
    speakText(content, () => setSpeaking(false))
  }, [stopListening])

  const feedSpokenReply = useCallback(
    (fullText: string) => {
      if (!pendingReplySpeechRef.current && !voiceModeRef.current) return
      const clean = textForSpeech(fullText || '')
      if (!clean || clean === '...' || clean.startsWith('❌')) return
      if (!streamActiveRef.current) {
        streamActiveRef.current = true
        spokenOffsetRef.current = 0
        lastSpokenRef.current = clean
        retryRef.current = 0
        setSpeaking(true)
        stopListening()
        beginSpokenReply(() => {
          if (!streamActiveRef.current) setSpeaking(false)
        })
      }
      const remaining = clean.slice(spokenOffsetRef.current)
      const sentences = remaining.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g)
      if (!sentences) return
      let eaten = 0
      for (const sentence of sentences) {
        const piece = sentence.trim()
        if (piece.length < 2) {
          eaten += sentence.length
          continue
        }
        pushSpokenText(piece)
        eaten += sentence.length
      }
      spokenOffsetRef.current += eaten
    },
    [stopListening]
  )

  const finishSpokenReply = useCallback(
    (fullText: string) => {
      if (!pendingReplySpeechRef.current && !voiceModeRef.current && !streamActiveRef.current) return
      const clean = textForSpeech(fullText || '')
      if (streamActiveRef.current) {
        const rest = clean.slice(spokenOffsetRef.current).trim()
        if (rest) pushSpokenText(rest)
        pendingReplySpeechRef.current = false
        spokenOffsetRef.current = 0
        streamActiveRef.current = false
        endSpokenReply()
        return
      }
      speakReply(fullText)
    },
    [speakReply]
  )

  useEffect(() => {
    return () => {
      listenGenRef.current += 1
      clearTimer(startTimerRef)
      clearTimer(pauseTimerRef)
      try {
        recognitionRef.current?.stop()
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
    transcript,
    toggleListening,
    toggleVoiceMode,
    stopVoice,
    stopCapture,
    speakReply,
    speakNow,
    feedSpokenReply,
    finishSpokenReply,
  }
}
