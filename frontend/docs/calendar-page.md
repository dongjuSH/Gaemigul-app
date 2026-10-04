# 경제 캘린더(Calendar) 페이지 — 구현/실행 문서

> 대상 페이지: `/calendar` (`frontend/app/(main)/calendar/page.tsx`)
> 기준 브랜치: `front/feat/calendar` (2026-09-17, 최신 커밋 `feat: 월별 달력 색 변경`)

이 문서는 캘린더 페이지를 **처음부터 다시 실행해서 확인**할 수 있도록 실행 방법을,
그리고 **어떻게 만들어져 있는지** 구현 방법을 순서대로 정리한 문서입니다.

---

## 1. 실행 방법

### 1-1. 필요한 것

- Node.js (frontend) + Python 3.14 / uv (backend) — 캘린더 데이터는 백엔드 API에서 내려오므로 **백엔드를 반드시 같이 켜야** 실제 일정이 보입니다.
- 백엔드가 없으면 페이지는 정상적으로 뜨지만 "일정을 불러오지 못했습니다" 에러 상태로만 보입니다.

### 1-2. 백엔드 먼저 실행

```powershell
cd backend
uv sync
# 최초 1회: .env.example → .env 복사 후 KIS 키 등 값 채우기
uv run uvicorn main:app --host 127.0.0.1 --port 8000
```

캘린더 전용 엔드포인트는 `GET /calendar/events?year=YYYY&month=M` 하나입니다.
(`backend/src/backend/domain/calendar/routers/calendar.py`)

브라우저나 curl로 직접 응답을 확인할 수 있습니다.

```powershell
curl "http://127.0.0.1:8000/calendar/events?year=2026&month=8"
```

### 1-3. 프론트엔드 실행

```powershell
cd frontend
npm install
npm run dev
```

- `.env`(또는 `.env.local`)의 `NEXT_PUBLIC_API_BASE_URL`이 백엔드 주소를 가리켜야 합니다. 기본값은 `http://localhost:8000`이고, `frontend/.env.example`을 복사해서 만듭니다.
- 브라우저에서 `http://localhost:3000/calendar` 접속.

### 1-4. 화면 없이 API 연동만 빠르게 확인하고 싶을 때

`http://localhost:3000/calendar-api-test?year=2026&month=8` 로 접속하면 실제 캘린더 UI
없이 백엔드 응답 JSON을 그대로 목록으로 볼 수 있습니다
([app/calendar-api-test/page.tsx](../app/calendar-api-test/page.tsx)). CPI/PPI 등 데이터가
정상적으로 내려오는지만 빠르게 확인하려고 만든 임시 페이지이며, 실제 서비스 화면과는
완전히 분리되어 있어 지워도 `/calendar`에는 영향이 없습니다.

### 1-5. 검증 명령어

```powershell
npm run typecheck   # tsc --noEmit
npm run lint
npm run build
```

캘린더 관련 코드는 `app/(main)/calendar/`, `components/calendar/`,
`lib/calendar.ts`, `lib/api/calendar.ts`, `lib/format-economic-value.ts`입니다.

### 1-6. 화면에서 눈으로 확인해볼 포인트

1. `/calendar` 진입 → 이번 달 월간 캘린더(데스크톱) 또는 주별 리스트(모바일 폭)가 보이는지
2. 상단 탭(전체/경제지표/실적) 전환 시 서브 카테고리가 바뀌는지, 서브 카테고리를 다중 선택/해제했을 때 "전체"와의 토글이 자연스러운지
3. 월 이동(◀ ▶) 시 스켈레톤이 잠깐 보였다가 새 달 데이터로 바뀌는지
4. 날짜 셀 클릭 / "+N개 더보기" 클릭 시 상세 팝업(아코디언)이 뜨는지
5. 우측 사이드바의 "이번 주, 주린이 탈출" 카드 → "3분 만에 알아보기" 클릭 시 5단계 학습 + 퀴즈 팝업이 뜨는지
6. 현재 연도가 아닌 해로 이동(예: 2025년, 2027년)했을 때 "아직 제공되지 않는 일정입니다" 안내가 뜨는지

---

