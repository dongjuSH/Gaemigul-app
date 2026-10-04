const MANUAL_REFRESH_INTERVAL_MS = 60_000
const STORAGE_KEY = "heatmap:manual-refresh-available-at"
const listeners = new Set<() => void>()
let availableAt = 0

export function getManualRefreshWaitSeconds() {
  let deadline = availableAt
  try {
    const saved = Number(window.sessionStorage.getItem(STORAGE_KEY))
    if (Number.isFinite(saved)) deadline = Math.max(deadline, saved)
  } catch {
    // Storage can be unavailable; keep the in-memory limit in that case.
  }
  return Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
}

/** Claim before requesting, so rapid clicks and failed requests share the limit. */
export function beginManualRefresh() {
  if (getManualRefreshWaitSeconds() > 0) return false
  availableAt = Date.now() + MANUAL_REFRESH_INTERVAL_MS
  try {
    // One deadline per tab, shared across markets, periods and page reloads.
    window.sessionStorage.setItem(STORAGE_KEY, String(availableAt))
  } catch {
    // The synchronous in-memory guard still prevents repeated clicks.
  }
  listeners.forEach((listener) => listener())
  return true
}

export function subscribeManualRefresh(listener: () => void) {
  listeners.add(listener)
  // Calculate from the deadline instead of decrementing, including after tab sleep.
  const timer = setInterval(listener, 1000)
  return () => {
    clearInterval(timer)
    listeners.delete(listener)
  }
}

export function getServerManualRefreshWaitSeconds() {
  return 0
}
