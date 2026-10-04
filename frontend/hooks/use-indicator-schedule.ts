"use client"

import { useEffect, useRef, useSyncExternalStore } from "react"

const INTERVAL_MS = 15 * 60 * 1000 // 15분
const EMPTY_LABEL = "--:--"

/** 다음 정시 기준 15분 경계(매시 00분, 15분, 30분, 45분)까지 남은 시간(ms) */
function getMsUntilNextBoundary(now = Date.now()) {
  return INTERVAL_MS - (now % INTERVAL_MS)
}

function formatRemaining(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  const pad = (n: number) => n.toString().padStart(2, "0")
  return `${pad(minutes)}:${pad(seconds)}`
}

/*
 * 앱 전체가 공유하는 15분 경계 시계.
 * 예전에는 훅을 쓰는 컴포넌트마다 1초 인터벌과 "남은 시간" 상태를 따로 가져서, 카운트다운을
 * 표시하지 않는 차트 카드·지수 티커까지 매초 리렌더링됐다. 이제 인터벌은 구독자가 있는 동안
 * 하나만 돌고, 매초 바뀌는 값은 카운트다운을 실제로 그리는 컴포넌트(useIndicatorCountdown)만 구독한다.
 */
const boundaryListeners = new Set<() => void>()
const countdownListeners = new Set<() => void>()
let timerId: number | undefined
let boundary = 0
let remainingLabel = EMPTY_LABEL

function tick() {
  const now = Date.now()
  if (now >= boundary) {
    boundary = now + getMsUntilNextBoundary(now)
    boundaryListeners.forEach((listener) => listener())
  }
  const nextLabel = formatRemaining(boundary - now)
  if (nextLabel !== remainingLabel) {
    remainingLabel = nextLabel
    countdownListeners.forEach((listener) => listener())
  }
}

function startClock() {
  if (timerId !== undefined) return
  const now = Date.now()
  boundary = now + getMsUntilNextBoundary(now)
  remainingLabel = formatRemaining(boundary - now)
  timerId = window.setInterval(tick, 1000)
}

function stopClockIfIdle() {
  if (boundaryListeners.size > 0 || countdownListeners.size > 0) return
  window.clearInterval(timerId)
  timerId = undefined
  remainingLabel = EMPTY_LABEL
}

function subscribe(listeners: Set<() => void>, listener: () => void) {
  listeners.add(listener)
  startClock()
  return () => {
    listeners.delete(listener)
    stopClockIfIdle()
  }
}

const subscribeCountdown = (listener: () => void) =>
  subscribe(countdownListeners, listener)
const getRemainingLabel = () => remainingLabel
const getServerRemainingLabel = () => EMPTY_LABEL

/**
 * 정시 기준 15분 경계(매시 00·15·30·45분)마다 onTick을 실행한다.
 * 상태를 갖지 않으므로 이 훅 때문에 컴포넌트가 리렌더링되지는 않는다.
 */
export function useIndicatorSchedule(onTick: () => void) {
  const onTickRef = useRef(onTick)

  useEffect(() => {
    onTickRef.current = onTick
  })

  useEffect(() => subscribe(boundaryListeners, () => onTickRef.current()), [])
}

/**
 * 다음 15분 경계까지 남은 시간을 "MM:SS"로 반환한다. 매초 리렌더링되므로
 * 카운트다운을 실제로 그리는 작은 컴포넌트에서만 쓴다.
 */
export function useIndicatorCountdown() {
  return useSyncExternalStore(
    subscribeCountdown,
    getRemainingLabel,
    getServerRemainingLabel
  )
}
