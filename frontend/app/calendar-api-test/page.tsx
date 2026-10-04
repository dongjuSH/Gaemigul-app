// 경제 캘린더 백엔드 API(GET /calendar/events) 연동 테스트 전용 화면.
// 기존 app/calendar/page.tsx(실제 캘린더 작업물)와 완전히 분리된 별도 라우트(/calendar-api-test)이며,
// 기존 캘린더 컴포넌트는 사용/수정하지 않는다. 목적은 CPI/PPI 실제 데이터가 정상적으로
// 내려오는지 눈으로 확인하는 것뿐이라 UI는 최소한으로만 구성한다.

type CalendarEvent = {
  id: string;
  publishedAt: string;
  start_date: string | null;
  end_date: string | null;
  time: string | null;
  region: string;
  category: string;
  title: string;
  summary: string;
  importance: number | null;
  previous: string | null;
  forecast: string | null;
  actual: string | null;
  status: string;
};

type PageProps = {
  searchParams: Promise<{ year?: string; month?: string }>;
};

export default async function CalendarApiTestPage({ searchParams }: PageProps) {
  const params = await searchParams;
  // 기본값: 실제 CPI/PPI 데이터가 저장돼 있는 2026년 8월
  const year = params.year ?? "2026";
  const month = params.month ?? "8";

  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const requestUrl = `${baseUrl}/calendar/events?year=${year}&month=${month}`;

  let events: CalendarEvent[] | null = null;
  let errorMessage: string | null = null;

  try {
    const res = await fetch(requestUrl, { cache: "no-store" });
    if (!res.ok) {
      errorMessage = `백엔드가 ${res.status} 응답을 반환했습니다.`;
    } else {
      events = await res.json();
    }
  } catch (err) {
    errorMessage = `백엔드 호출 실패: ${err instanceof Error ? err.message : String(err)}`;
  }

  return (
    <main style={{ padding: 24, fontFamily: "monospace", maxWidth: 720 }}>
      <h1 style={{ fontSize: 18, fontWeight: 700 }}>경제 캘린더 API 테스트</h1>
      <p style={{ color: "#666", fontSize: 13 }}>
        호출 주소: <code>{requestUrl}</code>
      </p>
      <p style={{ color: "#666", fontSize: 13 }}>
        다른 달을 보려면 URL에 <code>?year=2026&month=8</code> 형태로 쿼리를 바꿔보세요.
      </p>

      {errorMessage && (
        <p style={{ color: "#c00", marginTop: 16 }}>⚠️ {errorMessage}</p>
      )}

      {events && events.length === 0 && (
        <p style={{ marginTop: 16 }}>해당 연/월에는 이벤트가 없습니다 (정상 - 빈 배열).</p>
      )}

      {events && events.length > 0 && (
        <ul style={{ marginTop: 16, listStyle: "none", padding: 0 }}>
          {events.map((event) => (
            <li
              key={event.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 8,
                padding: 12,
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 12, color: "#888" }}>
                {event.publishedAt} {event.time ?? ""} · {event.region} · {event.category} · {event.status}
              </div>
              <div style={{ fontWeight: 700, marginTop: 4 }}>{event.title}</div>
              <div style={{ fontSize: 13, color: "#444", marginTop: 4 }}>{event.summary}</div>
              <div style={{ fontSize: 13, marginTop: 8 }}>
                실제값: {event.actual ?? "-"} / 이전값: {event.previous ?? "-"}
                {/* FRED가 제공하지 않아 항상 null이라 화면에서는 잠시 주석 처리 - 값 확인용으로만 필드는 유지 */}
                {/* / 예상값: {event.forecast ?? "-"} / 중요도: {event.importance ?? "-"} */}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
