"use client"

import InfoTooltip from "@/components/common/InfoTooltip"

export default function SummaryInfoTooltip() {
  return (
    <InfoTooltip
      label="AI 요약 안내"
      iconSize={16}
      buttonClassName="size-6"
      panelClassName="w-114"
      anchorBelowOnDesktop
    >
      <p className="mb-1 font-semibold text-popover-foreground">
        🐜 불개미 대장 알림
      </p>
      <p>
        불개미 대장AI가 빠르게 훑어온 요약 정보입니다. <br />
        시장 탐색용으로 가볍게 참고해 주시고, 최종 투자 결정과 책임은 투자자
        본인에게 있습니다.
      </p>
    </InfoTooltip>
  )
}
