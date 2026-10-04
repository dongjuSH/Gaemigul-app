"use client"

import Link from "next/link"
import Image from "next/image"
import { useCallback, useEffect, useRef, useState } from "react"
import { useTheme } from "next-themes"
import { Badge, Button, Skeleton } from "@/components/ui"

import DarkLogo from "@/public/images/dark-logo.svg"
import Logo from "@/public/images/logo.svg"

import Marquee from "../marquee/marquee"
import {
  Info,
  LogIn,
  LogOut,
  Menu,
  Moon,
  RotateCcwClock,
  Sun,
  User,
  UserPlus,
} from "lucide-react"

import {
  useIndicatorCountdown,
  useIndicatorSchedule,
} from "@/hooks/use-indicator-schedule"
import {
  getTimelineIndicators,
  type MarketIndicatorItem,
} from "@/lib/api/indicator"
import { useAuth } from "./auth/AuthContext"
import { useMobileSidebar } from "./sidebar"

/** 라이트/다크 토글. next-themes는 서버에는 실제 테마를 모르니, 마운트 전엔 자리만 차지해서
 * SSR과 클라이언트 렌더링이 어긋나는 걸(hydration mismatch) 막는다 */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return <div className="size-8 shrink-0" />

  const isDark = resolvedTheme === "dark"

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-muted dark:text-neutral-400"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  )
}

/** 프로필 이미지가 아직 없어서(업로드 기능 없음) 닉네임 첫 글자로 기본 아바타를 대신한다 */
function ProfileAvatar({ nickname }: { nickname: string }) {
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-point/10 text-xs font-bold text-point">
      {nickname.slice(0, 1)}
    </span>
  )
}

/** 로그인 버튼 <-> [프로필 아바타] [닉네임님] [등급 배지]. status가 loading인 동안은
 * 깜빡임 방지용으로 빈 자리만 차지 */
export function HeaderAuthAction() {
  const { user, status } = useAuth()

  if (status === "loading") return <div className="size-8 shrink-0" />

  if (!user) {
    return (
      <Link href="/login" className="shrink-0">
        <Button variant="secondary" className="h-10 text-xs">
          로그인
        </Button>
      </Link>
    )
  }

  return (
    <Link href="/mypage" className="flex shrink-0 items-center gap-2">
      <ProfileAvatar nickname={user.nickname} />
      <span className="hidden text-sm font-medium sm:inline">
        {user.nickname}님
      </span>
      <Badge className="bg-point3 text-[11px] text-point2">{user.grade}</Badge>
    </Link>
  )
}

const PROFILE_MENU_ITEM =
  "flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-muted disabled:cursor-default disabled:opacity-50"

/** 호버(키보드는 focus-visible)하면 trigger 아래 오른쪽 정렬로 메뉴가 열린다.
 * 메뉴와 trigger 사이 간격은 pt로 둬서, 마우스가 그 틈을 지나도 호버가 끊기지 않게 한다 */
function HeaderHoverMenu({
  trigger,
  children,
}: {
  trigger: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="group relative shrink-0">
      {trigger}
      {/* 오른쪽 위 모서리(프로필 쪽)를 기준점으로 접혀 있다가 통통 튀며 펼쳐진다 */}
      <div className="invisible absolute top-full right-0 z-40 origin-top-right -translate-y-1 scale-90 pt-2 opacity-0 transition-[opacity,scale,translate,visibility] duration-300 ease-bounce group-hover:visible group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-has-[:focus-visible]:visible group-has-[:focus-visible]:translate-y-0 group-has-[:focus-visible]:scale-100 group-has-[:focus-visible]:opacity-100">
        <div
          role="menu"
          className="flex w-40 flex-col rounded-lg border border-border bg-popover p-1 shadow-lg"
        >
          {children}
        </div>
      </div>
    </div>
  )
}

