'use client'

import { useEffect, useRef } from 'react'
import { readMicEnergy, readSpeechEnergy } from '@/lib/speechPlayback'
import styles from './VoiceOrb.module.css'

export type VoiceOrbState = 'connecting' | 'listening' | 'thinking' | 'speaking' | 'error'

export default function VoiceOrb({ state, cue = false }: { state: VoiceOrbState; cue?: boolean }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const energyRef = useRef(0)
  const stateRef = useRef(state)
  const cueRef = useRef(cue)
  stateRef.current = state
  cueRef.current = cue

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let frame = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = Math.min(0.048, Math.max(0.008, (now - last) / 1000))
      last = now
      const mode = stateRef.current
      const speaking = mode === 'speaking'
      const listening = mode === 'listening' || mode === 'thinking'
      const target = Math.max(speaking ? readSpeechEnergy() : 0, listening ? readMicEnergy() * (speaking ? 0.7 : 1) : 0)
      const current = energyRef.current
      const rate = target > current ? 18 : 7.5
      const next = current + (target - current) * (1 - Math.exp(-rate * dt))
      energyRef.current = next
      const energy = reduceMotion ? next * 0.22 : next
      stageRef.current?.style.setProperty('--px-energy', energy.toFixed(4))
      stageRef.current?.setAttribute('data-cue', cueRef.current ? 'true' : 'false')
      frame = window.requestAnimationFrame(tick)
    }

    frame = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(frame)
  }, [])

  return (
    <div ref={stageRef} className={styles.stage} data-state={state} data-cue={cue ? 'true' : 'false'} aria-hidden="true">
      <div className={styles.audio}>
        <div className={styles.halo} />
        <div className={styles.ambient}>
          <span className={styles.orb}>
            <span className={styles.atmosphere} />
            <span className={styles.clouds}>
              <span className={`${styles.cloud} ${styles.cloudOne}`} />
              <span className={`${styles.cloud} ${styles.cloudTwo}`} />
            </span>
            <span className={styles.core} />
            <span className={styles.coreBoost} />
            <span className={styles.highlight} />
            <span className={styles.vignette} />
          </span>
        </div>
      </div>
    </div>
  )
}
