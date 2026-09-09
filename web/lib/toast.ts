import { ToastType } from '@/components/ui/Toast'

let toastId = 0
const listeners: Array<(toasts: Toast[]) => void> = []
const toasts: Toast[] = []

export interface Toast {
  id: string
  message: string
  type: ToastType
}

export function showToast(message: string, type: ToastType = 'info') {
  const id = `toast-${toastId++}`
  const toast = { id, message, type }
  toasts.push(toast)
  listeners.forEach((listener) => listener([...toasts]))
  
  setTimeout(() => {
    removeToast(id)
  }, 5000)
}

export function removeToast(id: string) {
  const index = toasts.findIndex((t) => t.id === id)
  if (index > -1) {
    toasts.splice(index, 1)
    listeners.forEach((listener) => listener([...toasts]))
  }
}

export function subscribe(listener: (toasts: Toast[]) => void) {
  listeners.push(listener)
  return () => {
    const index = listeners.indexOf(listener)
    if (index > -1) {
      listeners.splice(index, 1)
    }
  }
}

export function getToasts() {
  return [...toasts]
}