/** 데스크톱 헤더 프로필 영역.
 * - 로딩 중: 아바타·닉네임 자리 스켈레톤
 * - 비로그인: [테마 토글] [유저 아이콘] - 유저 아이콘에 호버하면 로그인 / 회원가입 메뉴
 * - 로그인: [아바타] [닉네임님] - 호버하면 마이페이지 / 테마 변경 / 로그아웃 메뉴 */
function HeaderProfileMenu() {
  const { user, status, logout } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const [loggingOut, setLoggingOut] = useState(false)

  if (status === "loading") {
    return (
      <div className="flex shrink-0 items-center gap-2" aria-hidden="true">
        <Skeleton className="size-8 rounded-full" />
        <Skeleton className="h-4 w-16" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex shrink-0 items-center gap-1">
        <ThemeToggle />
        <HeaderHoverMenu
          trigger={
            <button
              type="button"
              aria-haspopup="menu"
              aria-label="로그인 메뉴"
              className="flex size-8 cursor-pointer items-center justify-center rounded-full text-neutral-500 hover:bg-muted dark:text-neutral-400"
            >
              <User size={18} />
            </button>
          }
        >
          <Link href="/login" role="menuitem" className={PROFILE_MENU_ITEM}>
            <LogIn size={15} />
            로그인
          </Link>
          <Link href="/signup" role="menuitem" className={PROFILE_MENU_ITEM}>
            <UserPlus size={15} />
            회원가입
          </Link>
        </HeaderHoverMenu>
      </div>
    )
  }

  const isDark = resolvedTheme === "dark"

  // 마이페이지에는 "비로그인이 되면 /login으로 보내는" 가드가 있어 클라이언트 이동은 그쪽과 경합한다.
  // 로그아웃 후에는 전체 페이지 이동으로 홈에 보내서 어느 페이지에서 눌러도 결과가 같게 한다
  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await logout()
      window.location.assign("/")
    } catch (error) {
      console.error("[logout] 실패", error)
      setLoggingOut(false)
    }
  }

  return (
    <HeaderHoverMenu
      trigger={
        <Link
          href="/mypage"
          aria-haspopup="menu"
          className="flex items-center gap-2"
        >
          <ProfileAvatar nickname={user.nickname} />
          <span className="text-sm font-medium">{user.nickname}님</span>
        </Link>
      }
    >
      <Link href="/mypage" role="menuitem" className={PROFILE_MENU_ITEM}>
        <User size={15} />
        마이페이지
      </Link>
      <button
        type="button"
        role="menuitem"
        onClick={() => setTheme(isDark ? "light" : "dark")}
        aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
        className={PROFILE_MENU_ITEM}
      >
        {isDark ? <Sun size={15} /> : <Moon size={15} />}
        테마 변경
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={handleLogout}
        disabled={loggingOut}
        className={PROFILE_MENU_ITEM}
      >
        <LogOut size={15} />
        {loggingOut ? "로그아웃 중..." : "로그아웃"}
      </button>
    </HeaderHoverMenu>
  )
}

/** 다음 지수 갱신까지 남은 시간. 매초 바뀌므로 이 텍스트만 따로 리렌더링되게 분리했다
 * (헤더 전체와 지수 티커가 매초 다시 그려지지 않도록) */
function IndicatorCountdown() {
  return <>{useIndicatorCountdown()}</>
}

