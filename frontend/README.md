# Gaemigul frontend

Next.js(App Router) 대시보드. 화면은 `app/`, UI 컴포넌트는 `components/`, 백엔드 호출은 `lib/api/`에 있다.
Next.js 16.2 · React 19.2 · Tailwind CSS 4 · shadcn/ui(`@base-ui/react`) · recharts · next-themes.

> 이 Next.js 버전은 이전 버전과 API·규칙이 다를 수 있다. 코드를 쓰기 전에 `node_modules/next/dist/docs/`의 해당 가이드를 먼저 본다 (`AGENTS.md`).

도메인별 상세 문서: 캘린더 `docs/calendar-page.md`, 히트맵 디자인 `design/heatmap-redesign.md`. 백엔드 쪽 설명은 `../backend/README.md`와 각 도메인의 `Claude.md`를 본다.

## 실행

```bash
npm install                     # 의존성 설치
cp .env.example .env.local      # NEXT_PUBLIC_API_BASE_URL 입력 (커밋하지 말 것)
npm run dev                     # http://localhost:3000
```

- 화면에 실제 데이터가 나오려면 백엔드가 떠 있어야 한다. 로컬 백엔드는 `http://localhost:8000` (API 문서: `http://localhost:8000/docs`). 백엔드를 켜기 전에 루트 `README.md`의 "4. 운영 규칙"(로컬 백엔드를 켜면 안 되는 시간)을 먼저 확인한다.
- 환경변수는 `NEXT_PUBLIC_API_BASE_URL` 하나다. 값이 없으면 코드가 `http://localhost:8000`을 쓴다 (`lib/api/client.ts` 외 `lib/api/*.ts` 각 파일).
- KIS·Gemini 등 외부 API 키는 프런트엔드에 두지 않는다. 브라우저는 백엔드만 호출한다.
- 스토리북은 없다.
- 운영 빌드 확인: `npm run build && npm run start` (기본 포트 3000).

## 배포 (Vercel)

- 배포 주소: `https://gaemigul-app.vercel.app` (백엔드 `main.py`의 CORS 허용 목록 기준. TODO: Vercel 프로젝트에서 실제 주소 확인)
- Vercel 프로젝트 설정(Root Directory, 연결 브랜치, 자동 배포 여부): TODO

### `/api/*` 프록시 (`vercel.json`)

```json
{ "rewrites": [{ "source": "/api/:path*", "destination": "http://<백엔드 서버>:8000/:path*" }] }
```

- Vercel 프런트는 HTTPS, 백엔드 운영 서버는 HTTP다. HTTPS 페이지에서 HTTP 주소를 직접 부르면 브라우저가 **mixed content**로 막는다.
- 그래서 브라우저는 같은 출처의 `https://<프런트 도메인>/api/...`를 부르고, Vercel이 서버 쪽에서 백엔드 `http://...:8000/...`로 넘긴다. `/api` 접두사는 떼고 전달된다 (`/api/timeline` → `/timeline`).
- 브라우저 입장에서는 같은 출처 요청이라 CORS 프리플라이트가 없고, 세션 쿠키도 프런트 도메인의 쿠키로 저장된다. 백엔드 `.env.example`의 "다른 도메인이면 `SESSION_COOKIE_SECURE=true`·`SAMESITE=none`" 설정은 프록시를 거치지 않고 직접 부를 때 이야기다.
- **백엔드 서버 주소는 `vercel.json`에만 둔다.** 이 README나 다른 문서에는 적지 않는다 (루트 README 운영 규칙: 공개 저장소이고 서버가 HTTP라 스캔 대상이 된다). 서버를 옮기면 `vercel.json`의 `destination`을 고치고 재배포한다.

### `NEXT_PUBLIC_API_BASE_URL`

| 환경 | 값 | 비고 |
|---|---|---|
| 로컬 | `http://localhost:8000` | `.env.local` |
| Vercel | TODO (Vercel 환경변수 실제 값 확인) | 위 프록시를 타려면 `/api`처럼 같은 출처 경로여야 한다. 백엔드 HTTP 주소를 넣으면 mixed content로 막힌다 |

- `NEXT_PUBLIC_` 변수는 **빌드할 때 번들에 문자열로 박힌다.** Vercel에서 값을 바꾼 뒤에는 반드시 재배포해야 반영된다. 실행 중에 바꿀 방법은 없다.
- 로컬에서도 `.env.local`을 고치면 `npm run dev`를 다시 띄운다.

## 주의

