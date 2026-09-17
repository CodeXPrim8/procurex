import ProcureXLoader from '@/components/ProcureXLoader'

export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center py-12">
      <ProcureXLoader size={56} label="Loading page" />
    </div>
  )
}
