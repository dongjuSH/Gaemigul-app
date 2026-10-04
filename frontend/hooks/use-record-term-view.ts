import { useEffect, useRef, type RefObject } from "react"

import { recordGlossaryTermView } from "@/lib/api/glossary"

/**
 * 용어 카드가 화면에 30% 이상 보이는 순간 열람을 1회 기록한다(등급 시스템 "용어 열람 개수"
 * 활동 점수, 굴 파기 기록의 use-record-slot-visit.ts와 같은 방식). 로그인 안 됐으면 호출 자체를
 * 하지 않는다(enabled=false) - 서버도 401을 던지긴 하지만 불필요한 요청을 아예 막는다.
 */
export function useRecordTermView(
  cardRef: RefObject<HTMLElement | null>,
  termId: number,
  enabled: boolean
) {
  const recordedRef = useRef(false)

  useEffect(() => {
    if (!enabled || recordedRef.current) return
    const el = cardRef.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !recordedRef.current) {
          recordedRef.current = true
          recordGlossaryTermView(termId).catch(() => {})
          observer.disconnect()
        }
      },
      { threshold: 0.3 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled, termId, cardRef])
}
