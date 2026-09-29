let audioCtx: AudioContext | null = null
let analyser: AnalyserNode | null = null
let outputGain: GainNode | null = null
let mediaSource: MediaElementAudioSourceNode | null = null
let audioEl: HTMLAudioElement | null = null
let bufferSource: AudioBufferSourceNode | null = null
let bufferPlaying = false
let playbackGen = 0
const timeDomain = new Uint8Array(1024)

function getAudioContext() {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return null
    audioCtx = new Ctx()
    analyser = audioCtx.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.62
    outputGain = audioCtx.createGain()
    outputGain.gain.value = 1
    analyser.connect(outputGain)
    outputGain.connect(audioCtx.destination)
  }
  return audioCtx
}

function getAudioElement() {
  const ctx = getAudioContext()
  if (!ctx || !analyser) return null
  if (!audioEl) {
    audioEl = new Audio()
    audioEl.preload = 'auto'
    audioEl.setAttribute('playsinline', 'true')
    audioEl.crossOrigin = 'anonymous'
    mediaSource = ctx.createMediaElementSource(audioEl)
    mediaSource.connect(analyser)
  }
  return audioEl
}

function stopBufferSource() {
  bufferPlaying = false
  if (!bufferSource) return
  try {
    bufferSource.onended = null
    bufferSource.stop()
  } catch {
    // ignore
  }
  try {
    bufferSource.disconnect()
  } catch {
    // ignore
  }
  bufferSource = null
}

export function unlockSpeechAudio() {
  const ctx = getAudioContext()
  if (ctx?.state === 'suspended') void ctx.resume()
}

export async function resumeSpeechAudio() {
  const ctx = getAudioContext()
  if (ctx?.state === 'suspended') await ctx.resume()
}

export function stopPlaybackAudio() {
  playbackGen += 1
  stopBufferSource()
  if (!audioEl) return
  try {
    audioEl.onended = null
    audioEl.onerror = null
    audioEl.pause()
    audioEl.removeAttribute('src')
    audioEl.load()
  } catch {
    // ignore
  }
}

export function isPlaybackAudioActive() {
  return bufferPlaying || Boolean(audioEl && !audioEl.paused && !audioEl.ended)
}

export function readSpeechEnergy() {
  if (!analyser) return 0
  if (!isPlaybackAudioActive()) return 0
  analyser.getByteTimeDomainData(timeDomain)
  let sum = 0
  for (let i = 0; i < timeDomain.length; i += 1) {
    const n = (timeDomain[i] - 128) / 128
    sum += n * n
  }
  const rms = Math.sqrt(sum / timeDomain.length)
  const normalized = (rms - 0.018) / 0.22
  return Math.min(1, Math.max(0, normalized))
}

function waitForElementEnd(el: HTMLAudioElement, gen: number) {
  return new Promise<boolean>((resolve) => {
    const finish = (ok: boolean) => {
      el.onended = null
      el.onerror = null
      window.clearTimeout(timer)
      resolve(ok && gen === playbackGen)
    }
    const timer = window.setTimeout(() => finish(true), 20000)
    el.onended = () => finish(true)
    el.onerror = () => finish(false)
  })
}

