import { Card, CardContent } from "@/components/ui/card"

interface IndexCardProps {
  name: string
  value: string
  change: string
  isIncrease: boolean
}

export default function IndexCard({
  name,
  value,
  change,
  isIncrease,
}: IndexCardProps) {
  return (
    <Card className="w-64 rounded-sm border-border bg-card shadow-sm">
      <CardContent className="flex flex-col gap-2 px-4 py-0.5">
        <div className="flex items-center justify-between gap-4">
          <span className="text-lg font-medium">{name}</span>
          <span className={isIncrease ? "text-increase" : "text-decrease"}>
            {change}
          </span>
        </div>
        <strong className="text-4xl leading-none font-semibold tracking-tight">
          {value}
        </strong>
      </CardContent>
    </Card>
  )
}
