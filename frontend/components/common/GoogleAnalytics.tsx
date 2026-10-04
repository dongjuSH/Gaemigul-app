"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useRef } from "react"

import { trackPageView } from "@/lib/analytics"

/**
 * App Router 클라이언트 이동은 GA가 자동으로 페이지뷰를 잡지 못하므로, 경로(쿼리 포함)가 바뀔 때마다
 * 직접 page_view를 보낸다. 첫 진입 페이지뷰도 여기서 보낸다(config의 자동 전송은 꺼둠).
 * useSearchParams를 쓰므로 레이아웃에서 Suspense로 감싸서 마운트한다.
 */
export default function GoogleAnalytics() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  // 같은 URL을 두 번 보내지 않는다(개발 모드 StrictMode의 effect 2회 실행 등)
  const lastTrackedRef = useRef<string | null>(null)

  useEffect(() => {
    const query = searchParams.toString()
    const pagePath = query ? `${pathname}?${query}` : pathname
    if (lastTrackedRef.current === pagePath) return
    lastTrackedRef.current = pagePath
    trackPageView(pagePath)
  }, [pathname, searchParams])

  return null
}