- `.env`, `.env.local`(`.env.*` 전체, `.env.example` 제외)은 커밋하지 않는다. `.gitignore`가 막고 있지만 `git add -f`로 우회하지 말 것.
- `package-lock.json`도 `.gitignore`에 들어가 있다. 팀원마다 설치된 버전이 다를 수 있으니, 한 사람만 재현되는 오류는 버전 차이부터 의심한다.
- **백엔드에 새 엔드포인트를 추가하면 백엔드를 재시작한다.** 백엔드는 자동 재시작이 없어서 재시작 전에는 예전 라우트 그대로라 404가 난다. 즐겨찾기·탈퇴 사유 API를 붙일 때 실제로 겪었다.
- **새 HTTP 메서드를 쓰면 백엔드 CORS `allow_methods`를 확인한다** (`backend/main.py`). 로컬(`localhost:3000` → `localhost:8000`)은 다른 출처라 CORS를 탄다. `DELETE`가 빠져 있어서 회원 탈퇴(`DELETE /auth/me`)가 프리플라이트에서 막혔고, 요청 자체가 안 나가서 서버 로그에도 남지 않았다. 현재 허용: `GET`, `POST`, `PATCH`, `DELETE`.
- **`localhost`와 `127.0.0.1`은 쿠키상 다른 호스트다.** `localhost:8000`으로 로그인하고 `127.0.0.1:8000`으로 확인하면 401이 난다. 앱과 검증 스크립트 모두 `localhost`로 통일한다.
- **리다이렉트 가드와 명시적 이동이 한 페이지에 있으면 경합한다.** 마이페이지에서 로그아웃하면 "비로그인이면 `/login`" 가드가 먼저 반응해 홈 대신 로그인 페이지로 갔다. `isLoggingOutRef`로 의도된 이탈을 표시해서 해결했다 (`app/(main)/mypage/page.tsx`).
- **`localStorage` 기반 상태는 정하는 순간 바로 저장한다.** 챗 안 읽은 배지 기준값을 state에만 두어 새로고침하면 초기화됐다 (`components/common/WhisperChat.tsx`, 키 `gaemigul:whisper-chat:seen-count`).
- 컴포넌트를 교체하는 리팩터링은 교체 전 버튼·링크 목록을 적어 두고 대조한다. 등급 재검사를 `GradeQuizStepper`로 바꾸면서 "취소" 버튼이 빠졌던 적이 있다.
- Playwright로 API를 모킹할 때는 호스트까지 적는다 (`http://localhost:8000/timeline*`). `**/timeline*`처럼 넓게 잡으면 프런트 `/timeline` 페이지 요청까지 가로챈다.

## 폴더 구조

| 폴더 | 내용 |
|---|---|
| `app/(main)/` | 실제 서비스 화면. `layout.tsx`가 브리핑·타임라인에서만 오른쪽 `ReportSidebar`를 붙이고, 모든 화면에 `WhisperChat`(대장 챗)을 띄운다 |
| `app/layout.tsx` | 루트 레이아웃. `ThemeProvider` → `AuthProvider` → `MobileSidebarProvider` 순으로 감싸고 Header·Sidebar·Footer를 둔다. Pretendard 로컬 폰트 |
| `app/(legacy)/legacy-timeline/` | 예전 정적 타임라인 화면(하드코딩 데이터). 메뉴에는 없다 |
| `app/calendar-api-test/` | `GET /calendar/events` 응답 확인용 테스트 화면. 메뉴에는 없다 |
| `components/ui/` | shadcn/ui 기본 컴포넌트. 추가는 `npx shadcn@latest add <이름>` |
| `components/common/` | Header, Sidebar, Footer, 인증 컨텍스트(`auth/AuthContext.tsx`), 대장 챗, 확인 다이얼로그 등 공용 |
| `components/<도메인>/` | `timeline`, `briefing`, `calendar`, `heatmap`, `glossary`, `home`, `auth`, `attendance`, `marquee` 화면 조각 |
| `hooks/` | 히트맵 조회(`use-heatmap.ts`, `use-heatmap-news.ts`), 지표 갱신 주기, 슬롯 방문·용어 열람 기록 |
| `lib/api/` | 백엔드 호출 (아래 표) |
| `lib/types/` | API 응답·화면 타입 (`*Type.ts`) |
| `lib/*.ts` | 응답 → 화면 데이터 변환(`timeline-mapper.ts`, `briefing-mapper.ts`, `report-list-mapper.ts`), 히트맵 배치·포맷·갱신 제한, 용어 톤 선택(`glossary.ts`) |
| `lib/constant/` | 사이드바 메뉴(`sidebar.ts`), 타임라인 슬롯 목록, 홈 상수 |
| `public/` | 파비콘, Pretendard 폰트, 이미지 |
| `tests/` | `node:test` + jsdom 테스트 |

