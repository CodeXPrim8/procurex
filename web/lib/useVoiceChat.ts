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
  setAnalysableSpeech,
} from './speech'
import { echoGuardActive, isPlaybackAudioActive, markEchoGuard, playVoiceCue, setMicEnergyLevel, stopVoiceCues } from './speechPlayback'
import { chatAPI } from './api'
import { getActiveTtsVoiceId } from './ttsVoices'
import {
  cleanTranscript,
  isCommitableSpeech,
  isLikelyEcho,
  isReadyToThink,
  novelUserSpeech,
  pauseDelayFor,
  pickBackchannel,
  type BackchannelId,
} from './voiceTurn'

type VoiceChatOptions = {
  onFinalTranscript: (text: string) => void
  onInterim?: (text: string) => void
  onPartialThink?: (text: string) => void
  onError?: (message: string) => void
  onInterrupt?: () => void
  busy?: boolean
}

const TRANSIENT_ERRORS = new Set(['no-speech', 'aborted', 'network', 'audio-capture'])
const PAUSE_TO_SEND_MS = 2000
const LIVE_TRANSCRIBE_MS = 900
const LIVE_TRANSCRIBE_MAX_BYTES = 140000
const BARGE_RMS = 0.082
const USER_SPEECH_RMS = 0.045
const SPEECH_HOLD_RMS = 0.062
const SPEECH_START_GRACE_MS = 480
const MAX_RECORD_MS = 9000

// #region agent log
function agentLog(location: string, message: string, data: Record<string, unknown>, hypothesisId: string) {
  fetch('http://127.0.0.1:7822/ingest/99b396db-6f63-4207-97c0-0286dee5a836',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'53a75c'},body:JSON.stringify({sessionId:'53a75c',runId:'voice-monitor',location,message,data,timestamp:Date.now(),hypothesisId})}).catch(()=>{})
}
// #endregion

function bestPhrase(result: any) {
  let best = result[0]
  for (let i = 1; i < result.length; i += 1) {
    if ((result[i]?.confidence || 0) > (best?.confidence || 0)) best = result[i]
  }
  return (best?.transcript || '').replace(/\s+/g, ' ').trim()
}

