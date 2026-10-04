"use client"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { VariantProps, cva } from "class-variance-authority"
import {
  Locale,
  addDays,
  addMonths,
  addWeeks,
  addYears,
  differenceInMinutes,
  endOfMonth,
  endOfWeek,
  format,
  getMonth,
  isSameDay,
  isSameHour,
  isSameMonth,
  isToday,
  setHours,
  setMonth,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
  subYears,
} from "date-fns"
import { ko } from "date-fns/locale/ko"
import {
  ReactNode,
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react"
import { useHotkeys } from "react-hotkeys-hook"

const monthEventVariants = cva("size-2 rounded-full", {
  variants: {
    variant: {
      default: "bg-primary",
      blue: "bg-blue-500",
      green: "bg-green-500",
      pink: "bg-pink-500",
      purple: "bg-purple-500",
      red: "bg-red-500",
      amber: "bg-amber-500",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

const dayEventVariants = cva("rounded border-l-4 p-2 text-xs font-bold", {
  variants: {
    variant: {
      default: "border-muted bg-muted/30 text-muted-foreground",
      blue: "border-blue-500 bg-blue-500/30 text-blue-600",
      green: "border-green-500 bg-green-500/30 text-green-600",
      pink: "border-pink-500 bg-pink-500/30 text-pink-600",
      purple: "border-purple-500 bg-purple-500/30 text-purple-600",
      red: "border-red-500 bg-red-500/30 text-red-600",
      amber: "border-amber-500 bg-amber-500/30 text-amber-600",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

type View = "day" | "week" | "month" | "year"

type ContextType = {
  view: View
  setView: (view: View) => void
  date: Date
  setDate: (date: Date) => void
  selectedDate: Date | null
  setSelectedDate: (date: Date | null) => void
  events: CalendarEvent[]
  locale: Locale
  setEvents: (date: CalendarEvent[]) => void
  onChangeView?: (view: View) => void
  onEventClick?: (event: CalendarEvent) => void
  onDateSelect?: (date: Date) => void
  enableHotkeys?: boolean
  today: Date
  /** 국내 증시 휴장일 (연보라 표시) */
  holidays: Date[]
}

const Context = createContext<ContextType>({} as ContextType)

export type CalendarEvent = {
  id: string
  start: Date
  end: Date
  title: string
  color?: VariantProps<typeof monthEventVariants>["variant"]
}

type CalendarProps = {
  children: ReactNode
  defaultDate?: Date
  events?: CalendarEvent[]
  holidays?: Date[]
  view?: View
  locale?: Locale
  enableHotkeys?: boolean
  onChangeView?: (view: View) => void
  onEventClick?: (event: CalendarEvent) => void
  onDateSelect?: (date: Date) => void
}

const Calendar = ({
  children,
  defaultDate = new Date(),
  locale = ko,
  enableHotkeys = true,
  view: _defaultMode = "month",
  onEventClick,
  onDateSelect,
  events: defaultEvents = [],
  holidays = [],
  onChangeView,
}: CalendarProps) => {
  const [view, setView] = useState<View>(_defaultMode)
  const [date, setDate] = useState(defaultDate)
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [events, setEvents] = useState<CalendarEvent[]>(defaultEvents)

  const changeView = (view: View) => {
    setView(view)
    onChangeView?.(view)
  }

  useHotkeys("m", () => changeView("month"), {
    enabled: enableHotkeys,
  })

  useHotkeys("w", () => changeView("week"), {
    enabled: enableHotkeys,
  })

  useHotkeys("y", () => changeView("year"), {
    enabled: enableHotkeys,
  })

  useHotkeys("d", () => changeView("day"), {
    enabled: enableHotkeys,
  })

  return (
    <Context.Provider
      value={{
        view,
        setView,
        date,
        setDate,
        selectedDate,
        setSelectedDate,
        events,
        setEvents,
        locale,
        enableHotkeys,
        onEventClick,
        onDateSelect,
        onChangeView,
        today: new Date(),
        holidays,
      }}
    >
      {children}
    </Context.Provider>
  )
}

export const useCalendar = () => useContext(Context)

const CalendarViewTrigger = forwardRef<
  HTMLButtonElement,
  React.HTMLAttributes<HTMLButtonElement> & {
    view: View
  }
>(({ children, view, ...props }, ref) => {
  const { view: currentView, setView, onChangeView } = useCalendar()

  return (
    <Button
      aria-current={currentView === view}
      size="sm"
      variant="ghost"
      ref={ref}
      {...props}
      onClick={() => {
        setView(view)
        onChangeView?.(view)
      }}
    >
      {children}
    </Button>
  )
})
CalendarViewTrigger.displayName = "CalendarViewTrigger"

const EventGroup = ({
  events,
  hour,
}: {
  events: CalendarEvent[]
  hour: Date
}) => {
  return (
    <div className="h-20 border-t last:border-b">
      {events
        .filter((event) => isSameHour(event.start, hour))
        .map((event) => {
          const hoursDifference =
            differenceInMinutes(event.end, event.start) / 60
          const startPosition = event.start.getMinutes() / 60

          return (
            <div
              key={event.id}
              className={cn(
                "relative",
                dayEventVariants({ variant: event.color })
              )}
              style={{
                top: `${startPosition * 100}%`,
                height: `${hoursDifference * 100}%`,
              }}
            >
              {event.title}
            </div>
          )
        })}
    </div>
  )
}

const CalendarDayView = () => {
  const { view, events, date } = useCalendar()

  if (view !== "day") return null

  const hours = [...Array(24)].map((_, i) => setHours(date, i))

  return (
    <div className="relative flex h-full overflow-auto pt-2">
      <TimeTable />
      <div className="flex-1">
        {hours.map((hour) => (
          <EventGroup key={hour.toString()} hour={hour} events={events} />
        ))}
      </div>
    </div>
  )
}

const CalendarWeekView = () => {
  const { view, date, locale, events } = useCalendar()

  const weekDates = useMemo(() => {
    const start = startOfWeek(date, { weekStartsOn: 0 })
    const weekDates = []

    for (let i = 0; i < 7; i++) {
      const day = addDays(start, i)
      const hours = [...Array(24)].map((_, i) => setHours(day, i))
      weekDates.push(hours)
    }

    return weekDates
  }, [date])

  const headerDays = useMemo(() => {
    const daysOfWeek = []
    for (let i = 0; i < 7; i++) {
      const result = addDays(startOfWeek(date, { weekStartsOn: 0 }), i)
      daysOfWeek.push(result)
    }
    return daysOfWeek
  }, [date])

  if (view !== "week") return null

  return (
    <div className="relative flex h-full flex-col overflow-auto">
      <div className="sticky top-0 z-10 mb-3 flex border-b bg-card">
        <div className="w-12"></div>
        {headerDays.map((date, i) => (
          <div
            key={date.toString()}
            className={cn(
              "flex flex-1 items-center justify-center gap-1 pb-2 text-center text-sm text-muted-foreground",
              [0, 6].includes(i) && "text-muted-foreground/50"
            )}
          >
            {format(date, "E", { locale })}
            <span
              className={cn(
                "grid h-6 place-content-center",
                isToday(date) &&
                  "size-6 rounded-full bg-primary text-primary-foreground"
              )}
            >
              {format(date, "d")}
            </span>
          </div>
        ))}
      </div>
      <div className="flex flex-1">
        <div className="w-fit">
          <TimeTable />
        </div>
        <div className="grid flex-1 grid-cols-7">
          {weekDates.map((hours, i) => {
            return (
              <div
                className={cn(
                  "h-full border-l text-sm text-muted-foreground first:border-l-0",
                  [0, 6].includes(i) && "bg-muted/50"
                )}
                key={hours[0].toString()}
              >
                {hours.map((hour) => (
                  <EventGroup
                    key={hour.toString()}
                    hour={hour}
                    events={events}
                  />
                ))}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const CalendarMonthView = () => {
  const {
    date,
    view,
    events,
    locale,
    selectedDate,
    setSelectedDate,
    onDateSelect,
    holidays,
  } = useCalendar()

  const monthDates = useMemo(() => getDaysInMonth(date), [date])
  const weekDays = useMemo(() => generateWeekdays(locale), [locale])

  if (view !== "month") return null

  return (
    <div className="flex h-full flex-col">
      <div className="sticky top-0 grid grid-cols-7 gap-px border-b bg-card">
        {weekDays.map((day, i) => (
          <div
            key={day}
            className={cn(
              "mb-2 text-center text-xs font-medium text-muted-foreground sm:text-sm",
              i === 0 && "text-red-500",
              i === 6 && "text-blue-500"
            )}
          >
            {day}
          </div>
        ))}
      </div>
      <div className="-mt-px grid flex-1 auto-rows-fr grid-cols-7 gap-px overflow-hidden p-px">
        {monthDates.map((_date) => {
          const currentEvents = events.filter((event) =>
            isSameDay(event.start, _date)
          )

          const isSelected = !!selectedDate && isSameDay(selectedDate, _date)
          const dow = _date.getDay()
          const isWeekend = dow === 0 || dow === 6
          const isHoliday = holidays.some((h) => isSameDay(h, _date))
          const inMonth = isSameMonth(date, _date)

          return (
            <button
              type="button"
              onClick={() => {
                setSelectedDate(_date)
                onDateSelect?.(_date)
              }}
              className={cn(
                "relative flex cursor-pointer flex-col items-start overflow-auto bg-card p-0.5 text-left text-xs text-muted-foreground ring-1 ring-border transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:bg-muted sm:p-1 sm:text-sm",
                (isWeekend || isHoliday) && "bg-muted/70",
                !inMonth && "text-muted-foreground/50",
                isSelected && "z-10 bg-primary/10 ring-2 ring-primary"
              )}
              key={_date.toString()}
            >
              <span
                className={cn(
                  "sticky top-0 mb-0.5 grid size-5 place-items-center self-start rounded-full text-xs tabular-nums sm:size-6 sm:text-sm",
                  dow === 0 && (inMonth ? "text-red-500" : "text-red-500/40"),
                  dow === 6 && (inMonth ? "text-blue-500" : "text-blue-500/40"),
                  isToday(_date) && "bg-primary text-primary-foreground",
                  isSelected &&
                    !isToday(_date) &&
                    "bg-primary/15 font-semibold text-primary ring-1 ring-primary"
                )}
              >
                {format(_date, "d")}
              </span>

              {currentEvents.length > 0 && (
                <div className="mt-0.5 flex flex-wrap gap-1">
                  {currentEvents.map((event) => (
                    <span
                      key={event.id}
                      title={event.title}
                      className={monthEventVariants({ variant: event.color })}
                    />
                  ))}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const CalendarYearView = () => {
  const { view, date, today, locale } = useCalendar()

  const months = useMemo(() => {
    if (!view) {
      return []
    }

    return Array.from({ length: 12 }).map((_, i) => {
      return getDaysInMonth(setMonth(date, i))
    })
  }, [date, view])

  const weekDays = useMemo(() => generateWeekdays(locale), [locale])

  if (view !== "year") return null

  return (
    <div className="grid h-full grid-cols-4 gap-10 overflow-auto">
      {months.map((days, i) => (
        <div key={days[0].toString()}>
          <span className="text-xl">{i + 1}</span>

          <div className="my-5 grid grid-cols-7 gap-2">
            {weekDays.map((day) => (
              <div
                key={day}
                className="text-center text-xs text-muted-foreground"
              >
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-x-2 text-center text-xs tabular-nums">
            {days.map((_date) => {
              return (
                <div
                  key={_date.toString()}
                  className={cn(
                    getMonth(_date) !== i && "text-muted-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "grid aspect-square size-full place-content-center tabular-nums",
                      isSameDay(today, _date) &&
                        getMonth(_date) === i &&
                        "rounded-full bg-primary text-primary-foreground"
                    )}
                  >
                    {format(_date, "d")}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

const CalendarNextTrigger = forwardRef<
  HTMLButtonElement,
  React.HTMLAttributes<HTMLButtonElement>
>(({ children, onClick, ...props }, ref) => {
  const { date, setDate, view, enableHotkeys } = useCalendar()

  const next = useCallback(() => {
    if (view === "day") {
      setDate(addDays(date, 1))
    } else if (view === "week") {
      setDate(addWeeks(date, 1))
    } else if (view === "month") {
      setDate(addMonths(date, 1))
    } else if (view === "year") {
      setDate(addYears(date, 1))
    }
  }, [date, view, setDate])

  useHotkeys("ArrowRight", () => next(), {
    enabled: enableHotkeys,
  })

  return (
    <Button
      size="icon"
      variant="outline"
      ref={ref}
      {...props}
      onClick={(e) => {
        next()
        onClick?.(e)
      }}
    >
      {children}
    </Button>
  )
})
CalendarNextTrigger.displayName = "CalendarNextTrigger"

const CalendarPrevTrigger = forwardRef<
  HTMLButtonElement,
  React.HTMLAttributes<HTMLButtonElement>
>(({ children, onClick, ...props }, ref) => {
  const { date, setDate, view, enableHotkeys } = useCalendar()

  const prev = useCallback(() => {
    if (view === "day") {
      setDate(subDays(date, 1))
    } else if (view === "week") {
      setDate(subWeeks(date, 1))
    } else if (view === "month") {
      setDate(subMonths(date, 1))
    } else if (view === "year") {
      setDate(subYears(date, 1))
    }
  }, [date, view, setDate])

  useHotkeys("ArrowLeft", () => prev(), {
    enabled: enableHotkeys,
  })

  return (
    <Button
      size="icon"
      variant="outline"
      ref={ref}
      {...props}
      onClick={(e) => {
        prev()
        onClick?.(e)
      }}
    >
      {children}
    </Button>
  )
})
CalendarPrevTrigger.displayName = "CalendarPrevTrigger"

const CalendarTodayTrigger = forwardRef<
  HTMLButtonElement,
  React.HTMLAttributes<HTMLButtonElement>
>(({ children, onClick, ...props }, ref) => {
  const { setDate, setSelectedDate, enableHotkeys, today } = useCalendar()

  const jumpToToday = useCallback(() => {
    setDate(today)
    setSelectedDate(today)
  }, [today, setDate, setSelectedDate])

  useHotkeys("t", () => jumpToToday(), {
    enabled: enableHotkeys,
  })

  return (
    <Button
      variant="outline"
      ref={ref}
      {...props}
      onClick={(e) => {
        jumpToToday()
        onClick?.(e)
      }}
    >
      {children}
    </Button>
  )
})
CalendarTodayTrigger.displayName = "CalendarTodayTrigger"

const CalendarCurrentDate = () => {
  const { date, view } = useCalendar()

  return (
    <time
      dateTime={date.toISOString()}
      className="tabular-nums"
      suppressHydrationWarning
    >
      {format(date, view === "day" ? "yyyy년 M월 d일" : "yyyy년 M월")}
    </time>
  )
}

const TimeTable = () => {
  const now = new Date()

  return (
    <div className="w-12 pr-2">
      {Array.from(Array(25).keys()).map((hour) => {
        return (
          <div
            className="relative h-20 text-right text-xs text-muted-foreground/50 last:h-0"
            key={hour}
          >
            {now.getHours() === hour && (
              <div
                className="z- absolute left-full h-[2px] w-dvw translate-x-2 bg-red-500"
                style={{
                  top: `${(now.getMinutes() / 60) * 100}%`,
                }}
              >
                <div className="absolute top-1/2 left-0 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-red-500"></div>
              </div>
            )}
            <p className="top-0 -translate-y-1/2">
              {hour === 24 ? 0 : hour}:00
            </p>
          </div>
        )
      })}
    </div>
  )
}

const getDaysInMonth = (date: Date) => {
  // 해당 월이 걸쳐 있는 주까지만 표시 (다음 달만으로 채워지는 마지막 주는 제외)
  const start = startOfWeek(startOfMonth(date), { weekStartsOn: 0 })
  const end = endOfWeek(endOfMonth(date), { weekStartsOn: 0 })

  let currentDate = start
  const calendar = []

  while (currentDate <= end) {
    calendar.push(new Date(currentDate))
    currentDate = addDays(currentDate, 1)
  }

  return calendar
}

const generateWeekdays = (locale: Locale) => {
  const daysOfWeek = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), i)
    daysOfWeek.push(format(date, "EEEEEE", { locale }))
  }
  return daysOfWeek
}

export {
  Calendar,
  CalendarCurrentDate,
  CalendarDayView,
  CalendarMonthView,
  CalendarNextTrigger,
  CalendarPrevTrigger,
  CalendarTodayTrigger,
  CalendarViewTrigger,
  CalendarWeekView,
  CalendarYearView,
}