화면 경로: `/`(홈), `/timeline`, `/briefing`, `/calendar`, `/heatmap`, `/glossary`, `/login`, `/signup`, `/find-id`, `/find-password`, `/change-password`, `/mypage`, `/onboarding/grade-quiz`, `/terms`, `/privacy-policy`, `/data-ai-usage`.

### `lib/api/` → 백엔드 엔드포인트

로그인이 필요한 요청은 `client.ts`의 `apiClient`(`withCredentials: true`)를 쓴다. 공개 조회는 axios·fetch를 직접 쓴다.

| 파일 | 엔드포인트 | 쓰는 곳 |
|---|---|---|
| `client.ts` | 쿠키 실어 보내는 axios 인스턴스 | auth·glossary·attendance |
| `auth.ts` | `/auth/signup`, `login`, `logout`, `me`(GET·DELETE=탈퇴), `withdrawal-feedback`, `find-id`, `reset-password`, `verify-password`, `change-password`, `grade-quiz`, `grade-survey`, `grade-history`, `activity-stats`, `promotion-suggestion`(+`/{id}/respond`), `newsletter-opt-in`(PATCH) | 로그인·회원가입·마이페이지·등급 퀴즈·대장 챗 |
| `timeline.ts` | `GET /timeline?date=`, `GET /timeline/glossary`, `GET /timeline/available-dates?year=&month=` | 타임라인, 날짜 선택, 홈 "오늘의 개미 용어" |
| `report.ts` | `GET /timeline/reports?year=&month=`, `GET /timeline/report?type=daily\|weekly&date=` | 브리핑, 보고서 사이드바 |
| `indicator.ts` | `GET /timeline/indicators` | 상단 지표 바(marquee) |
| `market.ts` | `GET /market/vix`, `sentiment`, `exchange-rate?period=today\|5d\|1m`, `investor-flow`, `trading-value-distribution` (캐시가 없으면 503) | 홈 대시보드 카드 |
| `calendar.ts` | `GET /calendar/events?year=&month=` | 캘린더, 홈 일정 카드, 대장 챗 |
| `glossary.ts` | `GET /glossary/terms?category=`(생략 시 전체), `POST /glossary/terms/{id}/view`, `GET /glossary/favorites`, `POST /glossary/terms/{id}/favorite` | 용어 사전, 타임라인 용어 툴팁, 홈 "오늘의 한 입", 마이페이지 |
| `heatmap.ts` | `GET /heatmap?market=&period=`, `GET /heatmap/news?market=&period=` (fetch, `AbortSignal`) | 히트맵, 대장 챗 |
| `attendance.ts` | `POST /attendance/visit`, `GET /attendance/heatmap?year=` | 타임라인 방문 기록, 마이페이지 "굴 파기 기록" |

## 인증 (세션 쿠키 + AuthProvider)

- 로그인하면 백엔드가 세션 쿠키(`session_id`)를 내려 준다. 프런트는 토큰을 따로 저장하지 않고 `apiClient`의 `withCredentials`로 쿠키만 주고받는다 (`lib/api/client.ts`).
- `AuthProvider`가 첫 렌더에 `GET /auth/me`로 로그인 상태를 확인한다. `status`는 `loading` → `authenticated` / `unauthenticated`. 401은 에러가 아니라 `null`로 돌려준다 (`getCurrentUser`).
- 화면에서는 `useAuth()`로 `user`, `status`, `login`, `logout`, `withdraw`, `setUser`, `refresh`를 쓴다. 등급 재검사처럼 서버 쪽 사용자 정보가 바뀌면 `refresh()`를 부른다.
- 임시 비밀번호로 로그인한 상태(`must_change_password`)면 `/change-password` 말고는 전부 그 페이지로 돌려보낸다.
- 로그인이 필요한 화면(마이페이지, 등급 퀴즈)은 각 페이지에서 `status === "unauthenticated"`일 때 `/login`으로 보낸다. 미들웨어 차단은 없다.
- 에러 문구는 `extractErrorMessage()`로 FastAPI `detail`(문자열 또는 422 배열)에서 뽑는다.

코드: `components/common/auth/AuthContext.tsx`, `lib/api/auth.ts`, `lib/types/AuthType.ts`, `app/(main)/login/`, `signup/`, `mypage/`, `components/common/WithdrawReasonDialog.tsx`

## 시황 타임라인 (용어 마커 + 호버 툴팁)

