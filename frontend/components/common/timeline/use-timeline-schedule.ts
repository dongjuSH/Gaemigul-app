"use client"

import { useEffect, useState } from "react"

import { timelineItems } from "@/lib/constant/timeline"
import type {
  ScheduleItem,
  TimelineItem,
  TimelineStatus,
} from "@/lib/types/TimelineType"

const STATUS_BADGE_LABEL: Record<TimelineStatus, string> = {
  past: "DONE",
  current: "NOW",
  next: "NEXT",
  upcoming: "",
}

function toMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

function getCurrentIndex(now: Date) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  let currentIndex = -1

  timelineItems.forEach((item, index) => {
    if (toMinutes(item.time) <= nowMinutes) {
      currentIndex = index
    }
  })

  return currentIndex
}

function getRemainingLabel(now: Date, target: TimelineItem) {
  const nowMinutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60
  const diffMinutes = Math.max(0, Math.round(toMinutes(target.time) - nowMinutes))
  const hours = Math.floor(diffMinutes / 60)
  const minutes = diffMinutes % 60

  if (hours === 0) return `${minutes}분 전`
  if (minutes === 0) return `${hours}시간 전`
  return `${hours}시간 ${minutes}분 전`
}

export function useTimelineSchedule(intervalMs = 1000) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    const tick = () => setNow(new Date())
    const initialTick = setTimeout(tick, 0)
    const timer = setInterval(tick, intervalMs)
    return () => {
      clearTimeout(initialTick)
      clearInterval(timer)
    }
  }, [intervalMs])

  const currentIndex = now ? getCurrentIndex(now) : -1

  const items: ScheduleItem[] = timelineItems.map((item, index) => {
    const status: TimelineStatus =
      currentIndex === -1
        ? "past"
        : index < currentIndex
          ? "past"
          : index === currentIndex
            ? "current"
            : index === currentIndex + 1
              ? "next"
              : "upcoming"

    return { ...item, status, badgeLabel: STATUS_BADGE_LABEL[status] }
  })

  const currentItem = currentIndex >= 0 ? items[currentIndex] : null
  const nextItem = items.find((item) => item.status === "next") ?? null
  const remainingLabel = now && nextItem ? getRemainingLabel(now, nextItem) : null

  return { now, items, currentItem, nextItem, remainingLabel }
}