function pickRecorderMime() {
  if (typeof MediaRecorder === 'undefined') return ''
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

function earlySpeechGroups(text: string) {
  const spoken = (text || '').replace(/\s+/g, ' ').trim()
  if (!spoken) return [] as string[]
  if (/[.!?]$/.test(spoken)) return [spoken]
  const clause = spoken.match(/^[\s\S]{10,80}?(?:,|;|:)\s*/)
  if (clause) return [clause[0]]
  const words = spoken.split(' ').filter(Boolean)
  if (words.length >= 6) return [words.slice(0, 8).join(' ') + (words.length > 8 ? ' ' : '')]
  if (spoken.length >= 22) return [spoken]
  return [] as string[]
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

export function useVoiceChat({ onFinalTranscript, onInterim, onPartialThink, onError, onInterrupt, busy }: VoiceChatOptions) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [voiceMode, setVoiceMode] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [spokenCaption, setSpokenCaption] = useState('')
  const [cueName, setCueName] = useState<BackchannelId | null>(null)
  const [micMuted, setMicMutedState] = useState(false)
  const [voiceError, setVoiceError] = useState<string | null>(null)
  const [clipBusy, setClipBusy] = useState(false)
  const [thinkingAhead, setThinkingAhead] = useState(false)

  const recognitionRef = useRef<any>(null)
  const voiceModeRef = useRef(false)
  const listeningRef = useRef(false)
  const speakingRef = useRef(false)
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
  const lastErrorRef = useRef('')
  const sttModeRef = useRef<'speech' | 'recorder'>('speech')
  const micStreamRef = useRef<MediaStream | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const recAbortRef = useRef(false)
  const clipBusyRef = useRef(false)
  const transcribeFailRef = useRef(0)
  const monitorRef = useRef<number | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const flushRef = useRef(false)
  const heldRef = useRef('')
  const liveTimerRef = useRef<number | null>(null)
  const onFinalRef = useRef(onFinalTranscript)
  const onInterimRef = useRef(onInterim)
  const onPartialThinkRef = useRef(onPartialThink)
  const onErrorRef = useRef(onError)
  const onInterruptRef = useRef(onInterrupt)
  const committingRef = useRef(false)
  const lastThinkRef = useRef('')
  const lastThinkAtRef = useRef(0)
  const lastCueRef = useRef<BackchannelId | null>(null)
  const lastCueAtRef = useRef(0)
  const lastCueWordsRef = useRef(0)
  const cueTimerRef = useRef<number | null>(null)
  const loudSinceRef = useRef(0)
  const ttsStartedAtRef = useRef(0)
  const ignoreFeedRef = useRef(false)

  const reportError = (message: string, overlay = true) => {
    if (overlay) setVoiceError(message)
    onErrorRef.current?.(message)
  }

  const markSpeaking = (next: boolean) => {
    speakingRef.current = next
    setSpeaking(next)
    if (!next) markEchoGuard(800)
  }

  onFinalRef.current = onFinalTranscript
  onInterimRef.current = onInterim
  onPartialThinkRef.current = onPartialThink
  onErrorRef.current = onError
  onInterruptRef.current = onInterrupt
  busyRef.current = Boolean(busy)
  voiceModeRef.current = voiceMode

  useEffect(() => {
    const canRecord = typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
    setSupported(speechSupported() || canRecord)
  }, [])

  const clearTimer = (ref: { current: number | null }) => {
    if (ref.current != null) {
      window.clearTimeout(ref.current)
      ref.current = null
    }
  }

  const setCaption = (text: string) => {
    liveRef.current = text
    setTranscript(text)
  }

  const publishLive = (piece: string) => {
    setCaption(joinPhrases(heldRef.current, piece))
    onInterimRef.current?.(joinPhrases(heldRef.current, piece))
  }

  const freezeHeld = () => {
    heldRef.current = liveRef.current.trim()
  }

  const takeTranscript = () => {
    const text = liveRef.current.trim()
    liveRef.current = ''
    heldRef.current = ''
    setTranscript('')
    clearTimer(pauseTimerRef)
    return text
  }

  const playCue = (id: BackchannelId, volume = 0.6) => {
    lastCueRef.current = id
    lastCueAtRef.current = Date.now()
    setCueName(id)
    if (cueTimerRef.current != null) window.clearTimeout(cueTimerRef.current)
    cueTimerRef.current = window.setTimeout(() => {
      setCueName((current) => (current === id ? null : current))
      cueTimerRef.current = null
    }, id === 'listening' ? 720 : 900)
    if (id === 'listening') return
    const voiceId = getActiveTtsVoiceId()
    void playVoiceCue(`/tts/cues/${voiceId}-${id}.mp3?v=1`, volume)
  }

  const interruptSpeech = useCallback(() => {
    if (!speakingRef.current && !isPlaybackAudioActive() && !streamActiveRef.current) return false
    // #region agent log
    agentLog('useVoiceChat.ts:interruptSpeech', 'barge-in stop', { speaking: speakingRef.current, playback: isPlaybackAudioActive(), streamActive: streamActiveRef.current, live: liveRef.current.slice(0, 80) }, 'E')
    // #endregion
    ignoreFeedRef.current = true
    streamActiveRef.current = false
    pendingReplySpeechRef.current = false
    spokenOffsetRef.current = 0
    stopSpeaking()
    markSpeaking(false)
    markEchoGuard(650)
    onInterruptRef.current?.()
    return true
  }, [])

  const maybeBackchannel = (live: string) => {
    if (!voiceModeRef.current || mutedRef.current) return
    if (pendingReplySpeechRef.current || busyRef.current || committingRef.current) return
    if (speakingRef.current || isPlaybackAudioActive()) return
    const words = live.split(/\s+/).filter(Boolean).length
    if (words - lastCueWordsRef.current < 6) return
    const sinceCue = Date.now() - lastCueAtRef.current
    if (sinceCue < 6500) return
    const cue = pickBackchannel(live, lastCueRef.current)
    if (!cue || cue === 'listening') return
    lastCueWordsRef.current = words
    playCue(cue, 0.4)
  }

  const maybeThinkAhead = (live: string) => {
    const spoken = cleanTranscript(live)
    if (!isReadyToThink(spoken)) return
    if (isLikelyEcho(lastSpokenRef.current, spoken)) return
    const now = Date.now()
    if (spoken === lastThinkRef.current && now - lastThinkAtRef.current < 1600) return
    if (now - lastThinkAtRef.current < 900) return
    lastThinkRef.current = spoken
    lastThinkAtRef.current = now
  }

  const stopListening = useCallback(() => {
    listenGenRef.current += 1
    listeningRef.current = false
    setListening(false)
    clearTimer(startTimerRef)
    clearTimer(pauseTimerRef)
    recAbortRef.current = true
    if (liveTimerRef.current != null) {
      window.clearInterval(liveTimerRef.current)
      liveTimerRef.current = null
    }
    if (monitorRef.current != null) {
      cancelAnimationFrame(monitorRef.current)
      monitorRef.current = null
    }
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
    } catch {
      // ignore
    }
    try {
      recognitionRef.current?.stop()
    } catch {
      // already stopped
    }
  }, [])

  const stopCapture = useCallback(() => {
    liveRef.current = ''
    heldRef.current = ''
    setTranscript('')
    retryRef.current = 0
    stopListening()
  }, [stopListening])

  const commitSpeech = useCallback(
    (_fromGen?: number) => {
      if (committingRef.current) return
      const text = liveRef.current.trim()
      if (!isCommitableSpeech(text)) {
        agentLog('useVoiceChat.ts:commitSpeech', 'commit skipped', { hasText: Boolean(text), busy: busyRef.current, listenGen: listenGenRef.current }, 'A')
        return
      }
      if (speakingRef.current || isPlaybackAudioActive()) {
        if (isLikelyEcho(lastSpokenRef.current, text) || echoGuardActive()) {
          agentLog('useVoiceChat.ts:commitSpeech', 'commit echo ignored', { text: text.slice(0, 80) }, 'A')
          return
        }
        interruptSpeech()
        playCue('listening', 0.7)
      }
      committingRef.current = true
      window.setTimeout(() => {
        committingRef.current = false
      }, 900)
      lastCueWordsRef.current = 0
      stopVoiceCues()
      takeTranscript()
      pendingReplySpeechRef.current = true
      setThinkingAhead(true)
      playCue('listening')
      agentLog('useVoiceChat.ts:commitSpeech', 'commit send', { text: text.slice(0, 180), voiceMode: voiceModeRef.current, busy: busyRef.current }, 'A')
      onFinalRef.current(text)
    },
    [interruptSpeech]
  )

  const stopVoice = useCallback(() => {
    // #region agent log
    agentLog(
      'useVoiceChat.ts:stopVoice',
      'voice session stopping',
      {
        voiceMode: voiceModeRef.current,
        listening: listeningRef.current,
        speaking: speakingRef.current,
        stack: String(new Error().stack || '').split('\n').slice(2, 8).join(' | '),
      },
      'D'
    )
    // #endregion
    voiceModeRef.current = false
    pendingReplySpeechRef.current = false
    retryRef.current = 0
    lastErrorRef.current = ''
    sttModeRef.current = 'speech'
    spokenOffsetRef.current = 0
    streamActiveRef.current = false
    recAbortRef.current = true
    liveRef.current = ''
    heldRef.current = ''
    setTranscript('')
    setSpokenCaption('')
    setCueName(null)
    setMicEnergyLevel(0)
    ignoreFeedRef.current = false
    mutedRef.current = false
    setMicMutedState(false)
    setVoiceError(null)
    setThinkingAhead(false)
    setAnalysableSpeech(false)
    micStreamRef.current?.getTracks().forEach((track) => track.stop())
    micStreamRef.current = null
    try {
      void audioCtxRef.current?.close()
    } catch {
      // ignore
    }
    audioCtxRef.current = null
    analyserRef.current = null
    setVoiceMode(false)
    stopListening()
    stopSpeaking()
    markSpeaking(false)
  }, [stopListening])

  const startRecorder = useCallback(async (backup = false) => {
    if (mutedRef.current || clipBusyRef.current || speakingRef.current) {
      agentLog('useVoiceChat.ts:startRecorder', 'recorder blocked', { backup, busy: busyRef.current, listening: listeningRef.current, clipBusy: clipBusyRef.current, speaking: speakingRef.current, sttMode: sttModeRef.current }, 'G')
      return
    }
    if (!backup && listeningRef.current) {
      agentLog('useVoiceChat.ts:startRecorder', 'recorder blocked', { backup, busy: busyRef.current, listening: listeningRef.current, clipBusy: clipBusyRef.current, speaking: speakingRef.current, sttMode: sttModeRef.current }, 'G')
      return
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') return
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      if (!backup) reportError('This browser cannot record voice. Try Chrome or Edge.')
      return
    }

    const gen = backup ? listenGenRef.current : ++listenGenRef.current
    recAbortRef.current = false
    flushRef.current = false
    listeningRef.current = true
    setListening(true)
    clearTimer(startTimerRef)
    if (!backup) freezeHeld()
    if (monitorRef.current != null) {
      cancelAnimationFrame(monitorRef.current)
      monitorRef.current = null
    }
    if (liveTimerRef.current != null) {
      window.clearInterval(liveTimerRef.current)
      liveTimerRef.current = null
    }
    if (!backup) {
      try {
        recognitionRef.current?.abort?.()
      } catch {
        try {
          recognitionRef.current?.stop()
        } catch {
          // ignore
        }
      }
      recognitionRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop()
      } catch {
        // ignore
      }
    }

    try {
      if (!micStreamRef.current || micStreamRef.current.getAudioTracks().every((track) => track.readyState !== 'live')) {
        micStreamRef.current = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        })
      }
    } catch (error: any) {
      listeningRef.current = false
      setListening(false)
      // #region agent log
      agentLog('useVoiceChat.ts:startRecorder', 'getUserMedia failed', { name: String(error?.name || ''), message: String(error?.message || '').slice(0, 120) }, 'G')
      // #endregion
      reportError('Microphone permission is blocked. Allow the mic and try again.')
      return
    }
    if (listenGenRef.current !== gen || recAbortRef.current) {
      listeningRef.current = false
      setListening(false)
      return
    }

    const stream = micStreamRef.current
    if (!stream) return
    const mime = pickRecorderMime()
    let recorder: MediaRecorder
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    } catch (error: any) {
      listeningRef.current = false
      setListening(false)
      // #region agent log
      agentLog('useVoiceChat.ts:startRecorder', 'MediaRecorder failed', { mime, message: String(error?.message || '').slice(0, 120) }, 'G')
      // #endregion
      reportError('Could not start the microphone.')
      return
    }

    chunksRef.current = []
    recorderRef.current = recorder
    let heard = false
    let silentSince = 0
    let peakRms = 0

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data)
    }

    recorder.onstop = async () => {
      if (liveTimerRef.current != null) {
        window.clearInterval(liveTimerRef.current)
        liveTimerRef.current = null
      }
      if (monitorRef.current != null) {
        cancelAnimationFrame(monitorRef.current)
        monitorRef.current = null
      }
      const abort = recAbortRef.current
      const flushed = flushRef.current
      flushRef.current = false
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || mime || 'audio/webm' })
      chunksRef.current = []
      if (recorderRef.current === recorder) recorderRef.current = null
      if (!recognitionRef.current) {
        listeningRef.current = false
        setListening(false)
      }
      // #region agent log
      agentLog('useVoiceChat.ts:recorder.onstop', 'clip ready', { abort, flushed, backup, bytes: blob.size, heard, peakRms: Number(peakRms.toFixed(4)), mime: blob.type, voiceMode: voiceModeRef.current, genMatch: listenGenRef.current === gen }, 'H')
      // #endregion
      if (abort || blob.size < 200) {
        clipBusyRef.current = false
        setClipBusy(false)
        return
      }
      if (isCommitableSpeech(liveRef.current)) {
        clipBusyRef.current = false
        setClipBusy(false)
        commitSpeech()
        return
      }
      if (backup || !heard && !flushed) {
        // #region agent log
        agentLog('useVoiceChat.ts:recorder.onstop', 'skip unheard clip', { backup, bytes: blob.size, peakRms: Number(peakRms.toFixed(4)) }, 'I')
        // #endregion
        clipBusyRef.current = false
        setClipBusy(false)
        return
      }
      clipBusyRef.current = true
      setClipBusy(true)
      try {
        const text = await chatAPI.transcribe(blob)
        // #region agent log
        agentLog('useVoiceChat.ts:transcribe', 'transcript', { chars: text.length, preview: text.slice(0, 80), voiceMode: voiceModeRef.current, busy: busyRef.current }, 'F')
        // #endregion
        const spoken = cleanTranscript(text || liveRef.current)
        if (!spoken || !isCommitableSpeech(spoken)) return
        if (isLikelyEcho(lastSpokenRef.current, spoken)) {
          // #region agent log
          agentLog('useVoiceChat.ts:transcribe', 'echo ignored', { preview: spoken.slice(0, 80) }, 'A')
          // #endregion
          return
        }
        transcribeFailRef.current = 0
        heldRef.current = ''
        setCaption(spoken)
        commitSpeech()
      } catch (error: any) {
        // #region agent log
        agentLog('useVoiceChat.ts:transcribe', 'failed', { status: error?.response?.status || 0, message: String(error?.message || '').slice(0, 120) }, 'F')
        // #endregion
        if (liveRef.current.trim() && !busyRef.current) {
          commitSpeech()
          return
        }
      } finally {
        clipBusyRef.current = false
        setClipBusy(false)
      }
    }

    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext
      if (Ctx && !audioCtxRef.current) audioCtxRef.current = new Ctx()
      const ctx = audioCtxRef.current
      if (ctx) {
        if (ctx.state === 'suspended') await ctx.resume()
        if (!analyserRef.current) {
          const source = ctx.createMediaStreamSource(stream)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 512
          source.connect(analyser)
          analyserRef.current = analyser
        }
      }
    } catch {
      // silence monitor is optional; clip still transcribes on user tap
    }

    const analyser = analyserRef.current
    const samples = analyser ? new Uint8Array(analyser.fftSize) : null
    let hangLogged = false
    let quietLogged = false
    const recStartedAt = performance.now()
    const stopClip = (reason: string, rms: number, now: number) => {
      // #region agent log
      agentLog('useVoiceChat.ts:recorder.tick', 'end utterance', {
        reason,
        rms: Number(rms.toFixed(4)),
        peakRms: Number(peakRms.toFixed(4)),
        heard,
        silentMs: silentSince ? Math.round(now - silentSince) : 0,
        recMs: Math.round(now - recStartedAt),
        speaking: speakingRef.current,
        playback: isPlaybackAudioActive(),
        echo: echoGuardActive(),
        liveChars: liveRef.current.trim().length,
      }, 'H')
      // #endregion
      try {
        if (recorder.state !== 'inactive') recorder.stop()
      } catch {
        // ignore
      }
    }
    const tick = (now: number) => {
      if (recorderRef.current !== recorder || recAbortRef.current) return
      let rms = 0
      if (samples && analyser) {
        analyser.getByteTimeDomainData(samples)
        let sum = 0
        for (let i = 0; i < samples.length; i += 1) {
          const n = (samples[i] - 128) / 128
          sum += n * n
        }
        rms = Math.sqrt(sum / samples.length)
        if (rms > peakRms) peakRms = rms
        const ttsActive = speakingRef.current || isPlaybackAudioActive()
        const ignoreAsEcho = echoGuardActive() || ttsActive
        const pastGrace = now - recStartedAt > SPEECH_START_GRACE_MS
        if (pastGrace && rms > USER_SPEECH_RMS && !ignoreAsEcho) {
          if (!heard) {
            // #region agent log
            agentLog('useVoiceChat.ts:recorder.tick', 'speech heard', {
              rms: Number(rms.toFixed(4)),
              recMs: Math.round(now - recStartedAt),
              speaking: speakingRef.current,
            }, 'I')
            // #endregion
            heard = true
            silentSince = now
          }
          if (rms > SPEECH_HOLD_RMS) silentSince = now
        } else if (
          ttsActive &&
          !echoGuardActive() &&
          Date.now() - ttsStartedAtRef.current > 420 &&
          rms > BARGE_RMS &&
          isCommitableSpeech(liveRef.current)
        ) {
          interruptSpeech()
          playCue('listening', 0.7)
        }
      }
      if (heard && silentSince && now - silentSince > pauseDelayFor(liveRef.current)) {
        if (isCommitableSpeech(liveRef.current)) {
          commitSpeech()
          recAbortRef.current = true
        }
        stopClip('silence', rms, now)
        return
      }
      if (heard && now - recStartedAt > MAX_RECORD_MS) {
        stopClip('max', rms, now)
        return
      }
      if (!quietLogged && !heard && now - recStartedAt > 2000) {
        quietLogged = true
        // #region agent log
        agentLog('useVoiceChat.ts:recorder.tick', 'no speech yet', {
          rms: Number(rms.toFixed(4)),
          peakRms: Number(peakRms.toFixed(4)),
          recMs: Math.round(now - recStartedAt),
        }, 'I')
        // #endregion
      }
      if (!hangLogged && heard && now - recStartedAt > 3500) {
        hangLogged = true
        // #region agent log
        agentLog('useVoiceChat.ts:recorder.tick', 'still recording', {
          rms: Number(rms.toFixed(4)),
          silentMs: silentSince ? Math.round(now - silentSince) : 0,
          recMs: Math.round(now - recStartedAt),
          speaking: speakingRef.current,
          playback: isPlaybackAudioActive(),
          echo: echoGuardActive(),
        }, 'H')
        // #endregion
      }
      monitorRef.current = window.requestAnimationFrame(tick)
    }

    recorder.start(250)
    listeningRef.current = true
    setListening(true)
    monitorRef.current = window.requestAnimationFrame(tick)
    // #region agent log
    agentLog('useVoiceChat.ts:startRecorder', 'recorder started', { backup, mime: recorder.mimeType || mime, voiceMode: voiceModeRef.current, tracks: stream.getAudioTracks().length }, 'G')
    // #endregion
  }, [commitSpeech])

  const startListening = useCallback(() => {
    if (mutedRef.current || clipBusyRef.current || speakingRef.current) {
      agentLog('useVoiceChat.ts:startListening', 'start blocked', { busy: busyRef.current, listening: listeningRef.current, clipBusy: clipBusyRef.current, speakingSynth: Boolean(window.speechSynthesis?.speaking), speakingState: speakingRef.current, sttMode: sttModeRef.current }, 'B')
      return
    }
    if (recognitionRef.current && listeningRef.current) return
    // #region agent log
    agentLog('useVoiceChat.ts:startListening', 'start mic', { voiceMode: voiceModeRef.current, synthSpeaking: Boolean(window.speechSynthesis?.speaking), synthPending: Boolean(window.speechSynthesis?.pending), lastError: lastErrorRef.current, retry: retryRef.current, sttMode: sttModeRef.current }, 'B')
    // #endregion
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      void startRecorder(false)
      return
    }

    const gen = ++listenGenRef.current
    clearTimer(startTimerRef)
    freezeHeld()
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
      lastErrorRef.current = ''
      const { live } = readTranscript(event)
      if (!live) return
      const speakingNow = speakingRef.current || isPlaybackAudioActive()
      const echo = echoGuardActive() && isLikelyEcho(lastSpokenRef.current, live)
      // #region agent log
      agentLog('useVoiceChat.ts:onresult', echo ? 'stt echo' : speakingNow ? 'stt during tts' : 'stt live', { live: live.slice(0, 100), speaking: speakingRef.current, playback: isPlaybackAudioActive(), listening: listeningRef.current, echoGuard: echoGuardActive(), ttsAge: Date.now() - ttsStartedAtRef.current }, speakingNow ? 'B' : 'A')
      // #endregion
      if (echo) return
      if (speakingNow) {
        const novel = novelUserSpeech(lastSpokenRef.current, live)
        if (!isCommitableSpeech(novel) || Date.now() - ttsStartedAtRef.current < 380) {
          // #region agent log
          agentLog('useVoiceChat.ts:onresult', 'barge-in ignored', { novel: (novel || '').slice(0, 80), ttsAge: Date.now() - ttsStartedAtRef.current, commitable: isCommitableSpeech(novel) }, 'B')
          // #endregion
          return
        }
        interruptSpeech()
        playCue('listening', 0.7)
        heldRef.current = ''
        setCaption(novel)
        maybeThinkAhead(novel)
        clearTimer(pauseTimerRef)
        pauseTimerRef.current = window.setTimeout(() => commitSpeech(), pauseDelayFor(novel))
        return
      }
      publishLive(live)
      maybeThinkAhead(live)
      maybeBackchannel(live)
      clearTimer(pauseTimerRef)
      pauseTimerRef.current = window.setTimeout(() => commitSpeech(), pauseDelayFor(liveRef.current))
    }

    recognition.onerror = (event: any) => {
      if (listenGenRef.current !== gen) return
      const err = String(event.error || '')
      lastErrorRef.current = err
      // #region agent log
      agentLog('useVoiceChat.ts:onerror', 'stt error', { err, voiceMode: voiceModeRef.current, hasLive: Boolean(liveRef.current.trim()), busy: busyRef.current, retry: retryRef.current, online: navigator.onLine, sttMode: sttModeRef.current }, 'C')
      // #endregion
      if (TRANSIENT_ERRORS.has(err)) {
        freezeHeld()
        if (isCommitableSpeech(liveRef.current) && !busyRef.current) {
          commitSpeech()
          return
        }
        if (err === 'network' || err === 'audio-capture') {
          retryRef.current += 1
          lastErrorRef.current = ''
          try {
            recognition.abort?.()
          } catch {
            // ignore
          }
          if (recognitionRef.current === recognition) recognitionRef.current = null
          void startRecorder(true)
          if (retryRef.current < 3) {
            startTimerRef.current = window.setTimeout(() => {
              if (voiceModeRef.current && !mutedRef.current) startListening()
            }, 240)
          }
          return
        }
        return
      }
      if (!recorderRef.current) {
        listeningRef.current = false
        setListening(false)
      }
      if (err === 'not-allowed' || err === 'service-not-allowed') {
        reportError('Microphone permission is blocked. Allow the mic and try again.')
      }
    }

    recognition.onend = () => {
      if (listenGenRef.current !== gen) return
      freezeHeld()
      if (recognitionRef.current === recognition) recognitionRef.current = null
      if (mutedRef.current || !voiceModeRef.current) {
        if (!recorderRef.current) {
          listeningRef.current = false
          setListening(false)
        }
        return
      }
      startTimerRef.current = window.setTimeout(() => {
        if (voiceModeRef.current && !mutedRef.current) startListening()
      }, 80)
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      listeningRef.current = true
      setListening(true)
      void startRecorder(true)
    } catch {
      void startRecorder(false)
    }
  }, [commitSpeech, startRecorder])

  const toggleListening = useCallback(() => {
    if (listeningRef.current || liveRef.current.trim()) {
      mutedRef.current = true
      retryRef.current = 0
      if (sttModeRef.current === 'recorder' && recorderRef.current && recorderRef.current.state !== 'inactive') {
        recAbortRef.current = false
        flushRef.current = true
        try {
          recorderRef.current.stop()
        } catch {
          commitSpeech()
        }
        return
      }
      commitSpeech()
      return
    }
    mutedRef.current = false
    retryRef.current = 0
    lastErrorRef.current = ''
    unlockSpeech(() => {
      if (!busyRef.current && !listeningRef.current) startListening()
    })
  }, [commitSpeech, startListening])

  const toggleVoiceMode = useCallback(() => {
    if (voiceModeRef.current) {
      stopVoice()
      return
    }
    setVoiceMode(true)
    voiceModeRef.current = true
    pendingReplySpeechRef.current = false
    sttModeRef.current = 'speech'
    lastErrorRef.current = ''
    mutedRef.current = false
    setMicMutedState(false)
    setVoiceError(null)
    retryRef.current = 0
    lastErrorRef.current = ''
    setAnalysableSpeech(true)
    unlockSpeech(() => {
      if (voiceModeRef.current && !listeningRef.current) startListening()
    })
  }, [startListening, stopVoice])

  const setMicMuted = useCallback(
    (muted: boolean) => {
      mutedRef.current = muted
      setMicMutedState(muted)
      if (muted) {
        recAbortRef.current = true
        stopListening()
        return
      }
      if (voiceModeRef.current && !listeningRef.current) startListening()
    },
    [startListening, stopListening]
  )

  const retryListen = useCallback(() => {
    setVoiceError(null)
    transcribeFailRef.current = 0
    mutedRef.current = false
    setMicMutedState(false)
    lastErrorRef.current = ''
    retryRef.current = 0
    if (!voiceModeRef.current) {
      voiceModeRef.current = true
      setVoiceMode(true)
      setAnalysableSpeech(true)
    }
    unlockSpeech(() => {
      if (voiceModeRef.current && !listeningRef.current) startListening()
    })
  }, [startListening])

  useEffect(() => {
    if (!voiceMode || mutedRef.current || voiceError) return
    if (listening || clipBusy || speaking) return
    const timer = window.setTimeout(() => {
      if (voiceModeRef.current && !listeningRef.current && !mutedRef.current && !clipBusyRef.current && !voiceError && !speakingRef.current) {
        startListening()
      }
    }, 160)
    return () => window.clearTimeout(timer)
  }, [voiceMode, busy, listening, speaking, clipBusy, voiceError, startListening])

  const speakReply = useCallback(
    (content: string) => {
      if (!pendingReplySpeechRef.current && !voiceModeRef.current) return
      pendingReplySpeechRef.current = false
      const clean = (content || '').trim()
      if (!clean || clean === '...' || clean.startsWith('❌')) return
      lastSpokenRef.current = clean
      retryRef.current = 0
      ignoreFeedRef.current = false
      ttsStartedAtRef.current = Date.now()
      markEchoGuard(420)
      setSpokenCaption(clean)
      markSpeaking(true)
      setThinkingAhead(false)
      // #region agent log
      agentLog('useVoiceChat.ts:speakReply', 'tts start', { chars: clean.length, preview: clean.slice(0, 100), listening: listeningRef.current }, 'A')
      // #endregion
      speakText(clean, () => {
        markSpeaking(false)
        setSpokenCaption('')
      })
    },
    []
  )

  const speakNow = useCallback((content: string) => {
    lastSpokenRef.current = content
    spokenOffsetRef.current = 0
    streamActiveRef.current = false
    ignoreFeedRef.current = false
    ttsStartedAtRef.current = Date.now()
    markEchoGuard(420)
    setSpokenCaption(content)
    markSpeaking(true)
    speakText(content, () => {
      markSpeaking(false)
      setSpokenCaption('')
    })
  }, [])

  const feedSpokenReply = useCallback(
    (fullText: string) => {
      if (ignoreFeedRef.current) {
        if (!pendingReplySpeechRef.current) return
        ignoreFeedRef.current = false
      }
      if (!pendingReplySpeechRef.current && !voiceModeRef.current) return
      const clean = textForSpeech(fullText || '')
      if (!clean || clean === '...' || clean.startsWith('❌')) return
      agentLog('useVoiceChat.ts:feedSpokenReply', 'feed tts', { pending: pendingReplySpeechRef.current, voiceMode: voiceModeRef.current, streamActive: streamActiveRef.current, chars: clean.length, preview: clean.slice(0, 120) }, 'D')
      if (!streamActiveRef.current) {
        streamActiveRef.current = true
        spokenOffsetRef.current = 0
        lastSpokenRef.current = clean
        retryRef.current = 0
        ignoreFeedRef.current = false
        ttsStartedAtRef.current = Date.now()
        markEchoGuard(420)
        markSpeaking(true)
        setThinkingAhead(false)
        beginSpokenReply(() => {
          if (!streamActiveRef.current) {
            markSpeaking(false)
            setSpokenCaption('')
          }
        })
      }
      lastSpokenRef.current = clean
      setSpokenCaption(clean)
      const remaining = clean.slice(spokenOffsetRef.current)
      const sentences = remaining.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g)
      const groups = sentences || earlySpeechGroups(remaining)
      if (!groups.length) return
      let eaten = 0
      for (const sentence of groups) {
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
    []
  )

  const finishSpokenReply = useCallback(
    (fullText: string) => {
      if (ignoreFeedRef.current) {
        pendingReplySpeechRef.current = false
        streamActiveRef.current = false
        return
      }
      if (!pendingReplySpeechRef.current && !voiceModeRef.current && !streamActiveRef.current) return
      const clean = textForSpeech(fullText || '')
      // #region agent log
      agentLog('useVoiceChat.ts:finishSpokenReply', 'finish tts', { streamActive: streamActiveRef.current, pending: pendingReplySpeechRef.current, voiceMode: voiceModeRef.current, restChars: Math.max(0, clean.length - spokenOffsetRef.current), chars: clean.length }, 'D')
      // #endregion
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
      // #region agent log
      agentLog('useVoiceChat.ts:unmount', 'voice hook unmount', { voiceMode: voiceModeRef.current }, 'E')
      // #endregion
      listenGenRef.current += 1
      recAbortRef.current = true
      clearTimer(startTimerRef)
      clearTimer(pauseTimerRef)
      if (liveTimerRef.current != null) {
        window.clearInterval(liveTimerRef.current)
        liveTimerRef.current = null
      }
      if (monitorRef.current != null) {
        cancelAnimationFrame(monitorRef.current)
        monitorRef.current = null
      }
      try {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop()
      } catch {
        // ignore
      }
      try {
        recognitionRef.current?.stop()
      } catch {
        // ignore
      }
      micStreamRef.current?.getTracks().forEach((track) => track.stop())
      micStreamRef.current = null
      setAnalysableSpeech(false)
      stopSpeaking()
    }
  }, [])

  useEffect(() => {
    if (!voiceMode || micMuted) {
      setMicEnergyLevel(0)
      return
    }
    let cancelled = false
    let frame = 0
    const setup = async () => {
      try {
        if (!micStreamRef.current || micStreamRef.current.getAudioTracks().every((track) => track.readyState !== 'live')) {
          micStreamRef.current = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          })
        }
        const Ctx = window.AudioContext || (window as any).webkitAudioContext
        if (Ctx && !audioCtxRef.current) audioCtxRef.current = new Ctx()
        const ctx = audioCtxRef.current
        if (ctx?.state === 'suspended') await ctx.resume()
        if (ctx && micStreamRef.current && !analyserRef.current) {
          const source = ctx.createMediaStreamSource(micStreamRef.current)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 512
          source.connect(analyser)
          analyserRef.current = analyser
        }
      } catch {
        return
      }
      if (cancelled) return
      const analyser = analyserRef.current
      const samples = analyser ? new Uint8Array(analyser.fftSize) : null
      const tick = () => {
        if (cancelled) return
        if (samples && analyserRef.current) {
          analyserRef.current.getByteTimeDomainData(samples)
          let sum = 0
          for (let i = 0; i < samples.length; i += 1) {
            const n = (samples[i] - 128) / 128
            sum += n * n
          }
          const rms = Math.sqrt(sum / samples.length)
          setMicEnergyLevel(Math.min(1, Math.max(0, (rms - 0.018) / 0.2)))
          if (
            (speakingRef.current || isPlaybackAudioActive()) &&
            !mutedRef.current &&
            !echoGuardActive() &&
            Date.now() - ttsStartedAtRef.current > 420 &&
            rms > BARGE_RMS &&
            isCommitableSpeech(liveRef.current)
          ) {
            if (!loudSinceRef.current) loudSinceRef.current = performance.now()
            else if (performance.now() - loudSinceRef.current > 280) {
              loudSinceRef.current = 0
              // #region agent log
              agentLog('useVoiceChat.ts:micEnergy', 'rms barge-in', { rms: Number(rms.toFixed(4)), speaking: speakingRef.current, playback: isPlaybackAudioActive() }, 'A')
              // #endregion
              interruptSpeech()
              playCue('listening', 0.7)
            }
          } else {
            loudSinceRef.current = 0
          }
        }
        frame = window.requestAnimationFrame(tick)
      }
      frame = window.requestAnimationFrame(tick)
    }
    void setup()
    return () => {
      cancelled = true
      if (frame) window.cancelAnimationFrame(frame)
      setMicEnergyLevel(0)
    }
  }, [voiceMode, micMuted, interruptSpeech])

  return {
    supported,
    listening,
    speaking,
    voiceMode,
    transcript,
    spokenCaption,
    cueName,
    micMuted,
    voiceError,
    clipBusy,
    thinkingAhead,
    toggleListening,
    toggleVoiceMode,
    setMicMuted,
    retryListen,
    stopVoice,
    stopCapture,
    interruptSpeech,
    speakReply,
    speakNow,
    feedSpokenReply,
    finishSpokenReply,
  }
}