## 2. 구현 방법 (단계별)

캘린더 페이지는 아래 순서로 쌓아 올린 구조입니다. 실제 개발도 이 순서(백엔드 스키마 →
API 클라이언트 → 화면 모델 변환 → 상태/필터 → 렌더링 → 상세 팝업 → 부가 기능)로
진행되었습니다.

### STEP 1. 백엔드 응답 타입 정의 — `lib/api/calendar.ts`

백엔드 `GET /calendar/events` 응답 스키마(`CalendarEventDto`)를 그대로 TS 인터페이스로
옮기고, axios로 호출하는 함수 하나(`getCalendarEvents(year, month)`)만 노출합니다.
응답이 배열이 아니면 즉시 에러를 던져 이후 로직이 항상 배열을 가정할 수 있게 합니다.

```ts
export async function getCalendarEvents(year: number, month: number) {
  const response = await axios.get<CalendarEventDto[]>(CALENDAR_EVENTS_URL, {
    params: { year, month },
  })
  if (!Array.isArray(response.data)) throw new Error(...)
  return response.data
}
```

### STEP 2. DTO → 화면 전용 모델 변환 — `app/(main)/calendar/news-data.ts`

백엔드 DTO를 화면에서 다루기 좋은 `NewsItem` 타입으로 변환하는 `toNewsItem()`을 만듭니다.
이 단계에서 하는 일:

- 필수 필드(제목/요약/지역, 알려진 카테고리)가 없으면 `null` 반환 → 페이지에서 걸러냄
- 날짜(`publishedAt`) + 시간(`time`)을 **KST 기준** `Date` 객체로 합성(`toPublishedAt`). 시간이 없으면 정오(12:00)를 써서 시간대 변환으로 날짜가 하루 밀리는 사고를 방지
- `actual`/`actual_label`/`previous`가 있을 때만 `detail` 객체를 채움
- 카테고리별 색상표(`CAT`), 상단 탭 그룹핑(`CATEGORY_GROUPS`), 국내/해외 판별(`scopeOf`), 국기 코드 매핑(`countryCodeOf`)도 이 파일에 함께 정의해 "카테고리/지역 관련 로직"을 한 곳에 모음
- 증시 휴장일(`MARKET_HOLIDAYS`)은 백엔드 연동 없이 2026년 기준 정적 배열로 하드코딩

### STEP 3. 페이지 상태 관리 — `app/(main)/calendar/page.tsx`

`useState`로 관리하는 핵심 상태:

| 상태                                           | 역할                                            |
| ---------------------------------------------- | ----------------------------------------------- |
| `month`                                        | 현재 보고 있는 달(월간 그리드 기준)             |
| `selectedDate`                                 | 선택된 날짜(미니 달력 강조, 주별 리스트 시작점) |
| `viewMode`                                     | `"month"` / `"week"` — 데스크톱에서만 전환 가능 |
| `groupFilter` / `categorySet` / `regionFilter` | 3단 필터 상태                                   |
| `allNews`                                      | 현재 조회된(비필터) 전체 일정                   |
| `loading` / `loadError` / `unavailableYear`    | 로딩·에러·연도 범위 밖 상태                     |
| `popup`                                        | 상세 팝업에 띄울 `{ group, itemId }`            |

데이터 조회(`fetchNews`)는 다음과 같이 구현합니다.

1. 현재 연도가 아니면 API 호출 없이 즉시 "제공 안 함" 상태로 종료
2. 월간 그리드가 앞뒤 달 여분 날짜도 그려야 하므로 **이전/현재/다음 달 3개월**을 `Promise.allSettled`로 병렬 조회
3. 성공한 달만 모아 `toNewsItem`으로 변환 후 `dedupeNewsItems`(id 기준 중복 제거)
4. 일부만 실패하면 성공분은 반영하고 `loadError` 배너만 띄움, 전부 실패하면 전체 에러 화면
5. 요청마다 증가하는 `requestIdRef`로 최신 요청 결과만 반영(월 이동을 빠르게 반복해도 이전 응답이 화면을 덮어쓰지 않도록 함)

### STEP 4. 필터 적용

