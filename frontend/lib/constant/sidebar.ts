import { BookOpen, Calendar, Lollipop, Timeline, Home } from "lucide-react"

import type { SidebarNavItem } from "@/lib/types/SidebarType"

export const sidebarNavItems: SidebarNavItem[] = [
  {
    href: "/",
    label: "한눈에 보는 개미굴",
    icon: Home,
  },
  {
    href: "/timeline",
    label: "실시간 시황&브리핑",
    icon: Timeline,
  },
  {
    href: "/calendar",
    label: "이벤트 일정 캘린더",
    icon: Calendar,
  },
  {
    href: "/heatmap",
    label: "주가 섹터별 히트맵",
    icon: Lollipop,
  },
  {
    href: "/glossary",
    label: "주식&경제 용어",
    icon: BookOpen,
  },
]

/** 데스크톱에서 좌측 사이드바를 숨기는 페이지 - 인증 폼·약관처럼 본문만 가운데 보여주는 화면.
 * 모바일 메뉴(햄버거)는 그대로 쓸 수 있어야 하므로 데스크톱(md 이상)에서만 숨긴다 */
export const SIDEBAR_HIDDEN_PATHS = [
  "/login",
  "/signup",
  "/find-id",
  "/find-password",
  "/privacy-policy",
  "/terms",
  "/newsletter-consent",
  "/data-sources",
]
