"use client"

import { Separator } from "../../ui"
import ScheduleClock from "./ScheduleClock"
import Timeline from "./Timeline"

export default function TimelineTimer() {
  return (
    <>
      <div className="w-full bg-card px-5 py-3 pr-1">
        {/* 타임라인 타이머 - 매초 갱신은 ScheduleClock 안에서만 일어난다 */}
        <ScheduleClock variant="desktop" />
      </div>
      <div className="flex w-full flex-col gap-1">
        <Separator className="w-full" />
        <Separator className="w-full" />
      </div>
      <Timeline />
    </>
  )
}