- `/timeline`은 `GET /timeline?date=`로 하루치 슬롯을 받아 `lib/timeline-mapper.ts`로 화면 데이터로 바꾼다. 오늘 날짜를 볼 때만 60초마다 다시 부른다. 선택 가능한 가장 이른 날짜는 2026-09-14(백엔드 실데이터 시작일, `MIN_DATE`).
- 슬롯 목록·공개 시각은 `components/common/timeline/use-timeline-schedule.ts`가 정한다. 시각이 안 된 슬롯은 잠금, 시각이 지났는데 데이터가 없으면 "아직 불러오지 못함"으로 표시한다 (`TimelineLockedSection.tsx`).
- `/timeline#<슬롯키>`로 들어오면 데이터가 늦게 그려지므로 대상 섹션이 생길 때까지 150ms 간격으로 최대 20회 스크롤을 다시 시도한다.
- **용어 마커**: 페이지가 `GET /glossary/terms`를 받아 `{용어: 설명}`으로 바꾼다. 설명 톤은 비로그인이면 `mid`, 로그인이면 등급에 맞춘다 (`lib/glossary.ts`의 `toneForGrade`, `descriptionForTone`).
- `GlossaryText`는 긴 용어부터 정규식으로 찾아 연한 배경으로 표시하고, 호버하면 CSS(`group-hover`)로 설명 툴팁을 띄운다. 한 카드 안에서 같은 용어는 처음 한 번만 표시한다.
- 로그인한 상태로 오늘 날짜를 볼 때만, 슬롯 섹션이 화면에 30% 이상 보이면 `POST /attendance/visit`를 1회 보낸다 ("굴 파기 기록"). 유효 시간대 판정은 서버가 한다.

코드: `app/(main)/timeline/page.tsx`, `components/timeline/`(`GlossaryText.tsx`, `TimelineSection.tsx`), `lib/timeline-mapper.ts`, `hooks/use-record-slot-visit.ts`

## 등급 진단

- 회원가입 완료 화면의 버튼으로 `/onboarding/grade-quiz`에 들어간다 (자동 이동 아님). `GradeQuizStepper`가 `GET /auth/grade-quiz`로 문제를 받아 투자 경험 → 용어 문제 → 뉴스 문제 순으로 한 문제씩 보여 주고, 끝나면 `POST /auth/grade-survey`로 제출해 결과(등급)를 보여 준다.
- 중간 저장은 없다. 답을 하나라도 고른 뒤 새로고침·탭 닫기를 하면 브라우저 이탈 확인창을 띄운다.
- 마이페이지 "등급 재검사"도 같은 컴포넌트를 쓰고, 취소 버튼은 마이페이지 쪽에서 감싼다.
- 등급은 `애기 개미` / `청년 개미` / `고참 개미`. 용어 설명 톤이 `easy` / `mid` / `hard`로 대응한다. 등급 값이 늘면 `toneForGrade()`만 고친다.
- 활동(출석 일수·용어 열람 수)이 쌓이면 백엔드가 승급 제안을 만든다. 대장 챗이 `GET /auth/promotion-suggestion`을 60초마다 확인해 보여 주고 수락·거절을 보낸다. 마이페이지는 애기→청년 기준(출석 15일, 용어 4개)에 못 미칠 때만 "등급 재검사"를 눈에 띄게 보여 준다. 용어 열람은 카드가 30% 이상 보이면 1회 기록한다 (`hooks/use-record-term-view.ts`).

코드: `app/(main)/onboarding/grade-quiz/page.tsx`, `components/auth/GradeQuizStepper.tsx`, `app/(main)/mypage/page.tsx`, `lib/glossary.ts`, `components/common/WhisperChat.tsx`

## 다크모드

- `next-themes`, `attribute="class"`, 기본값 `system`. `<html>`에 `.dark` 클래스가 붙는다. `suppressHydrationWarning`은 이것 때문에 루트 레이아웃에 있다.
- Header의 토글 버튼, 또는 키보드 `D`로 전환한다. 입력창(`input`·`textarea`·`select`·contenteditable)에 포커스가 있거나 Ctrl/Alt/Meta를 누르고 있으면 반응하지 않는다.
- 색은 `app/globals.css`의 `:root` / `.dark` CSS 변수로 정의하고, Tailwind는 `@custom-variant dark (&:is(.dark *))`로 `dark:`를 쓴다. `bg-white`처럼 고정 색을 쓴 곳은 `.dark .bg-white` 등으로 덮어쓴다.

코드: `components/theme-provider.tsx`, `components/common/Header.tsx`, `app/globals.css`

## 히트맵 (단물 지도)

