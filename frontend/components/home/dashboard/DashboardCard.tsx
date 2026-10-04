import { SECTION_CARD, SECTION_CARD_TITLE } from "@/lib/constant/surface"
import { cn } from "@/lib/utils"

interface DashboardCardProps {
  icon: React.ReactNode
  title: React.ReactNode
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export default function DashboardCard({
  icon,
  title,
  action,
  children,
  className,
}: DashboardCardProps) {
  return (
    <div
      className={cn(
        SECTION_CARD,
        "flex flex-col gap-4",
        className
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className={SECTION_CARD_TITLE}>
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  )
}
