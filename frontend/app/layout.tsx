import type { Metadata } from "next"
import "./globals.css"
import localFont from "next/font/local"
import Script from "next/script"
import { Suspense } from "react"
import GoogleAnalytics from "@/components/common/GoogleAnalytics"
import { ThemeProvider } from "@/components/theme-provider"
import { GA_MEASUREMENT_ID } from "@/lib/analytics"
import { cn } from "@/lib/utils"

import SidebarNav from "@/components/common/sidebar/SidebarNav"
import {
  AuthProvider,
  Footer,
  Header,
  MobileSidebarProvider,
  Sidebar,
} from "@/components/common"

const pretendard = localFont({
  src: "../public/fonts/pretendard/PretendardVariable.woff2",
  display: "swap",
  weight: "100 900",
  variable: "--font-pretendard",
})

export const metadata: Metadata = {
  title: "개미굴 | Gaemigul",
  description:
    "국내외 시세·뉴스·일정을 한 화면에서 확인하는 금융 뉴스 요약 및 시황 AI 인사이트 대시보드",
  icons: {
    icon: "/favicon.svg",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      // 가로 스크롤 방지: html은 hidden(iOS Safari는 body 값만으로는 막히지 않는다), body는 clip.
      // 둘 다 hidden이면 body가 스크롤 컨테이너가 되어 sticky(헤더 아래 고정 영역)가 모두 깨지므로 body는 clip으로 둔다
      className={cn(
        "overflow-x-hidden antialiased",
        pretendard.variable,
        "font-sans"
      )}
    >
      <body className="overflow-x-clip">
        {/* Google Analytics(GA4) - 측정 ID가 없으면(로컬 등) 아예 렌더링하지 않는다.
            초기화(config)는 lib/analytics.ts에서, 페이지뷰는 GoogleAnalytics 컴포넌트에서 보낸다 */}
        {GA_MEASUREMENT_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`}
              strategy="afterInteractive"
            />
            <Suspense fallback={null}>
              <GoogleAnalytics />
            </Suspense>
          </>
        )}
        <ThemeProvider>
          <AuthProvider>
            <MobileSidebarProvider>
              <Header />
              <div className="flex">
                <Sidebar />
                {/* 페이지 콘텐츠 여백은 (main)/layout.tsx 한 곳에서만 준다 - 여기와 각 페이지에는 넣지 않는다 */}
                <main className="w-full min-w-0">{children}</main>
              </div>
              <Footer />
              <SidebarNav />
            </MobileSidebarProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