export default function Header() {
  const { toggle } = useMobileSidebar()
  const [indicators, setIndicators] = useState<MarketIndicatorItem[]>([])

  // 지수 티커는 데스크톱/모바일용으로 두 번 그려지지만 데이터는 여기서 한 번만 불러온다.
  const fetchIndicators = useCallback(() => {
    getTimelineIndicators()
      .then((data) => setIndicators(data.items))
      .catch((error: unknown) => {
        console.error("[getTimelineIndicators] 실패", error)
      })
  }, [])

  // 최초 진입 시 1회, 이후 정시 기준 15분 경계마다 다시 불러온다
  useEffect(() => {
    fetchIndicators()
  }, [fetchIndicators])

  useIndicatorSchedule(fetchIndicators)
  const headerRef = useRef<HTMLElement>(null)
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  // 마운트 전(SSR)엔 항상 라이트 로고로 렌더링해 하이드레이션 불일치를 피한다
  const logoSrc = mounted && resolvedTheme === "dark" ? DarkLogo : Logo

  useEffect(() => {
    const node = headerRef.current
    if (!node) return

    const updateHeaderHeight = () => {
      document.documentElement.style.setProperty(
        "--header-height",
        `${node.offsetHeight}px`
      )
    }

    updateHeaderHeight()
    const observer = new ResizeObserver(updateHeaderHeight)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <header ref={headerRef} className="sticky top-0 z-30 w-full bg-background">
      {/* 데스크톱 헤더 (기존 그대로) */}
      <div className="hidden w-full md:flex">
        <div className="flex min-w-67.5 items-end justify-between px-5 py-2 pr-1 pb-5">
          <Link href={"/"}>
            <Image src={logoSrc} alt="개미굴 로고" width="150"></Image>
          </Link>
          {/* INDEX에 호버(키보드는 포커스)하면 갱신 주기 안내 툴팁을 띄운다 */}
          <div
            tabIndex={0}
            aria-describedby="header-index-tooltip"
            className="group relative flex cursor-help gap-0.5 rounded-sm pt-1.5 outline-offset-2 focus-visible:outline-point"
          >
            <strong className="-mb-1.25 flex items-center gap-0 text-[14px] text-point">
              <RotateCcwClock width={13.5} />
              <span className="min-w-10 text-right">
                <IndicatorCountdown />
              </span>
            </strong>
            <p
              id="header-index-tooltip"
              role="tooltip"
              className="pointer-events-none invisible absolute top-full left-1/2 z-40 mt-2 flex w-max origin-top -translate-x-1/2 -translate-y-1 scale-90 items-center gap-1 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-[11px] text-popover-foreground opacity-0 shadow-lg transition-[opacity,scale,translate,visibility] duration-300 ease-bounce group-hover:visible group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 group-focus-visible:visible group-focus-visible:translate-y-0 group-focus-visible:scale-100 group-focus-visible:opacity-100"
            >
              <Info size={11} className="text-muted-foreground" />
              지수 데이터는 정시 기준 15분마다 갱신됩니다.
            </p>
          </div>
        </div>
        <Marquee items={indicators} />
        <div className="flex shrink-0 items-center gap-2 px-5">
          <HeaderProfileMenu />
        </div>
      </div>

      {/* 모바일 헤더: 좌측 로고 / 우측 TIMER + 햄버거 메뉴, 같은 높이로 정렬 */}
      <div className="flex w-full items-center justify-between px-4 pt-4 pb-3 md:hidden">
        <Link href={"/"} className="flex items-center">
          <Image src={logoSrc} alt="개미굴 로고" className="h-7 w-auto" />
        </Link>
        <div className="flex items-center gap-3">
          {/* <strong className="flex items-center gap-1 text-[16px] text-point">
            <Badge className="bg-point text-[12px] text-white">TIMER</Badge>
            <IndicatorCountdown />
          </strong> */}
          <strong className="flex items-center gap-0 text-[16px] text-point">
            <RotateCcwClock width={16} />
            <span className="min-w-10 text-right">
              <IndicatorCountdown />
            </span>
          </strong>
          <button
            type="button"
            onClick={toggle}
            aria-label="메뉴 열기"
            className="p-1 text-neutral-500 dark:text-neutral-400"
          >
            <Menu size={24} />
          </button>
        </div>
      </div>

      {/* 모바일: 헤더 아래 지수 데이터 티커 */}
      <div className="w-full md:hidden">
        <Marquee items={indicators} />
      </div>
    </header>
  )
}
