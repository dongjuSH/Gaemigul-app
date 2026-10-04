// 실제 값과 무관한 고정 더미 데이터.
// 상승/하락 방향만 시각적으로 드러나면 되므로 우상향/우하향 형태로만 고정한다.

const uptrendChartData = [
  { desktop: 60 },
  { desktop: 90 },
  { desktop: 80 },
  { desktop: 140 },
  { desktop: 170 },
  { desktop: 230 },
]

const downtrendChartData = [
  { desktop: 230 },
  { desktop: 170 },
  { desktop: 190 },
  { desktop: 110 },
  { desktop: 90 },
  { desktop: 55 },
]

const flatChartData = [
  { desktop: 230 },
  { desktop: 160 },
  { desktop: 140 },
  { desktop: 200 },
  { desktop: 140 },
  { desktop: 140 },
]

export { uptrendChartData, downtrendChartData, flatChartData }
