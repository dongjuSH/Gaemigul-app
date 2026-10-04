/** 서브 페이지 공통 면(surface) 스타일. 페이지마다 카드 모양·색이 달라지지 않도록
 * 새 카드를 만들 때는 여기 값을 cn()으로 가져다 쓰고, 레이아웃(flex/gap 등)만 덧붙인다. */

/** 페이지 최상위 섹션 카드 - 홈 대시보드·시황·브리핑·히트맵·캘린더·용어 사전·마이페이지 공통 */
export const SECTION_CARD =
  "rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5"

/** 섹션 카드 헤더 제목 - 아이콘(16px, text-point) + 굵은 14px 텍스트 */
export const SECTION_CARD_TITLE =
  "flex items-center gap-1.5 text-sm font-bold text-foreground"

/** 섹션 카드 안에 들어가는 작은 카드(뉴스·종목·용어 카드 등) - 그림자 없이 테두리만 */
export const INNER_CARD = "rounded-lg border border-border bg-card p-4"

/** 데이터가 없을 때의 빈 상태 박스 */
export const EMPTY_STATE_BOX =
  "rounded-xl border border-dashed border-border px-4 text-center text-sm text-muted-foreground"

/** 탭/세그먼트 토글 - 회색 알약 트랙 위에서 선택된 항목만 포인트 색으로 채운다.
 * (시황·브리핑 탭, 용어 사전 탭, 히트맵 시장/기간, 캘린더 필터 공통) */
export const SEGMENT_LIST =
  "h-auto w-max gap-1 rounded-full bg-neutral-100 p-1 dark:bg-neutral-800"

/** Tabs(TabsTrigger)용 - data-active로 선택 상태를 표시한다. 모바일은 글자 12px */
export const SEGMENT_TRIGGER =
  "rounded-full px-4 py-1.5 text-neutral-500 data-active:bg-point data-active:text-white data-active:shadow-none max-md:text-xs dark:text-neutral-400"
