import { permanentRedirect } from "next/navigation"

// "데이터·AI 이용 안내" 내용은 "데이터 출처·방법론"(/data-sources)으로 합쳤다.
// 예전에 공유된 링크가 깨지지 않도록 옛 주소는 새 페이지로 영구 이동(308)시킨다
export default function DataAiUsagePage() {
  permanentRedirect("/data-sources")
}
