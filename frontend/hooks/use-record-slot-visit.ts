import { useEffect, useRef, type RefObject } from "react"

import { recordSlotVisit } from "@/lib/api/attendance"

/**
 * 슬롯 섹션이 화면에 30% 이상 보이는 순간 방문을 1회 기록한다("굴 파기 기록" 카운트,
 * 요구사항 문서 4번). 유효 시간대 판정은 서버가 하므로 여기서는 그냥 호출만 한다 - 실패해도
 * 조용히 무시(로그인 안 됨/네트워크 오류 등으로 사용자 경험을 막지 않는다).
 */
export function useRecordSlotVisit(
  sectionRef: RefObject<HTMLElement | null>,
  slotKey: string,
  enabled: boolean
) {
  const recordedRef = useRef(false)

  useEffect(() => {
    recordedRef.current = false
  }, [slotKey])

  useEffect(() => {
    if (!enabled || recordedRef.current) return
    const el = sectionRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !recordedRef.current) {
          recordedRef.current = true
          recordSlotVisit(slotKey).catch(() => {})
          observer.disconnect()
        }
      },
      { threshold: 0.3 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled, slotKey, sectionRef])
}
