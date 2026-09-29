'use client'

import { useEffect, useRef } from 'react'
import { getSpeechPlayback, subscribeSpeechPlayback } from '@/lib/speech'
import { approachMouth, mouthShapeForViseme, visemeFromSpokenText, type MouthShape } from '@/lib/lipSync'
import { buildFaceMesh, deformFace, resetFaceMesh, type FaceMesh } from '@/lib/voiceFaceMesh'

export type VoiceFaceMood = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'idle' | 'error'

type ProcureXVoiceFaceProps = {
  mood: VoiceFaceMood
  className?: string
}

const REST: MouthShape = mouthShapeForViseme('rest')

export default function ProcureXVoiceFace({ mood, className = '' }: ProcureXVoiceFaceProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const moodRef = useRef(mood)
  moodRef.current = mood

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) return

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const mobile = Math.min(window.innerWidth, window.innerHeight) < 720
    const density = mobile ? 0.72 : 1
    const mesh: FaceMesh = buildFaceMesh(density)

    let alive = true
    let raf = 0
    let lastT = performance.now()
    let blink = 0
    let blinkUntil = 0
    let nextBlink = performance.now() + 2200
    let yaw = 0
    let pitch = 0
    let shimmer = 0
    let mouth: MouthShape = { ...REST }
    let activeToken = getSpeechPlayback().token
    let speaking = false
    let spokenText = ''
    let charIndex = 0

    const unsub = subscribeSpeechPlayback((snap) => {
      if (snap.type === 'start') {
        activeToken = snap.token
        speaking = true
        spokenText = snap.text
        charIndex = 0
        return
      }
      if (snap.token !== activeToken) return
      if (snap.type === 'cancel' || snap.type === 'end') {
        speaking = false
        spokenText = ''
        charIndex = 0
        return
      }
      if (snap.type === 'boundary') {
        speaking = true
        spokenText = snap.text
        charIndex = snap.charIndex
      }
    })

    const resize = () => {
      const parent = canvas.parentElement
      const w = parent?.clientWidth || 360
      const h = parent?.clientHeight || 360
      const dpr = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2)
      canvas.width = Math.max(1, Math.floor(w * dpr))
      canvas.height = Math.max(1, Math.floor(h * dpr))
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
    }
    resize()
    const observer = new ResizeObserver(resize)
    if (canvas.parentElement) observer.observe(canvas.parentElement)

    const draw = (now: number) => {
      if (!alive) return
      const dt = Math.min(0.05, (now - lastT) / 1000)
      lastT = now
      const currentMood = moodRef.current
      const audioSpeaking = speaking && (currentMood !== 'error')
      const live = audioSpeaking && !window.speechSynthesis?.paused

      let target: MouthShape = REST
      if (live) {
        const viseme = visemeFromSpokenText(spokenText, charIndex)
        target = mouthShapeForViseme(viseme === 'rest' && spokenText ? 'mid' : viseme)
      }
      mouth = approachMouth(mouth, target, dt, live ? 14 : 8)

      if (!reduceMotion) {
        shimmer += dt
        yaw = Math.sin(now / 4200) * 0.045
        pitch = Math.sin(now / 5100) * 0.03
        if (now > nextBlink) {
          blinkUntil = now + 140
          nextBlink = now + 2800 + Math.random() * 2400
        }
        blink = now < blinkUntil ? Math.min(1, (blinkUntil - now) / 70, (now - (blinkUntil - 140)) / 70) : 0
      } else {
        yaw = 0
        pitch = 0
        blink = 0
      }

      resetFaceMesh(mesh)
      deformFace(mesh, mouth, blink, yaw, pitch)

      const { width, height } = canvas
      ctx.fillStyle = '#000000'
      ctx.fillRect(0, 0, width, height)

      const scale = Math.min(width, height) * 0.42
      const cx = width * 0.5
      const cy = height * 0.5 + scale * 0.04
      const project = (x: number, y: number, z: number) => {
        const p = 1 + z * 0.22
        return { x: cx + x * scale * p, y: cy - y * scale * p, s: p }
      }

      const glow =
        currentMood === 'thinking' ? 0.55 + Math.sin(shimmer * 3.2) * 0.2
          : currentMood === 'listening' ? 0.48
            : currentMood === 'connecting' ? 0.4 + Math.sin(shimmer * 2.2) * 0.12
              : currentMood === 'error' ? 0.28
                : live ? 0.62
                  : 0.42

      ctx.lineWidth = Math.max(0.6, scale * 0.004)
      const { verts, edges } = mesh
      for (let i = 0; i < edges.length; i += 1) {
        const a = verts[edges[i][0]]
        const b = verts[edges[i][1]]
        const pa = project(a.x, a.y, a.z)
        const pb = project(b.x, b.y, b.z)
        const purple = (a.hue + b.hue) * 0.5 > 0.4
        ctx.strokeStyle = purple
          ? `rgba(168, 85, 247, ${0.16 * glow})`
          : `rgba(34, 211, 238, ${0.18 * glow})`
        ctx.beginPath()
        ctx.moveTo(pa.x, pa.y)
        ctx.lineTo(pb.x, pb.y)
        ctx.stroke()
      }

      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < verts.length; i += 1) {
        const v = verts[i]
        const p = project(v.x, v.y, v.z)
        const twinkle = reduceMotion ? 1 : 0.72 + hashPulse(i, shimmer) * 0.28
        const r = Math.max(0.6, v.size * scale * 0.012 * p.s)
        const cyan = v.hue < 0.35
        ctx.fillStyle = cyan
          ? `rgba(56, 220, 255, ${0.55 * glow * twinkle})`
          : `rgba(125, 211, 252, ${0.42 * glow * twinkle})`
        ctx.beginPath()
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'

      raf = window.requestAnimationFrame(draw)
    }

    raf = window.requestAnimationFrame(draw)

    return () => {
      alive = false
      window.cancelAnimationFrame(raf)
      observer.disconnect()
      unsub()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      role="img"
      aria-label="ProcureX AI animated face"
    />
  )
}

function hashPulse(i: number, t: number) {
  return 0.5 + 0.5 * Math.sin(t * 3.1 + i * 0.47)
}
