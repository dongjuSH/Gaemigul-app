"use client"

import { Separator } from "../ui"
import { INNER_CARD } from "@/lib/constant/surface"
import { cn } from "@/lib/utils"

type ReportSectionsNavItem = {
  id: string
  label: string
}

type ReportSectionsNavProps = {
  items: ReportSectionsNavItem[]
  footerItem?: ReportSectionsNavItem
}

export default function ReportSectionsNav({
  items,
  footerItem,
}: ReportSectionsNavProps) {
  const scrollToSection = (id: string) => {
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      <div className={cn(INNER_CARD, "sticky top-23.75 flex flex-col gap-3")}>
        <p className="text-xs font-bold tracking-wide text-point">
          REPORT SECTIONS
        </p>
        <nav className="flex flex-col gap-2.5">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => scrollToSection(item.id)}
              className="cursor-pointer text-left text-xs font-medium text-muted-foreground transition-colors duration-200 hover:text-point"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <Separator className="bg-border/50 w-full" />

        {footerItem && (
          <button
            type="button"
            onClick={() => scrollToSection(footerItem.id)}
            className="cursor-pointer text-left text-xs font-bold text-point transition-colors duration-200 hover:text-point/80"
          >
            {footerItem.label}
          </button>
        )}
      </div>
    </aside>
  )
}
