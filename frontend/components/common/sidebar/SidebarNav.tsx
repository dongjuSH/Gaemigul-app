"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "cn"

import { sidebarNavItems } from "@/lib/constant/sidebar"

// 브리핑 페이지는 실시간 페로몬(타임라인)의 하위 화면이라 같은 항목을 active 처리한다.
const TIMELINE_PATH = "/timeline"
const BRIEFING_PATH = "/briefing"

export default function SidebarNav() {
  const pathname = usePathname()

  return (
    // PC 전용 하단 플로팅 메뉴. 모바일은 햄버거 메뉴 안의 목록(SidebarMobileNav)을 쓴다
    <nav className="fixed bottom-5 left-[50%] z-20 hidden translate-x-[-50%] rounded-full md:block border border-neutral-200/50 bg-card p-2 shadow-2xl dark:border-neutral-700">
      <ul className="flex gap-2">
        {sidebarNavItems.map(
          ({ href, label, icon: Icon }) => {
            const isActive =
              pathname === href ||
              pathname.startsWith(`${href}/`) ||
              (href === TIMELINE_PATH && pathname.startsWith(BRIEFING_PATH))

            return (
              <li key={href} className="flex items-center justify-between">
                <Link
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group flex w-full items-center justify-between rounded-lg p-2 transition-colors duration-200",
                    isActive ? "bg-point" : "hover:bg-point/10"
                  )}
                >
                  <span
                    className={cn(
                      "relative flex items-center gap-2 transition-colors duration-200",
                      isActive
                        ? "text-white"
                        : "text-foreground group-hover:text-point"
                    )}
                  >
                    <Icon size="16" />
                    {/* 호버(키보드는 포커스) 시 메뉴 위로 "통" 튀어나오는 라벨 툴팁.
                        아래쪽을 기준점으로 작게 접혀 있다가, 살짝 넘쳤다 돌아오는(overshoot) 곡선으로 커지며 올라온다.
                        활성 메뉴는 글자가 흰색이라 색을 직접 지정한다(다크 모드 포함) */}
                    <span
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full left-1/2 mb-6 w-max origin-bottom -translate-x-1/2 translate-y-2 scale-50 rounded-full border border-border bg-popover px-2.5 py-1 text-[13px] font-medium whitespace-nowrap text-popover-foreground opacity-0 shadow-md transition-[opacity,scale,translate] duration-300 ease-bounce group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:scale-100 group-focus-visible:opacity-100"
                    >
                      {label}
                    </span>
                  </span>
                </Link>
              </li>
            )
          }
        )}
      </ul>
    </nav>
  )
}

/** 모바일 전용 메뉴 목록 - 햄버거 메뉴(Sidebar 모바일 패널) 안에 세로로 들어간다. PC(md 이상)에서는 렌더링되지만 숨겨진다 */
export function SidebarMobileNav() {
  const pathname = usePathname()

  return (
    <nav aria-label="메뉴" className="px-2.5 py-3 md:hidden">
      <ul className="flex flex-col gap-1">
        {sidebarNavItems.map(({ href, label, icon: Icon }) => {
          const isActive =
            pathname === href ||
            pathname.startsWith(`${href}/`) ||
            (href === TIMELINE_PATH && pathname.startsWith(BRIEFING_PATH))

          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-[14px] transition-colors duration-200",
                  isActive
                    ? "bg-point text-white"
                    : "text-foreground hover:bg-point/10 hover:text-point"
                )}
              >
                <Icon size={16} />
                {label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
