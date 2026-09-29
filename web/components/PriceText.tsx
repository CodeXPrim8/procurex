'use client'

import { useEffect, useState } from 'react'
import { formatPrice } from '@/lib/currency'

export const CONTACT_FOR_PRICE_LABEL = 'Contact for price'

export default function PriceText({
  amount,
  className,
  contact = false,
}: {
  amount: number | null | undefined
  className?: string
  contact?: boolean
}) {
  const [text, setText] = useState('')

  useEffect(() => {
    if (contact) return
    let live = true
    void formatPrice(Number(amount) || 0).then((value) => {
      if (live) setText(value)
    })
    return () => {
      live = false
    }
  }, [amount, contact])

  if (contact) return <span className={className}>{CONTACT_FOR_PRICE_LABEL}</span>
  return <span className={className}>{text || '…'}</span>
}
