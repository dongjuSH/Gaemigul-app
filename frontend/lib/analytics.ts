/**
 * Google Analytics(GA4) 헬퍼.
 * 측정 ID(NEXT_PUBLIC_GA_MEASUREMENT_ID)가 없거나 서버 렌더링 중이면 모든 함수가 아무 일도 하지 않는다.
 *
 * gtag 초기화(dataLayer·js·config)는 레이아웃의 인라인 스크립트가 아니라 여기서 딱 한 번 한다.
 * gtag.js는 afterInteractive로 늦게 로드되므로, 인라인 스크립트로 초기화하면 페이지뷰 추적 effect가
 * 그보다 먼저 실행돼 첫 페이지뷰가 유실되거나 config보다 앞서 쌓일 수 있기 때문이다.
 * 여기서 만든 gtag는 호출을 dataLayer에 쌓아두기만 하고, gtag.js가 로드되면 순서대로 전송된다.
 */

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? ""

type GtagParams = Record<string, string | number | boolean | undefined>

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

let initialized = false

/** gtag를 쓸 수 있으면 반환한다(필요하면 최초 1회 초기화). 쓸 수 없는 환경이면 null */
function getGtag() {
  if (typeof window === "undefined" || !GA_MEASUREMENT_ID) return null

  if (!initialized) {
    initialized = true
    window.dataLayer = window.dataLayer ?? []
    if (typeof window.gtag !== "function") {
      // gtag.js는 배열이 아니라 arguments 객체 자체가 쌓여 있어야 처리한다(공식 스니펫과 동일)
      window.gtag = function gtag() {
        // eslint-disable-next-line prefer-rest-params
        window.dataLayer?.push(arguments)
      }
    }
    window.gtag("js", new Date())
    // 페이지뷰는 GoogleAnalytics 컴포넌트가 경로가 바뀔 때마다 직접 보낸다(자동 전송과 중복 방지)
    window.gtag("config", GA_MEASUREMENT_ID, { send_page_view: false })
  }

  return typeof window.gtag === "function" ? window.gtag : null
}

/** 커스텀 이벤트 전송. GA를 쓸 수 없는 환경에서는 조용히 무시한다 */
export function trackEvent(eventName: string, params?: GtagParams) {
  const gtag = getGtag()
  if (!gtag) return
  try {
    gtag("event", eventName, params)
  } catch {
    // 분석 전송 실패가 화면 동작을 막으면 안 된다
  }
}

/** 페이지뷰 전송. pagePath는 쿼리스트링을 포함한 경로(예: /glossary?q=PER) */
export function trackPageView(pagePath: string) {
  trackEvent("page_view", {
    page_path: pagePath,
    page_location: window.location.origin + pagePath,
    page_title: document.title,
  })
}
