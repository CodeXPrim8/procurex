'use client'

import { useEffect, useState } from 'react'
import { Volume2 } from 'lucide-react'
import { previewTtsVoice } from '@/lib/speech'
import {
  PROCUREX_VOICES,
  getActiveTtsVoiceId,
  getTtsVoice,
  saveTtsVoice,
  type TtsVoiceId,
} from '@/lib/ttsVoices'
import { useStore } from '@/lib/store'
import { showToast } from '@/lib/toast'

const SAMPLE = 'Hello, I am ProcureX. This is the voice I will use when we talk.'

export default function VoiceSettings() {
  const user = useStore((state) => state.user)
  const [selected, setSelected] = useState<TtsVoiceId>(getActiveTtsVoiceId)
  const [saving, setSaving] = useState<TtsVoiceId | null>(null)
  const [previewing, setPreviewing] = useState<TtsVoiceId | null>(null)

  useEffect(() => {
    setSelected(getActiveTtsVoiceId())
  }, [user?.id, user?.tts_voice])

  const choose = async (id: TtsVoiceId) => {
    if (id === selected || saving) return
    const previous = selected
    setSelected(id)
    setSaving(id)
    try {
      const saved = await saveTtsVoice(id)
      setSelected(saved)
      showToast(`${getTtsVoice(saved).name} is now your ProcureX voice.`, 'success')
    } catch (error: any) {
      setSelected(previous)
      showToast(error?.message || 'Could not save that voice. Try again.', 'error')
    } finally {
      setSaving(null)
    }
  }

  const preview = async (id: TtsVoiceId) => {
    setPreviewing(id)
    try {
      await previewTtsVoice(id, SAMPLE)
    } catch {
      showToast('Could not play a preview for that voice.', 'error')
    } finally {
      setPreviewing(null)
    }
  }

  return (
    <section id="voice" className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-[#ececec]">ProcureX voice</h2>
        <p className="text-sm text-[#b4b4b4] mt-1">
          Choose how ProcureX sounds. This stays on your account until you pick another voice.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {PROCUREX_VOICES.map((voice) => {
          const active = selected === voice.id
          return (
            <div
              key={voice.id}
              className={`rounded-xl border p-4 text-left transition-colors ${
                active
                  ? 'border-primary-500 bg-primary-600/10'
                  : 'border-[#3d3d3d] bg-[#171717] hover:border-[#5a5a5a]'
              }`}
            >
              <button
                type="button"
                onClick={() => void choose(voice.id)}
                disabled={Boolean(saving)}
                className="w-full text-left focus:outline-none"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-[#ececec]">{voice.name}</p>
                    <p className="text-xs text-[#8e8e8e] mt-0.5">
                      {voice.gender} · {voice.description}
                    </p>
                  </div>
                  <span
                    className={`mt-0.5 h-4 w-4 rounded-full border ${
                      active ? 'border-primary-500 bg-primary-500' : 'border-[#6b6b6b]'
                    }`}
                    aria-hidden
                  />
                </div>
              </button>
              <button
                type="button"
                onClick={() => void preview(voice.id)}
                disabled={previewing === voice.id}
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-[#19C37D] hover:text-[#16A66F]"
              >
                <Volume2 className="w-3.5 h-3.5" />
                {previewing === voice.id ? 'Playing…' : 'Preview'}
              </button>
            </div>
          )
        })}
      </div>
    </section>
  )
}
