'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Mic, MicOff, PhoneOff, RotateCcw, X } from 'lucide-react'
import VoiceOrb, { type VoiceOrbState } from './VoiceOrb'

type VoiceOverlayProps = {
  open: boolean
  status: VoiceOrbState
  muted: boolean
  error: string | null
  caption?: string
  cueName?: string | null
  onMute: () => void
  onEnd: () => void
  onClose: () => void
  onRetry: () => void
}

function statusLabel(
  status: VoiceOrbState,
  muted: boolean,
  error: string | null,
  caption?: string | null
) {
  if (status === 'error') return error || 'Voice chat ran into a problem.'
  if (muted && status !== 'speaking' && status !== 'thinking') return 'Microphone muted'
  if (status === 'connecting') return 'Connecting…'
  if (status === 'listening') return 'Listening…'
  if (status === 'thinking') return 'Thinking…'
  if (status === 'speaking') return 'Speaking…'
  return 'Ready'
}

export default function VoiceOverlay({
  open,
  status,
  muted,
  error,
  caption,
  cueName,
  onMute,
  onEnd,
  onClose,
  onRetry,
}: VoiceOverlayProps) {
  const titleId = useId()
  const statusId = useId()
  const overlayRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const [shownStatus, setShownStatus] = useState(status)
  const [shownError, setShownError] = useState(error)
  const [shownMuted, setShownMuted] = useState(muted)

  useEffect(() => {
    if (!open) return
    setShownStatus(status)
    setShownError(error)
    setShownMuted(muted)
  }, [open, status, error, muted])

  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement | null
      setMounted(true)
      const frame = window.requestAnimationFrame(() => setVisible(true))
      return () => window.cancelAnimationFrame(frame)
    }
    setVisible(false)
    const timer = window.setTimeout(() => setMounted(false), 280)
    return () => window.clearTimeout(timer)
  }, [open])

  useEffect(() => {
    if (!mounted || !visible) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const root = overlayRef.current
      if (!root) return
      const items = [...root.querySelectorAll<HTMLElement>('button:not([disabled])')]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [mounted, visible, onClose])

  useEffect(() => {
    if (mounted) return
    previousFocusRef.current?.focus?.()
  }, [mounted])

  if (!mounted || typeof document === 'undefined') return null

  const label = statusLabel(shownStatus, shownMuted, shownError, caption)

  return createPortal(
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={statusId}
      className={`fixed inset-0 z-[80] flex flex-col bg-black transition-opacity duration-300 ease-out ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      tabIndex={-1}
    >
      <div
        className={`flex min-h-0 flex-1 flex-col transition-transform duration-300 ease-out ${
          visible ? 'scale-100' : 'scale-[1.03]'
        }`}
      >
        <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
          <p id={titleId} className="text-sm font-medium tracking-wide text-white/80">
            ProcureX Voice
          </p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
            aria-label="Close voice conversation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6">
          <VoiceOrb state={shownStatus} cue={Boolean(cueName)} />
          <p
            id={statusId}
            className={`mt-8 max-w-sm text-center text-base ${
              shownStatus === 'error' ? 'text-red-300' : 'text-white/70'
            }`}
            aria-live="polite"
          >
            {label}
          </p>
          {caption?.trim() && shownStatus !== 'error' && (
            <p className="mt-4 max-w-lg text-center text-sm leading-relaxed text-white/85">
              {caption.trim()}
            </p>
          )}
          {shownStatus === 'error' && (
            <button
              type="button"
              onClick={onRetry}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-white/10 px-4 text-sm text-white hover:bg-white/15"
            >
              <RotateCcw className="h-4 w-4" />
              Retry
            </button>
          )}
        </div>

        <div className="flex items-center justify-center gap-8 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
          <button
            type="button"
            onClick={onMute}
            className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/15"
            aria-label={shownMuted ? 'Unmute microphone' : 'Mute microphone'}
            aria-pressed={shownMuted}
          >
            {shownMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
          </button>
          <button
            type="button"
            onClick={onEnd}
            className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[#ef4444] text-white hover:bg-[#dc2626]"
            aria-label="End voice conversation"
          >
            <PhoneOff className="h-7 w-7" />
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
