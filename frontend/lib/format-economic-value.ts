// FRED/ECOS 등에서 받아 그대로 저장된 "숫자+단위" 문자열(예: "159075천 명", "32486.066십억 달러")을
// 사람이 읽기 쉬운 한국어 단위(만/억/조)로 "화면에 표시할 때만" 바꿔주는 포맷터.
//
// calendar_events의 actual/previous는 backend/src/backend/domain/calendar/services/calendar.py의
// _with_unit()이 이미 "숫자+단위"를 합쳐 문자열로 저장해둔 값이다(DB/API 원본은 그대로 둔다는
// 원칙 때문에 백엔드는 건드리지 않는다). 이 함수는 그 문자열을 렌더링 시점에 다시 포맷할 뿐,
// 저장된 값 자체나 API 응답 구조는 전혀 바꾸지 않는다.
//
// %, 포인트, 조원처럼 이미 사람이 읽기 쉬운 단위이거나 변환 대상이 아닌 단위, 단위를 모르는 값,
// 숫자로 시작하지 않는 값은 원본 문자열을 그대로 반환한다 — 임의로 다른 단위를 만들지 않는다.

const NUMBER_UNIT_RE = /^(-?\d+(?:\.\d+)?)\s*(.*)$/

/** N을 소수 maxDecimals자리까지 반올림하고, 불필요한 trailing 0은 없앤 채 천 단위 콤마를 붙인다 */
function roundedLocaleString(value: number, maxDecimals: number): string {
  return value.toLocaleString("ko-KR", { maximumFractionDigits: maxDecimals })
}

/** 명 단위 정수를 만 단위로 반올림한 뒤 조/억/만으로 쪼개 "1억 5891만명" 형태로 조립 */
function formatKoreanCount(value: number): string {
  const negative = value < 0
  const man = 10_000
  const eok = 100_000_000
  const jo = 1_000_000_000_000

  // 만 단위 미만은 반올림 — 그래야 조/억/만으로 나눌 때 끝자리가 지저분해지지 않는다
  let remain = Math.round(Math.abs(value) / man) * man

  const trillions = Math.floor(remain / jo)
  remain -= trillions * jo
  const eokPart = Math.floor(remain / eok)
  remain -= eokPart * eok
  const manPart = Math.floor(remain / man)

  const parts: string[] = []
  if (trillions > 0) parts.push(`${trillions}조`)
  if (eokPart > 0) parts.push(`${eokPart}억`)
  if (manPart > 0 || parts.length === 0) parts.push(`${manPart}만`)

  return `${negative ? "-" : ""}${parts.join(" ")}명`
}

/** 십억 달러 단위 값을 1,000십억(=1조) 기준으로 조/억 달러로 변환 */
function formatUsdFromBillions(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? "-" : ""
  if (abs >= 1000) {
    return `약 ${sign}${roundedLocaleString(abs / 1000, 2)}조 달러`
  }
  return `약 ${sign}${roundedLocaleString(abs * 10, 1)}억 달러`
}

/**
 * 백만 달러 단위 값을 조/억 달러로 변환. 1,000백만 = 1십억이므로 십억 달러 변환 로직을
 * 그대로 재사용한다 — 두 단위 사이의 환산을 별도 임계값으로 다시 정의하면 스케일이 안 맞는
 * 값(예: 10,000백만=100억인데 "조" 단위로 표시)이 나올 수 있어서, 단일 기준(십억 변환)을
 * 공유해 항상 산술적으로 일치하게 만들었다.
 */
function formatUsdFromMillions(value: number): string {
  return formatUsdFromBillions(value / 1000)
}

/** 원 단위 금액을 억/조 원으로 변환. 1억 미만은 천 단위 콤마만 넣어서 보여준다(현재 배당·공모가는 전부 이 구간) */
function formatWon(value: number): string {
  const abs = Math.abs(value)
  if (abs < 100_000_000) return `${roundedLocaleString(value, 0)}원`

  const sign = value < 0 ? "-" : ""
  const eok = 100_000_000
  const jo = 1_000_000_000_000
  if (abs >= jo) {
    return `약 ${sign}${roundedLocaleString(abs / jo, 2)}조 원`
  }
  return `약 ${sign}${roundedLocaleString(abs / eok, 1)}억 원`
}

/**
 * "159075천 명", "32486.066십억 달러" 같은 원본 문자열을 화면 표시용으로 변환한다.
 * 값이 없으면 "-", 지원하지 않는/알 수 없는 단위나 숫자로 시작하지 않는 값은 원본 그대로 반환한다.
 */
export function formatEconomicValue(raw: string | null | undefined): string {
  if (!raw) return "-"

  const match = raw.match(NUMBER_UNIT_RE)
  if (!match) return raw

  const [, numberText, unitText] = match
  const value = Number(numberText)
  if (Number.isNaN(value)) return raw

  const unit = unitText.replace(/\s+/g, "")

  switch (unit) {
    // 코드상 _UNITS 표는 "천 명"이지만, 실제 Supabase에 저장된 PAYEMS 값은 이미 천 단위가
    // 풀린 채로 "158913000명"처럼 저장돼 있다(과거 적재 시점 값 그대로). 두 형태 다 지원한다.
    case "천명":
      return formatKoreanCount(value * 1000)
    case "명":
      return formatKoreanCount(value)
    case "십억달러":
      return formatUsdFromBillions(value)
    case "백만달러":
      return formatUsdFromMillions(value)
    case "원":
      return formatWon(value)
    default:
      // %, 포인트, 조원 등 이미 읽기 쉬운 단위이거나 모르는 단위는 그대로 둔다
      return raw
  }
}
