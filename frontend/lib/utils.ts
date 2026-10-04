export { cn } from "cn"

/** 마우스 호버가 실제로 가능한 기기인지(터치 전용 기기는 false). 툴팁류가 모바일에서 호버로
 * 열리지 않고 클릭으로만 열리도록 하는 데 쓴다. */
export function supportsHover() {
  if (typeof window === "undefined") return false
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches
}

export function formatClock(date: Date) {
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  const seconds = String(date.getSeconds()).padStart(2, "0")
  return `${hours}:${minutes}:${seconds}`
}