export async function playSpeechBuffer(
  data: ArrayBuffer,
  mime: string,
  onEnd?: () => void,
  waitUntilEnd = false
): Promise<boolean> {
  const ctx = getAudioContext()
  if (!ctx || !analyser) return false
  unlockSpeechAudio()
  if (ctx.state === 'suspended') await ctx.resume()
  const gen = ++playbackGen
  stopBufferSource()

  try {
    const decoded = await ctx.decodeAudioData(data.slice(0))
    if (gen !== playbackGen) {
      onEnd?.()
      return false
    }
    const source = ctx.createBufferSource()
    source.buffer = decoded
    source.connect(analyser)
    bufferSource = source
    bufferPlaying = true
    const finished = new Promise<boolean>((resolve) => {
      source.onended = () => {
        if (bufferSource === source) {
          bufferSource = null
          bufferPlaying = false
        }
        if (gen === playbackGen) onEnd?.()
        resolve(gen === playbackGen)
      }
    })
    source.start()
    if (waitUntilEnd) return await finished
    return true
  } catch {
    // Some browsers won't decode MPEG in AudioContext; use an audio element.
  }

  const el = getAudioElement()
  if (!el) {
    onEnd?.()
    return false
  }
  const blob = new Blob([data], { type: mime || 'audio/mpeg' })
  const url = URL.createObjectURL(blob)
  const finish = (ok: boolean) => {
    URL.revokeObjectURL(url)
    if (gen === playbackGen) onEnd?.()
    return ok && gen === playbackGen
  }
  el.src = url
  try {
    await el.play()
    if (gen !== playbackGen) {
      el.pause()
      return finish(false)
    }
    if (waitUntilEnd) return finish(await waitForElementEnd(el, gen))
    el.onended = () => finish(true)
    el.onerror = () => finish(false)
    return true
  } catch {
    return finish(false)
  }
}

export async function playSpeechUrl(url: string, waitUntilEnd = false): Promise<boolean> {
  const ctx = getAudioContext()
  if (!ctx) return false
  unlockSpeechAudio()
  if (ctx.state === 'suspended') await ctx.resume()
  const gen = playbackGen
  try {
    const response = await fetch(url)
    if (!response.ok || gen !== playbackGen) return false
    const data = await response.arrayBuffer()
    if (data.byteLength < 1000 || gen !== playbackGen) return false
    return await playSpeechBuffer(data, 'audio/mpeg', undefined, waitUntilEnd)
  } catch {
    return false
  }
}

let micEnergy = 0
let cueSource: AudioBufferSourceNode | null = null
let cuePlaying = false
let echoGuardUntil = 0
const cueCache = new Map<string, ArrayBuffer>()

export function setMicEnergyLevel(value: number) {
  micEnergy = Math.min(1, Math.max(0, value))
}

export function readMicEnergy() {
  return micEnergy
}

export function isVoiceCuePlaying() {
  return cuePlaying
}

export function echoGuardActive() {
  return cuePlaying || Date.now() < echoGuardUntil
}

export function markEchoGuard(ms = 700) {
  echoGuardUntil = Math.max(echoGuardUntil, Date.now() + ms)
}

export function stopVoiceCues() {
  stopCueSource()
}

function stopCueSource() {
  cuePlaying = false
  if (!cueSource) return
  try {
    cueSource.onended = null
    cueSource.stop()
  } catch {
    // ignore
  }
  try {
    cueSource.disconnect()
  } catch {
    // ignore
  }
  cueSource = null
}

export async function playVoiceCue(url: string, volume = 0.58): Promise<boolean> {
  if (isPlaybackAudioActive()) return false
  const ctx = getAudioContext()
  if (!ctx || !analyser) return false
  unlockSpeechAudio()
  if (ctx.state === 'suspended') await ctx.resume()
  try {
    let data = cueCache.get(url)
    if (!data) {
      const response = await fetch(url)
      if (!response.ok) return false
      data = await response.arrayBuffer()
      if (data.byteLength < 400) return false
      cueCache.set(url, data)
    }
    const decoded = await ctx.decodeAudioData(data.slice(0))
    stopCueSource()
    const source = ctx.createBufferSource()
    const gain = ctx.createGain()
    gain.gain.value = volume
    source.buffer = decoded
    source.connect(gain)
    gain.connect(analyser)
    cueSource = source
    cuePlaying = true
    markEchoGuard(Math.min(1600, decoded.duration * 1000 + 280))
    source.onended = () => {
      if (cueSource === source) {
        cueSource = null
        cuePlaying = false
      }
    }
    source.start()
    return true
  } catch {
    stopCueSource()
    return false
  }
}

export function speechPlaybackSupported() {
  return typeof window !== 'undefined' && Boolean(window.AudioContext || (window as any).webkitAudioContext)
}
