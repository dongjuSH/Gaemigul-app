import Link from "next/link"
import { Footprints, Home, Map } from "lucide-react"

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex items-center gap-2 text-[15px] font-medium text-neutral-400">
        <Footprints size="18" />
        길을 잃었어요
      </span>

      <strong className="text-[96px] leading-none font-extrabold tracking-tight text-point">
        404
      </strong>

      <div className="flex flex-col gap-2">
        <h1 className="text-[22px] font-bold">이 굴은 없는 길이에요!</h1>
        <p className="text-[14px] text-neutral-500">
          찾으시는 페이지가 없거나, 다른 부지런한 개미들이 개척한 안전한
          경로로 이동해 보세요.
        </p>
      </div>

      <div className="mt-4 flex items-center gap-2.5">
        <Link
          href="/"
          className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-point px-4 py-2.5 text-[14px] font-semibold text-white transition-colors duration-200 hover:bg-point/90"
        >
          <Home size="16" />
          홈으로 돌아가기
        </Link>
        <Link
          href="/hitmap"
          className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-neutral-200 px-4 py-2.5 text-[14px] font-semibold text-neutral-700 transition-colors duration-200 hover:bg-neutral-100"
        >
          <Map size="16" />
          단물 지도 보기
        </Link>
      </div>
    </div>
  )
}
