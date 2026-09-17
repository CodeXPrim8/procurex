type ProcureXLoaderProps = {
  size?: number
  label?: string
  className?: string
}

export default function ProcureXLoader({
  size = 48,
  label = 'Loading',
  className = '',
}: ProcureXLoaderProps) {
  return (
    <div
      className={`procurex-loader ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <img
        src="/procurex-icon.png"
        alt=""
        width={size}
        height={size}
        className="procurex-loader__mark"
        draggable={false}
      />
      <span className="procurex-loader__status">{label}</span>
    </div>
  )
}