`/heatmap`에서 KOSPI·KOSDAQ의 일간·주간·월간 히트맵을 본다. 메뉴 이름은 "주가 섹터별 히트맵", 내부 코드 이름은 `heatmap`. 집계 기준·수집 주기는 `../backend/README.md`의 히트맵 절을 본다.

- **면적**: 업종·종목 면적은 시가총액의 0.35제곱을 정규화한 비중 60%와 균등 비중 40%를 합쳐 계산한다. 시가총액 순서는 유지하면서 작은 업종·종목도 보이게 한다. 실제 시가총액은 상세 정보에 표시한다.
- **색**: 빨강 상승, 파랑 하락. 회색은 등락률 미제공과 보합이며 상세 문구로 구분한다.
- **표시 범위**: 시세가 있는 기업 5개 이상인 업종 중 시가총액 상위 15개 업종, 업종마다 상위 5개 기업(총 75개). 데이터가 부족하면 실제 가능한 업종 수를 안내한다. 검색·업종 확대에도 같은 범위를 적용하고, 업종 면적은 업종 전체 시가총액 기준을 유지한다.
- **1위 업종**: 선택한 시장·기간에서 전체 업종의 시가총액 가중 평균 등락률을 비교한 결과라서 히트맵에 없는 업종도 1위가 될 수 있다. 모두 하락하면 "등락률 1위(하락폭이 가장 작은 업종)"로 안내한다.
- **연관 업종**: 오른쪽에 1위 업종과 연결된 3개 업종의 연관 이유·등락률과 각 업종 시가총액 상위 기업 2개를 표시한다. 산업 연관 규칙이 부족해 시장 흐름으로 보완한 업종은 따로 표시한다.
- **뉴스**: 하단은 `GET /heatmap/news`로 1위 업종의 최신 경제뉴스 최대 4개(제목·언론사·발행 시각·링크)를 보여 준다. 기사 부족·오류를 샘플 기사로 채우지 않는다. 응답의 `sector_code`가 현재 1위 업종과 다르면 버린다. 뉴스 갱신은 히트맵 조회에 묶여 있어 60초 제한을 우회하는 별도 버튼이 없다.
- **조회·갱신** (`hooks/use-heatmap.ts`): 백엔드의 갱신 시각·초기 수집 상태에 맞춰 저장된 데이터를 읽는다. UPDATE 버튼도 KIS 수집을 강제로 실행하지 않는다. 수동 UPDATE와 오류 시 다시 불러오기는 요청 시작부터 60초에 한 번만 허용하고 남은 시간을 버튼에 표시한다. 이 제한은 같은 탭에서 시장·기간 변경과 새로고침에도 유지되고, 요청이 실패해도 초기화되지 않는다. 최초 조회·필터 변경·자동 갱신은 따로 동작한다. 필터를 바꾸면 이전 요청을 취소한다. 연결 오류·부분 수집·장외·지연 상태를 표시한다.
- **반응형**: 좁은 화면에서는 공통 메뉴를 가로로 두고 히트맵 아래에 연관 업종·뉴스를 둔다. 이 보완은 히트맵 페이지에만 적용된다.

코드: `components/heatmap/`, `hooks/use-heatmap.ts`, `hooks/use-heatmap-news.ts`, `lib/api/heatmap.ts`, `lib/types/HeatmapType.ts`, `lib/heatmap-layout.ts`, `lib/heatmap-refresh.ts`, `lib/heatmap-format.ts`

## 검증

```bash
npm run lint          # ESLint (eslint-config-next core-web-vitals + typescript 규칙)
npm run typecheck     # tsc --noEmit, 타입 오류 검사
npm run build         # 운영 빌드. 서버/클라이언트 경계, 라우트 오류까지 잡힌다
npm run test:charts   # tests/indicator-sparkline.test.tsx
npm run format        # Prettier로 **/*.{ts,tsx} 정렬 (검사가 아니라 파일을 고친다)
```

`test:charts`는 `node:test` + jsdom으로 실행한다. 숨겨진 데스크톱/모바일 헤더에서 반응형 차트가 0 × 0 크기 경고를 내는 상황을 재현하고, 고정 80 × 40 크기의 지수 미니 차트는 숨김·표시 전환 뒤에도 경고 없이 그려지는지 확인한다. 반복 티커의 SVG 그라데이션 ID가 겹치지 않는지도 본다.

그 밖의 화면 동작(로그인·탈퇴·리다이렉트·배지 등)은 자동 테스트가 없어서, 백엔드를 켠 상태로 브라우저에서 직접 눌러 확인한다. 이때 호스트는 `localhost`로 맞춘다 (위 "주의" 참고).