`filteredNews`는 `allNews`에 그룹/카테고리/지역 조건을 `useMemo`로 필터링한 파생 상태입니다.
그룹을 바꾸면 서브 카테고리 선택을 초기화(`selectGroup`)하고, 서브 카테고리는 "전체 항목을
다 켜면 자동으로 빈 집합(=전체)으로 접힘" 규칙(`toggleSubCategory`)을 둬서 전체 선택 상태가
항상 하나로 수렴하게 만들었습니다.

### STEP 5. 월/주 렌더링 — `lib/calendar.ts` + `MonthGrid` / `WeekList`

가장 까다로웠던 부분은 "월요일 시작·토요일까지 6일 주"가 두 달에 걸칠 때 어느 달 소속으로
볼지 정하는 규칙입니다(`lib/calendar.ts`).

- `getMonthGridWeeks(month)`: 월간 그리드가 그릴 모든 주(앞뒤 달 포함)를 계산
- `weekLabelOf(date)`: 그 주의 목요일이 속한 달을 "주인 달"로, 목요일이 그 달의 몇 번째
  목요일인지로 주차 번호를 계산 (6일 주에서 목요일은 항상 과반수 쪽에 속하기 때문)
- `weekOwnedRangeOfMonth(month)`: 주별 리스트(`WeekList`)가 그릴 날짜 범위(그 달이 주인인
  주만)를 계산 → 경계 주가 중복 표시되거나 누락되는 문제 방지

`MonthGrid`는 이 주 배열을 6열 그리드로 렌더링하며, 하루 일정이 3개를 넘으면
"+N개 더보기"로 상세 팝업을 열게 했습니다. `WeekList`는 표 형태로 주차별 섹션을 나눠
보여주며, 오늘이 속한 달을 보는 중이면 선택된 날짜부터, 다른 달이면 그 달 범위 전체를
보여줍니다.

### STEP 6. 상세 팝업 — `news-panel.tsx`

날짜 셀/일정 클릭 시 `dayGroupOf(date, allNews)`로 그날 전체 일정(필터 무관)을 모아
`DayDetailDialog`에 넘깁니다. 일정이 여러 개면 아코디언(하나씩 펼침), 하나면 항상
펼쳐진 상태이고, 처음 클릭한 항목이 팝업 맨 위로 자동 스크롤됩니다. 실제값/이전치는
`formatEconomicValue`로 가공해서 표시합니다.

### STEP 7. 값 표시 포맷팅 — `lib/format-economic-value.ts`

백엔드가 내려주는 원본 문자열(`"159075천 명"`, `"32486.066십억 달러"`)은 그대로 두고
(**DB/API 원본은 건드리지 않는다는 원칙**), 화면에 그릴 때만 정규식으로 숫자+단위를
분리해 만/억/조 단위 한국어 표기로 재조합합니다. 지원하지 않는 단위(%, 포인트, 조원 등)나
알 수 없는 값은 원본 그대로 반환합니다.

### STEP 8. 사이드바 부가 기능

- `MiniCalendar`: 월 이동 + 오늘 이동, 주별 뷰일 때 선택된 주 전체를 강조
- `WeekPlan`: 선택된 날짜가 속한 주의 실제 일정(필터 무관)을 요약 리스트로 — 클릭 시 상세 팝업 연결
- `BeginnerLessonTeaser` / `BeginnerLessonDialog` (+ `beginner-lessons.ts`): 실제 LLM 연동 없이, 이번 주 일정의 카테고리/제목에 **우선순위 매칭 규칙**(`PRIORITY` 배열)을 적용해 정적 학습 콘텐츠 1개를 골라 보여주는 방식. 5단계 설명 + 10초 퀴즈로 구성
- `calendar-skeletons.tsx`: 월 이동/재조회 중 각 영역에 동일 레이아웃의 스켈레톤을 보여줘 로딩 중 레이아웃이 흔들리지 않게 함

---

## 3. 전체 데이터 흐름 요약

