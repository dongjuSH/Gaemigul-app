export function isPositiveRate(rate: string) {
  return !rate.trim().startsWith("-")
}

/** "2,689.40" 같은 문자열을 숫자로 변환한다. */
function parseNumericValue(value: string) {
  return Number(value.replace(/,/g, ""))
}

/** 두 값의 차이를 "+11.30" / "-2.70" 형태로 반환한다. */
export function formatValueDelta(current: string, previous: string) {
  const diff = parseNumericValue(current) - parseNumericValue(previous)
  const sign = diff >= 0 ? "+" : "-"
  return `${sign}${Math.abs(diff).toLocaleString("ko-KR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}
