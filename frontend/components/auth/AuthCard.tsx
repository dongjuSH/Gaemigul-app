import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { Separator } from "@/components/ui"
import { SECTION_CARD } from "@/lib/constant/surface"
import { cn } from "@/lib/utils"

/**
 * 인증 관련 페이지(로그인/회원가입/아이디·비밀번호 찾기 등) 공용 레이아웃.
 * 사이드바 없이 인증 폼만 돋보이도록, 화면 가운데에 좁은 카드 하나(제목·설명 포함)로 보여준다.
 * 카드 폭은 maxWidthClassName으로 조절한다.
 */
export function AuthCard({
  title,
  description,
  icon: Icon,
  children,
  maxWidthClassName = "max-w-md",
}: {
  title: string
  description?: string
  icon?: LucideIcon
  children: ReactNode
  maxWidthClassName?: string
}) {
  return (
    <div className="flex min-h-[calc(100svh-var(--header-height,75px)-3rem)] items-center justify-center">
      <section
        className={cn(SECTION_CARD, "flex w-full flex-col gap-6 sm:p-8", maxWidthClassName)}
      >
        <div className="flex flex-col items-center gap-2 text-center">
          {Icon && (
            <span className="flex size-11 items-center justify-center rounded-full bg-point/10">
              <Icon className="text-point" size={22} />
            </span>
          )}
          <h1 className="text-xl font-bold sm:text-2xl">{title}</h1>
          {description && (
            <p className="text-xs text-muted-foreground sm:text-sm">
              {description}
            </p>
          )}
        </div>
        <Separator />
        <div className="w-full">{children}</div>
      </section>
    </div>
  )
}