```
GET /calendar/events?year=&month=  (백엔드)
        ▼
lib/api/calendar.ts → getCalendarEvents()         [STEP 1]
        ▼
news-data.ts → toNewsItem() → NewsItem[]           [STEP 2]
        ▼
page.tsx → allNews 상태 저장 (3개월 병렬 조회, dedupe)  [STEP 3]
        ▼
page.tsx → filteredNews (그룹/카테고리/지역 필터)        [STEP 4]
        ▼
lib/calendar.ts 주/월 계산 → MonthGrid / WeekList 렌더링 [STEP 5]
        ▼
클릭 시 news-panel.tsx → DayDetailDialog 상세 팝업       [STEP 6]
        (표시 값은 format-economic-value.ts로 가공)       [STEP 7]
```

---

## 4. 폴더 구조 참고

```
frontend/
├─ app/(main)/calendar/
│  ├─ page.tsx            # 상태 관리 + 데이터 조회 + 레이아웃 조립
│  ├─ news-data.ts         # 타입 + DTO→화면모델 변환 + 색상/휴장일 데이터
│  ├─ news-panel.tsx        # 날짜별 상세 팝업 + 그룹핑 유틸
│  └─ beginner-lessons.ts   # 주린이 교육 콘텐츠 + 매칭 로직
├─ components/calendar/
│  ├─ filter-bar.tsx / month-grid.tsx / week-list.tsx / mini-calendar.tsx
│  ├─ Weekplan.tsx / beginner-lesson-teaser.tsx / beginner-lesson-dialog.tsx
│  └─ calendar-skeletons.tsx / category-bar.tsx / region-badge.tsx
├─ lib/
│  ├─ calendar.ts               # 주/월 계산 순수 함수
│  ├─ api/calendar.ts           # 백엔드 API 클라이언트
│  └─ format-economic-value.ts  # 수치 문자열 포맷터
└─ app/calendar-api-test/page.tsx  # 연동 확인용 임시 페이지
```

---

## 5. 개발 히스토리 (커밋 타임라인)

| 날짜               | 커밋                                                                                | 구현 단계                                                  |
| ------------------ | ----------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 2026-09-10 ~ 09-11 | `feat:404페이지 추가`, `feat: 캘린더 수정`                                          | 페이지 초기 뼈대                                           |
| 2026-09-14         | `feat: 타이틀, 모바일 수정` / `feat: sticky했어욤`                                  | 레이아웃 STEP — 타이틀·모바일 대응, sticky 필터바/사이드바 |
| 2026-09-15         | `refactor: 기본 레이아웃 스타일 수정` / `refactor: 페이지 전체적으로 레이아웃 수정` | 레이아웃 정리                                              |
| 2026-09-15         | `feat: 백엔드 연동 후 전체필터, 일정 색깔 생성`                                     | STEP 1~4 — 실제 API 연동, 필터 체계·카테고리 색상 도입     |
| 2026-09-16         | `feat: 주별 단위 수정`                                                              | STEP 5 — 주 소유 달 판별 로직 정리                         |
| 2026-09-16         | `fix(calendar): PAYEMS 값을 천 명 단위 축약이 아닌 실제 인원 수로 저장`             | STEP 7 관련 — 저장 방식 수정                               |
| 2026-09-16         | `feat: 2025년으로 넘어가면 데이터 없음 처리`                                        | STEP 3 — 연도 범위 밖 처리                                 |
| 2026-09-16         | `feat: 퀴즈 영역 수정 및 이번 주 일정이 없어요 넣음`                                | STEP 8 — 퀴즈 UI, WeekPlan 빈 상태                         |
| 2026-09-17         | `feat: 월별 달력 색 변경`                                                           | STEP 5 — 월간 캘린더 색상 조정                             |

---

## 6. 알려진 제약

- `importance`(중요도), `detail.source`(발표처), `detail.sectors`(관련 수혜 섹터)는 UI는
  준비돼 있지만 백엔드가 아직 값을 주지 않아 항상 비어 있습니다.
- **현재 연도 데이터만** 조회합니다(과거/미래 연도는 API 호출 없이 안내 문구만 표시).
- 증시 휴장일은 2026년 기준 프론트 정적 데이터이며 백엔드 연동이 아닙니다.
- "주린이 탈출" 콘텐츠는 실제 AI 생성이 아닌 정적 데이터 + 규칙 기반 매칭입니다.
