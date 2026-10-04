// 아티클 순서(0-based id)에 따라 순환 적용되는 강조 색상.
// 0번은 앱 공통 포인트 컬러를 그대로 쓰고, 이후 순서는 지정된 팔레트를 사용한다.
const BRIEFING_ACCENT_COLORS = ["var(--color-point)", "#2563EB", "#059669"]

// 배지 배경처럼 "칠해진 면" 위에 흰 글자를 얹는 용도는 원래 색(진한 톤)이 그대로 맞다.
// 반면 카드 배경 위에 글자색으로만 쓰이는 곳(섹션 라벨 등)은 다크모드에서 원래 파란색(#2563EB)이
// 배경에 묻혀 버려서, 그 자리에서만 밝은 색으로 바꿔 쓸 다크모드 전용 짝을 별도로 둔다
const BRIEFING_ACCENT_TEXT_DARK_COLORS = ["var(--color-point)", "#006ff7", "#059669"]

export function getBriefingAccentColor(id: number) {
  return BRIEFING_ACCENT_COLORS[id % BRIEFING_ACCENT_COLORS.length]
}

export function getBriefingAccentTextDarkColor(id: number) {
  return BRIEFING_ACCENT_TEXT_DARK_COLORS[id % BRIEFING_ACCENT_TEXT_DARK_COLORS.length]
}
