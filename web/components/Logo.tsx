type LogoProps = {
  variant?: 'wordmark' | 'mark'
  className?: string
}

export default function Logo({ variant = 'wordmark', className = 'h-7' }: LogoProps) {
  const src = variant === 'mark' ? '/images/procurex-mark.png' : '/images/procurex-logo.png'
  return (
    <img
      src={src}
      alt="ProcureX"
      className={`w-auto object-contain select-none ${className}`}
    />
  )
}
