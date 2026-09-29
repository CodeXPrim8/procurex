'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Mic, MicOff, PhoneOff, X, RefreshCw } from 'lucide-react'
import ProcureXVoiceFace, { type VoiceFaceMood } from '@/components/ProcureXVoiceFace'
import { subscribeSpeechPlayback } from '@/lib/speech'

export type VoiceOverlayStatus = {
  listening: boolean
  speaking: boolean
  busy: boolean
  muted: boolean
  error: string
  connecting: boolean
}

type VoiceChatOverlayProps = {
  open: boolean
  status: VoiceOverlayStatus
  onClose: () => void
  onMute: () => void
  onUnmute: () => void
  onEnd: () => void
  onRetry: () => void
}

function moodFrom(status: VoiceOverlayStatus, audioPlaying: boolean): VoiceFaceMood {
  if (status.error) return 'error'
  if (audioPlaying) return 'speaking'
  if (status.busy) return 'thinking'
  if (status.listening) return 'listening'
  if (status.connecting) return 'connecting'
  return 'idle'
}

function statusLabel(mood: VoiceFaceMood, muted: boolean) {
  if (mood === 'error') return 'Something went wrong'
  if (mood === 'speaking') return 'Speaking'
  if (mood === 'thinking') return 'Thinking'
  if (mood === 'listening') return 'Listening'
  if (mood === 'connecting') return 'Connecting'
  if (muted) return 'Microphone muted'
  return 'Paused'
}

export default function VoiceChatOverlay({
  open,
  status,
  onClose,
  onMute,
  onUnmute,
  onEnd,
  onRetry,
}: VoiceChatOverlayProps) {
  const closeRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [audioPlaying, setAudioPlaying] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) {
      setAudioPlaying(false)
      return
    }
    return subscribeSpeechPlayback((snap) => {
      if (snap.type === 'start' || snap.type === 'boundary') setAudioPlaying(true)
      if (snap.type === 'end' || snap.type === 'cancel') setAudioPlaying(false)
    })
  }, [open])

  const mood = moodFrom(status, audioPlaying)

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    document.body.style.overflow = 'hidden'

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = ''
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [open, onClose])

  if (!open || !mounted) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black text-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-overlay-title"
      aria-describedby="voice-overlay-status"
    >
      <div ref={panelRef} className="flex h-dvh min-h-0 flex-col">
        <header className="flex items-start justify-between gap-3 px-4 pt-[max(0.9rem,env(safe-area-inset-top))] pb-2 sm:px-6">
          <div className="min-w-0">
            <p id="voice-overlay-title" className="text-base font-semibold tracking-wide text-white">
              ProcureX AI
            </p>
            <p id="voice-overlay-status" className="mt-0.5 text-sm text-cyan-200/80" aria-live="polite">
              {statusLabel(mood, status.muted)}
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            aria-label="Close voice conversation"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="relative min-h-0 flex-1">
          <ProcureXVoiceFace mood={mood} className="absolute inset-0 h-full w-full" />
        </div>

        {status.error ? (
          <div className="mx-auto mb-3 w-full max-w-md px-4 text-center">
            <p className="text-sm text-red-200">{status.error}</p>
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-medium text-black focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </button>
          </div>
        ) : null}

        <footer className="flex items-center justify-center gap-5 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-2">
          <button
            type="button"
            onClick={status.listening || status.speaking || mood === 'speaking' ? onMute : onUnmute}
            className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-[#303030] text-white hover:bg-[#3d3d3d] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            aria-label={status.listening || mood === 'speaking' ? 'Mute microphone' : 'Unmute microphone'}
            aria-pressed={!(status.listening || mood === 'speaking')}
          >
            {status.listening || mood === 'speaking' ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={onEnd}
            className="inline-flex min-h-14 min-w-14 items-center justify-center rounded-full bg-white text-black hover:bg-zinc-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300"
            aria-label="End voice conversation"
          >
            <PhoneOff className="h-5 w-5" />
          </button>
        </footer>
      </div>
    </div>,
    document.body
  )
}
