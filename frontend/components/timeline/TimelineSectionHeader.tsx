import InfoTooltip from "@/components/common/InfoTooltip"

type TimelineSectionHeaderProps = {
  title: string
  time: string
  infoText: string
}

export default function TimelineSectionHeader({
  title,
  time,
  infoText,
}: TimelineSectionHeaderProps) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="relative inline-flex items-center text-2xl font-bold after:absolute after:bottom-1.5 after:h-1.5 after:w-full after:bg-point/15 after:content-[''] md:text-3xl">
        {title}
      </h2>
      <span className="text-sm text-neutral-400">{time}</span>
      <InfoTooltip
        label={`${title} 안내`}
        panelClassName="z-10"
        anchorBelowOnDesktop
      >
        <p>{infoText}</p>
      </InfoTooltip>
    </div>
  )
}
