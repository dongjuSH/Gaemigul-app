"use client"

import {
  Header,
  Footer,
  ScrollTopButton,
  Sidebar,
  WhisperChat,
} from "@/components/common"
import ReportSidebar from "@/components/home/reportSidebar/ReportSidebar"
import { usePathname } from "next/navigation"
import { useState } from "react"

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const pathname = usePathname()
  const activeTargets = ["/briefing", "/timeline"]
  const isMatch = activeTargets.some((target) => pathname.includes(target))
  // 시황·브리핑 우측 리포트 사이드바.
  // - 브리핑 페이지로 들어오면(첫 진입이든 이동이든) 자동으로 연다
  // - 그 외(시황 등)로 처음 들어오면 닫힌 상태로 시작한다
  // - 열린 채로 시황으로 옮겨도 닫지 않는다 - 레이아웃이 계속 마운트돼 있어 마지막 상태가 유지된다
  const isBriefing = pathname.startsWith("/briefing")
  const [reportSidebarOpen, setReportSidebarOpen] = useState(isBriefing)
  const [prevIsBriefing, setPrevIsBriefing] = useState(isBriefing)
  if (isBriefing !== prevIsBriefing) {
    setPrevIsBriefing(isBriefing)
    if (isBriefing) setReportSidebarOpen(true)
  }

  return (
    <>
      <div className="flex w-full">
        {/* 모든 페이지 공통 콘텐츠 여백: 모바일 좌우 16px·위아래 24px, 데스크톱 사방 24px.
            페이지마다 따로 padding을 주지 말고 여기 값만 바꾼다 */}
        <main
          // 시황·브리핑은 우측 사이드바(열림 270px / 닫힘 40px)를 뺀 나머지 폭을 모두 쓴다
          className={`min-w-0 px-4 py-6 md:p-6 ${isMatch ? "w-full flex-1" : "mx-auto w-full 2xl:max-w-7xl"}`}
        >
          {children}
        </main>
        <ReportSidebar
          open={reportSidebarOpen}
          onOpenChange={setReportSidebarOpen}
        />
      </div>
      <WhisperChat />
      <ScrollTopButton />
    </>
  )
}
