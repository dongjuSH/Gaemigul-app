import { LoaderCircle } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"

export default function HeatmapLoadingSkeleton() {
  return (
    <div
      className="relative overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800/40"
      role="status"
      aria-label="히트맵 불러오는 중"
    >
      <div className="mb-3 flex justify-between">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-7 w-36" />
      </div>
      <div className="grid h-[700px] grid-cols-3 gap-2" aria-hidden="true">
        {[0, 1, 2].map((column) => (
          <div
            key={column}
            className="grid gap-2"
            style={{ gridTemplateRows: `${3 - column}fr ${column + 1}fr 1fr` }}
          >
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="size-full rounded-md" />
            ))}
          </div>
        ))}
      </div>
      <div className="absolute top-1/2 right-4 left-4 flex justify-center">
        <span className="flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-4 py-2 text-xs text-neutral-500 shadow-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
          <LoaderCircle className="size-3.5 text-point motion-safe:animate-spin" />{" "}
          히트맵을 불러오고 있어요
        </span>
      </div>
    </div>
  )
}
