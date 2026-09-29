import ProcureXLoader from '@/components/ProcureXLoader'

export default function Loading() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#212121]">
      <ProcureXLoader size={128} label="Loading page" />
    </div>
  )
}
