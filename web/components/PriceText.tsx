'use client'

import { useEffect, useState } from 'react'
import { formatPrice } from '@/lib/currency'

export default function PriceText({
  amount,
  className,
}: {
  amount: number
  className?: string
}) {
  const [text, setText] = useState('')

  useEffect(() => {
    let live = true
    void formatPrice(Number(amount) || 0).then((value) => {
      if (live) setText(value)
    })
    return () => {
      live = false
    }
  }, [amount])

  return <span className={className}>{text || '…'}</span>
}
