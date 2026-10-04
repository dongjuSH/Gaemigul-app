"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { Separator } from "@/components/ui/separator"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SEGMENT_LIST, SEGMENT_TRIGGER } from "@/lib/constant/surface"

const TIMELINE_PATH = "/timeline"
const BRIEFING_PATH = "/briefing"

interface PageTitleType {
  title: string
  description: string
  /** 제목 아래(구분선 위)에 붙는 페이지 전용 탭 등 */
  children?: React.ReactNode
  /** 시황/브리핑 탭 줄 오른쪽 끝에 놓을 요소 (탭이 보이는 페이지에서만 쓰인다) */
  tabsAside?: React.ReactNode
}

export default function PageTitle({
  title,
  description,
  children,
  tabsAside,
}: PageTitleType) {
  const pathname = usePathname()
  const showMarketTabs =
    pathname.startsWith(TIMELINE_PATH) || pathname.startsWith(BRIEFING_PATH)
  const activeTab = pathname.startsWith(BRIEFING_PATH) ? "briefing" : "timeline"

  return (
    <div className="text-l flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <div className="truncate text-lg leading-none font-bold sm:text-xl lg:text-2xl">
          {title}
        </div>
        <div className="text-muted-foreground">
          <p className="truncate text-[10px] sm:text-xs">{description}</p>
        </div>

        {showMarketTabs && (
          // 시황/브리핑 탭 오른쪽에 페이지 전용 요소(예: 날짜 선택)를 붙일 수 있다
          <div className="flex items-center justify-between gap-3">
            <Tabs value={activeTab} className="shrink-0">
              <TabsList className={SEGMENT_LIST}>
                <TabsTrigger
                  value="timeline"
                  render={<Link href={TIMELINE_PATH} />}
                  nativeButton={false}
                  className={SEGMENT_TRIGGER}
                >
                  시황
                </TabsTrigger>
                <TabsTrigger
                  value="briefing"
                  render={<Link href={BRIEFING_PATH} />}
                  nativeButton={false}
                  className={SEGMENT_TRIGGER}
                >
                  브리핑
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {tabsAside}
          </div>
        )}
        {children}
      </div>
      <Separator />
    </div>
  )
}
