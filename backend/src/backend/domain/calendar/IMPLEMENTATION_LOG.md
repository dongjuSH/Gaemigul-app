# Calendar 백엔드 1차 구현 정리 (FRED CPI)

CLAUDE.md 요구사항 기준으로 1~4단계(FRED 연동 → FastAPI → Supabase → API 응답)를 CPI 지표 하나로
끝까지 완성한 기록. 개발 순서표 기준 STEP 1~11에 해당.

## 1. 확정된 설계 결정

| 항목                     | 결정                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------- |
| ORM 모델                 | 사용하지 않음. `models/calendar.py`는 비워둠                                                      |
| Supabase 접근 방식       | `core/database.py`의 `async_session`/`get_db()`를 그대로 재사용, `sqlalchemy.text()` 기반 raw SQL |
| 테이블 생성 방식         | 마이그레이션 도구 없이 Supabase SQL Editor에서 수동 실행                                          |
| FRED 수집 트리거         | APScheduler 미사용. `scripts/seed_cpi.py` 수동 실행(1회성 적재)                                   |
| API 엔드포인트           | `GET /calendar/events?year=YYYY&month=MM`                                                         |
| `publishedAt` 의미       | 한국시간(KST) 기준 경제지표 **발표일**. FRED 원본 날짜를 그대로 쓰지 않고 Service에서 변환        |
| `publishedAt` 타입       | `text` 유지 (`'YYYY-MM-DD'` 형식 고정 → 사전순 정렬이 곧 날짜순 정렬)                             |
| `forecast`, `importance` | FRED가 제공하지 않으므로 항상 `null` (임의 생성 금지)                                             |

## 2. Supabase `calendar_events` 테이블 (생성 완료)

```sql
CREATE TABLE calendar_events (
    id            text PRIMARY KEY,
    "publishedAt" text NOT NULL,
    start_date    text,
    end_date      text,
    "time"        text,
    region        text NOT NULL,
    category      text NOT NULL,
    title         text NOT NULL,
    summary       text NOT NULL,
    importance    integer,
    previous      text,
    forecast      text,
    actual        text,
    status        text NOT NULL
);

CREATE INDEX idx_calendar_events_published_at ON calendar_events ("publishedAt");
CREATE INDEX idx_calendar_events_category ON calendar_events (category);
```

- `publishedAt`, `time`은 camelCase라서 모든 SQL에서 반드시 큰따옴표로 감싸야 함(안 그러면 Postgres가 자동 소문자화).
- `id`가 PK라서 `INSERT ... ON CONFLICT (id) DO UPDATE`로 중복 없이 upsert 가능.

## 3. 신규/수정 파일

| 파일                                   | 역할                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `core/config.py`                       | `fred_api_key` 필드 추가 (기존 항목 유지)                               |
| `core/fred_client.py` (신규)           | FRED `series/observations`, `series/release`, `release/dates` 호출 전담 |
| `domain/calendar/schemas/calendar.py`  | Pydantic `CalendarEvent` (CLAUDE.md 6번 그대로, 14개 필드)              |
| `domain/calendar/services/calendar.py` | FRED 호출 → KST 변환 → 한국어 title/summary → upsert/조회. ORM 미사용   |
| `domain/calendar/routers/calendar.py`  | `GET /calendar/events?year=&month=`                                     |
| `main.py`                              | `calendar_router` include 한 줄만 추가 (기존 코드 불변)                 |
| `scripts/seed_cpi.py` (신규)           | CPI 1회 적재용 수동 스크립트                                            |

## 4. KST 변환 로직

FRED는 발표 **날짜**만 주고 **시각**은 주지 않는다. BLS(미국 노동통계국)가 CPI를 공식적으로
미국 동부시간 **08:30**에 발표한다는 것은 공개된 고정 스케줄이므로(추정치 아님, `market_hours.py`의
장 운영시간표와 같은 성격), 이 시각을 기준으로 `America/New_York` → `Asia/Seoul`로 실제 timezone
변환을 수행해 `publishedAt`(날짜)과 `time`(시각)을 계산한다. 다른 지표(PPI/GDP/고용/실업률)를
추가할 때는 `services/calendar.py`의 `_RELEASE_TIME_ET` 표에 해당 지표의 공식 발표 시각을 추가하면 됨
(모르는 지표는 표에 없으면 자동으로 `time=null` 처리).

## 5. 검증 결과 (STEP 9~11)

### STEP 9 — `scripts/seed_cpi.py` 실행: 성공

```
저장 완료: fred-CPIAUCSL-2026-07-01 | publishedAt=2026-08-12 time=21:30 | actual=332.813 previous=332.568 status=RELEASED
```

### STEP 10 — 저장 데이터 검증: 성공

DB에 실제로 저장된 row:

| 컬럼                      | 값                         | 비고                                                                                                     |
| ------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------- |
| `id`                      | `fred-CPIAUCSL-2026-07-01` | `fred-{series_id}-{observation_date}` 규칙                                                               |
| `publishedAt`             | `2026-08-12`               | FRED 실제 release date를 KST로 환산                                                                      |
| `time`                    | `21:30`                    | 08:30 ET(서머타임 EDT, UTC-4) → KST(UTC+9) 변환 결과, 검산 일치                                          |
| `region`                  | `미국`                     |                                                                                                          |
| `category`                | `CPI`                      |                                                                                                          |
| `title`                   | `미국 소비자물가지수(CPI)` | 최초 적재 시점 값. 8번 항목에서 대상 기간 표기를 추가해 현재는 `"미국 소비자물가지수(CPI) - 2026년 7월"` |
| `previous`                | `332.568`                  | FRED 실제 관측값                                                                                         |
| `actual`                  | `332.813`                  | FRED 실제 관측값                                                                                         |
| `importance`              | `null`                     | FRED 미제공                                                                                              |
| `forecast`                | `null`                     | FRED 미제공                                                                                              |
| `start_date` / `end_date` | `null`                     | 보류 규칙                                                                                                |
| `status`                  | `RELEASED`                 | `actual` 존재 → RELEASED                                                                                 |

- **UPSERT 검증**: `seed_cpi.py`를 두 번째 실행해도 같은 `id`라서 row 수는 계속 1개 유지 (중복 적재 없음 확인).

### STEP 11 — API 테스트: 성공

`uvicorn main:app`으로 로컬 서버를 띄워 실제 HTTP 요청 확인 (테스트 후 서버 종료).

**`GET /calendar/events?year=2026&month=9`**

- HTTP 200, `[]` (9월 데이터가 아직 없어서 빈 배열 — 정상)

**`GET /calendar/events?year=2026&month=8`** (실제 데이터가 있는 달, 검증용 추가 호출)

- HTTP 200
- 아래는 이 시점(최초 적재 직후) 스냅샷. title/summary가 대상 기간 없이 저장된 상태이며,
  8번 항목에서 이 문제를 다루고 개선했다.

```json
[
  {
    "id": "fred-CPIAUCSL-2026-07-01",
    "publishedAt": "2026-08-12",
    "start_date": null,
    "end_date": null,
    "time": "21:30",
    "region": "미국",
    "category": "CPI",
    "title": "미국 소비자물가지수(CPI)",
    "summary": "미국 소비자물가지수(CPI)는 미국에서 소비자가 구입하는 상품과 서비스의 가격 변화를 보여주는 대표적인 물가 지표입니다. 물가가 예상보다 높게 나오면 인플레이션 우려가 커지고 미국의 금리 인하 기대가 약해질 수 있어 주식시장에 부담으로 작용할 수 있습니다.",
    "importance": null,
    "previous": "332.568",
    "forecast": null,
    "actual": "332.813",
    "status": "RELEASED"
  }
]
```

## 6. 종합

| 단계                              | 결과 |
| --------------------------------- | ---- |
| STEP 9 (CPI 1회 적재)             | 성공 |
| STEP 10 (저장 데이터/UPSERT 검증) | 성공 |
| STEP 11 (API 실제 호출 테스트)    | 성공 |

## 7. title/summary 대상 기간(대상 월) 표기 추가

**문제**: `title`이 항상 `"미국 소비자물가지수(CPI)"`로 고정이라, 이 발표가 **몇 월 데이터인지**
캘린더 화면에서 알 수 없었다. FRED observation의 `date`(예: `"2026-07-01"`)는 **대상 기간**(그
값이 설명하는 달)이고, `release/dates`가 주는 날짜는 **발표일**(그 값이 공개된 날) — 이 둘은
다른 개념이며, `publishedAt`은 이미 발표일 기준으로 정확히 계산되고 있었다. 다만 대상 기간
정보가 어디에도 노출되지 않는 게 진짜 문제였다.

**검토했던 대안과 결정**:

| 대안                                                           | 채택 여부 | 이유                                                                                                                                                                                              |
| -------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start_date`/`end_date`에 대상 기간(예: 2026-07-01~07-31) 저장 | ❌        | 이 두 컬럼은 CLAUDE.md 10번 항목에서 "여러 날에 걸친 **이벤트**"(FOMC, 컨퍼런스) 용도로 이미 정의됨. "통계가 설명하는 기간"은 다른 개념이라 같은 컬럼에 넣으면 의미가 섞임 → **NULL 유지로 확정** |
| title에 대상 기간을 덧붙임                                     | ✅        | `"미국 소비자물가지수(CPI) - 2026년 7월"`. 컬럼 추가 없이 텍스트만으로 해결                                                                                                                       |
| summary 맨 앞에 대상 기간 안내 문장 추가                       | ✅        | `"2026년 7월 소비자물가지수(CPI) 자료입니다."` + 기존 summary                                                                                                                                     |

**구현 위치**: `services/calendar.py`에 `_PERIOD_LABELS` 표와 `_format_period_kr()` 함수 추가,
`ingest_cpi_from_fred()`에서 title/summary 조합 시 사용. 테이블 스키마, FRED 수집 로직,
`forecast`/`importance`/`actual` 값 생성 로직은 변경하지 않음.

**적용 후 실제 데이터** (재적재해서 확인):

```json
{
  "title": "미국 소비자물가지수(CPI) - 2026년 7월",
  "summary": "2026년 7월 소비자물가지수(CPI) 자료입니다. 미국 소비자물가지수(CPI)는 미국에서 소비자가 구입하는 상품과 서비스의 가격 변화를 보여주는 대표적인 물가 지표입니다. ..."
}
```

## 8. Response 구조 점검 (Next.js 캘린더 연동 기준, PPI 추가 전 예비 점검)

PPI를 추가하기 전에, 현재 `GET /calendar/events` 응답이 프런트 캘린더에서 바로 쓸 수 있는
구조인지 필드별로 점검한 결과.

| 필드                      | 프런트에서의 쓰임                                | 비고                                                                                                           |
| ------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `publishedAt`             | 캘린더에서 어느 날짜 칸에 이벤트를 배치할지 결정 | `'YYYY-MM-DD'`, 이미 KST 기준                                                                                  |
| `time`                    | 카드 상단 시각 표시 (`"21:30"`)                  | `HH:MM` 24시간제. `null`이면 프런트가 시각 미표기 처리 필요                                                    |
| `title`                   | 카드 제목                                        | 대상 기간 포함(`"... - 2026년 7월"`)이라 좁은 카드에서는 말줄임(ellipsis) 처리 고려 필요 (프런트 UI 판단 영역) |
| `category`                | 색깔별 카테고리 태그                             | 문자열 그대로 매핑 키로 사용 가능                                                                              |
| `region`                  | 국가 배지                                        | 현재 `"미국"` 고정                                                                                             |
| `summary`                 | 카드 본문/상세 설명                              | 대상 기간 안내 문장이 맨 앞에 포함됨                                                                           |
| `actual` / `previous`     | 상세 영역의 "실제값 / 이전값"                    | FRED 실측값, 항상 문자열                                                                                       |
| `forecast` / `importance` | 상세 영역의 "예상값 / 중요도"                    | 현재 항상 `null` → 프런트는 "-"로 표시 (CLAUDE.md 39·47번 원칙)                                                |
| `status`                  | 발표완료(`RELEASED`)/발표예정(`SCHEDULED`) 배지  | `actual` 유무와 사실상 연동되지만 별도 필드로 명시                                                             |
| `start_date` / `end_date` | (현재 미사용)                                    | CPI/PPI 등 단일 발표 지표에는 항상 `null`                                                                      |

**PPI 추가 시 프런트 영향**: 응답은 카테고리와 무관하게 항상 동일한 14필드 flat 구조이므로,
PPI가 추가돼도 배열에 `category: "PPI"` 항목이 하나 늘어날 뿐 JSON 구조 변경은 없음. 프런트는
카테고리별 색상 매핑에 `PPI` 항목만 추가하면 됨. 백엔드도 `services/calendar.py`의
`_TITLES`/`_SUMMARIES`/`_PERIOD_LABELS`/`_RELEASE_TIME_ET` 4개 표에 `"PPI"` 항목만 추가하면
되고, 라우터/스키마/테이블 변경은 불필요.

## 9. Git 브랜치 동기화 (원격 "연습" 커밋과의 충돌 해결)

`back/feat/calendar`에 push가 거부되는 문제가 있었다. 원인은 단순히 "뒤처짐"이 아니라, 원격에
`44acc3c "api연동 및 연습"`이라는 커밋이 로컬 히스토리에 없는 상태에서 정확히 같은 파일
(`main.py`, `routers/calendar.py`, `schemas/calendar.py`, `services/calendar.py`)을 건드려서
히스토리가 갈라져 있었다.

**확인 결과**: 이 커밋은 팀원이 아니라 본인이 다른 세션에서 미리 짜본 연습용 초안이었고, 내용도
대부분 주석 처리된 이전 시도들과 CLAUDE.md 스펙과 다른 구버전 `CalendarEvent` 스키마
(`date`/`country`/`importance: int` 등), CORS·스케줄러 없는 미완성 `main.py`였다.

**해결**: `git pull`로 병합한 뒤, 충돌난 4개 파일은 전부 이번 세션에서 완성한 버전으로 확정
(`git checkout --ours`)하고, 충돌 없이 병합 가능했던 `test_fred.py`(FRED 연결 테스트 스크립트),
`calendarPractice.py`(빈 파일), `.gitignore` 추가 내용은 그대로 살렸다. 병합 커밋을 만들어
push 완료. (`calendarPractice.py`는 이후 정리 과정에서 삭제됨.)

## 10. PPI(PPIACO) 구현

### FRED 데이터 확인 (구현 전 사전 검토)

| 항목                   | 값                                                 |
| ---------------------- | -------------------------------------------------- |
| Series ID              | `PPIACO`                                           |
| 지표명                 | Producer Price Index by Commodity: All Commodities |
| 주기                   | Monthly                                            |
| 단위                   | Index 1982=100 (Not Seasonally Adjusted)           |
| release_id             | 46 ("Producer Price Index", BLS 공식)              |
| 2026년 7월 실제 발표일 | `2026-08-13`                                       |

CPI와 동일하게 `series/observations`의 `date`는 대상 기간, `release/dates`의 `date`가 실제
발표일이며, BLS가 CPI와 같은 고정 시각(08:30 ET)에 발표한다는 공개된 사실을 그대로 적용해
KST로 변환했다.

### 구현 방식

`ingest_cpi_from_fred()` 내부 로직을 `_ingest_from_fred(category)` 공통 함수로 일반화하고,
`ingest_cpi_from_fred()` / `ingest_ppi_from_fred()`는 이 공통 함수를 호출하는 얇은 래퍼로
남겨서 기존 호출부(`scripts/seed_cpi.py`)에 영향이 없도록 했다. `_TITLES`, `_SUMMARIES`,
`_PERIOD_LABELS`, `_RELEASE_TIME_ET`, `_SERIES_IDS` 5개 표에 `"PPI"` 항목만 추가.
`scripts/seed_ppi.py`를 신규로 추가(수동 1회 적재, APScheduler 미사용). 테이블 스키마,
`GET /calendar/events` 라우터 구조는 변경하지 않았다.

### 검증 결과

- **PPI 실제 저장 데이터**:

```json
{
  "id": "fred-PPIACO-2026-07-01",
  "publishedAt": "2026-08-13",
  "time": "21:30",
  "region": "미국",
  "category": "PPI",
  "title": "미국 생산자물가지수(PPI) - 2026년 7월",
  "summary": "2026년 7월 생산자물가지수(PPI) 자료입니다. 미국 생산자물가지수(PPI)는 기업이 상품과 서비스를 생산하면서 받는 가격의 변화를 보여주는 지표입니다. 생산 단계의 물가 흐름을 확인할 수 있어 향후 소비자물가와 인플레이션 흐름을 판단할 때 참고합니다.",
  "importance": null,
  "previous": "286.279",
  "forecast": null,
  "actual": "284.057",
  "status": "RELEASED"
}
```

- `publishedAt`/`time`은 FRED의 실제 release date(`2026-08-13`)를 KST로 변환한 값 — 관측일을
  그대로 쓴 게 아님을 확인.
- `actual`/`previous`는 FRED 실측값 그대로, `forecast`/`importance`는 여전히 `null`.
- **CPI 회귀 테스트**: PPI 추가 후 `scripts/seed_cpi.py`를 재실행해도 CPI row(`publishedAt=2026-08-12`, `actual=332.813`)가 이전과 완전히 동일하게 유지됨을 확인.
- **`GET /calendar/events?year=2026&month=8`**: `HTTP 200`, CPI·PPI 두 이벤트가 `publishedAt` 오름차순(08-12, 08-13)으로 한 배열에 정상적으로 반환됨.

## 11. Next.js 연동 준비 단계 — Response 구조 최종 점검 (CPI+PPI)

PPI까지 추가된 상태에서 실제 응답을 다시 점검한 결과 (8번 항목의 예비 점검을 구체화).

- **캘린더 날짜 배치**: `publishedAt`으로 날짜 칸 결정, 칸 안에는 `time`/`category`/`title`로 카드 렌더링. `id`는 리스트 key.
- **클릭 시 상세 정보**: `title`, `summary`, `region`, `category`, `actual`, `previous`, `forecast`, `importance`, `status`, `time`. `start_date`/`end_date`는 항상 `null`이라 다일 이벤트가 생기기 전까지 미사용.
- **필드별 프런트 표시 방법**:
  - `status`: `RELEASED`→"발표완료", `SCHEDULED`→"발표예정" 배지로 프런트가 매핑 (백엔드 값은 영문 유지로 확정)
  - `actual`/`previous`: 값 있으면 그대로, `null`이면 "-"
  - `forecast`/`importance`: **현재 항상 `null`** → 반드시 "-" 또는 미표시 처리 (CLAUDE.md 27·28번, 값이 있는 것처럼 보이는 UI 금지)
- **현재 구조가 Next.js 연동에 충분한가**: 기본 캘린더 표시(날짜 배치, 카드, 상세 패널)에는 충분. 카테고리 추가(PPI)에도 응답 구조가 안 바뀌는 것을 실제로 확인함.
- **프런트에서 추가로 필요할 수 있는 필드 (제안만, 테이블 변경 필요해서 보류)**:
  1. 단위(unit) — CLAUDE.md 39번은 단위 표시를 요구하는데 현재 응답엔 단위 정보가 없음 (FRED는 `units` 메타데이터를 실제로 제공함)
  2. 대상 기간의 구조화된 값 — 지금은 "2026년 7월"이 `title`/`summary` 문자열 안에만 있어서 프런트가 따로 쓰려면 문자열 파싱 필요
  3. 국가 코드 — `region`이 이미 한국어 텍스트(`"미국"`)라 국기 아이콘 매핑 등에 쓰려면 별도 코드가 있으면 편함
- **백엔드 구조에서 향후 검토할 사항 (목록만, 아직 미수정)**:
  1. `main.py`의 CORS `allow_origins`가 `localhost:3000`만 허용 — 프런트 배포 도메인 추가 필요
  2. 단위 정보 부재 (위 1번과 동일 이슈)
  3. `title`/`summary`의 대상 기간이 자유 텍스트로만 존재 — 구조화된 필드 없음

## 12. Next.js 임시 연동 테스트 화면 (`/calendar-api-test`)

프런트엔드 팀의 실제 캘린더 화면(`frontend/app/calendar/page.tsx`, `components/ui/full-calendar.tsx`)은
아직 전달되지 않았지만, 백엔드 API가 정상 동작하는 것을 눈으로 확인하기 위해 완전히 분리된
임시 테스트 화면을 만들었다. **기존 프런트 작업물은 전혀 수정하지 않았다.**

### 사전 분석 결과

| 항목                  | 확인 결과                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Next.js 프로젝트 경로 | `frontend/` (저장소 최상위, `backend/`와 나란히 위치)                                                                                                |
| package.json          | `frontend/package.json`                                                                                                                              |
| Next.js 버전          | `16.2.6` (React `19.2.4`). `frontend/AGENTS.md`에 "이전에 알던 Next.js와 다르다, 코드 작성 전 번들 문서 확인" 경고 있음                              |
| 라우터 방식           | App Router (`frontend/app/`, `pages/` 디렉토리 없음)                                                                                                 |
| 기존 캘린더 컴포넌트  | 이미 존재함 — `app/calendar/page.tsx` + `components/ui/full-calendar.tsx` (더미 이벤트로 렌더링 중, 처음 공유된 캡처 화면과 동일). **수정하지 않음** |
| HTTP 클라이언트       | `axios` 미설치 — 네이티브 `fetch` 사용이 프로젝트 관례                                                                                               |
| 백엔드 주소           | `frontend/.env.example`의 `NEXT_PUBLIC_API_BASE_URL` 기본값이 `8080`으로 이미 지정돼 있어, 이 포트로 통일하기로 확정                                 |

### 구현

- `frontend/app/calendar-api-test/page.tsx` (신규) — `/calendar-api-test` 라우트. 서버 컴포넌트에서
  `fetch(NEXT_PUBLIC_API_BASE_URL + "/calendar/events?year=&month=")`를 직접 호출해 SSR로 렌더링.
  브라우저 클라이언트 코드가 없어 CORS 영향을 받지 않는다. `?year=&month=` 쿼리로 연/월 변경 가능,
  기본값은 실데이터가 있는 2026년 8월.
- `frontend/.env.local` (신규, `.gitignore`로 커밋 제외) — `NEXT_PUBLIC_API_BASE_URL=http://localhost:8080`
- `npm install`로 `frontend/node_modules` 최초 설치 (이전엔 설치돼 있지 않았음)

### 검증 결과

- `uv run uvicorn main:app --port 8080`(백엔드) + `npm run dev`(프런트, 포트 3000) 동시 기동 후 실제 호출.
- `GET /calendar-api-test?year=2026&month=8` → `HTTP 200`, CPI(`332.813`/`332.568`)·PPI(`284.057`/`286.279`) 카드가 title/summary/시각/상태까지 정상 렌더링됨을 SSR HTML과 Playwright 스크린샷으로 직접 확인.
- `GET /calendar-api-test?year=2026&month=9` → `HTTP 200`, "해당 연/월에는 이벤트가 없습니다" 정상 표시 (빈 배열 케이스).
- 기존 `/calendar` 라우트 → `HTTP 200`, 변경 없이 그대로 동작 확인 (영향 없음 재확인).

### 후속 조정

사용자 요청으로 화면의 "예상값(forecast) / 중요도(importance)" 표시 줄을 주석 처리함 — 두 필드 모두
FRED가 제공하지 않아 항상 `null`이라 테스트 화면에서 굳이 "-"로 노출할 필요가 없다고 판단. 필드
자체(타입 정의)는 남겨두고 화면 출력 JSX만 주석 처리했다. 재검증 결과 "실제값 / 이전값"만 정상
표시됨을 스크린샷으로 재확인.

## 13. 실제 프런트엔드 Calendar 연동 분석 (front/feat/calendar 병합 후)

프런트 팀의 실제 캘린더 화면(`front/feat/calendar` 브랜치 병합분)이 들어온 뒤, 백엔드
`GET /calendar/events`와 실제로 연결 가능한지 코드 기준으로 분석한 기록. **분석만 진행, 코드는
수정하지 않음.**

### 프런트 Calendar 관련 실제 파일

| 파일                                             | 역할                                                                          |
| ------------------------------------------------ | ----------------------------------------------------------------------------- |
| `frontend/app/(main)/calendar/page.tsx`          | 페이지 엔트리                                                                 |
| `frontend/app/(main)/calendar/calendar-view.tsx` | 메인 컴포넌트(월/주 뷰, 필터, 미니캘린더)                                     |
| `frontend/app/(main)/calendar/news-data.ts`      | **타입 정의 + mock 데이터** (`NewsItem`, `Category`, `MarketHoliday`, `NEWS`) |
| `frontend/app/(main)/calendar/news-panel.tsx`    | 날짜 클릭 상세 팝업                                                           |
| `frontend/lib/api/indicator.ts`                  | (타임라인 도메인) 실제 axios API 연동 선례                                    |
| `frontend/components/ui/full-calendar.tsx`       | 더 이상 안 쓰는 예전 더미 캘린더 잔재                                         |

### 프런트 `NewsItem` 타입 (실제 요구 데이터 구조)

```ts
type NewsItem = {
  id: string;
  title: string;
  summary: string;
  category: "macro" | "rate" | "dividend" | "earnings" | "optionExpiry"; // 5종 고정
  region: string; // 국가/기업명 겸용
  publishedAt: Date; // 날짜+시간 통합 (백엔드는 publishedAt/time 분리)
  highlight?: "special";
  replay?: boolean;
  url?: string;
  detail?: {
    forecast?: string;
    previous?: string;
    source?: string;
    sectors?: string[];
  };
};
```

`news-data.ts` 상단에 `/* 뉴스 데이터 — TODO: API 연동 시 NEWS 배열만 교체 */` 주석이 이미
있어, 프런트 팀이 이 지점을 연동 지점으로 스스로 열어둔 상태.

### 백엔드 ↔ 프런트 필드 비교

| 백엔드 필드                        | 프런트 대응                          | 상태                                                                                        |
| ---------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------- |
| `id`                               | `id`                                 | 이름 동일, 값 형식만 다름(문제 없음)                                                        |
| `publishedAt`(날짜) + `time`(시각) | `publishedAt`(날짜+시각 통합 `Date`) | 합쳐서 변환 필요                                                                            |
| `start_date`/`end_date`            | 없음                                 | 다일 이벤트 개념 자체가 프런트에 없음                                                       |
| `region`                           | `region`                             | 호환                                                                                        |
| `category`(지표 코드: `CPI`/`PPI`) | `category`(5종 그룹)                 | **값 불일치, 매핑표 필요** (`CPI`/`PPI`/`GDP`/`UNRATE`/`PAYEMS`→`macro`, `FEDFUNDS`→`rate`) |
| `title`/`summary`                  | `title`/`summary`                    | 호환                                                                                        |
| `importance`                       | 없음                                 | 항상 null이라 당장 문제 없음                                                                |
| `previous`/`forecast`              | `detail.previous`/`detail.forecast`  | 이름은 다르지만(중첩 구조) 매핑 가능                                                        |
| **`actual`**                       | **없음**                             | **UI에 실제값을 보여줄 자리가 아예 없음 — 가장 중요한 격차**                                |
| **`status`**                       | **없음**                             | RELEASED/SCHEDULED 구분 UI 없음                                                             |

### 발견된 주요 문제

1. 날짜/시간 구조 불일치 (분리 vs 통합)
2. `category` 값 완전 불일치 → 매핑표 필요
3. `actual`/`status`를 보여줄 화면 요소가 프런트에 없음 (프런트 팀과 별도 협의 필요)
4. timezone 처리 코드 없음 — 프런트는 "브라우저 로컬시간 = KST"라는 암묵적 가정에 의존 (date-fns만 사용, UTC/timezone 변환 로직 없음)
5. **환경변수 불일치**: `frontend/.env.local`이 `8080`인데, `.env.example`과 `lib/api/indicator.ts`의 실제 기본값은 `8000`으로 이미 바뀌어 있음 — 나중에 `8000`으로 통일 필요
6. HTTP 클라이언트는 fetch가 아니라 **axios**가 실제 팀 컨벤션(`indicator.ts` 기준, 이제 `package.json`에도 설치돼 있음)

### 현재 API 연결 상태

**mock 데이터만 사용 중.** `calendar-view.tsx`가 `news-data.ts`의 `NEWS` 정적 배열을 그대로 씀.
fetch/axios 호출 0건(grep 확인). Supabase 직접 호출도 프로젝트 전체에 0건.

### 연결 가능 여부 판단: **B. 간단한 데이터 매핑 후 연결 가능**

필드명이 상당수 동일(`id`/`region`/`title`/`summary`)하고 나머지도 이름만 바꾸거나 합치는
수준이라, 백엔드 스키마나 프런트 컴포넌트 구조를 바꿀 정도의 근본적 불일치는 없음. **백엔드는
지금 구조를 그대로 유지**하는 것으로 결론.

### 나중에 필요한 최소 수정사항 (아직 미적용)

- `news-data.ts`의 `NEWS` 상수를 "백엔드 응답 → `NewsItem[]` 변환 함수" 호출 결과로 교체
- `lib/api/calendar.ts` 신규 추가 (`indicator.ts`와 동일한 axios 패턴으로 `GET /calendar/events` 호출)
- `frontend/.env.local`을 `8000`으로 통일
- `calendar-view.tsx`/`news-panel.tsx`는 둘 다 `NEWS`라는 이름의 배열만 소비하므로, 위 두 파일만 추가/교체하면 **컴포넌트는 한 줄도 안 건드리고 연결 가능**
- `actual`/`status` 노출 여부는 프런트 팀과 UI 설계 협의 필요

### 전체 데이터 흐름 현황

| 단계                                                       | 상태                                                           |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| FRED → FastAPI Service → Supabase → `GET /calendar/events` | ✅ 완료                                                        |
| Next.js (axios 연동)                                       | 🟡 부분완료 — timeline 도메인만 연동, calendar 도메인은 미연동 |
| Calendar UI                                                | ❌ 미구현 — 100% mock 데이터                                   |

`Supabase → Next.js` 직접 연결은 없음(확인 완료, 목표 아키텍처 위반 없음).

## 14. 전체 카테고리 체계 재설계 (5개 대분류 확정 + 전체 이벤트 유형 매핑)

`category` 컬럼을 지표별 코드(`CPI`/`PPI`/...)가 아니라, 캘린더 색상 구분용 **5개 대분류
고정값**으로만 쓰기로 확정. 프런트 `NewsItem.category`(13번 항목에서 확인한 5종)와 정확히
동일한 값을 백엔드도 그대로 저장하는 방향.

```python
Literal["macro", "rate", "dividend", "earnings", "optionExpiry"]
```

### 전체 이벤트 유형 → category 매핑

| 지역        | 이벤트                                                | category       | 소스 상태                                                                                                   |
| ----------- | ----------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------- |
| 미국        | FOMC(회의/결정)                                       | `macro`        | ❓ 미정 — Federal Reserve 공식 캘린더 필요(FRED/KIS 둘 다 없음)                                             |
| 미국        | CPI                                                   | `macro`        | ✅ FRED, 구현 완료                                                                                          |
| 미국        | PPI                                                   | `macro`        | ✅ FRED, 구현 완료                                                                                          |
| 미국        | GDP                                                   | `macro`        | ✅ FRED, series_id `GDP` (다음 후보)                                                                        |
| 미국        | 고용지표(UNRATE/PAYEMS)                               | `macro`        | ✅ FRED (다음 후보)                                                                                         |
| 미국        | 기준금리(FEDFUNDS)                                    | `rate`         | ✅ FRED, series_id `FEDFUNDS` (다음 후보) — FOMC 회의 일정과는 다른 데이터(41번/CLAUDE.md 원문 경고 재확인) |
| 미국        | 증시 휴장일                                           | `macro`        | ❓ 미정 — FRED·KIS 둘 다 미국 시장 휴장일 데이터 없음(KIS `chk-holiday`는 한국 KRX 전용)                    |
| 미국        | 주요 기업 실적 발표(NVIDIA/Apple/MS/Oracle 등)        | `earnings`     | ❓ 미정 — KIS `estimate-perform`은 발표일 아님(기존 조사 결론 유지), 기업 IR 캘린더 등 별도 소스 필요       |
| 미국        | 선물 만기/옵션 만기/동시만기/월물옵션                 | `optionExpiry` | 🔧 API 없음, **규칙 계산으로 해결 가능**(예: 매월 세번째 금요일 등 고정 규칙)                               |
| 미국        | 기업/시장 이벤트(신제품 발표·GTC·CES·Investor Day 등) | `macro`        | ❓ 미정 — 뉴스/보도자료성 데이터, 정형화된 API 없음                                                         |
| 한국        | 기준금리                                              | `rate`         | ❓ 미정 — 한국은행 API/공지 필요                                                                            |
| 한국        | 주요 기업 실적 발표(삼성전자/SK하이닉스 등)           | `earnings`     | ❓ 미정 — DART 등 필요(KIS로는 발표일 확인 불가, 기존 조사 결론 유지)                                       |
| 한국        | 주요 금융 뉴스 / 정책·관세 뉴스                       | `macro`        | ❓ 미정 — 뉴스 API 필요                                                                                     |
| 한국        | 증시 휴장일                                           | `macro`        | ✅ KIS `chk-holiday`, 라이브 테스트 완료                                                                    |
| 한국        | 옵션 만기/선물 만기/동시만기                          | `optionExpiry` | 🔧 API 없음, 규칙 계산으로 해결 가능                                                                        |
| 한국        | 합병/분할                                             | `macro`        | ✅ KIS `ksdinfo/merger-split`, 라이브 테스트 완료                                                           |
| (지역 무관) | 배당                                                  | `dividend`     | ✅ KIS `ksdinfo/dividend`, 라이브 테스트 완료. 실데이터 없으면 임의 생성 안 함(원칙 유지)                   |

### ⚠️ 지난 KIS 설계안과 달라진 점 (재확인 필요)

10번 항목(KIS 설계)에서는 `IPO`, `MERGER_SPLIT`, `SHAREHOLDER_MEETING`을 **각각 별도
category 값**으로 제안했었다. 이번 5개 고정 category 체계에서는:

- **합병/분할**은 `macro`로 재배정됨(사용자 지시 목록에 명시)
- **공모주청약(IPO)**은 이번 전체 이벤트 목록에 아예 등장하지 않음 — "기업/시장 이벤트" 하위 예시로만 존재했던 원래 항목이라 `macro`에 포함되는 것으로 추정되나, 명시적 확인 필요
- **주주총회일정**도 이번 두 차례 지시 어디에도 등장하지 않음 — 계속 확장 대상에 포함할지, 이번 범위에서 제외할지 확인 필요

### Supabase 테이블 구조 변경 필요 여부 — 결론: **컬럼 추가 불필요**

현재 14개 컬럼만으로 위 표의 모든 이벤트 유형을 구조적으로 담을 수 있다고 판단한다. 근거:

| 컬럼                                        | 위 모든 유형에 왜 충분한가                                                                                                                                                                                                                                                         |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `region`                                    | **국가명만 사용**(`"미국"`/`"한국"`). 기업명은 `region`에 넣지 않고 `title`에 포함시킨다 — 예: `title="삼성전자 2026년 3분기 실적 발표"`, `region="한국"`. (13번 항목에서 확인한 프런트의 "국가/기업명 겸용" 방식과는 다른 선택 — 프런트 연동 매핑 단계에서 이 차이를 흡수해야 함) |
| `start_date`/`end_date`                     | FOMC 2일 회의, 합병/분할의 매매정지~신주상장 구간 등 다일 이벤트에 사용(원래 이 두 컬럼의 설계 목적)                                                                                                                                                                               |
| `previous`/`actual`/`forecast`/`importance` | 값이 있는 유형(지표, 기준금리, 배당금 등)엔 채우고, 없는 유형(휴장일, 만기일, 뉴스)엔 전부 `null` 유지 — 임의 생성 금지 원칙 그대로                                                                                                                                                |
| `title`/`summary`                           | 어떤 지표/이벤트인지 구체적으로 구분하는 역할을 전담(카테고리가 더 이상 이 역할을 안 하므로 더 중요해짐)                                                                                                                                                                           |

**대신 필요한 변경 2가지** (컬럼 추가 아님):

1. `category`에 5개 값만 허용하는 제약(Pydantic `Literal`, 필요하면 Postgres `CHECK` 제약)
2. **코드 내부 리팩터링**: 지난 턴(카테고리 이슈 발견)에서 확인한 대로, `services/calendar.py`의 `category`가 지금 "저장값"과 "내부 조회 키(indicator)"를 겸하고 있어서, 이 둘을 분리해야 함 — `indicator`("CPI"/"PPI"/"KR_HOLIDAY" 등, 코드 내부에서만 쓰는 세부 식별자) → `category`(5개 값, DB 저장용) 매핑표를 추가하는 구조로.

### 소스별 `id` 접두사 규칙 제안 (여러 API가 같은 테이블을 공유하므로)

| 소스                      | 접두사 예시                                                           |
| ------------------------- | --------------------------------------------------------------------- |
| FRED                      | `fred-{series_id}-{observation_date}` (기존 그대로)                   |
| KIS                       | `kis-{세부유형}-{종목코드 또는 all}-{날짜}` (10번 항목에서 이미 제안) |
| 규칙 계산(만기일 등)      | `rule-{세부유형}-{날짜}` (신규 제안)                                  |
| 향후 뉴스/IR 등 미정 소스 | 소스가 정해지면 그때 접두사 확정                                      |

서로 다른 접두사를 쓰는 한, 같은 `calendar_events` 테이블을 계속 공유해도 `id` 충돌 위험은 없다.

## 15. category → macro 통일 구현 + CPI/PPI 2026년 1~12월 일괄 수집

14번 항목에서 설계한 내용을 실제로 구현하고 실행한 기록.

### category 리팩터링 (indicator ≠ category 분리)

기존엔 `services/calendar.py`의 `category` 변수가 "DB에 저장할 값"과 "FRED series/제목/
발표시각을 찾는 내부 조회 키" 두 역할을 동시에 하고 있었다(13~14번 항목에서 발견한 문제). 아래처럼
분리했다.

```python
_SERIES_IDS  = {"CPI": "CPIAUCSL", "PPI": "PPIACO"}   # 내부 조회 키(indicator)는 그대로
_CATEGORY_OF = {"CPI": "macro", "PPI": "macro"}        # 신규: indicator -> 저장할 category
```

`_ingest_from_fred()`의 파라미터명도 `category` → `indicator`로 바꾸고, DB에는
`category=_CATEGORY_OF[indicator]`(즉 `"macro"`)를 저장하도록 수정. `scripts/seed_cpi.py`,
`scripts/seed_ppi.py`는 코드 변경 없이 그대로 이 새 로직을 타게 됨.

기존에 이미 저장돼 있던 2건(`fred-CPIAUCSL-2026-07-01`, `fred-PPIACO-2026-07-01`)의 `category`도
Supabase에서 직접 `"CPI"`/`"PPI"` → `"macro"`로 UPDATE(삭제 아님, 값만 변경)해서 앞으로의
데이터와 일관되게 맞춰뒀다.

### `core/fred_client.py` 확장 (기존 호출 방식엔 영향 없음, 파라미터 추가만)

- `get_series_observations()`: `observation_start`/`observation_end` 옵션 추가 → 특정 기간
  전체 관측치를 한 번에 조회 가능
- `get_release_dates()`: `realtime_start`/`realtime_end`/`include_release_dates_with_no_data`
  옵션 추가 → 이 마지막 옵션이 `True`여야 **아직 지나지 않은 미래 예정 발표일**까지 나온다
  (기본값 `False`일 땐 이미 지나간 발표일만 나옴 — 실제 라이브 호출로 확인한 FRED 자체 규칙)

### 연간 일괄 수집 함수: `ingest_year_from_fred(indicator, year)`

동작 방식:

1. 전년 12월분까지 포함해서 그 해 전체 관측치를 한 번에 조회(1월의 `previous` 계산용)
2. 그 해 전체 발표일(예정 포함)을 한 번에 조회 — PPI처럼 월 12개보다 발표일이 더 많이 나오는
   경우(특이 발표일)가 있어서, "각 관측월의 다음 달 1일 이후 최초로 오는 발표일"을 그 달의
   실제 발표일로 매칭하는 규칙을 사용(실제 데이터로 정확성 검증 완료)
3. 그 발표일에 대응하는 실제 관측값이 FRED에 있으면 `RELEASED`+실제값, 없으면(아직 발표 안 됨)
   `SCHEDULED`+`actual=null`
4. 예정 발표일 자체가 FRED 캘린더에 없는 달은 **아무것도 만들지 않고 건너뜀**(임의 날짜 생성 금지
   원칙)
5. `previous`는 RELEASED/SCHEDULED 관계없이, 그 시점까지 실제로 존재하는 가장 최근 관측값을 사용

`scripts/seed_2026_calendar.py`(신규)로 CPI/PPI 각각 이 함수를 호출.

### 실행 결과

```
CPI 2026년: 11건 upsert (1~11월)
PPI 2026년: 11건 upsert (1~11월)
```

**12월이 빠진 이유**: 12월분 발표는 보통 다음 해 1월에 나오는데, 조회 범위(2027년 2월까지)를
넉넉히 잡았는데도 FRED가 그 발표일을 아직 공개하지 않은 상태였다. 규칙대로 만들지 않고 건너뜀
— 의도한 동작.

### Supabase 최종 상태 (검증 완료)

- 전체 22건(CPI 11 + PPI 11), **전부 `category="macro"`**
- RELEASED 16건(1~8월, 실제 FRED 값), SCHEDULED 6건(9~11월, `actual=null`이지만 `previous`는
  최근 실측값으로 채워짐)
- `GET /calendar/events?year=2026&month=1~12`를 전부 실제 호출해서 월별 분포 확인(2월~12월
  각 2건씩 정상 반환. 1월만 0건이라 처음엔 버그로 의심했으나, **16번 항목에서 원인이 밝혀짐 —
  버그 아님**: `fred-CPIAUCSL-2026-01-01`(관측월은 1월)의 실제 `publishedAt`은 `2026-02-13`
  (발표는 다음 달에 되므로). 즉 "관측월이 1월인 이벤트"는 있어도 "1월에 실제로 발표되는
  이벤트"는 이번에 채운 범위(2026년 관측치만) 안에서는 존재하지 않는 게 정상 — 2025년 12월분
  데이터가 있었다면 그게 2026년 1월에 발표됐을 것

### Git 동기화

- 위 작업을 커밋(`d9fdee4`)한 뒤, 새로 올라온 `front/feat/calendar`(캘린더 UI 개선,
  `calendar-view.tsx`/`full-calendar.tsx` 등 7개 프런트 파일)를 병합 — 백엔드 파일과 전혀
  안 겹쳐서 충돌 없이 완료. 아직 원격에는 push하지 않은 상태.

## 16. GDP(분기별 지표) 추가 — CPI/PPI(월별)와 다른 처리 필요성 발견

GDP는 FRED에서 `frequency: "Quarterly"`로 확인됨. CPI/PPI와 같은 로직(1~12월 반복)을 그대로
쓰면 분기가 아닌 달에도 억지로 이벤트를 만들려고 시도하게 되므로(원래 CLAUDE.md가 경고했던
"GDP 월별 12개 임의 생성 금지"), 아래처럼 분리했다.

```python
_FREQUENCY = {"GDP": "quarterly"}  # 표에 없으면 monthly로 취급(CPI/PPI는 그대로)
```

`ingest_year_from_fred()`가 이 표를 보고 분기별이면 대상 기간을 1/4/7/10월만 순회하고,
`_format_period_kr()`도 지표를 보고 "2026년 9월" 대신 "2026년 3분기" 형태로 만든다.

### ⚠️ 실제 라이브 검증으로 발견한 중요한 문제와 해결

GDP는 분기당 발표가 **3번**(속보치→잠정치→확정치, BEA 관행) 있어서, "다음 분기 1일 이후
최초로 오는 release date"라는 기존 매칭 규칙(CPI/PPI에서는 잘 맞았음)을 그대로 쓰면 틀릴 수
있음을 실제로 확인했다.

- 2026년 1분기(Q1) GDP의 실제 최초 발표일을 FRED의 실시간(vintage) 데이터로 직접 검증한 결과
  **`2026-04-30`**이었는데, 단순 "다음 분기 시작 이후 최초 발표일" 규칙으로는 그 사이에 낀
  다른 발표일(`2026-04-09`, 아마도 직전 분기 확정치/연간 개정 관련)을 잘못 골랐을 것.
- **해결**: 실제 값이 존재하는(RELEASED) 기간에 한해, 후보 발표일들을 하나씩
  `realtime_start`/`realtime_end`로 고정해서 "그 시점 스냅샷에 이 관측값이 실제로 있는지"를
  라이브로 검증하고, 처음으로 값이 나타나는 날짜를 진짜 발표일로 채택하도록
  `ingest_year_from_fred()`를 수정. 아직 발표 안 된(SCHEDULED) 기간은 검증할 실제 값이
  없으므로 후보 중 가장 이른 날짜(=속보치 예정일)를 그대로 사용.
- 이 수정 덕분에 `core/fred_client.py`의 `get_series_observations()`에도 `realtime_start`/
  `realtime_end` 파라미터를 추가했다(기존 호출 방식에는 영향 없음).

### 실행 결과

```
GDP 2026년: 3건 upsert (1~3분기)
  fred-GDP-2026-01-01 | publishedAt=2026-04-30 | actual=31865.721 | status=RELEASED
  fred-GDP-2026-04-01 | publishedAt=2026-07-30 | actual=32486.066 | status=RELEASED
  fred-GDP-2026-07-01 | publishedAt=2026-10-29 | actual=None      | status=SCHEDULED
```

`publishedAt=2026-04-30`이 앞서 vintage 데이터로 직접 검증한 값과 정확히 일치함을 확인.
4분기는 발표일이 FRED에 아직 없어서(12월 케이스와 같은 이유) 생성되지 않음 — 의도한 동작.

`GET /calendar/events?year=2026&month=4` 실제 호출로 CPI(3월분)·PPI(3월분)·GDP(1분기)가 한
배열에 정상적으로 같이 나오는 것도 확인. `title`이 `"미국 국내총생산(GDP) - 2026년 1분기"`로
분기 표기가 정확히 적용됨.

### Supabase 최종 상태

전체 25건(CPI 11 + PPI 11 + GDP 3), 전부 `category="macro"`.

## 17. PAYEMS(비농업 고용) 추가

CPI/PPI와 동일한 월별·발표 1회 패턴인지 먼저 라이브로 확인: FRED `frequency: "Monthly"`,
release_id=50("Employment Situation", BLS), 2026년 발표일이 정확히 12개(월 1개씩, GDP 같은
특이 케이스 없음)로 확인됨 — 그대로 기존 `_ingest_from_fred`/`ingest_year_from_fred` 구조에
값만 추가.

```python
_RELEASE_TIME_ET["PAYEMS"] = dt_time(8, 30)   # BLS, CPI/PPI와 동일 기관·시각
_TITLES["PAYEMS"]          = "미국 비농업 고용(Nonfarm Payrolls)"
_PERIOD_LABELS["PAYEMS"]   = "비농업 고용"
_SERIES_IDS["PAYEMS"]      = "PAYEMS"
_CATEGORY_OF["PAYEMS"]     = "macro"
```

참고: release_id=50은 UNRATE(실업률)와 같은 "Employment Situation" 보고서를 공유한다 — 나중에
UNRATE 추가할 때 release_id 조회 결과가 PAYEMS와 같아도 정상이다.

### 실행 결과

```
PAYEMS 2026년: 11건 upsert (1~11월, 12월은 CPI/PPI와 같은 이유로 보류)
  fred-PAYEMS-2026-01-01 | publishedAt=2026-02-11 | actual=158592 previous=158432 status=RELEASED
  ...
  fred-PAYEMS-2026-08-01 | publishedAt=2026-09-04 | actual=159075 previous=158913 status=RELEASED
  fred-PAYEMS-2026-09-01 | publishedAt=2026-10-02 | actual=None   previous=159075 status=SCHEDULED
```

### Supabase 최종 상태

전체 36건(CPI 11 + PPI 11 + GDP 3 + PAYEMS 11), 전부 `category="macro"`.

## 18. UNRATE(실업률) 추가 + FEDFUNDS(연방기금금리) 보류 결정

### UNRATE

사전 확인 결과 PAYEMS와 완전히 같은 패턴(release_id=50 "Employment Situation" 공유, 월별 12개
발표일). 바로 표에 값만 추가.

```python
_RELEASE_TIME_ET["UNRATE"] = dt_time(8, 30)   # PAYEMS와 같은 보고서, 같은 기관·시각
_TITLES["UNRATE"]          = "미국 실업률"
_PERIOD_LABELS["UNRATE"]   = "실업률"
_SERIES_IDS["UNRATE"]      = "UNRATE"
_CATEGORY_OF["UNRATE"]     = "macro"
```

실행 결과: **11건 upsert(1~11월)**, publishedAt이 PAYEMS와 완전히 동일한 날짜로 확인됨(같은
보고서라 당연함). 참고로 2025-10분 관측치가 FRED에서 `"."`(값 없음)로 왔는데, 이번에 채운
2026년 범위의 `previous` 계산엔 영향 없음(2026년 1월의 previous는 2025년 12월 실측값을
정상적으로 사용함, 영향받는 건 2025년 11월분 계산이라 이번 범위 밖).

**Supabase 최종 상태**: 전체 47건(CPI 11 + PPI 11 + GDP 3 + PAYEMS 11 + UNRATE 11), 전부
`category="macro"`.

### FEDFUNDS — 이번 확장에서 제외 (사용자 결정, 추후 별도 논의)

실제 조회해본 결과 다른 5개 지표와 근본적으로 성격이 다름을 발견해서 구현 전에 확인받음.

- release_id=18 **"H.15 Selected Interest Rates"**(연준 자체 발표, BLS/BEA 아님)
- 월 1회가 아니라 **거의 매 영업일 발행**됨(2026년 1~3월만 조회해도 61건)
- 지금까지 쓴 "다음 달 1일 이후 최초 발표일 = 그 달의 발표일" 매칭 규칙을 그대로 적용하면
  "그 달의 첫 영업일"이 기계적으로 골라질 뿐, CPI처럼 "시장이 그 순간 처음 그 숫자를 알게 된
  날"이라는 의미가 없음
- 원래 CLAUDE.md의 "FEDFUNDS는 FOMC 회의 일정이 아니다" 경고와 같은 맥락 — FEDFUNDS를 CPI류의
  "발표 이벤트"로 다루는 것 자체가 애매함

**결정: 이번 확장 대상에서 제외, 추후 별도 논의.** `scripts/seed_2026_calendar.py`에도 포함하지
않았고 주석으로 제외 이유를 남겨둠. `_TITLES` 등 표에도 아직 추가 안 함.

## 19. 프런트엔드 `/calendar` 화면에 실데이터 임시 반영 (테스트 목적)

화면에 실제로 어떻게 뿌려지는지 눈으로 확인하기 위해, `frontend/app/(main)/calendar/news-data.ts`의
더미 `NEWS` 배열을 Supabase `calendar_events`의 실제 47건으로 교체했다. **사용자 확인 후 진행**
— 프런트는 다른 팀원이 계속 작업 중이라 원래는 건드리지 않기로 했던 파일이라, 진행 전 범위를
명확히 확인받았다(구조는 유지, 데이터 내용만 교체, `back/feat/calendar`에 올리는 것도 괜찮다는
확인).

### 변경 범위

- **바꾼 것**: `NEWS` 배열의 내용물만. Supabase 47건(CPI 11 + PPI 11 + GDP 3 + PAYEMS 11 +
  UNRATE 11)을 `NewsItem[]` 형태로 변환해서 그대로 채워 넣음.
- **안 바꾼 것**: `Category`/`NewsItem`/`MarketHoliday` 타입, `CAT`/`CATEGORY_GROUPS` 정의,
  `scopeOf`/`countryCodeOf` 함수, `MARKET_HOLIDAYS` 더미 데이터, `calendar-view.tsx`,
  `news-panel.tsx` — 컴포넌트/구조는 전혀 건드리지 않음.

### 변환 규칙 (백엔드 `CalendarEvent` → 프런트 `NewsItem`)

| 백엔드 필드                            | 처리                                                                                                        |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `publishedAt` + `time`                 | `new Date("YYYY-MM-DDTHH:mm:00")`로 합침(13번 항목에서 설계한 방식)                                         |
| `category`                             | 이미 전부 `"macro"`로 저장돼 있어서 값 그대로 사용(15번 항목의 category 리팩터링 덕분에 별도 매핑표 불필요) |
| `region`                               | 그대로 사용(끝에 공백이 붙어있던 CPI 1건은 `.strip()`으로 정리, DB 값 자체는 안 건드림)                     |
| `title`, `summary`                     | 그대로 사용                                                                                                 |
| `previous`                             | 값이 있을 때만 `detail.previous`로                                                                          |
| `forecast`                             | 전부 null이라 `detail.forecast` 자체를 만들지 않음(빈 키 생성 안 함)                                        |
| `actual`, `status`                     | **대응 필드가 프런트에 없어서 반영 못 함** — 13번 항목에서 이미 확인한 한계 그대로                          |
| `importance`, `start_date`, `end_date` | 전부 null/미사용이라 반영 대상 없음                                                                         |

### 진행 상태

파일 교체까지 완료. 사용자가 "문서로만 알려달라"고 해서 **개발 서버 실행/스크린샷/커밋·push는
하지 않고 여기서 멈춤.** 다음 확인이 필요하면:

```
frontend/ 에서 npm run dev 실행 후 /calendar 접속
```

## 20. 주식 초보자에게 필요한 FRED 일정 후보 정리

"FRED에서 주식 시작하는 사람이 알아야 할 일정 중 필요한 것"을 정리해달라는 요청으로, 후보
시리즈들을 실제로 FRED에 존재하는지 하나씩 라이브로 확인했다. 순수 조사/문서 작업이며 코드는
건드리지 않았다.

### 이미 구현됨

| Series ID  | 지표                | 이유                                                          |
| ---------- | ------------------- | ------------------------------------------------------------- |
| `CPIAUCSL` | 소비자물가지수(CPI) | 인플레이션의 대표 지표, 금리 방향을 가늠하는 가장 중요한 숫자 |
| `PPIACO`   | 생산자물가지수(PPI) | CPI보다 하루 먼저 나오는 물가 선행지표                        |
| `GDP`      | 국내총생산(GDP)     | 경제가 성장하는지 축소하는지 보여주는 가장 큰 그림            |
| `UNRATE`   | 실업률              | 고용시장 체력, 연준 금리 결정의 핵심 근거                     |
| `PAYEMS`   | 비농업 고용         | 매달 가장 시장이 크게 반응하는 지표 중 하나(첫째 주 금요일)   |

### 실제 FRED에 존재함 — 추가 후보 (라이브로 확인 완료)

| Series ID            | 지표                         | 주기                  | 초보자에게 중요한 이유                                                                                                     |
| -------------------- | ---------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `PCEPI` / `PCEPILFE` | PCE 물가지수(근원 포함)      | 월별                  | **연준이 금리 결정 시 CPI보다 더 공식적으로 참고하는 물가 지표.** "연준이 진짜로 보는 물가"라고 소개하기 좋음              |
| `ICSA`               | 신규 실업수당 청구건수       | **주별**(매주 목요일) | 매주 나오는 몇 안 되는 지표라 고용시장 변화를 가장 빨리 감지할 수 있음. 초보자에게 "매주 확인하는 습관"을 들이기 좋은 지표 |
| `UMCSENT`            | 미시간대 소비자심리지수      | 월별                  | 소비자들이 경기를 어떻게 느끼는지 보여줌. 미국 경제의 약 70%가 소비이므로 중요                                             |
| `MICH`               | 미시간대 기대인플레이션율    | 월별                  | "사람들이 앞으로 물가가 오를 거라 믿는지" — 실제 인플레이션에 선행하는 심리 지표                                           |
| `RSAFS`              | 소매판매                     | 월별                  | 소비 동향을 직접 보여주는 지표, 경기소비재·유통주와 관련                                                                   |
| `INDPRO`             | 산업생산지수                 | 월별                  | 제조업 경기 판단 지표                                                                                                      |
| `HOUST`              | 신규 주택착공건수            | 월별                  | 부동산·건설 경기 판단, 금리 민감 업종과 직결                                                                               |
| `CSUSHPINSA`         | S&P/케이스-실러 주택가격지수 | 월별                  | 집값 흐름 — 가계 자산과 소비 여력에 영향                                                                                   |

### FRED에서 구할 수 없음 (확인됨)

| 항목           | 확인 결과                                                                                                                                                                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ISM 제조업 PMI | `series_id=NAPM` 조회 시 **400 오류** — ISM 데이터는 라이선스 문제로 FRED가 직접 제공하지 않음. 프런트 더미 데이터에 "ISM 제조업지수"가 있었는데, FRED로는 구현 불가 — 별도 소스(ISM 직접 구독 등) 필요 |

### 존재는 하지만 "발표 이벤트"로 쓰기엔 부적합함 (FEDFUNDS와 같은 문제)

| Series ID  | 지표                   | 문제                                                                 |
| ---------- | ---------------------- | -------------------------------------------------------------------- |
| `DGS10`    | 미국 10년물 국채금리   | **매 영업일** 발행 — FEDFUNDS처럼 "이 날 발표됐다"는 이벤트성이 없음 |
| `T10Y2Y`   | 10년-2년 금리 스프레드 | 위와 동일(매 영업일)                                                 |
| `DTWEXBGS` | 달러인덱스             | 위와 동일(매 영업일)                                                 |

이 3개는 18번 항목의 FEDFUNDS 결론과 같은 이유로, 캘린더 "이벤트"보다는 종목 상세 페이지 등의
**배경 참고 데이터(차트용)**로 쓰는 게 더 맞아 보인다.

### 제안 우선순위 (다음에 추가한다면)

1. **`ICSA`(신규 실업수당 청구)** — 주별이라 "매주 확인" 습관을 들이기 좋고, 구현 난이도도 월별
   지표와 동일(release_id만 다름)
2. **`PCEPI`/`PCEPILFE`** — CPI 다음으로 시장이 가장 신경 쓰는 물가 지표. CLAUDE.md 원래
   대상엔 없었지만 "연준이 보는 물가"라는 설명으로 초보자 교육 가치가 큼
3. `UMCSENT`/`MICH`, `RSAFS`, `INDPRO`, `HOUST`, `CSUSHPINSA` — 나머지는 우선순위 낮게 순차
   확장

## 21. PCE(개인소비지출 물가지수) 추가

20번 항목에서 조사한 후보 중 우선순위 2위(연준이 CPI보다 공식적으로 더 참고하는 물가 지표)를
바로 구현. series_id `PCEPI`, release_id=54("Personal Income and Outlays", BEA).

### 사전 확인 — GDP와 발표 캘린더를 공유함

PCEPI의 2026년 release/dates가 **GDP(release_id=53)의 날짜와 완전히 동일**함을 확인했다
(1/22, 2/20, 3/13, 4/9, 4/30, ... 전부 일치). BEA가 GDP와 PCE를 같은 날 같이 발표하기 때문.
GDP처럼 한 기간에 여러 후보 발표일이 섞여 있는 구조라, 16번 항목에서 만든 "실측 검증"(candidate
발표일들을 realtime으로 고정해서 실제로 값이 등장하는 첫 날짜를 찾는 로직)이 정확히 필요한
케이스였다 — 별도 코드 추가 없이 `ingest_year_from_fred()`가 기존 로직 그대로 처리함.

```python
_RELEASE_TIME_ET["PCE"] = dt_time(8, 30)   # BEA, GDP와 같은 기관·시각
_TITLES["PCE"]          = "미국 개인소비지출 물가지수(PCE)"
_PERIOD_LABELS["PCE"]   = "개인소비지출(PCE) 물가지수"
_SERIES_IDS["PCE"]      = "PCEPI"
_CATEGORY_OF["PCE"]     = "macro"
```

### 실행 결과 — 실측 검증이 실제로 후보를 정정한 사례

```
PCE 2026년: 11건 upsert (1~11월)
  fred-PCEPI-2026-01-01 | publishedAt=2026-03-13 | actual=129.023 previous=128.576 status=RELEASED
  ...
  fred-PCEPI-2026-07-01 | publishedAt=2026-08-26 | actual=131.659 previous=131.454 status=RELEASED
  fred-PCEPI-2026-08-01 | publishedAt=2026-09-30 | actual=None   previous=131.659 status=SCHEDULED
```

1월분 데이터의 경우, "다음 달 1일 이후 최초 후보"만 썼다면 `2026-02-20`이 골라졌을 텐데(그 날짜엔
아직 1월분 PCE 값이 없음, GDP 쪽 특이일로 추정), 실측 검증이 실제로 값이 등장하는 `2026-03-13`을
정확히 찾아냄. GDP 때 만든 로직이 다른 지표에서도 그대로 유효함을 재확인.

### Supabase 최종 상태

전체 58건(CPI 11 + PPI 11 + GDP 3 + PAYEMS 11 + UNRATE 11 + PCE 11), 전부 `category="macro"`.

## 22. 한국투자증권(KIS) API에서 가져올 수 있는 일정 정리 (종합)

지금까지 여러 턴에 걸쳐 조사·라이브 검증한 KIS 일정 관련 API를 한 곳에 모아 정리. **순수
문서 작업이며 코드는 건드리지 않았다.** 전부 실제 계정으로 라이브 호출해서 확인한 내용이다
(core/kis_client.py의 `get_access_token()` 재사용, 새 토큰 발급 없이 캐시 재사용).

### 사용 가능함 (실제 라이브 호출로 확인 완료)

| #   | 일정                  | endpoint                                                  | TR_ID           | 5개 category 중                                                          | 실데이터 예시(핵심 필드만)                                                                                      |
| --- | --------------------- | --------------------------------------------------------- | --------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| 1   | 한국 증시 휴장일      | `GET /uapi/domestic-stock/v1/quotations/chk-holiday`      | `CTCA0903R`     | `macro`                                                                  | `{bass_dt, opnd_yn}` — 개장일 여부만 있음, 날짜만 있고 시각 없음                                                |
| 2   | 배당일정              | `GET /uapi/domestic-stock/v1/ksdinfo/dividend`            | `HHKDB669102C0` | `dividend`                                                               | `{record_date, sht_cd, isin_name, divi_kind, per_sto_divi_amt, divi_rate, divi_pay_dt}`                         |
| 3   | 합병/분할일정         | `GET /uapi/domestic-stock/v1/ksdinfo/merger-split`        | `HHKDB669104C0` | `macro`                                                                  | `{record_date, sht_cd, cust_nm, merge_type, merge_rate, td_stop_dt, list_dt}`                                   |
| 4   | 주주총회일정          | `GET /uapi/domestic-stock/v1/ksdinfo/sharehld-meet`       | `HHKDB669111C0` | **미정** (5개 중 마땅한 값 없음, earnings에 가깝다는 의견 있으나 미확정) | `{record_date, sht_cd, isin_name, gen_meet_dt, gen_meet_type, agenda}`                                          |
| 5   | 공모주청약일정(IPO)   | `GET /uapi/domestic-stock/v1/ksdinfo/pub-offer`           | `HHKDB669108C0` | **미정** (5개 중 마땅한 값 없음)                                         | `{record_date, sht_cd, isin_name, fix_subscr_pri, subscr_dt("시작~종료" 문자열), pay_dt, list_dt, lead_mgr}`    |
| 6   | 국내주식 종목추정실적 | `GET /uapi/domestic-stock/v1/quotations/estimate-perform` | `HHKST668300C0` | **캘린더 부적합**                                                        | 날짜(이벤트 시점) 자체가 없는 "현재 시점 추정치" 데이터라 애초에 calendar_events에 안 맞음(10번 항목 결론 유지) |

⚠️ **1번(휴장일)은 KIS 공식 주석에 "하루 1회 이하로 호출" 제한이 명시돼 있음** — 자동 수집 시 반드시 캐싱 필요.

### KIS에 없는 것 (확인됨)

| 항목                                                      | 결과                                                                                                                                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 한국 선물 만기 / 한국 옵션 만기 / 한국 옵션·선물 동시만기 | 전용 API 없음(공식 저장소 전수 검색 결과 없음). 보통 "매월 둘째 주 목요일" 같은 고정 규칙 계산으로 해결 가능(20번 항목의 FEDFUNDS/DGS10과 비슷하게, API가 아니라 규칙으로 풀어야 하는 케이스) |
| 삼성전자/SK하이닉스 등 기업 실적 **발표일**               | `estimate-perform`은 추정치 API일 뿐 발표일 필드가 없음 — DART 등 별도 소스 필요(이전 조사 결론 유지)                                                                                         |
| 한국 기준금리(한국은행 금통위 결정)                       | **KIS 안에서 전용 API를 아직 찾아보지 않음** — 확인 필요 항목으로 남겨둠(임의로 "없다"고 단정하지 않음)                                                                                       |
| 주요 금융 뉴스 / 정책·관세 뉴스                           | KIS는 증권 시세·공시 데이터 API라 뉴스 API 자체가 없음                                                                                                                                        |

### 구현 시 참고할 것 (이미 정해진 원칙 재확인)

- **ORM 미사용**: 지금까지와 동일하게 `services/calendar.py`가 raw SQL로 직접 upsert
- **id 접두사**: `kis-{세부유형}-{종목코드 또는 all}-{날짜}` (9번 항목에서 이미 제안, fred- 접두사와 충돌 없음)
- **category**: 위 표처럼 5개 중 5번(휴장일)과 4번(합병/분할)은 이미 확정(`macro`), 2번(배당)도
  확정(`dividend`). 주주총회·IPO 2개만 아직 미정 — 실제 KIS 데이터 연동 코드를 작성하는 시점에
  다시 확인하기로 함(사용자 확인: "지금은 안 중요, KIS 연동할 때 다시 물어봐라")
- **날짜/시간**: 전부 날짜만 있고 시각 정보가 없음 → `time`은 항상 `null` (임의 생성 금지 원칙 그대로 적용)
- **previous/actual/forecast**: FRED 지표들과 달리 이 KIS 일정들은 "수치 발표" 개념이 아니라
  "이벤트 발생" 개념에 가까움(예: 주주총회가 "열린다"는 사실 자체가 중요, 숫자 비교가 핵심이
  아님) → 대부분 previous/actual/forecast는 null로 두고 summary 텍스트로 내용 전달하는 게 맞을
  가능성이 높음(배당만 예외로 실제 배당금액을 actual에 넣는 안이 있었음, 10번 항목 참고)

## 23. KIS 배당일정 구현 — 첫 번째 KIS 연동 (`category="dividend"`)

지금까지는 설계·조사만 했던 KIS 연동을 실제로 구현. 전체 종목 조회는 페이지당 100건 제한이 있어서
(22번 항목에서 확인), 주요 국내 기업 29개로 범위를 좁혀 종목코드 지정 조회 방식으로 구현했다.

### 신규/수정 파일

| 파일                                   | 내용                                                                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/kis_client.py`                   | `get_dividend_schedule(f_dt, t_dt, sht_cd, gb1)` 추가(기존 함수 3개는 그대로)                                                                         |
| `services/calendar.py`                 | `_clean_kis_value`/`_clean_kis_date`(KIS 전용 빈값 정리), `_dividend_event_from_kis`(변환), `ingest_dividends_from_kis(stock_codes, f_dt, t_dt)` 추가 |
| `scripts/seed_kis_dividends.py` (신규) | 시가총액 상위 위주 코스피 29개 종목 리스트 + 실행 스크립트                                                                                            |

### 변환 규칙 (KIS 레코드 → CalendarEvent)

| 필드                               | 값                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `id`                               | `kis-dividend-{종목코드}-{record_date}` (fred- 접두사와 충돌 없음)                                                |
| `publishedAt`                      | `record_date`(배당기준일, "YYYYMMDD"→"YYYY-MM-DD")                                                                |
| `time`                             | 항상 `null` (KIS에 시각 정보 없음)                                                                                |
| `region`                           | `"한국"` 고정, 회사명은 `title`에 (9/14 결정 사항 그대로 적용)                                                    |
| `category`                         | `"dividend"`                                                                                                      |
| `title`                            | `"{종목명} 배당기준일({배당구분})"`                                                                               |
| `summary`                          | 배당금액이 있으면 "주당 N원 배당 예정", 없으면 "배당금액은 아직 확정되지 않았습니다" + 지급예정일(있으면)         |
| `actual`                           | `per_sto_divi_amt`(주당배당금), 미확정이면 `null`                                                                 |
| `previous`/`forecast`/`importance` | 항상 `null` (해당 개념 없음)                                                                                      |
| `status`                           | `publishedAt`이 오늘(KST) 이후면 `SCHEDULED`, 지났으면 `RELEASED` (22번 항목에서 제안한 날짜 기반 규칙 최초 적용) |

**`divi_rate`는 의도적으로 안 씀** — 실제 라이브 데이터로 확인해보니 이 필드가 시가 기준이 아니라
**액면가 대비 배당률**이었다(삼성전자: 주당 374원 / 액면가 100원 = "374.00%"로 표시됨). 초보자가
보면 "배당율 374%"로 오해할 수 있어서, 주식 초보자 혼동 방지 원칙(CLAUDE.md 47번)에 따라
summary에서 제외하고 실제 배당금액(원)만 보여주기로 판단.

### 실행 결과

```
=== KIS 배당일정 29개 종목 조회, 42건 upsert ===
  kis-dividend-005930-20260630 | actual=374  status=RELEASED | 삼성전자 배당기준일(분기)
  ...
  kis-dividend-055550-20261103 | actual=None status=SCHEDULED | 신한금융지주회사 배당기준일(분기)
```

29개 종목 중 8개(삼성바이오로직스, 셀트리온, 한화에어로스페이스, 삼성물산, 메리츠금융지주,
SK이노베이션, 삼성생명, 한국전력)는 2026년 기준 배당 레코드가 0건으로 조회됨(KIS에 해당 데이터가
없다는 뜻 — 임의로 채우지 않음).

`GET /calendar/events?year=2026&month=8` 실제 호출로 macro(FRED)와 dividend(KIS) 데이터가 한
응답 배열에 정상적으로 섞여서 나오는 것 확인 완료.

### 참고 — 회사명 표기

KIS `isin_name`은 정식 등기명이라 일반적으로 알려진 종목명과 다를 수 있다(예: "SK하이닉스"가
아니라 "에스케이하이닉스", "NAVER"가 아니라 "네이버", "HD현대중공업"이 아니라
"에이치디현대중공업"). 지금은 KIS가 주는 이름을 그대로 쓰고 있는데, 사용자에게 익숙한 이름으로
바꾸려면 별도의 종목명 매핑표가 필요하다 — 지금은 임의로 이름을 바꾸지 않았다.

### Supabase 최종 상태

전체 100건(macro 58 + dividend 42).

## 24. KIS 합병/분할일정 구현 — `start_date`/`end_date` 첫 실사용

배당과 달리 전체 시장 조회(SHT_CD 빈값)로도 2026년 30건뿐이라 페이지 제한에 안 걸림을 먼저 확인
후, 종목코드 없이 전체 조회 한 번으로 구현.

### 신규/수정 파일

| 파일                                       | 내용                                                                                                                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `core/kis_client.py`                       | `get_merger_split_schedule(f_dt, t_dt, sht_cd)` 추가(기존 함수는 그대로)                                                                                                |
| `services/calendar.py`                     | `_clean_kis_date_compact`(구분자 없는 "YYYYMMDD" 파서), `_split_kis_date_range`(기간 문자열 분리), `_merger_split_event_from_kis`, `ingest_merger_splits_from_kis` 추가 |
| `scripts/seed_kis_merger_splits.py` (신규) | 전체 시장 조회 실행 스크립트                                                                                                                                            |

### 변환 규칙 (KIS 레코드 → CalendarEvent)

| 필드                               | 값                                                                                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                               | `kis-mergersplit-{종목코드}-{record_date}-{seq}` — `seq`를 포함한 이유는 회사분할 시 한 레코드가 여러 신설 종목코드로 나뉘어 같은 날짜에 여러 건 생기기 때문(예: 한화머시너리앤서비스홀딩스 분할이 000880/000885/00088K 3건으로 옴 — 실제 확인됨) |
| `publishedAt`                      | `record_date`                                                                                                                                                                                                                                     |
| **`start_date`/`end_date`**        | `td_stop_dt`(매매정지 기간, "YYYY/MM/DD ~ YYYY/MM/DD" 또는 "YYYY/MM/DD ~") 파싱 결과. **CLAUDE.md가 다일 이벤트용으로 예비해둔 이 두 컬럼을 프로젝트에서 처음으로 실사용**                                                                        |
| `category`                         | `"macro"` (14번 항목 결정 그대로)                                                                                                                                                                                                                 |
| `title`                            | `"{cust_nm} {merge_type}"` (예: "휴맥스 흡수합병")                                                                                                                                                                                                |
| `summary`                          | 관련 회사(`opp_cust_nm`), 비율(`merge_rate`), 매매정지 기간, 신주상장일(`list_dt`) 중 있는 것만 문장으로 조합                                                                                                                                     |
| `actual`                           | `merge_rate`(합병/분할 비율), 없으면 `null`                                                                                                                                                                                                       |
| `previous`/`forecast`/`importance` | 항상 `null`                                                                                                                                                                                                                                       |
| `status`                           | 배당과 동일하게 날짜 기반(`publishedAt` 기준 과거/미래)                                                                                                                                                                                           |

`cust_nm`(이 종목)과 `opp_cust_nm`(관련 회사) 중 어느 쪽이 "흡수하는 쪽"인지 필드명만으로는
단정할 수 없어서, title/summary에서 방향성(A가 B를 흡수한다 등)은 주장하지 않고 사실 관계만
기술했다 — 임의 추론 금지 원칙 적용.

### 실행 결과

```
=== KIS 합병/분할일정: 30건 upsert ===
  kis-mergersplit-028080-20260930-0 | start_date=2026-09-29 end_date=None       | 휴맥스 흡수합병
  kis-mergersplit-082640-20260810-0 | start_date=2026-08-07 end_date=2026-08-30 | 우리금융지주 주식교환
  ...
```

`merge_type`은 "흡수합병"/"회사분할"/"주식교환"/"분할합병" 등 KIS가 이미 한국어로 제공하는 값을
그대로 사용.

### Supabase 최종 상태

전체 130건(macro 88 + dividend 42).

## 25. KIS 신규상장(IPO)/유상증자/무상증자 구현

### ⚠️ "신규상장" 관련 확인 필요 사항

KIS에 "상장정보일정"(`ksdinfo/list-info`)이라는 API가 따로 있는데, 실제로 호출해보니 이건
**진짜 신규 IPO가 아니라 전환사채(CB)/신주인수권(BW) 행사·스톡옵션 행사로 인한 기존 상장사의
추가 주식 상장**이었다(`issue_type` 값이 "국내CB행사"/"국내BW행사"/"STOCKOPTION행사" 등으로
확인됨). 일반적으로 "신규상장"이라 하면 IPO(기업공개)를 뜻하므로, **이미 조사해둔
`ksdinfo/pub-offer`(공모주청약일정)를 "신규상장"으로 구현했다.** `list-info`는 다른 성격의
데이터라 이번엔 구현하지 않음 — 필요하면 별도로 다시 논의.

### 신규/수정 파일

| 파일                                           | 내용                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `core/kis_client.py`                           | `get_ipo_schedule`, `get_paidin_capital_increase_schedule`, `get_bonus_issue_schedule` 3개 추가(기존 함수는 그대로) |
| `services/calendar.py`                         | 각각의 변환 함수(`_ipo_event_from_kis` 등)와 ingest 함수(`ingest_ipos_from_kis` 등) 3세트 추가                      |
| `scripts/seed_kis_corporate_actions.py` (신규) | 셋을 한 번에 실행하는 스크립트                                                                                      |

### 조회 방식 (엔드포인트별 데이터량에 맞춰 다르게 선택)

| 일정          | endpoint               | TR_ID           | 2026년 건수                          | 조회 방식                                                                    |
| ------------- | ---------------------- | --------------- | ------------------------------------ | ---------------------------------------------------------------------------- |
| 신규상장(IPO) | `ksdinfo/pub-offer`    | `HHKDB669108C0` | 43건                                 | 전체 시장(페이지 제한 안 걸림, 라이브 확인)                                  |
| 유상증자      | `ksdinfo/paidin-capin` | `HHKDB669100C0` | 82건                                 | 전체 시장(마찬가지로 안 걸림)                                                |
| 무상증자      | `ksdinfo/bonus-issue`  | `HHKDB669101C0` | 100건(전체 조회 시 페이지 제한 도달) | 주요 기업 29개 종목코드 지정 조회(배당일정과 동일 방식) — 결과 1건(셀트리온) |

### category 판단

세 가지 다 "기업 주식구조 변경" 이벤트로 보고 **`"macro"`**로 저장했다. 5개 고정 카테고리 중
확정된 지침이 없어서, 24번 항목의 합병/분할과 같은 논리(마땅한 카테고리가 없으면 macro로 묶음)를
그대로 적용한 판단 — 확정 사항 아님, 필요하면 재논의.

### 변환 규칙 요약

| 일정     | `start_date`/`end_date`    | `actual`에 넣은 값                                                                       |
| -------- | -------------------------- | ---------------------------------------------------------------------------------------- |
| IPO      | `subscr_dt`(청약기간) 파싱 | `fix_subscr_pri`(공모가)                                                                 |
| 유상증자 | `sub_term`(청약기간) 파싱  | `fix_rate`(신주배정비율 %) — `fix_price`(확정발행가)는 대부분 "0"(미확정)이라 채택 안 함 |
| 무상증자 | 없음(해당 필드 없음)       | `fix_rate`(신주배정비율 %)                                                               |

### 실행 결과

```
=== 신규상장(IPO): 43건 upsert ===
=== 유상증자: 82건 upsert ===
=== 무상증자: 1건 upsert ===   (주요기업 29개 중 셀트리온만 2026년 무상증자 있음)
```

`GET /calendar/events?year=2026&month=9` 실제 호출로 FRED 지표·배당·IPO·유상증자가 한 응답에
정상적으로 섞여 나오는 것 확인 완료(예: "엔에이치스팩34호 공모주 청약", "에스케이디앤디
유상증자", "미국 비농업 고용" 등이 같은 배열에 같이 있음).

### Supabase 최종 상태

전체 256건(macro 214 + dividend 42).

## 26. 유상증자/무상증자 캘린더 제외 결정

25번 항목 직후, "신규상장/유상증자/무상증자가 초보 투자자에게 얼마나 중요한가"를 물어봐서 아래
의견을 드렸고, 그대로 확정됐다.

- **IPO는 유지** — 한국 개인투자자에게 "공모주 청약"은 관심도가 매우 높은 항목
- **유상증자/무상증자는 제외** — 유상증자는 기존 주주 입장에서 "주의할 리스크"일 뿐 초보자가
  능동적으로 찾아볼 이벤트가 아니고, 무상증자는 대형주에선 드묾(주요기업 29개 중 1건). 특히
  유상증자만 82건이라 다 넣으면 낯선 중소형주 이름으로 캘린더가 채워져서 CPI·삼성전자 배당 같은
  진짜 중요한 항목이 묻힐 위험이 있다고 판단

### 처리

- Supabase에서 기존에 넣었던 83건(유상증자 82 + 무상증자 1)을 직접 DELETE로 제거
  (`id LIKE 'kis-paidincap-%' OR id LIKE 'kis-bonusissue-%'`)
- `scripts/seed_kis_corporate_actions.py`에서 유상증자/무상증자 호출을 제거하고 IPO만 남김 —
  재실행해도 다시 안 들어감
- `services/calendar.py`의 `ingest_paidin_capital_increases_from_kis`/`ingest_bonus_issues_from_kis`
  함수 자체는 **삭제하지 않고 남겨둠** — FEDFUNDS를 보류 처리했을 때(18번 항목)와 같은 방식으로,
  나중에 다시 필요해지면 스크립트에 호출만 추가하면 되도록. `core/kis_client.py`의 관련 함수도 동일.

### Supabase 최종 상태

전체 173건(macro 131 + dividend 42).

## 27. 합병/분할 캘린더 제외 결정

26번 항목 직후 "전체적으로 불필요한 데이터/더 필요한 데이터"를 물어봐서, 합병/분할도 유상증자와
비슷하게 "보유 종목이 아닌 이상 초보자가 능동적으로 찾아볼 정보는 아니다"라는 의견을 드렸고 그대로
제외 결정됨. 대신 가장 아쉬운 공백으로 **기업 실적 발표일**(삼성전자/SK하이닉스/NVIDIA/Apple
등, 현재 KIS·FRED 어디에도 발표일 소스가 없음)을 꼽았고, 그다음 우선순위로 한국 증시 휴장일·FOMC
일정을 제안함 — 다음 작업 후보에 반영.

### 처리

- Supabase에서 기존 30건을 직접 DELETE로 제거 (`id LIKE 'kis-mergersplit-%'`)
- `scripts/seed_kis_merger_splits.py` 상단에 "재실행하면 다시 들어가니 주의" 경고 주석 추가
  (26번 항목과 동일한 방식)
- `services/calendar.py`의 `ingest_merger_splits_from_kis`/`core/kis_client.py`의
  `get_merger_split_schedule`은 **삭제하지 않고 남겨둠** — 26번 항목과 동일한 이유(정책이 바뀌면
  재사용 가능하도록)

### Supabase 최종 상태

전체 143건(macro 101 + dividend 42).

## 28. FRED·KIS 수집 현황 종합 정리 (2026-09-14 기준)

지금까지 여러 항목에 흩어져 있던 FRED/KIS 데이터 현황을 한 곳에 모은 스냅샷. 실제 Supabase를
다시 조회해서 검증한 최신 수치이며, 코드는 건드리지 않았다.

### 현재 `calendar_events`에 실제로 들어있는 것 (전체 143건)

**FRED (미국 경제지표, 전부 `category="macro"`, `region="미국"`)** — 58건

| 지표                       | series_id  | 주기   | 건수 | 비고                                                |
| -------------------------- | ---------- | ------ | ---- | --------------------------------------------------- |
| 소비자물가지수(CPI)        | `CPIAUCSL` | 월별   | 11   | 1~11월(12월은 발표일 미확정으로 보류)               |
| 생산자물가지수(PPI)        | `PPIACO`   | 월별   | 11   | 위와 동일                                           |
| 국내총생산(GDP)            | `GDP`      | 분기별 | 3    | 1~3분기(4분기는 발표일 미확정)                      |
| 비농업 고용(PAYEMS)        | `PAYEMS`   | 월별   | 11   | 1~11월                                              |
| 실업률(UNRATE)             | `UNRATE`   | 월별   | 11   | 1~11월                                              |
| 개인소비지출 물가지수(PCE) | `PCEPI`    | 월별   | 11   | 1~11월, GDP와 발표 캘린더 공유(실측 검증 로직 적용) |

**KIS (한국, `region="한국"`)** — 85건

| 일정                      | category   | 건수 | 비고                                                            |
| ------------------------- | ---------- | ---- | --------------------------------------------------------------- |
| 배당일정                  | `dividend` | 42   | 주요 기업 29개 종목코드 지정 조회(전체 조회는 페이지 제한 있음) |
| 신규상장(IPO, 공모주청약) | `macro`    | 43   | 전체 시장 조회(연 100건 미만이라 제한 안 걸림)                  |

**status 분포**: RELEASED 122건, SCHEDULED 21건(미래 발표 예정)

### 조사는 했지만 캘린더에서 제외/보류한 것

| 항목                                | 소스                        | 상태                   | 이유                                                                        |
| ----------------------------------- | --------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| 연방기금금리(FEDFUNDS)              | FRED                        | 미구현                 | 매 영업일 발행돼서 "발표 이벤트" 개념이 안 맞음(18번 항목)                  |
| 합병/분할                           | KIS `ksdinfo/merger-split`  | **구현 후 삭제**(27번) | 보유 종목 아니면 관심사 아니라는 판단                                       |
| 유상증자                            | KIS `ksdinfo/paidin-capin`  | **구현 후 삭제**(26번) | 82건이라 캘린더에 노이즈 유발                                               |
| 무상증자                            | KIS `ksdinfo/bonus-issue`   | **구현 후 삭제**(26번) | 대형주엔 드묾(29개 중 1건)                                                  |
| 상장정보일정(`list-info`)           | KIS                         | 조사만 함, 미구현      | "신규상장"이 아니라 CB/BW/스톡옵션 행사로 인한 추가상장이라는 걸 확인(25번) |
| 주주총회일정                        | KIS `ksdinfo/sharehld-meet` | 필드까지 확인, 미구현  | 5개 category 중 마땅한 값이 없어 보류                                       |
| 종목추정실적                        | KIS `estimate-perform`      | 조사만 함, 구현 안 함  | 날짜 개념이 없는 추정치 데이터라 애초에 캘린더 부적합(10번 항목)            |
| ISM 제조업 PMI                      | FRED 후보였으나 없음        | -                      | 라이선스 문제로 FRED가 아예 제공 안 함(400 오류 확인, 20번 항목)            |
| 10년물 국채·금리스프레드·달러인덱스 | FRED                        | 미구현                 | 매 영업일 발행, FEDFUNDS와 같은 이유로 부적합                               |
| PCEPILFE(근원 PCE)                  | FRED                        | 미구현                 | PCEPI(헤드라인)만 구현, 코어는 후순위                                       |
| ICSA(신규 실업수당 청구) 등         | FRED                        | 조사만 함              | 20번 항목에서 후보로 정리, 순위 2순위(주별이라 구현 용이)                   |

### 아직 소스 자체를 못 구한 것 (구현 이전 단계)

- **기업 실적 발표일**(삼성전자·SK하이닉스·NVIDIA·Apple 등) — 현재 최우선 공백
- 한국 증시 휴장일 — KIS `chk-holiday`로 가능하다고 이미 확인됨(설계만 완료, 구현 안 함)
- 미국 증시 휴장일 — FRED/KIS 어디에도 없음, 별도 소스 필요
- FOMC 회의 일정 — Federal Reserve 공식 캘린더 필요
- 한국 기준금리(금통위) — KIS 안에서 검색 안 해봄(22번 항목, "없다"고 단정 안 함)
- 선물/옵션 만기(한국·미국) — API 자체가 없음, 규칙 계산으로 해결 필요

## 29. 버그 수정 — KIS 숫자 필드 공백 트림 누락 + 프런트 실데이터 재반영

프런트에 현재 143건을 다시 반영하는 작업 중 실제 데이터 버그를 하나 발견해서 고쳤다.

### 버그: `_clean_kis_value`가 KIS의 고정폭 공백을 안 지우고 있었음

IPO 데이터를 프런트용으로 변환하다가 `actual`/`summary`에 이상한 공백이 들어있는 걸 발견했다.

```
actual: "       18000"   (앞에 공백 7개)
summary: "...공모가는        18000원입니다..."
```

원인 확인: KIS의 `fix_subscr_pri`(공모가) 같은 일부 숫자 필드가 **고정폭 우측정렬**로 오는데
(`"       18000"`), `_clean_kis_value()`가 `raw in ("", "0", "0.00")`만 검사하고 trim은 안 하고
있었다. 배당의 `per_sto_divi_amt`는 우연히 패딩이 없어서 지금까지 안 걸렸을 뿐, 같은 함수를 쓰는
모든 KIS 숫자 필드(배당금액, 합병비율, 증자비율 등)에 잠재된 문제였다.

### 수정

- `_clean_kis_value`: trim 후 빈 문자열/"0"/"0.00" 판정하도록 수정
- `_clean_kis_date`, `_clean_kis_date_compact`: 방어적으로 trim 추가
- `scripts/seed_kis_dividends.py`, `scripts/seed_kis_corporate_actions.py` 재실행해서
  Supabase에 이미 저장된 값도 정정(upsert라 기존 42+43건이 새 값으로 덮어써짐, 건수 변화 없음)
- 수정 후 재확인: `actual: "18000"`, `summary: "...공모가는 18000원입니다..."` — 정상

### 프런트 `/calendar` 실데이터 재반영 + 실제 화면 확인

19번 항목과 같은 방식으로 `news-data.ts`의 `NEWS` 배열을 현재 143건(버그 수정 반영된 값)으로
다시 채웠다. 이번엔 지난번과 달리 **실제 개발 서버를 띄워 진짜 `/calendar` 화면을 스크린샷으로
확인**했다(이전엔 "문서로만 알려달라"고 하셔서 화면 확인 전에 멈췄었음).

- 첫 스플라이스 시도에서 실수 발견: 기존 파일에 새 주석만 앞에 붙이고 `export const NEWS: NewsItem[] = [` 여는 줄을 빠뜨려서 문법이 깨짐 → 파일 전체를 처음부터 다시 깨끗하게 작성해서 해결(중괄호/대괄호/소괄호 개수 일치 확인 후 배포)
- 백엔드(8080)/프런트(3000) 기동 후 Playwright로 실제 `/calendar` 화면 캡처 — "와이즈플래닛컴퍼니 공모주 청약", "빅웨이브로보틱스 공모주 청약"(KIS IPO), "미국 개인소비지출 물가지수(PCE) - 2026년 8월"(FRED) 등 실데이터가 정상적으로 카드에 표시되는 것 확인
- 테스트 후 서버 종료. 이전에 죽이지 못하고 남아있던 오래된 개발 서버 프로세스(포트 3000 점유)가 있어서 그것도 같이 정리함

### Supabase 최종 상태

전체 143건, 변경 없음(값 교정만).

## 31. FOMC 정례회의 정적 데이터 추가

FRED/KIS 둘 다 "회의 일정" 자체를 API로 제공하지 않는다는 걸 확인했다(연준 공식 페이지
federalreserve.gov/monetarypolicy/fomccalendars.htm도 API·JSON·ICS 없이 HTML 표로만
게시). 그래서 30번 항목에서 제안한 두 방식 중 **"정적 데이터로 시딩 + 결과는 회의 후 수동
확인" 방식**을 사용자가 채택했다.

### 데이터 소스와 확인 방법

- 회의 날짜(연 8회, 각 2일): federalreserve.gov 공식 캘린더 페이지를 그대로 옮겨 적음
  (2026년: 1/27-28, 3/17-18, 4/28-29, 6/16-17, 7/28-29, 9/15-16, 10/27-28, 12/8-9)
- 발표 시각: 연준이 모든 성명서 배포 시 "For release at 2:00 p.m. EDT/EST"로 공식 명시 —
  임의 추정이 아니라 공개된 사실이라 `_RELEASE_TIME_ET["FOMC"] = 14:00`으로 등록하고
  기존 `_to_kst()`를 그대로 재사용(DST는 `ZoneInfo("America/New_York")`가 자동 처리)
- actual(기준금리 목표범위): 각 회의의 실제 성명서(federalreserve.gov press release,
  monetary20260128a.htm 등)를 하나씩 웹 검색으로 확인해서 채움 — 2025-12-10 회의에서
  3.50~3.75%로 인하된 뒤 2026년 1/3/4/6/7월 회의 모두 그 범위를 동결(각각 표결 결과까지
  확인). 9월(15-16일) 회의는 오늘(2026-09-15) 기준 진행 중이라 결과가 없어 `actual=None`
  으로 두고 SCHEDULED 처리
- previous: 직전 회의의 실제 결과가 확인된 경우에만 채움. 10월/12월은 직전(9월/10월) 결과가
  아직 없으므로 previous도 임의로 채우지 않고 None으로 둠 — 다른 지표와 동일한
  "확인 안 된 값은 절대 임의 생성하지 않는다" 원칙 적용
- 회의 시작~종료일(`start_date`/`end_date`)은 미국 동부시간 기준 날짜를 그대로 저장한다
  (관측기간 라벨과 같은 성격 — KST로 옮기지 않음). 발표 시점(`publishedAt`/`time`)만
  KST로 변환한다

### 구현

- `services/calendar.py`: `_FOMC_SUMMARY`, `_FOMC_MEETINGS`(연도별 정적 표),
  `ingest_fomc_year(year)` 추가. 외부 API 호출이 없는, 유일하게 표 자체가 데이터 소스인
  ingest 함수
- `category="rate"`로 고정 — 프런트 5개 카테고리 중 "금리"에 해당, 사이드바 AI 요약에
  이미 "한국 기준금리 동결 전망" 같은 rate 성격 문구가 있어 프런트 쪽 개념과도 부합
- `scripts/seed_fomc_2026.py` 신규 — 매년 다음 해 일정이 발표되면 `_FOMC_MEETINGS`에
  그 해 항목을 추가하고 이 스크립트를 그 해로 다시 실행해야 하는 연 1회 수동 갱신 구조
- 실행 결과: 8건 upsert(1~7월 RELEASED 5건, 9/10/12월 SCHEDULED 3건). Supabase 전체
  151건(기존 143건 + FOMC 8건)

### 남은 것

- 아직 프런트 `news-data.ts`에는 반영하지 않음(이번 요청은 백엔드 데이터 적재까지)
- 9월 회의 결과가 나오면(9/16 14:00 ET 이후) `_FOMC_MEETINGS`의 9월 항목 actual과
  10월 항목 previous를 수동으로 채워 재실행 필요

## 32. 다음 후보

- **기업 실적 발표일 소스 확보** (최우선 공백 — DART 등 KIS/FRED 밖의 별도 소스 조사 필요)
- 한국 증시 휴장일 구현 (KIS `chk-holiday`, 설계 완료·구현만 남음, 하루 1회 호출 제한 유의)
- IPO의 `category="macro"` 배정이 적절한지 재확인(확정 사항 아님)
- "신규상장"으로 `list-info`(CB/BW/스톡옵션 행사에 따른 추가상장)도 별도로 다룰지 결정
- KIS `isin_name`/`cust_nm` → 일반적으로 통용되는 종목명으로 바꿀지(매핑표 필요) 여부 결정
- 20번 항목의 나머지 후보(`ICSA` 신규 실업수당 청구 등) 순차 확장
- FEDFUNDS 처리 방식 별도 논의(H.15 매일 발행 구조를 어떻게 "이벤트"로 환산할지)
- FOMC 결과 발표 후 `_FOMC_MEETINGS` 수동 갱신 루틴을 문서화된 절차로 정착시킬지, 아니면
  다른 자동화 방법을 찾을지
- 기본 흐름이 안정된 뒤 APScheduler로 자동 수집 전환 여부 결정
- 11번 항목에서 제안한 unit/대상기간/국가코드 필드를 추가할지 프런트엔드 팀과 논의
- 프런트엔드 팀과 `GET /calendar/events` Response 구조 최종 합의
- FOMC 데이터를 `news-data.ts`에도 반영할지(반영 시 143건 재동기화와 같은 방식)
- 9/10/12월 FOMC 의사록(MINUTES) 공개일이 연준 공식 캘린더에 게시되면 `core/fed_client.py`에
  날짜를 채우고 `seed_fomc_2026.py` 재실행 필요
- 9월 FOMC 결과가 나온 뒤 다음 해(2027년) 일정이 발표되면 `core/fed_client.py`에 그 해 항목
  추가

## 33. FOMC 설계 변경 — category="macro" + STATEMENT/SEP/MINUTES 3종 분리

31번 항목에서 만든 FOMC 구현(회의당 1건, `category="rate"`, actual/previous에 실제 금리
결정값 채움)을 사용자가 명시적으로 재설계 요청해서 갈아엎었다. 새 요구사항의 핵심 차이:

- **category**: "rate"가 아니라 프런트 5개 카테고리 중 **"macro"로 통일**(별도 FOMC
  category 금지)
- **actual/previous/forecast**: FRED 지표처럼 실제 값을 채우지 않고 **항상 null** — FOMC는
  "일정"이지 "값"이 아니라는 관점
- **이벤트를 회의당 1건이 아니라 여러 종류로 분리**: FOMC_MEETING(회의 기간) /
  FOMC_STATEMENT(금리결정) / FOMC_PRESS_CONFERENCE(기자회견) / FOMC_MINUTES(의사록) /
  FOMC_SEP(경제전망) 중 어떤 걸 실제로 만들지는 사용자와 논의해서 결정
- DB에 `indicator` 컬럼을 추가하지 않고, id에 `-{event_type}` 접미사를 붙여 코드 내부에서만
  구분 (`fomc-{event_date}-{event_type}`)

### 사용자와 논의해서 뺀 것

- **FOMC_MEETING**(회의 기간 카드): actual/forecast 없이 "이번 주 회의 중"이라는 정보만
  주는데, 며칠 뒤 STATEMENT 카드가 같은 사실을 다시 알려주는 셈이라 사실상 중복 신호 →
  제외(합병/분할·유무상증자를 뺐던 것과 같은 "초보 투자자가 굳이 필요로 하지 않는 정보"
  기준 적용)
- **FOMC_PRESS_CONFERENCE**(기자회견): 2026년 8회 회의 모두 기자회견이 열리는 것을 확인했지만
  STATEMENT와 같은 날 30분 안팎 차이로 열려 내용도 거의 겹침 → 제외
- 최종적으로 **FOMC_STATEMENT + FOMC_SEP + FOMC_MINUTES 3종**만 구현하기로 사용자가 확정

### 데이터 소스 재확인 (federalreserve.gov 공식 캘린더 원문 직접 파싱)

- 8회 회의 날짜는 그대로 유지(1/27-28, 3/17-18, 4/28-29, 6/16-17, 7/28-29, 9/15-16,
  10/27-28, 12/8-9)
- SEP 동반 회의(\*): 3월/6월/9월/12월 — 공식 페이지의 `panel-footer` 각주로 재확인
- 의사록(Minutes) 공개일: 공식 페이지 원문(raw HTML)에서 "Released ..." 문구를 직접 확인.
  1월→2/18, 3월→4/8, 4월→5/20, 6월→7/8, 7월→8/19. **9월/10월/12월 회의는 아직 열리지
  않았거나(9월은 오늘 진행 중) 공식 캘린더에 의사록 공개일 자체가 비어 있음** — "3주 뒤"라는
  관례로 임의 계산하지 않고 해당 회의의 MINUTES 이벤트는 아예 만들지 않았다(날짜 공식
  게시 전까지는 생성 보류)
- 발표 시각: 성명서·SEP·의사록 모두 연준이 "For release at 2:00 p.m. EDT/EST"로 공식
  명시 — 임의 추정 아님. 기존 `_RELEASE_TIME_ET["FOMC"] = 14:00`을 그대로 재사용

### 구현

- **신규**: `core/fed_client.py` — `FomcMeeting` dataclass(start_date/end_date/has_sep/
  minutes_date)와 `get_fomc_meetings(year)`. FRED/KIS와 달리 외부 API 호출이 전혀 없고
  이 표 자체가 유일한 데이터 소스
- **수정**: `services/calendar.py`
  - 기존 `_FOMC_SUMMARY`/`_FOMC_MEETINGS`/`ingest_fomc_year`(31번 항목의 구현)를
    전부 삭제하고 새로 작성
  - `_FOMC_EVENT_TITLES`, `_FOMC_EVENT_SUMMARIES`(이벤트 종류별 제목/설명),
    `_fomc_status()`(actual 대신 발표 시각 경과 여부로 RELEASED/SCHEDULED 판단),
    `_fomc_event()`(단일 이벤트 생성), `ingest_fomc_year()`(연도별 전체 upsert) 추가
  - import에 `fed_client` 추가(fred_client/kis_client와 나란히)
  - CPI/PPI/GDP/PAYEMS/UNRATE/PCE 관련 FRED 코드는 손대지 않음
- **수정**: `scripts/seed_fomc_2026.py` — `ingest_fomc_year(2026)` 호출부는 그대로,
  출력 필드만 새 스키마에 맞게 조정
- **Supabase 정리**: 31번 항목에서 만든 옛 스키마 행 8건(`fomc-2026-01-28` 등, id에
  event_type 접미사 없음)을 정규식으로 찾아 삭제한 뒤 새 스키마로 재시딩

### 결과

- 17건 upsert: STATEMENT 8(전체 회의) + SEP 4(3/6/9/12월) + MINUTES 5(1/3/4/6/7월,
  9/10/12월은 공개일 미확정이라 아직 없음)
- 상태(2026-09-15 기준): RELEASED 12건, SCHEDULED 5건(9월 STATEMENT·9월 SEP·
  10월 STATEMENT·12월 STATEMENT·12월 SEP — 아직 발표 시각이 지나지 않은 이벤트 전부)
- Supabase 전체 143 → 160건(FOMC 17건)
- API 테스트: `GET /calendar/events?year=2026&month=9`에 `fomc-2026-09-16-FOMC_STATEMENT`,
  `fomc-2026-09-16-FOMC_SEP`가 정상 포함되는 것 확인(둘 다 category="macro",
  status="SCHEDULED"). 1~10월, 12월 전체 조회해서 월별 건수가 위 결과와 일치하는 것도 확인

### 남은 것

- 9/10/12월 MINUTES는 연준이 공개일을 공식 발표하면 `fed_client.py`에 채우고 재실행 필요
- 프런트 `news-data.ts`에는 아직 반영 안 함

## 34. 다음 후보

- **기업 실적 발표일 소스 확보** (최우선 공백 — DART 등 KIS/FRED 밖의 별도 소스 조사 필요)
- 한국 증시 휴장일 구현 (KIS `chk-holiday`, 설계 완료·구현만 남음, 하루 1회 호출 제한 유의)
- IPO의 `category="macro"` 배정이 적절한지 재확인(확정 사항 아님)
- "신규상장"으로 `list-info`(CB/BW/스톡옵션 행사에 따른 추가상장)도 별도로 다룰지 결정
- KIS `isin_name`/`cust_nm` → 일반적으로 통용되는 종목명으로 바꿀지(매핑표 필요) 여부 결정
- 20번 항목의 나머지 후보(`ICSA` 신규 실업수당 청구 등) 순차 확장
- FEDFUNDS 처리 방식 별도 논의(H.15 매일 발행 구조를 어떻게 "이벤트"로 환산할지)
- 9/10/12월 FOMC 의사록 공개일이 확정되면 `fed_client.py` 갱신 + 재시딩
- 기본 흐름이 안정된 뒤 APScheduler로 자동 수집 전환 여부 결정
- 11번 항목에서 제안한 unit/대상기간/국가코드 필드를 추가할지 프런트엔드 팀과 논의
- 프런트엔드 팀과 `GET /calendar/events` Response 구조 최종 합의
- FOMC 데이터를 `news-data.ts`에도 반영할지(반영 시 143건 재동기화와 같은 방식)

FRED (58건, 전부 macro): CPI 11 / PPI 11 / GDP 3 / PAYEMS 11 / UNRATE 11 / PCE 11

KIS (85건): 배당 42(dividend) / IPO 43(macro)

FOMC (17건, 전부 macro): STATEMENT 8 / SEP 4(3·6·9·12월) / MINUTES 5(1·3·4·6·7월,
9·10·12월은 의사록 공개일 미확정이라 보류)

## 35. 프런트 `/calendar` 실데이터 재반영 — FOMC 17건 포함 160건

33번 항목에서 재설계한 FOMC 데이터(17건)를 포함해 Supabase `calendar_events` 전체 160건을
`frontend/app/(main)/calendar/news-data.ts`의 `NEWS` 배열에 다시 반영했다. 19번·29번 항목과
같은 방식(구조/타입/컴포넌트는 그대로, 배열 내용만 교체)이다.

- Supabase에서 전체 160건을 `publishedAt`/`time` 순으로 export한 뒤 Python 스크립트로
  TypeScript 리터럴로 변환 — id/title/summary/category/region/publishedAt과, 있는 경우만
  `detail.previous`/`detail.forecast`(FOMC는 previous/forecast가 항상 null이라 detail 자체가
  생략됨. `actual`은 프런트 타입에 필드가 없어 기존과 동일하게 반영 안 함 — 알려진 한계)
- 29번 항목에서 겪은 스플라이스 사고를 반복하지 않으려고, 기존 파일을 헤더(타입/유틸/CAT 등,
  1~78행)·NEWS 배열·푸터(MARKET_HOLIDAYS 등)로 나눠 새 NEWS 배열만 갈아끼운 전체 파일을
  통째로 재조립한 뒤 중괄호/대괄호/소괄호 개수 일치를 확인하고 나서 교체
- 백엔드(8080)/프런트(3000) 재기동 후 `npx tsc --noEmit`으로 타입 에러 없음 확인, Playwright로
  실제 `/calendar` 화면(2026년 9월, 월별 보기) 캡처 — 9/17 칸에 "미국 경제전망(SEP) 공개"와
  "미국 FOMC 금리결정" 카드가 정상적으로 함께 표시되는 것 확인
- 테스트 후 두 서버 모두 종료

### Supabase 최종 상태

전체 160건 (FRED 58 + KIS 85 + FOMC 17), 프런트 `news-data.ts`와 동기화 완료.

## 36. DART Open API 연결 1단계 — 삼성전자 1개 기업 테스트

30번 항목의 최우선 공백("기업 실적 발표일 소스 확보")을 메우기 위해 DART(전자공시시스템) API
연결을 시작했다. 이번 단계는 **연결 자체가 되는지 삼성전자 1개 기업으로만 확인**하는 것이 목표고,
DB 저장·다른 기업 확장·forecast 생성은 전부 다음 단계로 미뤘다(`calendar_events` 테이블은
전혀 건드리지 않음).

### 사전 확인

- `.env`에 `DART_API_KEY`가 이미 40자 값으로 설정되어 있는 것 확인(값은 확인만 하고 출력하지
  않음)
- `core/config.py`의 `Settings`는 다른 API 키들처럼 `str | None = None`으로 등록해야 이 키가
  없는 다른 팀원 환경에서도 앱이 뜬다는 기존 규칙(파일 상단 주석)을 그대로 따름
- `core/fred_client.py` 패턴을 그대로 따라 `httpx.get()` + `get_settings()` 조합으로 구현,
  DART 전용 client는 `core/dart_client.py`로 분리(FRED/KIS와 같은 위치)

### DART API 특성 조사 중 발견한 것 (문서만으로는 알 수 없어서 실제 라이브 호출로 확인)

- **corp_code가 종목코드와 다른 별도 식별자**: `list.json`(공시검색)은 종목코드(예: 005930)가
  아니라 DART 자체의 `corp_code`(예: 삼성전자 = `00126380`)를 요구한다. 이름/종목코드로 바로
  검색해주는 API가 없어서, 전체 상장·비상장사 고유번호 파일(`corpCode.xml`, zip 안에
  `CORPCODE.xml`)을 통째로 받아 직접 매칭해야 한다 - 전체 119,281건
- **corpCode.xml 정상/에러 응답 형식이 다르다**: 정상이면 zip 파일이 오지만, 인증키가 틀리면
  zip이 아니라 XML이 그대로 온다(`<result><status>010</status><message>...</message></result>`).
  처음엔 이 구분을 안 해서 `zipfile.BadZipFile`이 그대로 터지는 버그가 있었다 -
  `zipfile.BadZipFile`을 잡아서 zip이 아니면 응답 바이트를 바로 XML로 파싱하도록 수정
  (`dart_client.get_corp_codes`)
- **corpCode.xml의 정상 응답도 루트 태그가 `<result>`라서 에러와 태그명만으로 구분이 안 된다**:
  정상은 `<result><list>...</list>...</result>`(회사마다 `<list>` 하나씩 반복), 에러는
  `<result><status>.../<message>...</result>` - `<status>` 자식 유무로 구분하도록 구현
- **`pblntf_ty`/`pblntf_detail_ty`는 응답 필드가 아니라 요청 파라미터**: 작업 지시에는 이 두
  필드를 응답에서 출력하라고 되어 있었지만, 실제 `list.json` 호출 결과 응답 필드는
  `corp_code`/`corp_name`/`stock_code`/`corp_cls`/`report_nm`/`rcept_no`/`flr_nm`/`rcept_dt`/
  `rm` 9개뿐이었다. `pblntf_ty`(공시유형, 정기공시="A")는 검색 결과를 필터링하는 **요청**
  파라미터였다 - 존재하지 않는 응답 필드를 쓰지 않기로 한 지시(6번)에 따라 실제 필드만 쓰고,
  `pblntf_ty=A`로 정기공시만 걸러서 조회하는 방식으로 대체
- **`list.json`은 status가 항상 JSON body 안에 있다**("013"=조회된 데이터 없음은 에러가 아니라
  정상적으로 있을 수 있는 상황이라 예외 대신 빈 리스트로 처리)
- 페이지네이션: 기본 호출은 최근 100건까지만 나오고(`total_count`/`total_page`로 전체 규모 확인
  가능, 삼성전자는 최근 1.75년간 3591건/36페이지) - 이번 테스트에서는 페이지네이션 없이 1페이지만
  확인, 정기공시는 `pblntf_ty=A` 필터로 전체(7건)를 한 번에 받아 페이지네이션이 필요 없었음

### 구현

- **수정**: `core/config.py` - `dart_api_key: str | None = None` 추가
- **수정**: `.env.example` - `DART_API_KEY=` 항목 추가
- **신규**: `core/dart_client.py` - `DartApiError`, `get_corp_codes()`,
  `find_corp_by_stock_code()`, `get_disclosure_list()`
- **신규**: `scripts/test_dart_samsung.py` - 삼성전자 1개 기업만 대상으로 한 조회 전용 테스트
  스크립트(DB 저장 없음)

### 테스트 결과

- corp_code 확인: `{'corp_code': '00126380', 'corp_name': '삼성전자', 'stock_code': '005930', 'modify_date': '20251201'}`
- 공시검색(2025-01-01~2026-09-15) 전체 100건(1페이지) 정상 조회
- 정기공시(`pblntf_ty=A`) 7건 정상 조회 - 반기보고서(2026.06)/분기보고서(2026.03)/
  사업보고서(2025.12)/분기보고서(2025.09)/반기보고서(2025.06)/분기보고서(2025.03)/
  사업보고서(2024.12) 전부 확인됨
- 인증키 오류(status="010") 케이스도 `DartApiError`로 정상적으로 구분되는 것 확인
  (`list.json`과 `corpCode.xml` 양쪽 다)

### 다음 단계

- 재무정보 API(예: `fnlttSinglAcnt.json` - 단일회사 주요계정) 연결해서 사업/분기/반기보고서에
  담긴 실제 재무 수치까지 가져올 수 있는지 확인
- 이번엔 안 한 것: 여러 기업 확장(30개), `calendar_events` 저장, forecast 생성, 증권사
  컨센서스 연결, KIS/FRED 코드와의 통합 - 전부 지시대로 보류
- "기업 실적 발표일"을 캘린더 이벤트로 만들려면 정기보고서의 `rcept_dt`(공시 접수일)를 쓸
  건지, 아니면 실제 "실적 발표"(컨퍼런스콜) 날짜를 별도로 찾을 건지 결정 필요 - DART
  정기보고서는 확정 실적이 공시되는 날짜이지, 잠정실적 발표(예: 삼성전자 매 분기 초
  가이던스 발표)와는 다를 수 있음

## 37. DART 2단계 사전조사 — 실적 발표일 판단 기준 확정

36번 항목 마지막에 남긴 질문("실적 발표일을 정기보고서 접수일로 볼지, 별도의 잠정실적 발표일로
볼지")을 실제 라이브 조회로 확인했다. 이번 단계는 코드를 거의 수정하지 않고 조사만 했다 -
`dart_client.py`의 기존 함수(`get_disclosure_list`)로 페이지네이션을 직접 돌리고, 재무정보
API·공시원문(document.xml)은 1회성 조사 스크립트로만 확인했다(파일로 남기지 않음).

### 1~2. 실적 관련 공시의 실제 report_nm

2024-01-01~2026-09-15 삼성전자 전체 공시(3,875건)를 페이지네이션으로 전부 받아 "잠정실적/
영업(잠정)실적/분기실적/반기실적/사업실적/실적" 키워드로 걸러보니, 실적 관련 report_nm은
**"연결재무제표기준영업(잠정)실적(공정공시)"** 딱 한 가지 패턴만 존재했다(및 정정 시
"[기재정정]" 접두사가 붙는 변형). 지시서에 예시로 든 "연결재무제표 기준 영업(잠정)실적" 패턴이
맞았고, 2024~2026년 동안 분기마다 예외 없이 반복됐다(33건 = 3년 x 분기당 2건 + 기재정정
일부).

**분기당 이 report_nm으로 정확히 2번 공시된다**(직접 원문 대조로 확인, 아래 3번 참고):

- 분기 종료 후 약 1~1.5주 뒤: "가이던스"성 1차 공시 (매출액/영업이익만, 조원 단위 반올림)
- 분기 종료 후 약 4주 뒤: "상세" 2차 공시 (매출액/영업이익/법인세비용차감전순이익/당기순이익
  전부, 억원 단위 정확한 수치) — 같은 날 "[기재정정]"으로 한 번 더 올라오는 경우가 많음

### 3. rcept_dt 비교 (실적 관련 공시 vs 정기보고서)

document.xml로 1차/2차 잠정실적 공시 원문을 직접 대조해서 확인한 내용을 포함해 분기별로
정리하면:

| 대상 분기 | 1차(가이던스) rcept_dt | 2차(상세) rcept_dt | 정기보고서 rcept_dt | 정기보고서 종류 |
| --------- | ---------------------- | ------------------ | ------------------- | --------------- |
| 2024 Q4   | 2025-01-08             | 2025-01-31         | 2025-03-11          | 사업보고서      |
| 2025 Q1   | 2025-04-08             | 2025-04-30         | 2025-05-15          | 분기보고서      |
| 2025 Q2   | 2025-07-08             | 2025-07-31         | 2025-08-14          | 반기보고서      |
| 2025 Q3   | 2025-10-08             | 2025-10-31         | 2025-11-14          | 분기보고서      |
| 2025 Q4   | 2026-01-08             | 2026-01-29         | 2026-03-10          | 사업보고서      |
| 2026 Q1   | 2026-04-07             | 2026-04-30         | 2026-05-15          | 분기보고서      |
| 2026 Q2   | 2026-07-07             | 2026-07-30         | 2026-08-14          | 반기보고서      |

**세 날짜가 전부 다르다.** 1차 공시가 항상 가장 빠르고(분기 종료 후 7~9일), 2차 공시가 그
2.5~3주 뒤(분기 종료 후 28~31일), 정기보고서가 가장 늦다(1차 대비 +31~62일, 2차 대비
+14~40일). 2026년 1분기를 document.xml로 직접 대조한 결과:

- 1차(04-07): 매출액 133.00(조원), 영업이익 57.20(조원) — 당기순이익 항목 자체가 "-"로 비어있음
- 2차(04-30): 매출액 1,338,734(억원=133.8734조, 1차와 정합), 영업이익 572,328(억원),
  법인세비용차감전계속사업이익 588,284(억원), 당기순이익 472,253(억원), 지배기업소유주지분
  순이익 471,012(억원) — 전부 채워짐

즉 **1차 공시는 매출액/영업이익만 먼저 공개하는 "잠정" 발표고, 당기순이익은 2차 공시에서야
나온다.**

### 4. DART에서 실적 발표 이벤트를 만들 때 쓸 날짜

**1차(가이던스) 공시의 rcept_dt를 "실적 발표일"로 쓰는 것이 적절하다.** 이유:

- 시장이 실제로 반응하는 시점은 매출액/영업이익이 처음 공개되는 1차 공시일이다(뉴스 헤드라인도
  보통 이날 나옴) - 2차 공시는 이미 알려진 숫자에 당기순이익을 추가하는 것이라 시장 임팩트가
  1차보다 작음
- 정기보고서(사업/반기/분기보고서)는 실적 발표가 아니라 회계·주석까지 포함한 정식 규제 제출
  서류로, 실적 자체는 이미 몇 주 전 1차/2차 공시로 다 알려진 뒤라 새로운 시장 정보가 거의 없음
- 다만 당기순이익까지 캘린더에 담고 싶다면 2차(상세) 공시일도 별도 이벤트로 함께 쓰는 방안이
  있다 - 어느 쪽을 쓸지, 혹은 둘 다 쓸지는 사용자 확인이 필요한 지점(1차만/2차만/둘 다 중 택1)

### 5. fnlttSinglAcnt.json 응답 구조

`GET /api/fnlttSinglAcnt.json?crtfc_key=...&corp_code=00126380&bsns_year=2025&reprt_code=11011`
(2025 사업보고서)로 실제 호출해서 확인한 응답 필드:

```
rcept_no, reprt_code, bsns_year, corp_code, stock_code, fs_div, fs_nm, sj_div, sj_nm,
account_nm, thstrm_nm, thstrm_dt, thstrm_amount, frmtrm_nm, frmtrm_dt, frmtrm_amount,
bfefrmtrm_nm, bfefrmtrm_dt, bfefrmtrm_amount, ord, currency
```

- `fs_div`: "CFS"(연결재무제표) / "OFS"(별도재무제표) - 연결 실적을 쓰려면 CFS만 필터링
- `sj_div`/`sj_nm`: "BS"(재무상태표) / "IS"(손익계산서) 등 재무제표 구분
- `account_nm`: 계정과목명(한글) - 매출액/영업이익/당기순이익 전부 **정확히 이 이름 그대로**
  존재함(추측이 아니라 실제 응답에서 확인: "매출액", "영업이익", "당기순이익(손실)")
- `thstrm_amount`: 당기 금액. **문자열이고 천단위 콤마가 포함되어 있다**(예: `"333,605,938,000,000"`)
  - 파싱할 때 `.replace(",", "")` 후 `int()` 변환 필요(KIS의 공백 트림 버그와 비슷하게, 다음
    단계에서 실제 구현할 때 놓치기 쉬운 지점이라 여기 남겨둠)

### 6. 매출액/영업이익/당기순이익 필드 확인

2025 사업보고서(CFS, 연결) 기준 실제 값:

- 매출액: 333,605,938,000,000원 (약 333.6조)
- 영업이익: 43,601,051,000,000원 (약 43.6조)
- 당기순이익(손실): 45,206,805,000,000원 (약 45.2조) - `account_nm == "당기순이익(손실)"`로
  두 번 중복 출력되는데(리스트에 같은 계정이 2행) 이유는 추가 조사 필요(포괄손익계산서 구성
  방식 차이로 추정, 확정 아님)

### 다음 단계에서 구현할 코드

- `core/dart_client.py`에 추가:
  - `get_disclosure_list_all_pages()` 또는 기존 함수에 자동 페이지네이션 추가(현재는
    1페이지=최대 100건만 반환 - 이번 조사에서 수동으로 페이지 루프를 돌려서 확인)
  - `get_preliminary_earnings(corp_code, year, quarter)`: report_nm에 "영업(잠정)실적"이
    포함된 공시만 골라 1차/2차를 구분해 반환(가장 이른 rcept_dt = 1차, 그 다음 = 2차 취급)
  - `get_key_accounts(corp_code, bsns_year, reprt_code)`: `fnlttSinglAcnt.json` 래퍼,
    `fs_div == "CFS"`이고 `account_nm`이 매출액/영업이익/당기순이익(손실)인 행만 추출,
    `thstrm_amount`의 콤마 제거 파싱 포함
- 아직 결정 안 된 것(사용자 확인 필요): 실적 발표 이벤트를 1차 공시일만 쓸지, 2차(당기순이익
  포함) 공시일도 별도로 만들지
- 이번 조사에서도 `calendar_events` 저장·30개 기업 확장·forecast·컨센서스 연결은 전부 안 함

## 38. DART 3단계 구현 — 삼성전자 실적 이벤트를 calendar_events에 저장

37번 항목에서 확정한 기준(1차 잠정실적 공시일만 사용, 당기순이익은 별도 이벤트로 안 만듦,
category="earnings" 고정)대로 삼성전자 1개 기업의 실적 이벤트를 실제로 `calendar_events`에
저장하고 `GET /calendar/events`로 조회되는 것까지 확인했다.

### 1~2. dart_client.py 개선

- `get_disclosure_list()`: 기존 로직은 안 건드리고, 1페이지(최대 100건)만 받던 것을
  `page_no`를 늘려가며 `total_page`까지 자동으로 이어받도록만 추가했다(반환 타입/기존 호출부
  전부 그대로 호환).
- `get_preliminary_earnings(corp_code, start_date, end_date)` 신규: report_nm에
  "영업(잠정)실적"이 들어간 공시만 걸러서, **날짜 단위로 먼저 중복 제거**(정정 공시는 항상
  원본과 같은 rcept_dt에 올라온다는 걸 2단계 조사에서 실측으로 확인했으므로, 같은 날짜는
  하나로 합침 - 이게 "정정 공시가 대표 실적 이벤트와 중복되지 않도록" 처리하는 방법), 그 다음
  **45일 간격으로 분기 묶음을 나눠서** 각 묶음의 가장 이른 날짜만 1차로 채택한다(같은 분기의
  1차→2차 간격은 실측 22~24일, 분기 사이 간격은 실측 60일 이상이었던 것에 근거).
  실제 라이브 호출로 삼성전자 2025~2026년 7분기 전부 정확히 1건씩(총 7건) 나오는 것 확인.
- `get_key_accounts(corp_code, bsns_year, reprt_code="11011")` 신규: `fnlttSinglAcnt.json`
  래퍼. CFS(연결) 우선, 없으면 OFS로 대체. `account_nm`이 정확히 "매출액"/"영업이익"/
  "당기순이익(손실)"인 행만 찾고, `thstrm_amount`의 콤마를 제거해 정수로 변환. 값이 없으면
  예외 대신 `None`.
  - 구현 중 재확인한 것: 반기보고서(11012)/3분기보고서(11014)에는 `thstrm_amount`(당기,
    그 분기만) 외에 `thstrm_add_amount`(당기누적, 연초부터 누적)가 별도로 존재한다. 실측으로
    `thstrm_amount`가 항상 "그 분기만의 값"이라는 걸 두 번(2025년, 2026년 반기) 확인했다
    (예: 2026년 반기 매출 `thstrm_add_amount`=305.37조 = Q1 133.87조 + Q2 `thstrm_amount`
    171.50조로 정확히 맞아떨어짐). `get_key_accounts`는 원래부터 `thstrm_amount`만 쓰고
    있어서 수정은 필요 없었지만, 다음에 이 함수를 건드릴 사람을 위해 주석으로 남겨둠.

### 3. 1차/2차 구분

날짜 클러스터링(위 참고)으로 해결 - report_nm 문자열만으로는 1차/2차를 구분할 수 없다는 걸
확인했으므로(둘 다 report_nm이 완전히 동일), rcept_dt 간격을 기준으로 구분했다.

### 4~6. calendar_events 매핑 (`services/calendar.py`)

- `_dart_quarter_period(rcept_dt)`: 1차 공시 발표월(1/4/7/10월 - 삼성전자가 실제로 이 네
  달에만 1차 공시를 낸다는 걸 실측으로 확인)로 `fnlttSinglAcnt` 조회에 쓸 `(bsns_year,
reprt_code, 분기라벨)`을 판단. 1월 공시는 전년도 4분기/연간(`reprt_code="11011"`)으로
  처리(12월 결산이라 1월엔 전년도 실적이 나옴)
- `_format_trillion_won()`: 원 단위 정수를 "조원" 문자열(소수 1자리)로 변환, 값 없으면 `None`
  그대로 유지(0으로 채우지 않음)
- `_dart_earnings_event()`: `id="dart-earnings-{stock_code}-{rcept_dt}"`(기존
  `fred-{series}-{date}`/`fomc-{date}-{type}`와 같은 소스-식별자-날짜 규칙), `category=
"earnings"`, `region="한국"`, `title="{corp_name} 실적 발표"`, `time=None`(정확한 발표
  시각을 DART가 주지 않으므로 임의로 채우지 않음), `start_date`/`end_date`는 단일 발표일이라
  기존 FRED 방식과 동일하게 `None`(다일 이벤트가 아니므로 KIS의 IPO/합병분할과는 다름),
  `previous=None`/`forecast=None`(FRED 방식과 혼동하지 않도록 임의로 채우지 않음),
  `status="RELEASED"`(이미 지나간 공시만 대상이라 SCHEDULED 케이스 자체가 없음)
- **7번 항목의 데이터 설계 문제 해결**: 매출액/영업이익/당기순이익 세 값을 각각 담을 전용
  컬럼이 없으므로, **`actual`에는 매출액(조원)만 대표값으로 저장**하고(다른 지표들의 `actual`
  이 "그 발표의 headline 숫자 하나"라는 기존 관례를 따름), **`summary`에 세 값을 전부 한글
  문장으로 풀어서 담는 방식**으로 해결했다. summary 문구는 "매출액과 영업이익이 가장 먼저
  공개되는 날"이라고 명시해서, 당기순이익까지 같은 날 확정된 것처럼 오해하지 않도록 했다
  (당기순이익은 실제로는 몇 주 뒤 2차 공시/정기보고서에서야 확정된다 - 37번 항목 참고)

### 8~9. 삼성전자 1개 기업, 중복 방지

`ingest_preliminary_earnings_from_dart(corp_code, stock_code, corp_name, start_date,
end_date)` 신규. 기존 `_upsert_event()`(id 충돌 시 UPDATE)를 그대로 재사용해서 별도 중복
방지 로직을 새로 만들지 않았다.

### 신규 파일

- `scripts/test_dart_earnings.py`: 1단계로 `get_preliminary_earnings()`만 호출해 DB에 아무
  것도 쓰지 않고 후보 7건을 먼저 출력, 2단계로 실제 `ingest_preliminary_earnings_from_dart()`
  실행, 3단계로 같은 함수를 한 번 더 실행해서 건수가 그대로인지(중복 방지) 확인

### 테스트 결과

- 삼성전자 1차 잠정실적 이벤트 **7건** 생성 (2024 Q4 ~ 2026 Q2)
- `publishedAt`이 각 공시의 `rcept_dt`와 정확히 일치: 2025-01-08 / 2025-04-08 / 2025-07-08 /
  2025-10-14 / 2026-01-08 / 2026-04-07 / 2026-07-07
- `category`는 7건 전부 `"earnings"`
- 실제 DART 매출액/영업이익/당기순이익(조원, `fnlttSinglAcnt.json` CFS 기준):

  | 분기          | 매출액 | 영업이익 | 당기순이익 |
  | ------------- | ------ | -------- | ---------- |
  | 2024 Q4(연간) | 300.9  | 32.7     | 34.5       |
  | 2025 Q1       | 79.1   | 6.7      | 8.2        |
  | 2025 Q2       | 74.6   | 4.7      | 5.1        |
  | 2025 Q3       | 86.1   | 12.2     | 12.2       |
  | 2025 Q4(연간) | 333.6  | 43.6     | 45.2       |
  | 2026 Q1       | 133.9  | 57.2     | 47.2       |
  | 2026 Q2       | 171.5  | 89.5     | 71.6       |

- DB 중복 방지: `ingest_preliminary_earnings_from_dart()`를 두 번 연속 실행해도 7건 그대로
  (upsert라 덮어쓰기만 되고 새 행 생성 안 됨) 확인
- `GET /calendar/events`: 2026-01/04/07월, 2025-10월 각각 조회해서 해당 월에
  `dart-earnings-005930-*` 이벤트가 정확히 1건씩 포함되는 것 확인
- 기존 데이터 영향 없음: 전체 160건 → **167건**(+7), `category` 그룹별 건수는 dividend
  42/macro 118(FRED 58+KIS IPO 43+FOMC 17, 그대로) + earnings 7(신규) - CPI/PPI/FOMC 등
  기존 데이터는 전혀 변경되지 않음

### 발견된 문제점

- 2026 Q2 영업이익(89.5조)·당기순이익(71.6조)이 직전 분기 대비 큰 폭으로 뛰어서 처음엔
  `thstrm_amount`/`thstrm_add_amount` 필드를 착각한 게 아닌지 의심했으나, 실제 raw 응답을
  다시 대조해서 진짜 그 분기만의 값이 맞다는 것을 확인했다(계산 오류 아님 - 위 3번 참고)
- 그 외 새로 발생한 오류는 없음(2단계에서 이미 페이지네이션/콤마 파싱 등을 미리 검증해둔
  덕분)

### 다음 단계

- 2차(상세) 공시일에 당기순이익을 포함한 별도 이벤트를 만들지 여부 결정
- 삼성전자 외 기업으로 확장할지, 확장한다면 report_nm 패턴("영업(잠정)실적")이 다른 기업에도
  동일하게 적용되는지 확인 필요(현재는 삼성전자로만 검증됨)
- `_dart_quarter_period()`의 "1/4/7/10월에만 1차 공시" 가정이 12월 결산이 아닌 회사에도
  성립하는지 확인 필요(확장 시)
- `news-data.ts`에는 아직 반영 안 함

## 39. `back/dev` 통합 — calendar 도메인을 팀 공용 dev 브랜치에 병합

지금까지 `back/feat/calendar` 브랜치 위에서만 진행하던 FRED/KIS/FOMC/DART 작업을, 팀이 같이
쓰는 `back/dev` 브랜치로 병합해서 push했다. `back/dev`에는 그동안 다른 팀원이 만든
timeline(지표 바·슬롯 수집·보고서)·briefing 도메인이 이미 들어있었고, **calendar 도메인
자체가 `back/dev`에는 아직 한 번도 합쳐진 적이 없었다** - 그래서 이번 병합은 단순 업데이트가
아니라 calendar 도메인 전체(backend+frontend)를 `back/dev`에 처음 들여오는 작업이었다.

### 절차

1. 병합 전 `back/feat/calendar`에 남아있던 미커밋 프런트 변경(`calendar-view.tsx`,
   `news-data.ts`)을 `git stash push -u`로 대피
2. `git checkout -b back/dev origin/back/dev`로 로컬에 최신 `back/dev` 생성
3. `git merge back/feat/calendar`로 병합 시도 - 4개 파일 충돌
4. 각 충돌을 "한쪽만 채택"이 아니라 **양쪽이 각자 추가한 내용을 전부 살리는 방식**으로 해결
   (아래 상세)
5. 병합 커밋 생성 - 스모크 테스트로 실제로 서버가 뜨는지 확인 (아래 상세)
6. `origin/back/dev`에 push (`392944f..96c2341`)
7. `back/feat/calendar`로 복귀, 1번에서 대피한 변경사항 `git stash pop`으로 복원

### 충돌 해결 내용

- **`backend/src/backend/core/config.py`**: `back/dev` 쪽이 그새 `naver_api_key_id`/
  `naver_api_key`/`gemini_api_key`/`cloudflare_account_id`/`cloudflare_api_token`/
  `supabase_url`/`supabase_service_key`를 추가했고, `kis_app_key`/`kis_app_secret`도
  필수(`str`)에서 선택(`str | None = None`)으로 바뀌어 있었다. 여기에 `back/feat/calendar`의
  `fred_api_key`/`dart_api_key`를 추가하는 방식으로 합쳤다 - 두 브랜치가 서로 다른 필드를
  추가한 것이라 실제 내용 충돌은 없었고, 텍스트 위치만 겹친 것이었다
- **`backend/.env.example`**: 위와 같은 이유로 같은 방식으로 병합(`NAVER_*`/`GEMINI_API_KEY`
  뒤에 `DART_API_KEY` 추가)
- **`backend/main.py`**: `back/dev` 쪽이 로그 설정(`setup_logging`)·스케줄러를
  `BackgroundScheduler`에서 `AsyncIOScheduler` + 슬롯 수집 8개로 크게 확장해뒀었다. import문만
  충돌났고(`calendar_router` import 위치), 실제 `app.include_router(calendar_router)` 호출부는
  이미 자동 병합되어 있었다 - import문에 `calendar_router`를 추가하는 것으로 해결
- **`backend/src/backend/core/kis_client.py`**: 가장 큰 충돌. `back/dev` 쪽이 그새
  업종지수·등락률/거래량 순위·국내휴장일·예상체결순위·투자자매매동향·지수/종목 기간별 시세·
  코스피 마스터파일까지 10개 함수를 새로 추가했고, `back/feat/calendar` 쪽은 이번 세션에서
  만든 배당/합병분할/IPO/유상증자/무상증자 5개 KSD 함수를 추가했다 - 서로 다른 함수를 파일
  끝에 이어붙인 것뿐이라 두 블록을 순서대로 이어 붙이는 것으로 해결(내용 손실 없음)

### 병합 후 추가로 발견해서 고친 문제

병합 자체는 충돌 없이 끝났지만, `back/dev`의 `core/database.py`가 그새
`async_session()`(컨텍스트매니저 함수)을 없애고 `get_session_factory()`(세션메이커를 반환,
호출부에서 `get_session_factory()() as session`으로 열어 써야 함) 구조로 바뀌어 있었다.
`services/calendar.py`는 이 변경 이전 구조를 그대로 쓰고 있어서, 병합 직후
`python -c "import main"`으로 실제 import를 시도해보고서야 `ImportError: cannot import name
'async_session'`를 발견했다. `services/calendar.py`의 `async_session()` 호출 9곳을 전부
`get_session_factory()()`로 바꾸고 import문도 수정해서 해결 - 병합 자체는 텍스트 충돌이
없었지만 이런 "충돌 없이 조용히 깨지는" 문제가 있을 수 있다는 걸 보여주는 사례라 남겨둔다.

### 검증

- 4개 충돌 파일 + 후속 수정 파일 전부 `ast.parse()`로 문법 확인
- `uv run python -c "import main"` - 에러 없이 성공(1차 시도는 위 문제로 실패, 수정 후 재확인)
- `uv run uvicorn main:app`으로 실제 기동 - 스케줄러 작업 9개(`indicator_bar` +
  `slot_0730~2000`) 정상 등록, "Application startup complete" 확인
- `GET /calendar/events?year=2026&month=9` - 13건 정상 응답(macro 카테고리, FRED+FOMC 섞여
  있음)
- `GET /timeline/indicators` - 200 정상 응답(calendar 도메인 추가가 기존 timeline 도메인에
  영향 없음을 확인)
- `GET /` - 정상 응답

### 결과

- `back/dev`가 `392944f` → `96c2341`(병합 커밋)로 갱신, origin에 push 완료
- `back/feat/calendar`의 FRED(58)/KIS(85)/FOMC(17)/DART(7) = 167건 calendar 데이터와 관련
  코드 전체가 `back/dev`에 처음으로 합류
- `back/feat/calendar` 브랜치 자체는 그대로 유지(삭제하지 않음), 로컬 미커밋 프런트 변경사항도
  stash pop으로 복원해서 작업 전 상태 그대로 돌아옴

### 남은 것

- `services/calendar.py`의 KIS 함수들(배당/IPO 등)은 여전히 `get_settings()` +
  수동 `httpx.get()` 방식이고, `back/dev`가 새로 도입한 `_checked_settings()`/`_headers()`/
  `_get_with_retry()` 공용 헬퍼 스타일로는 통일하지 않았다 - 지금은 정상 동작하지만, 다음에
  `kis_client.py`를 다시 손볼 일이 있으면 일관성 있게 리팩터링할지 검토
- `back/dev`에는 이제 `frontend/app/(main)/calendar/` 쪽 UI도 함께 들어갔지만, 이번 세션에서
  작업한 FOMC/DART 실데이터는 아직 `news-data.ts`에 반영되지 않은 상태로 병합됨(반영은 별도
  작업 필요)

## 40. DART 실적 이벤트를 SK하이닉스·현대차로 확장

38번 항목에서 삼성전자 1개 기업으로 구현한 DART 실적 이벤트 로직을 SK하이닉스·현대차까지
확장했다. `get_preliminary_earnings()`/`get_key_accounts()`/`ingest_preliminary_earnings_from_dart()`
는 처음부터 corp_code/stock_code/corp_name을 인자로 받는 일반 함수였어서(38번 항목에서 이미
그렇게 설계함), 삼성전자 전용 코드를 복제할 필요는 없었다. 대신 새 기업으로 실제 라이브 데이터를
확인하는 과정에서 **키워드 매칭 버그를 하나 발견해서 고쳤다.**

### corp_code 확인 (추측 없이 실제 조회)

`get_corp_codes()` + `find_corp_by_stock_code()`로 조회해서 확인:

| 기업                            | corp_code | stock_code |
| ------------------------------- | --------- | ---------- |
| 삼성전자                        | 00126380  | 005930     |
| SK하이닉스                      | 00164779  | 000660     |
| 현대차(DART 등록명: 현대자동차) | 00164742  | 005380     |

### 발견한 문제: `_PRELIMINARY_EARNINGS_KEYWORD`가 현대차의 월간 판매실적까지 잘못 잡음

SK하이닉스는 삼성전자와 똑같이 "연결재무제표기준영업(잠정)실적(공정공시)"만 분기당 1건씩(2년간
7건) 나와서 문제가 없었다. 그런데 **현대차는 이 분기 공시와 별개로 매달 "영업(잠정)실적(공정공시)"
(접두사 "연결재무제표기준" 없음, 월간 판매실적으로 추정)를 따로 공시하고 있었다** - 기존 키워드
`"영업(잠정)실적"`은 두 report_nm 모두에 포함된 부분문자열이라, 현대차만 조회하면 분기 실적
7건이 아니라 21개월치 월간 공시까지 섞여서 **28건**이 걸리는 문제를 실제 라이브 호출로
발견했다. 키워드를 `"연결재무제표기준영업(잠정)실적"`(접두사까지 포함)으로 좁혀서 해결 -
수정 후 현대차도 정확히 분기당 1건씩 7건만 잡히는 것을 재확인했고, 삼성전자·SK하이닉스는
이 변경으로 결과가 달라지지 않는 것도 재확인했다(`core/dart_client.py`).

### 분기 판단 로직(`_dart_quarter_period`) 재검증

3개 기업의 1차 잠정실적 rcept_dt를 전부 확인한 결과, 셋 다 예외 없이 1/4/7/10월에만 공시가
나왔다 - 38번 항목에서 삼성전자로만 확인했던 "1/4/7/10월 가정"이 SK하이닉스·현대차에도
그대로 성립하는 것을 확인했다(셋 다 12월 결산이라 성립하는 것으로 보이며, 결산월이 다른
회사로 더 확장할 때는 재검증 필요 - 원래 남겨둔 다음 단계 항목 그대로 유효).

### 기업별 발표 주기 차이

SK하이닉스·현대차는 삼성전자와 달리 **분기당 1건만** 공시한다(삼성전자처럼 1차 가이던스 +
2차 상세로 나뉘지 않음). 기존 `get_preliminary_earnings()`의 날짜 클러스터링 로직(45일 간격
기준으로 그룹을 나누고 그룹의 첫 날짜를 채택)은 그룹에 1건만 있어도 그대로 동작해서 별도
분기 처리가 필요 없었다.

### 구현

- **수정**: `core/dart_client.py` - `_PRELIMINARY_EARNINGS_KEYWORD` 좁힘, 관련 주석 갱신,
  모듈 상단 주석에서 "삼성전자 테스트 단계" 표현을 "조회 전용, 저장은 services가 담당"으로 정리
- **수정**: `scripts/test_dart_earnings.py` - 삼성전자 상수 3개를 `COMPANIES` 리스트(기업당
  corp_code/corp_name/stock_code)로 교체하고 전체 로직을 기업별 반복으로 변경. 미리보기
  단계에서 `calendar_service._dart_quarter_period()`를 재사용해 분기 라벨과 계정 수치까지
  같이 출력하도록 보강(저장 전 검증 강화)
- `services/calendar.py`는 변경 없음 - 애초에 기업 중립적으로 설계되어 있었다

### 테스트 결과

- 미리보기(DB 저장 없음)에서 3개 기업 각 7건씩 확인 - report_nm/발표일/분기라벨/매출액/영업이익/
  당기순이익까지 전부 실제 값으로 출력해서 확인
- 저장 실행: 삼성전자 7 + SK하이닉스 7 + 현대차 7 = **21건 upsert**
- 재실행(중복 방지 확인): 동일하게 21건 - 삼성전자 7건은 이미 있던 id라 upsert로 덮어쓰기만
  되고 새 행이 생기지 않았고, SK하이닉스·현대차 14건이 신규로 추가됨
- Supabase 전체: 167 → **181건**(+14, 신규 2개 기업분만 순증)
- 각 기업 실제 DART 수치(조원, CFS 기준) 일부:

  | 기업       | 2025 Q1 매출 | 2025 Q1 영업이익 | 2025 Q1 당기순이익 |
  | ---------- | ------------ | ---------------- | ------------------ |
  | 삼성전자   | 79.1         | 6.7              | 8.2                |
  | SK하이닉스 | 17.6         | 7.4              | 8.1                |
  | 현대차     | 44.4         | 3.6              | 3.4                |

- `GET /calendar/events`: 2026-01/04월, 2025-10월 각각 조회해서 세 기업의
  `dart-earnings-{stock_code}-*` 이벤트가 해당 월에 정확히 1건씩(총 3건) 포함되는 것 확인,
  `actual` 값도 위 표와 일치
- 기존 데이터 영향 없음: 9월 조회 시 FOMC 2건·FRED 5건 그대로, CPI/PPI/FOMC 등 이번 확장과
  무관한 데이터는 전혀 변경되지 않음

### 발견된 문제점

- 위에서 설명한 현대차 키워드 오탐(월간 판매실적 vs 분기 잠정실적) - 수정 완료
- 그 외 새로 발생한 문제 없음(id 스킴이 `dart-earnings-{stock_code}-{rcept_dt}`라 기업 간
  ID 충돌 가능성 자체가 없었음)

### 다음 단계 — NVIDIA/Apple 연결을 위해 필요한 작업

- DART는 한국 기업 전자공시 시스템이라 미국 기업(NVIDIA/Apple)에는 애초에 적용 불가 - 미국
  기업은 SEC EDGAR(10-Q/10-K, 8-K 실적 발표) 등 별도 데이터 소스 조사 필요
- 미국 기업의 "실적 발표일"은 정기보고서 접수일이 아니라 실적 발표(어닝콜) 날짜를 어떻게
  구할지부터 확인 필요(EDGAR는 재무제표 원본은 주지만 "발표 일정"을 별도로 안 줄 수 있음 -
  DART의 "1차 잠정실적 vs 정기보고서" 문제와 비슷한 구조가 있을 수 있어 미리 조사 필요)
- 한국 기업을 더 늘릴 경우 12월 결산이 아닌 회사(일부 금융지주 등)가 있는지 확인하고
  `_dart_quarter_period()`의 1/4/7/10월 가정이 깨지는지 재검증 필요
- `news-data.ts`에는 아직 반영 안 함

## 41. 프런트 `/calendar` 실데이터 재반영 — DART 실적 발표 21건 포함 181건

40번 항목에서 확장한 SK하이닉스·현대차 실적 이벤트를 포함해 Supabase 전체 181건을
`frontend/app/(main)/calendar/news-data.ts`에 다시 반영하고, 실제 화면에서 확인했다.
19번·29번·35번 항목과 같은 방식(구조/타입/컴포넌트는 그대로, `NEWS` 배열 내용만 교체)이다.

- Supabase에서 181건을 export → TypeScript 리터럴로 변환 → 기존 파일의 헤더(타입/유틸/CAT 등)
  ·푸터(MARKET_HOLIDAYS 등)는 그대로 두고 `NEWS` 배열만 교체
- 교체 전 파일 상태 점검 중 사소한 문제 발견: 이전 회차(35번 항목)에서 저장된 파일의 배열
  마지막 항목과 닫는 대괄호가 한 줄에 붙어 있었다(`...} },]`) - 문법상 문제는 없지만(트레일링
  콤마 허용) 다음에 또 이 패턴으로 파싱 스크립트를 짜면 헷갈릴 수 있어 이번 재작성 때 정상적인
  줄바꿈으로 정리됨
- `npx tsc --noEmit`으로 타입 에러 없음 확인
- 백엔드(8080)/프런트(3000) 재기동 후 Playwright로 실제 `/calendar` 화면 확인. 오늘(2026-09-15)
  기준 기본 화면은 9월이라 실적 이벤트가 안 보여서, "이전 달" 버튼을 5회 클릭해 2026년 4월로
  이동한 뒤 캡처 - 4/7 "삼성전자 실적 발표", 4/23 "SK하이닉스 실적 발표"·"현대차 실적 발표"
  카드가 정상적으로 함께 표시되는 것 확인(같은 화면에 FOMC 4/9·4/30, 배당·공모주 데이터도
  그대로 섞여서 잘 보임)
- 테스트 후 두 서버 모두 종료

### Supabase 최종 상태

전체 181건 (FRED 58 + KIS 85 + FOMC 17 + DART 21), 프런트 `news-data.ts`와 동기화 완료.

## 42. 발표 시각이 지난 SCHEDULED 이벤트 정리(재시딩으로 상태 최신화)

"발표 후 시간이 지나면 발표 완료로 해달라"는 요청으로 SCHEDULED 상태를 점검했다. 코드를
새로 만들 필요는 없었다 - `_ipo_event_from_kis`/`_dividend_event_from_kis`의
`status="SCHEDULED" if published_at >= today_kst else "RELEASED"` 로직과 `ingest_fomc_year`의
`_fomc_status()`(발표 시각 경과 여부로 판단)가 이미 "시간이 지나면 RELEASED로 바뀌는" 로직을
갖고 있었다. 문제는 이 `today_kst`/"지금 시각"이 **시딩 스크립트를 실행한 시점에 한 번만
계산되고 DB에 그대로 저장**된다는 점 - 그 뒤로 실제 날짜가 지나도 스크립트를 다시 실행하기
전까지는 DB에 저장된 status가 갱신되지 않는다(정적 스냅샷이라 자동으로 안 바뀜).

### 확인한 사례

`kis-ipo-0010S0-20260914`(와이즈플래닛컴퍼니, 공모가 12000원 이미 확정)가 청약일 2026-09-14가
지난 오늘(2026-09-15)까지도 `status="SCHEDULED"`로 남아있던 것을 발견 - 마지막으로 시딩한
시점(9/14 이전)의 `today_kst` 기준으로는 아직 SCHEDULED가 맞았지만, 그 뒤로 재시딩을 안 해서
그대로 굳어있었다.

### 조치

기존 시딩 스크립트를 그대로 재실행해서 "지금" 기준으로 상태를 다시 계산시켰다(로직 변경 없음,
데이터만 최신화):

- `scripts/seed_kis_dividends.py`, `scripts/seed_kis_corporate_actions.py`(IPO)
- `scripts/seed_2026_calendar.py`(FRED - 그사이 새로 발표된 실측값이 있으면 같이 반영)
- `scripts/seed_fomc_2026.py`(FOMC - 시각 기준 재계산, 9/16 회의는 아직 발표 전이라 그대로
  SCHEDULED 유지)

### 결과

- `kis-ipo-0010S0-20260914` → `RELEASED`로 정상 전환 확인
- `kis-ipo-0035S0-20260915`(오늘 날짜)는 날짜 단위 비교라 오늘 하루는 그대로 `SCHEDULED`
  유지(설계상 정상 - KIS 이벤트는 정확한 시각이 없어 날짜 단위로만 판단, 내일부터 RELEASED로
  바뀜)
- 전체 SCHEDULED 26건 → 25건(위 1건만 전환, 나머지는 실제로 아직 발표 전이라 그대로 맞음)

### 남은 것

- 이 "재시딩해야 최신화된다"는 구조 자체가 근본적인 한계다 - 시딩을 안 하면 지난 이벤트가
  계속 SCHEDULED로 보일 수 있다. 30번 항목에서부터 계속 미뤄온 "APScheduler로 자동 수집
  전환" 결정이 이 문제의 근본 해결책이 될 수 있다(정기적으로 자동 재실행되면 이런 수동 정리가
  필요 없어짐) - 아직 결정 안 됨

## 43. "이번주 AI 요약" 기능 — 프런트 시안 정리 (구현 전 문서화 단계)

사용자가 DART(실적)·FOMC(금리) 확장 작업은 잠시 보류하고, 프런트 캘린더 화면의 더미
"이번주 AI 요약" 카드(`frontend/app/(main)/calendar/calendar-view.tsx`의 `AiSummaryCard()`
— 지금은 하드코딩된 고정 문구 "경제성장률 발표를 포함한 주요 경제지표 9개가 이번 주에
발표돼요"만 보여주는 정적 컴포넌트)를 실제 데이터 기반으로 만드는 작업을 먼저 처리해달라고
요청했다. 프런트 팀이 전달한 시안과 제안된 백엔드 설계를 코드 작성 전에 먼저 문서로
정리한다 - **이번 항목은 설계만 기록하고 아직 구현하지 않았다.**

### 프런트 시안 (전달받은 화면 캡처)

카드를 클릭하면 열리는 팝업/모달 형태로, 다음 구성을 갖는다:

- 상단: "✦ 이번주 AI 요약" 배지 + 닫기(X) 버튼
- **헤드라인**: 굵은 한 줄 요약 (예: "FOMC 회의 결과 발표 등 주요 경제지표 5개가 이번 주에
  발표돼요")
- **"✓ 이번주 주요 소식이에요"** 섹션: 그 주 캘린더 이벤트를 근거로 한 설명 문단 (예: 소매판매
  발표의 의미, FOMC 회의 결과의 의미, 애플·마이크로소프트 실적 발표 언급)
- **"✓ 이런 소식도 있어요"** 섹션: 캘린더 이벤트에는 없는 시장 전반 코멘터리 (예: 중동 정세
  불안에 따른 유가 변동성, AI 투자 확대 트렌드) - **이 부분이 아래 "팀 판단 필요" 항목의
  근거다**
- **"주요 경제지표" 표**: 날짜/일정/발표(국기+제목)/예측/이전 컬럼으로, 그 주 캘린더 이벤트
  목록을 요일별로 그룹핑해서 보여줌(오른쪽 끝 컬럼에는 "오후 9시 30분 발표 예정"처럼 아직
  안 지난 이벤트의 예정 시각이 표시됨 - 화면 예시는 전부 미래 시점 이벤트라 실측값 없이
  "발표 예정"만 있음)

### 제안받은 새 테이블: `calendar_weekly_summaries`

기존 `calendar_events`와 같은 방식(KST 기준 관리, id로 upsert)을 그대로 따르는 설계.

| 컬럼               | 타입            | 설명                                              |
| ------------------ | --------------- | ------------------------------------------------- |
| `id`               | text (PK)       | 예: `"ai-summary-2026-09-14"` (그 주 월요일 날짜) |
| `week_start`       | text            | 그 주 월요일(KST, `YYYY-MM-DD`)                   |
| `week_end`         | text            | 그 주 토요일(앱이 월~토 6일 주 기준)              |
| `headline`         | text            | 맨 위 굵은 한 줄 요약                             |
| `highlights`       | text            | "이번주 주요 소식이에요" 문단                     |
| `additional_notes` | text (nullable) | "이런 소식도 있어요" 문단                         |
| `event_ids`        | jsonb/text[]    | 이 요약이 참고한 `calendar_events.id` 목록        |
| `generated_at`     | timestamp       | 생성 시각                                         |
| `model`            | text            | 어떤 LLM으로 생성했는지(감사/디버깅용)            |

`event_ids`로 실제 이벤트를 참조만 하고, "주요 경제지표" 표는 프런트가 이미 갖고 있는
`GET /calendar/events` 데이터와 조인해서 그리는 방식 - 이벤트 내용을 이 테이블에 중복
저장하지 않는다. 이 프로젝트가 지금까지 지켜온 "한 사실은 한 곳에만 저장"(`calendar_events`
컬럼 구조를 그대로 유지하고 새 컬럼을 함부로 늘리지 않는다는 원칙)과 정합적인 설계다.

### 제안받은 새 엔드포인트

```
GET /calendar/weekly-summary?week_start=2026-09-14
```

응답 예시:

```json
{
  "weekStart": "2026-09-14",
  "weekEnd": "2026-09-19",
  "headline": "...",
  "highlights": "...",
  "additionalNotes": "...",
  "eventIds": ["fred-CPIAUCSL-2026-08-01", "fomc-2026-09-16-FOMC_STATEMENT"],
  "generatedAt": "2026-09-15T09:00:00+09:00"
}
```

### 제안받은 생성 트리거: 요청 시 즉석 생성이 아니라 스케줄러로 미리 생성

`main.py`(현재 back/dev 쪽 버전 기준)에 이미 `BackgroundScheduler`/`AsyncIOScheduler` +
`CronTrigger`로 지표 바를 주기적으로 갱신하는 `market_indicator_service.refresh_all` 패턴이
있으므로, 같은 방식으로 **매주 월요일 아침에 한 번만** 그 주 `calendar_events`를 모아 LLM을
호출해 `calendar_weekly_summaries`에 upsert하는 방식을 제안받았다. 이러면:

- 사용자 요청 시점에는 LLM 호출 없이 DB만 읽어서 응답 - 빠르고 실패 지점이 적음
- LLM 호출 비용이 주 1회로 고정됨(요청마다 호출하는 것보다 훨씬 저렴)

### 팀 판단이 필요한 정책 결정 (기술 문제가 아니라 방향 결정)

시안의 "이런 소식도 있어요" 섹션(중동 정세 불안·유가 변동성, AI 투자 확대 트렌드 등)은
**우리 `calendar_events` DB에 없는 내용**이다 - LLM이 자기 일반 지식으로 덧붙이는 부분이라는
뜻이다. 이 프로젝트의 CLAUDE.md(2번 항목, "가장 중요한 개발 원칙")와 지금까지의 모든 구현
결정(forecast/importance는 근거 없으면 무조건 null, actual/previous는 실제 API 응답값만
사용, FOMC 회의 결과도 실제 확인된 값만 채움 등)은 **"근거 없는 값은 임의로 만들지 않는다"**
는 원칙을 강하게 지켜왔다. 이 원칙을 "이번주 AI 요약"에도 그대로 적용한다면:

- **선택지 A**: 요약을 `calendar_events`에 실제로 존재하는 이벤트만 근거로 작성(LLM이
  이벤트 목록을 자연어 문장으로 풀어쓰는 역할만 함) - "이런 소식도 있어요" 같은 DB 밖
  일반 지식 섹션은 만들지 않거나, 만들더라도 근거 이벤트가 있는 경우만 채움
- **선택지 B**: 시안 그대로 LLM의 일반 지식(지정학 이슈, 트렌드 등)까지 섞어서 더 풍부한
  요약을 제공 - 단, 이 경우 지금까지의 "임의 생성 금지" 원칙에서 벗어나는 예외를 만드는
  것이므로 명시적으로 합의하고, UI에도 "이 내용은 AI가 추정한 시장 일반 정보이며
  calendar_events 근거가 없습니다" 같은 구분 표시가 필요할 수 있음

이건 스키마 문제가 아니라 팀 판단이 필요한 부분이라 구현 전에 미리 짚어둔다.

### 정책 결정 확정: A 기본 + 선택적 B(명시적 구분 표시)

사용자가 확정한 방향은 다음과 같다:

- **기본은 A**: "이번주 주요 소식이에요"는 그 주 `calendar_events`에 실제로 있는 이벤트만
  근거로 LLM이 자연어 문장으로 풀어쓴다. 여기 등장하는 내용은 전부 `event_ids`로 추적
  가능해야 한다 - 이 프로젝트의 "근거 없는 값은 임의 생성 금지" 원칙을 그대로 지킨다.
- **"이런 소식도 있어요"(B에 해당하는 일반 지식 섹션)는 완전히 배제하지 않되, 반드시
  명시적으로 구분 표시한다** - 안내 문구는 **"AI가 참고로 덧붙인 시장 이야기예요"**로
  확정(사용자 확정, 2026-09-15). "근거 없음" 같은 딱딱한 표현 대신, 이 프로젝트의 다른
  카피 톤("~예요/돼요")에 맞춘 문구다. 이 문구를 DB 근거 기반 내용(A)과 LLM 일반 지식(B)이
  화면에서 섞여 보이지 않도록 `additional_notes` 옆에 항상 같이 표시한다.
- 정리하면: 데이터 구조상 `highlights`(DB 근거, A) 필드와 `additional_notes`(LLM 일반 지식,
  구분 표시 필요, B) 필드를 이미 분리해서 설계해뒀던 것이 이 결정과 정확히 맞아떨어진다 -
  프런트에서 `additional_notes`를 렌더링할 때 반드시 "AI가 참고로 덧붙인 시장 이야기예요"
  문구를 같이 표시해야 한다는 조건이 추가된 것으로 이해하면 된다.

### 현재 상태

- 아직 아무 코드도 작성하지 않음(테이블 생성·엔드포인트·스케줄러 전부 미구현) - 정책
  결정까지만 확정된 단계
- 이 항목 문서화 전에 진행 중이던 DART(실적)·FOMC(금리) 확장 작업은 사용자 지시로 보류 -
  "이후 좀 더 보강" 예정
- 다음 단계: 구현 착수(테이블 생성 → 엔드포인트 → 스케줄러 → LLM 프롬프트 설계, `highlights`
  는 이벤트 목록만 근거로 쓰도록 강하게 제약하고 `additional_notes`는 구분 표시 조건을
  프런트와 맞춰야 함). GEMINI_API_KEY는 현재 `back/feat/calendar` 브랜치의 `config.py`/
  `.env`에 없음(back/dev 쪽에서 다른 도메인이 이미 등록해둠) - 구현 시작 시 이 브랜치에도
  추가 필요

### `calendar_weekly_summaries` 테이블 생성 완료

설계한 스키마 그대로 Supabase에 실제로 생성했다(마이그레이션 도구 없이, 기존 `calendar_events`
때와 같은 방식 - `core/database.py`의 세션으로 raw SQL 실행).

```sql
CREATE TABLE calendar_weekly_summaries (
    id                text PRIMARY KEY,
    week_start        text NOT NULL,
    week_end          text NOT NULL,
    headline          text NOT NULL,
    highlights        text NOT NULL,
    additional_notes  text,
    event_ids         jsonb NOT NULL DEFAULT '[]'::jsonb,
    generated_at      timestamptz NOT NULL,
    model             text NOT NULL
);

CREATE UNIQUE INDEX idx_calendar_weekly_summaries_week_start
    ON calendar_weekly_summaries (week_start);
```

- `event_ids`는 리스트 저장이 필요해서 `calendar_events`에는 없던 `jsonb` 타입을 처음 도입함
  (Python에서 `list[str]`을 그대로 넣고 뺄 수 있음). 기본값 `'[]'::jsonb`로 빈 리스트 허용.
- `week_start`에 유니크 인덱스 - 주당 요약이 1건만 존재하도록 DB 레벨에서 보장하고,
  `GET /calendar/weekly-summary?week_start=...` 조회에도 그대로 씀.
- `generated_at`은 `calendar_events`의 다른 날짜 컬럼들과 달리 `text`가 아니라
  `timestamptz`로 만들었다 - 이 컬럼은 화면에 표시되는 "발표일"이 아니라 순수 감사/디버깅용
  메타데이터라서, `calendar_events`가 `publishedAt`을 `text`로 고정한 이유(사전순 정렬=날짜순
  정렬)가 여기엔 적용되지 않는다고 판단함.
- `additional_notes`만 nullable - 그 주에 LLM이 덧붙일 일반 시장 코멘트가 없으면 비워둘 수
  있다(43번 항목에서 확정한 "AI가 참고로 덧붙인 시장 이야기예요" 문구는 이 필드가 실제로
  값이 있을 때만 프런트에서 같이 표시).
- 테이블 생성만 완료된 상태 - 이 테이블에 데이터를 채우는 엔드포인트/스케줄러/LLM 호출
  로직은 아직 구현하지 않았다.

## 44. "이번주 AI 요약" 자세히 보기 팝업 — 프런트 UI 선구현 (테이블만 실데이터)

사용자가 "'이번주 AI 요약'의 자세히 보기를 클릭하면 페이지를 만들어서 시안대로 보여줘"라고
요청했다. 백엔드 LLM 요약 생성(엔드포인트/스케줄러)은 아직 없어서, 헤드라인/"이번주 주요
소식이에요" 문구는 준비 중 안내로 두고, **"주요 경제지표" 표만 실제 `calendar_events`
데이터로 채우는 방식**으로 진행하기로 사용자와 확정했다(43번 항목의 A/B 정책 결정과는 별개로,
"지금 당장 뭘 보여줄 수 있는가"에 대한 실용적 절충).

이 항목은 이례적으로 프런트 코드를 직접 수정한다 - 그동안 세션 내내 지켜온 "프런트 디자인
수정 금지" 원칙은 DART/FOMC 단계별 작업 지시에 한정된 제약이었고, 이번엔 사용자가 명시적으로
프런트 UI 작업을 요청했다.

### 구현

- **신규**: `frontend/app/(main)/calendar/weekly-summary-panel.tsx` - `WeeklySummaryDialog`
  컴포넌트. 기존 `news-panel.tsx`의 `DayDetailDialog`와 똑같은 `@base-ui/react/dialog` 패턴
  (Root/Portal/Backdrop/Popup/Title/Close)을 그대로 따라서 새 팝업 스타일을 처음부터 다시
  만들지 않았다.
  - `useThisWeekEconomicEvents(today)`: "이번 주"를 월요일~토요일(43번 항목의
    `week_start`/`week_end` 정의와 동일)로 계산하고, `NEWS`에서 `region === "미국"`이면서
    `category`가 `"macro"`/`"rate"`인 항목만 그 기간으로 필터링. **KIS 배당/IPO도 category가
    `"macro"`라서 카테고리만으로는 걸러지지 않는다** - `region === "미국"` 조건을 추가해야
    시안처럼 FRED/FOMC(전부 미국발)만 남는 것을 실제 데이터로 확인하고 반영했다.
  - 프런트 `NewsItem` 타입에는 `status`/`actual` 필드가 아예 없다(29번 항목에서부터 알려진
    한계 - 백엔드 `CalendarEvent`에는 있지만 프런트 타입엔 반영 안 됨). 그래서 "이미
    발표됐는지"는 `n.status`가 아니라 **`publishedAt`을 현재 시각과 직접 비교**해서 판단하도록
    구현 - 아직 안 지난 이벤트는 `"오후 9시 30분 발표 예정"` 형태로, 지난 이벤트는
    `detail.previous` 값(없으면 `"-"`)을 보여준다.
  - "예측" 컬럼은 시안에 있지만 이 프로젝트는 forecast를 절대 임의 생성하지 않는 원칙이라
    실제로도 항상 `null`이다 - `detail?.forecast ?? "-"`로 항상 `-`가 나오는 게 정상이다
    (거짓 값이 아니라 진짜 데이터가 없다는 뜻).
- **수정**: `calendar-view.tsx`
  - `RegionBadge`를 로컬 함수에서 `export`로 변경(새 파일에서 재사용)
  - `AiSummaryCard`가 `today` prop을 받도록 변경, "자세히 보기"를 `<span>`에서 클릭 가능한
    `<button>`으로 바꾸고 `useState`로 팝업 열림 상태 관리, `<WeeklySummaryDialog>` 렌더링
    추가
  - 카드에 미리 보이는 더미 문구("...9개가 이번 주에 발표돼요")는 이번 요청 범위 밖이라
    손대지 않음(요청은 "자세히 보기 클릭 시" 페이지에 한정됨) - 클릭 전 카드와 클릭 후
    팝업의 문구가 서로 다르다는 점은 알아둘 필요가 있음(카드는 여전히 더미, 팝업은 표만 실데이터)

### 테스트

- `npx tsc --noEmit` 통과
- 백엔드(8080)/프런트(3000) 기동 후 Playwright로 "자세히 보기" 클릭 → 실제 팝업 캡처.
  2026-09-15(오늘) 기준 이번 주(9/14~9/19)에 해당하는 FOMC 이벤트 2건(`미국 경제전망(SEP)
공개`, `미국 FOMC 금리결정`, 둘 다 9/17 발표 예정)이 표에 정확히 표시되는 것 확인 -
  헤드라인도 하드코딩이 아니라 `events.length`(=2)로 실시간 계산된 값
- 테스트 후 두 서버 모두 종료

### 남은 것

- 카드 자체의 더미 문구("9개가 이번 주에 발표돼요")는 그대로 남아있음 - 나중에 카드도
  `events.length` 기반으로 바꿀지, 아니면 백엔드 요약 API가 준비될 때까지 그대로 둘지 결정
  필요
- 43번 항목의 실제 백엔드 구현(테이블은 이미 생성됨, 엔드포인트·스케줄러·LLM 호출은 미착수)
  이 완료되면 이 팝업의 헤드라인/"이번주 주요 소식이에요"/"이런 소식도 있어요" 부분을
  `GET /calendar/weekly-summary` 응답으로 교체해야 함

## 45. "이런 소식도 있어요" 정책 재검토 — `timeline_news` 실데이터로 근거 확보 (A/B 문제 해결)

43번 항목에서 "이런 소식도 있어요"(중동 정세, AI 투자 확대 등 DB 밖 일반 시장 코멘트)를
LLM 일반 지식(B)으로 채울지, 아예 안 만들지(A)를 팀이 판단해야 한다고 남겨뒀었다. 사용자가
제3의 방법을 제안했다 - **timeline 도메인의 `timeline_news` 테이블(네이버 뉴스 검색 결과를
실제로 수집해둔 테이블)에 있는 진짜 기사들을 근거로 이 섹션을 채우면 어떤가**라는 것.

### 실제로 확인한 내용

- `timeline_news`/`timeline_slot` 테이블 둘 다 Supabase에 이미 존재하고, 실제 데이터가
  쌓여 있는 것을 라이브 쿼리로 확인했다: `timeline_slot` 15행, `timeline_news` 83건 -
  오늘(2026-09-15) 17:30 슬롯 뉴스까지 실제로 들어와 있음(코스피 마감시황, 원달러 환율,
  두산퓨얼셀 특징주 등 실제 네이버 뉴스 기사, 각각 진짜 기사 URL 포함)
- 이 데이터는 `back/feat/calendar` 브랜치 코드가 아니라 timeline 도메인의 다른 프로세스가
  (Naver 뉴스 검색 API로) 이미 채워둔 것 - 이 브랜치엔 `models/timeline.py`의 `TimelineNews`
  ORM 클래스 정의만 있고 실제 수집 서비스 코드(`news_service.py`)는 없지만, Supabase는
  전체 팀이 공유하는 하나의 DB라서 테이블과 데이터 자체는 그대로 조회 가능
- `TimelineNews` 컬럼: `id`, `timeline_slot_id`(FK), `title`, `summary`, `url`.
  `TimelineSlot`을 조인하면 `trade_date`/`time_slot`까지 얻을 수 있어 "이번 주" 범위로
  필터링 가능

### 정책 재정의

"이런 소식도 있어요"는 LLM의 사전 지식(B)이 아니라 **그 주 `timeline_news`에 실제로 수집된
기사들을 LLM이 요약**하는 방식으로 채운다. 이러면:

- 43번 항목의 원래 딜레마(A: 밋밋하지만 안전 / B: 풍부하지만 검증 불가)가 사라진다 - 근거는
  실제 기사(`timeline_news.id`+`url`)로 100% 추적 가능하면서도, `calendar_events`에는 없는
  시장 전반 분위기(정세·업종 동향 등)까지 자연스럽게 담을 수 있다
- "AI가 참고로 덧붙인 시장 이야기예요"(42→43번 항목에서 확정한 문구)라는 안내 표시는 여전히
  유지한다 - `calendar_events`(일정) 근거가 아니라 `timeline_news`(기사) 근거라는 점은
  다르다는 걸 사용자에게 알려주는 게 맞다고 판단(문구 자체는 "일정 근거는 없다"는 취지라
  그대로 써도 정합적)

### 스키마 변경

`calendar_weekly_summaries`에 `news_ids` 컬럼을 추가했다(생성 직후라 아직 데이터가 없어서
컬럼 추가에 위험 부담 없음):

```sql
ALTER TABLE calendar_weekly_summaries
ADD COLUMN news_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
```

`event_ids`(계산 근거: `calendar_events.id` 목록)와 대칭되는 구조로, `news_ids`는
`additional_notes`를 만들 때 참고한 `timeline_news.id` 목록을 담는다. 최종 컬럼 구성:

| 컬럼               | 근거 데이터                     |
| ------------------ | ------------------------------- |
| `highlights`       | `event_ids` → `calendar_events` |
| `additional_notes` | `news_ids` → `timeline_news`    |

### 다음 단계

- LLM 프롬프트 설계 시 `additional_notes`는 "그 주 `timeline_news` 기사 목록만 참고해서
  요약하고, 목록에 없는 사실은 언급하지 말 것"이라는 제약을 명시적으로 넣어야 한다(A안에서
  `highlights`에 적용하려던 것과 같은 원칙을 뉴스 소스에도 동일하게 적용)
- `timeline_news`를 그 주 범위로 조회하는 쿼리(및 트레이드데이트 기준 "이번 주" 정의를
  `calendar_weekly_summaries`의 `week_start`/`week_end`와 맞추는 로직) 구현 필요
- 이 브랜치엔 news 수집 서비스 코드가 없으므로, `timeline_news`를 읽기만 하고 쓰지는
  않는다(calendar 도메인은 이 테이블의 소비자일 뿐 생산자가 아님) - 도메인 경계를 지키는
  선에서 조회 전용으로 접근

### 프런트 팝업에 "이런 소식도 있어요" 섹션 누락 수정

사용자가 실제 화면에서 팝업을 열어보고 "소식이 없는데?"라고 지적했다 - 44번 항목에서
`WeeklySummaryDialog`를 만들 때 "이번주 주요 소식이에요" 섹션만 넣고 "이런 소식도 있어요"
섹션 자체를 아예 빠뜨렸었다(당시엔 이 섹션의 데이터 소스 정책이 아직 안 정해진 상태였다).
45번 항목에서 `timeline_news` 기반으로 정책을 확정했으니, 같은 방식(준비 중 안내)으로
자리를 마련해뒀다:

```
✓ 이런 소식도 있어요
AI가 참고로 덧붙인 시장 이야기예요. 이 부분도 아직 준비 중이에요.
```

`weekly-summary-panel.tsx`에 섹션 추가, Playwright로 실제 팝업에 두 섹션("이번주 주요
소식이에요" / "이런 소식도 있어요")이 나란히 표시되는 것 확인.

### "이런 소식도 있어요" 실제 뉴스 기반 미리보기 테스트

사용자가 "뉴스를 정리해서 텍스트로 보여달라"고 요청해서, `timeline_news`에서 이번 주
(2026-09-14~15, 실제로 쌓인 만큼) 기사 83건을 전부 조회해서 직접 읽고 요약 문단을 만들었다
(LLM 자동 파이프라인이 아직 없어서 이번엔 직접 종합함). 주요 흐름: 사우디 송유관 드론
공격발 국제유가 급등 → 미국 10년물 국채금리 5% 근접 → FOMC 앞둔 긴축 경계감 → 미국
빅테크의 "AI 개발 속도조절론"에 따른 반도체 대형주(삼성전자·SK하이닉스) 급락 → 코스피
6600선 후퇴 → 한국거래소 애프터마켓(오후 4~8시) 신규 개장.

이 요약을 "우선 테스팅으로 보여달라"는 요청에 따라 `weekly-summary-panel.tsx`의 "이런
소식도 있어요" 자리에 **테스트용으로 하드코딩**해서 넣고 Playwright로 실제 팝업에 표시되는
것까지 확인했다 - "(테스트 미리보기 — timeline_news 실제 기사 기반)"이라고 명시해서, 아직
자동 생성이 아니라 수동 검증용 샘플이라는 걸 구분해뒀다.

이건 어디까지나 프리뷰다 - 실제 서비스에서는 이 문단을 `calendar_weekly_summaries.
additional_notes`에 저장하고 `news_ids`에 근거 기사 id(예: [6, 49, 54, 47, 51, 52, 16, 41,
43, 13, 21, 68, 78, 10, 33, 83, 24, 39, 63, 70, 74, 76])를 채우는 자동 파이프라인(LLM
프롬프트로 "이 기사 목록만 근거로 요약하라"는 제약을 건 뒤 생성)으로 대체해야 한다.

### 범위를 "이번 주"에서 "오늘"로 좁힌 재요약

사용자가 "오늘 기사 기반으로 보여달라"고 요청해서, 위 요약을 이번 주 전체(83건) 대신
**오늘(2026-09-15) 슬롯의 기사 38건만**으로 다시 종합했다. 오늘자 흐름: 사우디 송유관
드론 공격발 유가 급등(105달러대) → 美 10년물 국채금리 5% 근접 → 코스피 0.85%↓(6627.26
마감)·코스닥은 오히려 0.70%↑(812.41 마감) → 원달러 1359.4원 마감 → **코스닥 바이오
기업 다수를 겨냥한 주가조작 합동대응단 압수수색**(오늘 유독 반복적으로 보도된 이슈,
관련 기사만 6건) → HD현대중공업 노조 파업 하락 / 두산퓨얼셀 美 수주 강세 / 이차전지주
강세(中배터리 견제 기대) 등 개별 특징주.

`weekly-summary-panel.tsx`의 테스트 미리보기 문구를 이 오늘자 요약으로 교체하고 Playwright로
재확인 - "(테스트 미리보기 — 오늘 timeline_news 실제 기사 기반)"으로 문구도 갱신해서
범위가 이번 주 전체가 아니라 오늘 하루라는 걸 명시했다.

## 46. 한국 기준금리(ECOS) + KOSPI200 선물·옵션 만기(KIS) 사전조사

30번 항목에서부터 남아있던 두 공백(한국 기준금리, 국내 선물/옵션 만기)을 실제 API로
조사했다. **이번 단계는 조사까지만 - `calendar_events` 저장·Next.js 수정 없음.**

### A. 한국 기준금리 (ECOS)

- **기존 코드 없음** 확인(`core/`, `domain/calendar/`, `scripts/`에 ECOS 관련 코드 전무) -
  새로 만드는 게 맞았음
- 통계표코드 `722Y001`(한국은행 기준금리 및 여수신금리), 통계항목코드 `0101000`(한국은행
  기준금리) - 웹 검색 + 실제 라이브 호출로 확인
- URL: `https://ecos.bok.or.kr/api/StatisticSearch/{키}/json/kr/{시작}/{종료}/722Y001/M/{시작월}/{종료월}/0101000`
- **인증키 없이도 `"sample"` 키로 실제 데이터 호출이 된다**는 걸 발견(단, 최대 10건 제한) -
  처음엔 이걸로 검증했고, 이후 사용자가 정식 `ECOS_API_KEY`를 발급받아 `.env`에 등록해서
  제한 없이 재검증함(`config.py`에 `ecos_api_key` 필드 추가, `.env.example`에도 추가)
- **버그 발견 및 수정**: 사용자가 `.env`에 키를 붙여넣을 때 `ECOS_API_KEY=` 없이 값만
  단독 줄로 들어가 있어서 앱이 못 읽는 상태였다 - `ECOS_API_KEY=<값>` 형태로 직접 수정
- **핵심 발견**: ECOS는 "그 달의 금리 레벨"만 주는 통계 DB라서, 금리가 안 바뀌는 달에도
  매달 같은 값이 반복해서 나온다(예: 3.5, 3.5, 3.5, ...) - "몇 월에 결정됐는지"조차 값이
  바뀌는 지점을 직접 찾아야 하고, 그 "달"도 정확한 "결정일"은 아니다(ECOS는 일 단위로 조회해도
  같은 값이 그 달 내내 반복될 뿐, 결정일 자체를 표시해주지 않음)
- 값이 바뀐 지점(2024~2026): 2024-10(3.5→3.25) / 2024-11(3.25→3.0) / 2025-02(3.0→2.75) /
  2025-05(2.75→2.5) / **2026-07(2.5→2.75) / 2026-08(2.75→3.0)**
- **정확한 결정일**은 한국은행 공식 홈페이지(`bok.or.kr/portal/singl/baseRate/list.do`, 기준금리
  추이 목록)에서만 확인 가능 - FOMC의 federalreserve.gov와 정확히 같은 구도(가격/통계 API는
  "언제 바뀌었는지"를 정확히 안 주고, 기관 공식 홈페이지가 "결정일" 자체를 준다). 확인한 결정일:
  2024-10-11(3.25%), 2024-11-28(3.00%), 2025-02-25(2.75%), 2025-05-29(2.50%),
  **2026-07-16(2.75%), 2026-08-27(3.00%)** - ECOS 변경 지점과 전부 정확히 일치, 교차 검증 완료
- **미래 금통위 일정**: ECOS는 제공 안 함. 한국은행 공식 홈페이지
  (`bok.or.kr/portal/singl/crncyPolicyDrcMtg/listYear.do?menuNo=200755&mtgSe=A`)가 FOMC의
  federalreserve.gov 캘린더와 같은 역할 - 2026년 전체 일정(1/15, 2/26, 4/10, 5/28, 7/16,
  8/27, 10/22, 11/26, 총 8회)이 이미 공개되어 있는 것을 확인. FOMC처럼 "1차 결과 발표만
  대표 이벤트로 채택"할지, 아니면 BOK는 별도 잠정치 발표가 없어서 결정 당일 하나로 끝인지는
  다음 구현 단계에서 확정 필요(현재까지 조사로는 BOK 결정은 회의 당일 바로 공식 발표되고
  Fed처럼 1차/2차 잠정치 개념이 없어 보임 - DART처럼 재확인 필요)

### B. 국내 선물/옵션 만기 (KIS)

- KIS 공식 GitHub(`koreainvestment/open-trading-api`)에서 4개 API의 정확한 URI/TR_ID/파라미터
  확인 후, 기존 `kis_client.get_access_token()`을 그대로 재사용해 실제 라이브 호출로 검증
- **국내옵션전광판\_옵션월물리스트**(`FHPIO056104C0`): 응답 필드가 `mtrt_yymm_code`/
  `mtrt_yymm` 2개뿐 - 만기 "년월"만 주고 정확한 날짜는 없음
- **국내옵션전광판\_선물**(`FHPIF05030200`, `display-board-futures`): 가격·미결제약정 등
  20개 필드, 만기일 필드 없음. 대신 `FID_COND_MRKT_CLS_CODE`로 상품이 갈리는 것을 실제
  호출로 발견 - `""`(빈 값)은 **정규 KOSPI200선물**(종목코드 `A01XXX`, `F 202612`처럼
  분기월 3·6·9·12월만 존재), `"MKI"`는 **미니 KOSPI200선물**(종목코드 `A05XXX`,
  `미니F 202610`처럼 월물 전체 존재) - 문서에 명시된 값이 아니라 여러 후보를 실제로 호출해
  결과 이름으로 구분해낸 것
- **국내옵션전광판\_콜풋**(`FHPIF05030100`, `display-board-callput`): 행사가·그릭스 등 40여
  필드, 이것도 만기일 필드 없음. `optn_shrn_iscd`(예: `B01610C41` - B0=옵션, 1610=만기월,
  C=콜, 41=행사가지수)로 종목 식별
- **선물옵션 시세**(`FHMIF10000000`, `inquire-price`)에서 드디어 `futs_last_tr_date`(선물
  최종 거래 일자) 필드를 발견 - 이게 실제 만기일이다. 정규/미니 선물, 옵션 전부에 이 필드가
  있는 것을 실제 호출로 확인(예: `A01612`→`20261210`, `A05610`→`20261008`,
  `B01610C41`(콜옵션)→`20261008`)
- 이 `futs_last_tr_date` 값들을 한국투자증권 공식 매매 안내 페이지가 명시한 "해당 결제월의
  두 번째 목요일" 규칙과 대조한 결과 **전부 정확히 일치**(2026년 12개월 전체를 직접 계산해서
  교차검증: 1/8, 2/12, 3/12, 4/9, 5/14, 6/11, 7/9, 8/13, 9/10, 10/8, 11/12, 12/10) - 이 규칙은
  임의 추정이 아니라 증권사 공식 안내 페이지에서 확인한 공개된 사실
- **"국내선물 영업일조회"라는 이름의 별도 API는 KIS 공식 예제에 존재하지 않는다** - 기존
  `kis_client.get_holiday_calendar()`(chk-holiday)는 시장 개장/휴장 여부(`opnd_yn`)만 주는
  일반 캘린더라서 만기일 데이터로 쓰지 않기로 확인(추측 방지 원칙 그대로 적용)
- **동시만기 판단**: 정규 선물이 분기월(3·6·9·12)에만 존재하므로, 옵션도 같은 달에 만기가
  겹치는 이 4개월만 "선물·옵션 동시만기"로, 나머지 8개월(1·2·4·5·7·8·10·11)은 "옵션 만기"만
  발생 - 실제 두 상품의 월물 목록을 비교해서 도출한 결론이지 추측이 아님

### 구현

- **수정**: `core/config.py` - `ecos_api_key: str | None = None` 추가
- **수정**: `.env.example` - `ECOS_API_KEY=` 추가
- **수정**: `.env` - 사용자가 형식 오류로 붙여넣은 키를 `ECOS_API_KEY=` 형태로 수정
- **신규**: `scripts/test_rate_api.py` - ECOS 조회 + 변경월 자동 감지 + 공식 결정일 대조표 출력
- **신규**: `scripts/test_kis_expiry.py` - 옵션월물리스트/정규선물/미니선물/옵션 각각 실제
  조회 후 `futs_last_tr_date`까지 확인하는 스크립트. 둘 다 DB 저장 없이 조회·출력만 한다

### 다음 단계

- BOK 기준금리 결정이 FOMC처럼 "1차/2차 발표" 구조가 있는지, 아니면 회의 당일 한 번에
  확정 발표되는지 확인 필요(DART 삼성전자처럼 실제 라이브 데이터로 재확인)
- `ecos_client.py`, `kis_client.py`에 선물/옵션 함수 승격, `services/calendar.py`에
  `ingest_bok_rate_decisions()`/`ingest_kospi200_expiry()` 구현
- 기준금리 이벤트는 FOMC와 동일하게 이미 확정된 과거 결정만 이벤트로 만들고, 아직 결정
  안 된 미래 금통위는 만들지 않는 방향이 이 프로젝트 원칙과 일치
- 선물·옵션 만기 이벤트는 콜/풋 수백 개를 각각 만들지 않고 "월 단위 요약 이벤트" 하나로
  처리하는 기존 계획(PART 3 설계) 그대로 진행

## 47. 한국 기준금리(ECOS) + KOSPI200 선물·옵션 만기(KIS) 실제 구현 및 저장

46번 사전조사를 바탕으로 실제 `calendar_events` 연결까지 완료했다. `calendar_events` 스키마
변경 없음, Next.js 미수정, 기존 FRED/FOMC/DART 코드 무수정.

### 사용자가 실제 ECOS_API_KEY 발급 및 등록

작업 도중 사용자가 ECOS 정식 인증키를 발급받아 `.env`에 붙여넣었는데, `ECOS_API_KEY=` 없이
값만 단독 줄로 들어가 있어서 앱이 못 읽는 상태였다 - `ECOS_API_KEY=<값>` 형태로 직접 수정해서
해결. 이후 `sample` 키(최대 10건 제한)가 아니라 정식 키로 32개월 전체를 한 번에 재조회해서
기존 조사 결과와 100% 일치하는 것도 재확인했다.

### 구현

- **신규**: `core/ecos_client.py` - `EcosApiError`, `get_base_rate_series(start, end)`.
  fred_client.py/dart_client.py와 같은 구조(에러/정상 응답 구분, `.env`의 `ecos_api_key`
  사용, 키 하드코딩 없음)
- **수정**: `core/config.py` - `ecos_api_key: str | None = None` 추가(46번 항목에서 이미 완료)
- **수정**: `core/kis_client.py` - 46번 사전조사 때 검증한 4개 API를 함수로 승격:
  `get_option_month_list()`, `get_futures_board(market_cls_code)`,
  `get_option_callput_board(mtrt_yymm)`(옵션 종목코드 확보용, task 요청 3종 외 추가 필요해서
  포함), `get_price(market_div_code, iscd)`. TR_ID/URI는 전부 사전조사에서 실제 확인한 값
  그대로 사용, 새 인증 코드 없이 기존 `get_access_token()` 재사용
- **수정**: `services/calendar.py`:
  - `_BOK_RATE_DECISION_DATES`(정적 표, fed_client.py의 FOMC 일정과 같은 성격) - ECOS가
    "그 달 값"만 주고 정확한 결정일은 안 줘서, 한국은행 공식 홈페이지에서 확인한 결정일을
    월(YYYYMM) 단위로 매핑해뒀다. 매핑에 없는 변경월은 임의 날짜를 만들지 않고 건너뛴다
  - `_bok_rate_event()`, `ingest_bok_rate_decisions(start, end)` - ECOS 월별 시계열에서
    값이 바뀐 지점만 찾아 정적 표와 대조 후 이벤트 생성. ECOS 자체가 실제 발표된 값만 주기
    때문에, 아직 결정 안 된 미래 회의는 애초에 데이터가 없어 자동으로 이벤트가 안 만들어짐
    (FOMC의 "미래 회의는 안 만든다" 요구사항과 결과적으로 동일한 효과)
  - `_kospi200_expiry_event()`, `ingest_kospi200_expiry()` - 정규 선물 전광판(분기월만)에서
    분기월의 `futs_last_tr_date`를 먼저 확보해두고, 옵션월물리스트를 순회하면서 분기월이면
    그 값을 그대로 재사용(옵션도 같은 날 만기라는 걸 이미 확인했으므로 별도 옵션 시세 조회
    안 함 - API 호출 절감), 분기월이 아니면 콜풋 전광판에서 종목코드 하나를 뽑아
    `get_price("O", ...)`로 직접 조회. 콜/풋 개별 행은 저장하지 않고 월물당 대표 이벤트
    1건만 생성
  - status는 기존 KIS 이벤트(`_ipo_event_from_kis` 등)와 같은 날짜 문자열 비교 규칙
    (`"SCHEDULED" if expiry_date >= today_kst else "RELEASED"`)을 그대로 재사용 - task가
    "기존 공통 규칙이 있으면 그걸 우선하라"고 한 부분에 해당
- **수정**: `scripts/test_rate_api.py` - 조회만 하던 걸 `ingest_bok_rate_decisions()` 실행
  - 재실행 중복 방지 확인까지 포함하도록 확장
- **수정**: `scripts/test_kis_expiry.py` - 직접 만들었던 임시 `_call()` 헬퍼를 지우고
  승격된 `kis_client` 함수를 그대로 사용하도록 재작성, `ingest_kospi200_expiry()` 실행
  - 재실행 중복 방지 확인까지 포함

### 테스트 결과

**ECOS**: `get_base_rate_series("202401","202609")` 32개월 조회, 6건 upsert, 재실행해도
6건 그대로(중복 없음). 저장된 6건 전부 요청한 결정일과 정확히 일치:

| 날짜       | previous | actual |
| ---------- | -------- | ------ |
| 2024-10-11 | 3.5      | 3.25   |
| 2024-11-28 | 3.25     | 3      |
| 2025-02-25 | 3        | 2.75   |
| 2025-05-29 | 2.75     | 2.5    |
| 2026-07-16 | 2.5      | 2.75   |
| 2026-08-27 | 2.75     | 3      |

**KIS**: 옵션월물리스트 11개월 확보, 정규 선물 전광판 7개(분기월) 확보, 11건 upsert(콜/풋
확장 후 재실행해도 11건 그대로). 저장된 이벤트:

| publishedAt | title              | status    |
| ----------- | ------------------ | --------- |
| 2026-10-08  | KOSPI200 옵션 만기 | SCHEDULED |
| 2026-11-12  | KOSPI200 옵션 만기 | SCHEDULED |
| 2026-12-10  | 선물·옵션 동시만기 | SCHEDULED |
| 2027-01-14  | KOSPI200 옵션 만기 | SCHEDULED |
| 2027-02-11  | KOSPI200 옵션 만기 | SCHEDULED |
| 2027-03-11  | 선물·옵션 동시만기 | SCHEDULED |
| 2027-06-10  | 선물·옵션 동시만기 | SCHEDULED |
| 2027-09-09  | 선물·옵션 동시만기 | SCHEDULED |
| 2027-12-09  | 선물·옵션 동시만기 | SCHEDULED |
| 2028-06-08  | 선물·옵션 동시만기 | SCHEDULED |
| 2028-12-14  | 선물·옵션 동시만기 | SCHEDULED |

**API**: `GET /calendar/events`로 2026-08(rate), 2026-10/12(optionExpiry) 각각 조회해서
정상 노출 확인. 2026-09 조회 시 macro 13건 그대로, earnings/dividend 등 기존 카테고리
영향 없음 확인.

**전체 DB**: 181 → **198건**(rate +6, optionExpiry +11). 기존 dividend 42 / earnings 21 /
macro 118 전부 그대로.

### 다음 단계

- BOK 결과가 FOMC처럼 1차/2차 잠정치 구조가 있는지는 이번 구현 범위에서 확인 안 함(현재까지
  조사로는 없어 보이지만 미확정)
- 미니 KOSPI200 선물, 콜/풋 개별 이벤트는 이번에도 의도적으로 제외(task 지시)
- `news-data.ts`에는 아직 반영 안 함(frontend 수정 금지 범위)

## 48. previous/forecast/actual에 단위 붙이기

사용자가 `calendar_events`의 `previous`/`forecast`/`actual` 문자열에 단위를 붙여달라고
요청했다. 처음엔 46~47번 항목(ECOS/KIS)에만 국한할지, 전체(FRED/KIS/DART 포함)로 할지
물었고 "전체", "없는 것(=값 자체가 없는 null)은 제외"로 확정됐다 - 바로 직전 47번 작업에서
"기존 FRED/FOMC/DART 코드 수정 금지"라고 했던 범위를 이번 요청으로 명시적으로 풀어준 것으로
이해하고 진행했다.

### 단위 확인 (추측 없이 실제 확인)

FRED 6개 지표는 series 메타데이터(`/fred/series` 엔드포인트)를 실제로 호출해서 공식
`units`/`units_short` 값을 확인한 뒤 한국어로 옮겼다:

| 지표          | FRED 공식 단위       | 붙인 단위 |
| ------------- | -------------------- | --------- |
| CPI(CPIAUCSL) | Index 1982-1984=100  | 포인트    |
| PPI(PPIACO)   | Index 1982=100       | 포인트    |
| GDP           | Billions of Dollars  | 십억 달러 |
| PAYEMS        | Thousands of Persons | 천 명     |
| UNRATE        | Percent              | %         |
| PCE(PCEPI)    | Index 2017=100       | 포인트    |

그 외는 이미 알고 있는 실제 단위를 그대로 사용: KIS 배당/IPO(원), DART 실적(조원, 이미
`_format_trillion_won`으로 조원 단위 숫자를 만들고 있었으니 접미사만 추가), ECOS 기준금리(%).
FOMC/KIS 만기 이벤트는 previous/forecast/actual이 원래 항상 `null`이라 해당 없음("없는 것은
제외" 조건에 따라 손대지 않음).

### 구현

- **수정**: `services/calendar.py`
  - `_UNITS`(지표별 단위 표) + `_with_unit(value, indicator)` 추가, FRED 두 ingest 함수
    (`_ingest_from_fred`, `ingest_year_from_fred`)의 `previous`/`actual` 생성부에 적용
    (status 판정에 쓰는 원래 `actual` 변수는 단위 없는 상태로 유지 - `_with_unit`은
    `CalendarEvent` 생성 시점에만 적용해서 `None` 판정 로직에 영향 없음)
  - `_dividend_event_from_kis`: `actual=f"{per_sto_divi_amt}원" if per_sto_divi_amt else None`
  - `_ipo_event_from_kis`: `actual=f"{fix_subscr_pri}원" if fix_subscr_pri else None`
  - `_dart_earnings_event`: `actual=f"{revenue}조원" if revenue is not None else None`
  - `_bok_rate_event`: `previous`/`actual`에 `%` 접미사
- 기존 DB에 이미 들어있던 값들을 갱신하기 위해 관련 시딩 스크립트를 전부 재실행(코드 수정
  없음, upsert라 제자리에서 덮어씀): `seed_2026_calendar.py`, `seed_kis_dividends.py`,
  `seed_kis_corporate_actions.py`, `test_dart_earnings.py`, `test_rate_api.py`

### 결과 확인 (실제 DB 조회)

- FRED: `326.031포인트`→`326.588포인트`(CPI), `31422.526십억 달러`(GDP),
  `158432천 명`(PAYEMS), `4.4%`(UNRATE), `128.576포인트`(PCE)
- KIS: `880원`(배당), `2000원`(IPO 공모가)
- DART: `300.9조원`(삼성전자 매출액)
- BOK: `3.5%` → `3.25%`
- 전체 건수 198 → **200건**(재시딩 중 KIS IPO가 실제로 2건 늘어난 것 - 단위 작업과 무관한
  자연 증가, 기존 데이터 유실 없음 확인)

## 49. 프런트 `/calendar` 실데이터 재반영 — rate/optionExpiry 200건 포함 + 만기 요약문 오타 수정

사용자가 새로 추가된 `rate`(한국은행 기준금리)·`optionExpiry`(KOSPI200 선물·옵션 만기)
카테고리가 실제 화면에서 잘 보이는지 확인해달라고 요청했다. `news-data.ts`는 47번 항목
이후 한 번도 재동기화되지 않아 이 두 카테고리가 0건이었다 - Supabase 전체 200건으로
다시 채웠다(19번·29번·35번·41번·44번 항목과 같은 방식).

### 재반영 전 발견해서 고친 사소한 버그

`services/calendar.py`의 KOSPI200 만기 요약 문구에서 여러 줄 문자열을 이어 붙일 때 공백을
빠뜨린 곳이 2군데 있었다("만기를" + "앞두고" → "만기를앞두고", "장중" + "(특히" →
"장중(특히") - 화면에 표시하기 전에 발견해서 `_KOSPI200_CONCURRENT_EXPIRY_SUMMARY`/
`_KOSPI200_OPTION_EXPIRY_SUMMARY`를 수정하고 `test_kis_expiry.py`를 재실행해서 기존 11건의
DB 텍스트도 정정했다(upsert라 건수 변화 없음).

### 결과

- `npx tsc --noEmit` 통과
- Playwright로 실제 `/calendar` 화면(월별 보기) 확인: 2026년 8월 27일에 "한국은행 기준금리
  결정" 카드, 2026년 12월 10일에 "선물·옵션 동시만기" 카드가 정상 표시되는 것 확인
- 테스트 후 두 서버 모두 종료

### Supabase 최종 상태

전체 200건(FRED 58 + KIS 배당·IPO 87 + FOMC 17 + DART 21 + BOK rate 6 + KOSPI200 만기 11),
프런트 `news-data.ts`와 동기화 완료.

## 50. `NewsItem`에 `actual` 필드 추가 — 주별 표의 "발표"/"현재" 컬럼 로직 수정

사용자가 `calendar-view.tsx`의 "주별" 표(WeekList/DayRows)를 보고, 발표일이 이미 지난
항목도 "발표" 컬럼에 계속 "OO시 발표 예정"이 뜨고 "현재" 컬럼은 (라벨과 안 맞게) `forecast`
값을 보여주고 있던 걸 지적했다. 이 "현재" 컬럼이 실제로는 `actual`(실제 발표값)을 보여줘야
하는데, `NewsItem` 타입에 애초에 `actual` 필드가 없었다 - 29번 항목 때부터 계속 "알려진
한계"로만 남겨뒀던 문제를 이번에 실제로 해결했다.

### 구현

- **수정**: `news-data.ts` - `NewsItem["detail"]`에 `actual?: string` 필드 추가, `NEWS`
  배열도 Supabase `actual` 컬럼까지 포함해서 재생성(153건이 실제 `actual` 값을 가짐)
- **수정**: `calendar-view.tsx`의 `DayRows`:
  - "발표" 컬럼: `n.publishedAt.getTime() < Date.now()`(이미 지난 항목)이면 `"-"`,
    아니면 기존처럼 `announceLabel(n.publishedAt)`("OO시 발표 예정")
  - "현재" 컬럼: `n.detail?.forecast` 대신 `n.detail?.actual ?? "-"`로 교체(라벨과 실제
    내용이 맞도록 수정) - "이전" 컬럼(`previous`)은 그대로 유지

### 테스트

- `npx tsc --noEmit` 통과
- Playwright로 "주별" 탭 클릭 후 2026년 9월 3주차 확인: 9/15(이미 지난 빅웨이브로보틱스
  IPO)는 발표란 `"-"`·현재란 `"18000원"`, 9/17(아직 안 지난 FOMC/SEP)은 발표란에 예정 시각·
  현재란 `"-"`, 9/30(PCE)도 발표 예정 시각과 이전값(`131.659포인트`)만 정상 표시되는 것 확인
- 테스트 후 두 서버 모두 종료

### 참고

- 9/16 IPO(덕산넵코어스 등)는 청약일이 아직 안 지났는데도 현재란에 공모가가 이미 표시됨 -
  버그가 아니라 실제 데이터 특성이다(KIS 공모주 데이터는 청약일 전에 공모가가 이미 확정되는
  경우가 많아서 `actual`이 미리 채워져 있음)
- `forecast` 필드 자체는 지우지 않았다 - `news-panel.tsx`의 일정 상세 팝업에서는 여전히
  "예상치"로 표시하고 있어 그대로 둠

### 주별 표 문구 다듬기

사용자 요청으로 "발표" 컬럼명을 "발표시간"으로 바꾸고, `announceLabel()`이 만들던
"오후 9시 30분 발표 예정" 문구에서 "발표 예정" 부분을 빼서 "오후 9시 30분"만 남기도록
`calendar-view.tsx`를 수정했다. Playwright로 실제 화면(9월 3주차)에서 헤더/시각 표기가
정상 반영되는 것 확인.

## 51. `front/dev` pull — 병합하지 않고 조사만 함(고위험 판단)

사용자가 `front/dev`를 pull해달라고 요청했다. 39번 항목의 `back/dev` pull+merge+push와
같은 흐름을 기대하고 시작했지만, 실제로 받아보니 그때와 달리 **병합하면 안 되는 수준으로
갈라져 있다는 걸 확인해서 병합은 하지 않고 조사만 하고 멈췄다.**

### 절차

1. `back/feat/calendar`의 미커밋 프런트 작업(`calendar-view.tsx`/`news-data.ts` 수정,
   `weekly-summary-panel.tsx` 신규)을 `git stash push -u`로 대피
2. `git checkout -b front/dev origin/front/dev`로 로컬에 받음(병합 없이 체크아웃만)
3. `git diff HEAD origin/front/dev --stat`로 전체 차이 확인 - 86개 파일, +4195/-7400
4. 위험 신호를 발견하고 병합 시도 없이 바로 `back/feat/calendar`로 복귀, 1번에서 대피한
   변경사항 `git stash pop`으로 복원

### 발견한 위험 신호 — `front/dev`는 이 브랜치의 calendar 백엔드 작업을 전혀 모른다

- `backend/src/backend/domain/calendar/services/calendar.py`가 diff에서 "1078줄 삭제"로
  나온다 - `front/dev` 쪽 이 파일이 지금 이 브랜치(FRED+KIS+FOMC+DART+ECOS+KOSPI200,
  2000줄 이상)보다 1078줄 적은, 훨씬 이전 버전이라는 뜻
- `front/dev`의 `core/config.py`를 직접 열어보니 `fred_api_key`/`dart_api_key`/
  `ecos_api_key` 자체가 없다 - 대신 `heatmap_enabled`/`heatmap_requests_per_second` 등
  히트맵 도메인 전용 필드가 있다. `core/kis_client.py`도 히트맵용으로 완전히 다시 짜여 있다
  (`get_sector_prices`/`get_stock_quotes` 등, 이 브랜치의 KSD/선물옵션 함수는 없음)
- 즉 `front/dev`는 처음에 `front/feat/calendar`가 이 브랜치에 합쳐진 시점(세션 초반) 이후로
  **이 브랜치의 calendar 백엔드 작업을 한 번도 받아간 적이 없고**, 그 사이 자기들끼리
  heatmap 도메인을 새로 만들며 `core/` 공용 파일들을 독자적으로 발전시켰다

### 발견한 위험 신호 — 프런트 calendar UI가 컴포넌트 단위로 전면 리팩터링됨

- `frontend/app/(main)/calendar/calendar-view.tsx`가 diff에서 "851줄 삭제"로 나온다 -
  `front/dev`에서는 이 파일 자체가 없어지고, 대신 `frontend/components/calendar/`
  아래 `ai-summary-card.tsx`/`category-bar.tsx`/`event-row.tsx`/`filter-bar.tsx`/
  `mini-calendar.tsx`/`month-grid.tsx`/`region-badge.tsx`/`week-list.tsx` 8개 파일과
  `frontend/lib/calendar.ts`(공용 유틸)로 쪼개져 있다 - 이번 세션 내내 이 브랜치에서
  `calendar-view.tsx` 하나에 직접 해온 수정(44번 "이번주 AI 요약" 팝업 연결, 50번 `actual`
  필드 배선, 방금 한 "발표시간" 라벨 수정 등)이 전부 이 리팩터링과 충돌한다
- `front/dev`의 `news-data.ts`는 여전히 더미 상태다(`/* TODO: API 연동 시 NEWS 배열만
교체 */`, 실제 항목 0건) - 19번 항목 이후 이 브랜치에서 계속해온 Supabase 실데이터 동기화
  작업도 전혀 반영되어 있지 않다
- `frontend/app/calendar-api-test/page.tsx`(원본 데이터 확인용 테스트 페이지)도 diff에서
  "96줄 삭제"로 나온다 - `front/dev`에는 이 페이지 자체가 없다

### 판단

지금 이대로 `front/dev`를 `back/feat/calendar`에 병합하면: (1) 몇 시간 동안 만든 calendar
백엔드 코드(ECOS/KIS 선물옵션/BOK/DART 등)가 훨씬 오래된 버전과 3-way 병합되면서 대규모
충돌이 나거나 최악의 경우 조용히 손실될 위험이 있고, (2) 프런트 `calendar-view.tsx`에 대한
이번 세션의 모든 수정이 이미 없어진 파일에 대한 수정이 되어버려서 병합 자체가 불가능하다
(컴포넌트 분할 리팩터링과 직접 충돌). 39번 항목의 `back/dev` 병합 때와 상황이 근본적으로
다르다고 판단해서, **병합·push는 하지 않고 로컬에 `front/dev` 브랜치만 받아둔 채 조사
결과만 문서화**하기로 했다.

### 다음 단계 (팀 논의 필요)

- `front/dev`가 이 브랜치의 calendar 백엔드 작업(FRED/KIS/FOMC/DART/ECOS/KOSPI200)을
  받아가려면, 단순 `git merge`가 아니라 `front/dev`의 컴포넌트 분할 구조에 맞춰 이 브랜치의
  변경사항을 다시 이식하는 작업이 필요해 보인다
- 반대로 이 브랜치가 `front/dev`의 heatmap 관련 `core/` 변경(`kis_client.py`의 재시도/속도
  제한 로직 등)을 받으려 해도 같은 문제가 있다
- 로컬에 `front/dev` 브랜치는 만들어뒀으니(삭제 안 함), 실제 병합은 팀과 방향을 정한 뒤
  진행하는 게 안전하다고 판단

## 52. `front/dev`의 컴포넌트 분할 구조로 프런트 calendar 재정리(51번의 "다음 단계" 실행)

사용자가 "front/dev의 frontend부분이 최종입니다. 다시 정리"라고 지시했다. 51번에서 병합을
보류했던 이유(구조 자체가 다름)는 그대로 두고, `git merge` 대신 **51번 "다음 단계"에 적어둔
대로 `front/dev`의 컴포넌트 구조를 새 기준으로 삼아 이 브랜치의 실데이터·기능을 그 구조
위에 다시 이식**하는 방식으로 진행했다. 백엔드(`services/calendar.py` 등)는 이번 작업
대상이 아니라서 손대지 않았다.

### 방법 — `git show front/dev:<path>`로만 읽고, 체크아웃/병합은 하지 않음

`back/feat/calendar` 작업 트리를 건드리지 않기 위해 `front/dev`의 8개 신규 파일
(`frontend/app/(main)/calendar/page.tsx`, `frontend/lib/calendar.ts`,
`frontend/components/calendar/{ai-summary-card,category-bar,event-row,filter-bar,
mini-calendar,month-grid,region-badge,week-list}.tsx`)을 전부 `git show`로만 읽어서
내용을 확인한 뒤, 이 브랜치에 새로 `Write`했다(체크아웃도 병합도 하지 않았다).

### 그대로 가져온 파일(내용 동일, front/dev 원본 그대로 채택)

`region-badge.tsx`, `category-bar.tsx`, `event-row.tsx`, `month-grid.tsx`,
`filter-bar.tsx` — 이 브랜치의 기존 `calendar-view.tsx` 안에 있던 동명 컴포넌트와
로직이 사실상 같아서 그대로 파일만 분리했다. `mini-calendar.tsx`도 front/dev 쪽이
"오늘" 버튼(`onToday`)이 추가된 더 발전된 버전이라 그대로 채택했다(이 브랜치에는
없던 기능).

### 이 브랜치의 세션 작업을 이식한 파일

- **`week-list.tsx`**: front/dev 원본은 `발표` 컬럼에 `announceLabel`을 항상 표시하고
  `현재` 컬럼에 `detail?.forecast`를 표시하는 옛날 버전이었다. 50번 항목에서 고친
  "발표시간" 헤더명 + "발표일이 지나면 발표시간 칸은 `-`, 현재 칸은 `detail?.actual`"
  로직을 그대로 옮겨왔다.
- **`ai-summary-card.tsx`**: front/dev 원본은 클릭 동작이 없는 정적 더미 카드
  (6개 카테고리 예시를 나열만 함, "자세히 보기" 버튼 없음)였다. 44번 항목에서 만든
  "자세히 보기" 클릭 → `WeeklySummaryDialog` 팝업 여닫기 동작으로 교체했다(이 세션에
  만든 실제 기능이라 front/dev의 더미로 되돌리지 않았다).
- **`lib/calendar.ts`**: front/dev 원본의 `announceLabel`은 아직 "...발표 예정" 접미사가
  붙어 있었다. 50번 항목에서 사용자가 명시적으로 요청해 뗀 접미사이므로 뗀 버전으로
  옮겼다. 나머지 유틸(`getMonthGridWeeks`/`weekOfMonth`/`toggleCategory`/`segBtn`류)은
  front/dev 원본 그대로다.
- **`page.tsx`**: front/dev 원본을 그대로 쓰되, `<AiSummaryCard />` 호출에 `today={today}`
  prop을 추가했다(위에서 바꾼 `ai-summary-card.tsx`가 팝업에 넘길 기준 날짜로 필요).
- **`weekly-summary-panel.tsx`**: 기존 `import { RegionBadge } from "./calendar-view"`를
  `import { RegionBadge } from "@/components/calendar/region-badge"`로만 수정했다(로직은
  변경 없음, `calendar-view.tsx` 삭제에 따른 경로 수정).

### 그대로 유지한 파일

- **`news-data.ts`**: front/dev 쪽은 여전히 더미(`NEWS` 0건)라서 이식 대상이 아니다.
  이 브랜치의 200건 실데이터 + `detail.actual` 필드를 그대로 유지했고, 파일 상단 주석만
  "컴포넌트 구조는 front/dev 기준으로 재구성했다"는 취지로 갱신했다.
- **`news-panel.tsx`**: 두 브랜치가 `diff` 결과 완전히 동일해서 손대지 않았다.

### 삭제한 파일

`frontend/app/(main)/calendar/calendar-view.tsx` — `page.tsx` +
`components/calendar/*` + `lib/calendar.ts`로 전부 대체되어 이 파일을 참조하는 곳이
없음을 `grep -rl "calendar-view"`로 확인한 뒤 삭제했다.

### 검증

- `npx tsc --noEmit` 통과(에러 0건)
- `npm run dev`로 서버를 띄우고 `/calendar`를 Playwright로 스크린샷 — 새 구조에서 필터
  바(sticky)/미니 달력("오늘" 버튼 포함)/주별 표(발표시간·현재·이전 컬럼에 실데이터,
  발표일 지난 항목은 발표시간 칸이 `-`)가 정상 렌더링됨을 확인
- "자세히 보기" 버튼을 클릭해 `WeeklySummaryDialog`가 새 `region-badge.tsx`(다른 파일로
  이동한 컴포넌트)를 정상적으로 import해서 국기 배지까지 포함해 그대로 뜨는 것을 확인

### 이번 작업 대상이 아니었던 것 (그대로 남겨둠)

- 백엔드(`services/calendar.py`, `core/kis_client.py`, `core/config.py`)는 51번에서
  확인한 `front/dev`와의 구조적 차이(heatmap 도메인 전용 필드/함수)가 이번 작업으로
  해소되지 않았다 — 이번 지시("frontend부분이 최종")는 프런트 UI 구조에 한정된 지시라고
  판단해서 백엔드 쪽은 손대지 않았다. 팀 차원의 `core/` 재조정은 여전히 별도 논의가
  필요하다(51번 "다음 단계" 참고).
- "이번주 AI 요약" 팝업의 "이번주 주요 소식이에요"/"이런 소식도 있어요" 두 섹션은 여전히
  43~45번 항목에서 만든 수동 테스트 문구 그대로다 — 이번 작업은 컴포넌트 구조 이전만
  다뤘고, 실제 LLM/엔드포인트 자동화는 그대로 다음 단계로 남아 있다.

## 53. 주별(WeekList) "현재" 값에 라벨 추가 — 배당/공모가/실적은 단위(원)만으로는 의미가 안 드러남

사용자가 "캘린더에서 주별을 볼 때 현재의 previous에서 단위가 뭐에 대한 단위인지 알 수가
없어서 라벨(예를 들어 공모가, 주 를 넣어주고)을 넣어달라"고 요청했다. 48번 항목에서 붙인
단위(원/조원/%)는 숫자의 단위일 뿐 그 숫자가 "무엇"인지는 말해주지 않는다는 지적이다 —
예를 들어 IPO의 "14600원"은 공모가인지 다른 값인지 제목을 따로 안 읽으면 알 수 없다.

### 왜 previous가 아니라 actual(현재) 컬럼만 문제였는가

배당(dividend)·공모주(IPO, category="macro")·DART 실적(earnings) 세 가지 모두
`services/calendar.py`에서 `previous=None`으로 고정 저장한다(각 항목 원본 API가 "직전
값"을 안 주기 때문 - 임의 생성 금지 원칙). 즉 이전 컬럼은 이 세 유형에서 항상 "-"만
나오고, 라벨이 필요한 값은 전부 "현재"(actual) 컬럼에만 나타난다. FRED 경제지표/BOK
기준금리는 previous에도 실제 값이 있지만 제목에 이미 맥락(CPI/PPI/기준금리 등)이 있고
단위도 이미 붙어 있어 추가 라벨이 필요 없다고 판단해서 건드리지 않았다.

### 구현 — 백엔드는 손대지 않고 프런트에서만 라벨을 매핑

DB에 라벨 컬럼을 새로 추가하는 대신, 이미 저장된 `category`/`title` 문자열로 프런트에서
결정적으로(추측 없이) 라벨을 매핑했다. `frontend/app/(main)/calendar/news-data.ts`에
`actualLabelOf(n: NewsItem)` 함수를 추가:

```ts
export function actualLabelOf(n: NewsItem): string | null {
  if (n.category === "dividend") return "주당";
  if (n.category === "earnings" && n.title.endsWith("실적 발표"))
    return "매출액";
  if (n.category === "macro" && n.title.endsWith("공모주 청약"))
    return "공모가";
  return null;
}
```

- "주당" — 배당은 `_dividend_event_from_kis`에서 `actual = per_sto_divi_amt`(주당배당금액)를
  그대로 담는다. `category === "dividend"`인 이벤트는 배당 관련 이벤트뿐이라 카테고리만으로
  안전하게 판별된다.
- "매출액" — DART 실적(`_dart_earnings_event`)의 `actual`은 매출액(revenue)이다. earnings
  카테고리 중 제목이 "실적 발표"로 끝나는 것만 매칭해서, 혹시 이 카테고리에 다른 성격의
  이벤트가 추가돼도 잘못 라벨링되지 않게 했다.
- "공모가" — IPO(`_ipo_event_from_kis`)는 category가 "macro"라서(51번/합병·분할과 같은
  분류 기준, 14번 항목 참고) 카테고리만으로는 다른 macro 이벤트(FRED/FOMC/합병분할/유상
  증자/무상증자)와 구분이 안 된다. 대신 IPO 이벤트 제목이 항상 `"{종목명} 공모주 청약"`
  형태로 고정돼 있어서(`_ipo_event_from_kis`의 `title = f"{isin_name} 공모주 청약"`)
  제목이 "공모주 청약"으로 끝나는지로 판별했다.
- 유상증자/무상증자/합병·분할(전부 category="macro")의 `actual`은 비율(`fix_rate`/
  `merge_rate`)인데 현재 %도 안 붙어 있고 라벨도 없다 - 이번 요청 범위(배당/공모가 예시)
  밖이라고 판단해 건드리지 않았고, 필요하면 후속 작업으로 남겨둔다.

`frontend/components/calendar/week-list.tsx`의 `DayRows`에서 "현재" 컬럼 렌더링을
`actualLabelOf(n)`이 있으면 `"{라벨} {값}"`(예: `주당 880원`, `공모가 8300원`)으로,
없으면 기존처럼 값만 표시하도록 수정했다.

### 검증

- `npx tsc --noEmit` 통과
- `npm run dev` + Playwright로 `/calendar` 주별 뷰 확인: 9월 3주차의 "덕산넵코어스
  공모주 청약"/"글로벌테크놀로지 공모주 청약"이 각각 "공모가 14600원"/"공모가 10000원"으로
  표시됨을 확인. 미니 달력을 2월로 이동해 "신한금융지주회사 배당기준일(결산)"이
  "주당 880원", "케이뱅크 공모주 청약"이 "공모가 8300원"으로 표시되는 것도 확인
- FRED 지표(CPI 등)와 BOK 기준금리는 라벨 없이 기존 그대로(단위만 붙은 값) 표시됨을
  같은 스크린샷에서 함께 확인 — 의도한 대로 라벨 대상에서 제외됨

## 54. `actual_label`을 프런트 전용 로직에서 `calendar_events` 실제 컬럼으로 승격

사용자가 "위의 내용을 백엔드에 컬럼을 추가하는데 model에 라벨을 추가하고 calendar_events에
컬럼에 라벨을 넣어줘"라고 요청했다. 53번에서 프런트(`news-data.ts`의 `actualLabelOf()`)가
`category`/`title` 문자열을 보고 추측하던 라벨을, DB 컬럼으로 만들어 백엔드가 이벤트를 만드는
시점에 직접 채워 넣는 방식으로 승격했다.

### 왜 프런트의 추측보다 백엔드가 직접 채우는 게 더 정확한가

프런트의 `actualLabelOf()`는 `category === "macro"`인 이벤트가 FRED/FOMC/IPO/합병분할/
유상증자/무상증자까지 전부 섞여 있어서 `title.endsWith("공모주 청약")` 같은 문자열 패턴으로
IPO를 추측해야 했다. 반면 `_ipo_event_from_kis`/`_dividend_event_from_kis`/
`_dart_earnings_event` 각 함수는 자기가 지금 만드는 이벤트가 정확히 무엇인지 이미 알고
있으므로, 패턴 매칭 없이 리터럴 문자열을 그대로 넣을 수 있다 - 추측이 사실로 바뀐 것.

### 변경한 파일

- **`schemas/calendar.py`**: `CalendarEvent`에 `actual_label: Optional[str] = None` 필드
  추가(라우터가 `response_model=list[CalendarEvent]`라 자동으로 응답에 포함됨).
- **`models/calendar.py`**: 미사용 ORM 클래스에도 동일하게 `actual_label` 컬럼 추가(1번
  항목에서 정한 "실제 쓰이진 않지만 스키마는 항상 동기화" 원칙 유지).
- **`services/calendar.py`**:
  - `_dividend_event_from_kis`: `actual_label="주당" if per_sto_divi_amt else None`
  - `_dart_earnings_event`: `actual_label="매출액" if revenue is not None else None`
  - `_ipo_event_from_kis`: `actual_label="공모가" if fix_subscr_pri else None`
  - `_upsert_event`의 INSERT/UPDATE SQL, `get_events_by_month`의 SELECT SQL에
    `actual_label` 컬럼 추가(누락하면 값이 저장/조회되지 않으므로 둘 다 필수)
  - 나머지 이벤트 생성 함수(FRED/FOMC/BOK/KOSPI200 만기/합병분할/유상증자/무상증자)는
    건드리지 않았다 - `actual_label`은 pydantic 기본값 `None`이 그대로 저장된다

### DB 마이그레이션 — `scripts/add_actual_label_column.py` (1회성)

마이그레이션 도구 없이 `calendar_weekly_summaries` 테이블을 만들 때와 같은 방식으로,
`core/database.py`의 세션을 통해 raw SQL을 직접 실행하는 스크립트를 새로 만들어 실행했다:

1. `ALTER TABLE calendar_events ADD COLUMN IF NOT EXISTS actual_label text`
2. 이미 저장돼 있던 기존 행들을 category/title 조건으로 백필(원본 API를 다시 호출하지
   않음 - 라벨은 category/title만으로 결정적으로 정해지므로 SQL UPDATE로 충분):
   - `category='dividend' AND actual IS NOT NULL` → `'주당'`
   - `category='earnings' AND title LIKE '%실적 발표' AND actual IS NOT NULL` → `'매출액'`
   - `category='macro' AND title LIKE '%공모주 청약' AND actual IS NOT NULL` → `'공모가'`

실행 결과: 배당 40건, DART 실적 21건, 공모주(IPO) 45건 백필됨. 앞으로 들어오는 신규 행은
각 ingest 함수가 생성 시점에 바로 채우므로 이 백필은 다시 실행할 필요가 없다(멱등이라
재실행해도 안전 - `actual_label IS NULL` 조건 때문에 이미 채워진 행은 건드리지 않음).

### 검증

- `uv run python scripts/add_actual_label_column.py` 실행 → 컬럼 추가 + 위 백필 건수 출력
  확인
- `get_events_by_month(session, 2026, 2)`를 직접 호출해 응답 객체에 `actual_label`이
  실제로 채워져 나오는지 확인("케이뱅크 공모주 청약" → `공모가`, "신한금융지주회사
  배당기준일(결산)" → `주당` 등, 53번에서 화면으로 확인했던 값과 동일)

### 프런트는 아직 그대로 - 다음 단계

이번 요청은 백엔드(모델 + 컬럼)로 범위가 한정되어 있어서 프런트는 건드리지 않았다.
`frontend/app/(main)/calendar/news-data.ts`의 `actualLabelOf()`(53번)는 지금도 그대로
남아 있고 동일한 값을 계산해내므로 화면은 지금 당장 깨지지 않는다. 다만 이제 진짜 출처는
DB 컬럼이 됐으니, 다음에 `news-data.ts`를 실데이터로 재동기화할 때는 `NewsItem.detail`에
`actualLabel?: string` 필드를 추가해서 DB 값을 그대로 실어 오고, `week-list.tsx`가
`actualLabelOf(n)` 대신 `n.detail?.actualLabel`을 쓰도록 바꿔서 프런트의 추측 로직을
완전히 제거하는 정리가 필요하다(사용자가 요청하면 진행).

## 55. `forecast` 컬럼 삭제 + `actual_label`을 title 기반 로직으로 정리

사용자가 "calendar_events에서 forecast 컬럼은 삭제하고 actual_label에 title내용을
기반으로 (예를 들어 공모가, 주 등) 라벨을 넣어줘"라고 요청했다. 두 가지를 처리했다:
(1) 실제로 한 번도 값이 들어간 적 없는 `forecast` 컬럼을 스키마/모델/DB에서 전부 삭제,
(2) 54번에서 하드코딩 리터럴로 채웠던 `actual_label`을 title 문자열을 직접 읽고 판단하는
공용 함수로 바꿔서, 사용자가 말한 "title 내용을 기반으로"라는 방식에 맞췄다.

### forecast 컬럼 삭제 — 근거

CLAUDE.md 27번 항목("forecast는 FRED가 시장 컨센서스를 제공하지 않으므로 임의로 채우지
않는다")대로 이 프로젝트의 `forecast`는 처음부터 지금까지 모든 이벤트에서 `None`만
저장됐다(FRED/KIS/DART/ECOS 어느 소스도 예상치를 안 준다). 실제로 쓰인 적이 없는 컬럼이라
삭제해도 데이터 손실이 없다는 걸 먼저 `grep -rn "forecast=" services/calendar.py`로
확인한 뒤 진행했다(4곳 모두 `forecast=None` 리터럴이었고, FRED 이벤트 두 곳은 애초에
forecast를 넘기지도 않았다 - pydantic 기본값 None에 의존).

- `schemas/calendar.py`: `forecast: Optional[str] = None` 필드 제거, 상단에 "삭제된
  컬럼" 주석 추가(CLAUDE.md의 `source_url` 삭제 기록과 같은 방식)
- `models/calendar.py`: 동일하게 ORM 컬럼 제거
- `services/calendar.py`: `_fomc_event`/`_dart_earnings_event`/`_bok_rate_event`/
  `_kospi200_expiry_event`의 `forecast=None,` 4곳 제거, `_upsert_event`의 INSERT/
  ON CONFLICT SQL과 `get_events_by_month`의 SELECT SQL에서 `forecast` 컬럼 제거,
  관련 주석 2곳도 정리
- **`scripts/drop_forecast_column.py`**(신규, 1회성): `ALTER TABLE calendar_events
DROP COLUMN IF EXISTS forecast` 실행 - 마이그레이션 도구 없이 기존 방식대로
  `core/database.py` 세션으로 raw SQL 직접 실행

### `actual_label`을 title 기반 공용 함수로 전환

54번에서는 세 함수(`_dividend_event_from_kis`/`_dart_earnings_event`/
`_ipo_event_from_kis`)에 각각 `"주당"`/`"매출액"`/`"공모가"` 리터럴을 하드코딩했다.
이번 요청("title내용을 기반으로")에 맞춰 하나의 공용 함수로 통합했다:

```python
def _actual_label_from_title(title: str) -> str | None:
    if "배당기준일" in title:
        return "주당"
    if title.endswith("공모주 청약"):
        return "공모가"
    if title.endswith("실적 발표"):
        return "매출액"
    return None
```

세 함수 모두 이미 title을 저 형식대로 직접 만들고 있으므로(`_dividend_event_from_kis`의
`title = f"{isin_name} 배당기준일{kind_label}"`, `_ipo_event_from_kis`의
`title = f"{isin_name} 공모주 청약"`, `_dart_earnings_event`의
`f"{corp_name} 실적 발표"`) 이 매칭은 title 값을 실제로 아는 것이지 추측이 아니다.
각 함수의 `actual_label=` 인자를 리터럴 대신 `_actual_label_from_title(title)` 호출로
바꿨다. category만으로는 IPO를 다른 macro 이벤트(FRED/FOMC/합병분할/유무상증자)와
구분할 수 없어서 원래도 title을 참고해야 했던 IPO/실적 케이스는 결과가 그대로고,
`category == "dividend"`만 보고 판단했던 배당 케이스도 이제 title 내용(`"배당기준일"`
포함 여부)으로 판단하도록 통일했다 - 실제 출력값은 이전과 동일하다.

### 왜 유상증자/무상증자/합병·분할은 그대로 뒀는가

이 셋(전부 category="macro")의 `actual`은 비율(`fix_rate`/`merge_rate`)인데 지금도
단위(%)가 안 붙어 있고 라벨도 없다. 53번에서도 "이번 요청 범위 밖"이라고 명시했고, 이번
요청도 "공모가, 주"라는 동일한 예시만 들었을 뿐 이 세 유형을 언급하지 않아서 그대로 뒀다.
필요하면 후속 작업으로 진행 가능(유상증자/무상증자는 title이 각각 "...유상증자"/
"...무상증자"로 고정돼 있어 요약 텍스트에 이미 쓰는 "신주배정비율"이라는 표현을 그대로
라벨로 쓸 수 있을 것으로 보이지만, 합병/분할은 `merge_type`이 다양해서 title만으로 안전하게
판별되는지 추가 확인이 필요하다).

### 검증

- `uv run python scripts/drop_forecast_column.py` 실행 → 컬럼 삭제 완료
- `get_events_by_month(session, 2026, 2)`를 직접 호출해 `actual_label` 값이 54번 때와
  동일하게(`공모가`/`주당`) 나오는 것을 확인 - 하드코딩 리터럴을 title 기반 함수로
  바꿔도 출력이 달라지지 않았음을 검증
- FastAPI 서버(`uvicorn main:app`)를 띄우고 `GET /calendar/events?year=2026&month=2`를
  직접 호출 - 응답 JSON에 `forecast` 키가 더 이상 없고, `actual_label`은 정상적으로
  채워져 나오는 것을 확인

### 프런트는 이번에도 범위 밖

54번과 마찬가지로 이번 요청도 "calendar_events" 백엔드 컬럼/모델로 한정되어 있어서
프런트(`news-data.ts`의 `actualLabelOf()`, `NewsItem.detail.forecast` 타입 등)는
건드리지 않았다. 프런트의 `detail.forecast` 타입 필드 자체는 DB 컬럼과 무관하게 여전히
존재하고(`news-panel.tsx`의 상세 팝업 "예상치" 표시에 사용), 실데이터로 동기화된 항목은
원래도 항상 `forecast: undefined`였으므로 이번 백엔드 변경으로 화면에 나타나는 차이는
없다.

## 56. 화면 표시용 단위 변환 — "159075천 명"/"32486.066십억 달러"를 사람이 읽는 단위로

사용자가 상세한 스펙 문서를 주면서 요청했다: FRED/ECOS 값이 "159075천명"/"32486.066십억
달러"처럼 API 원본 단위 그대로 화면에 노출되어 초보 사용자가 이해하기 어려우니, **DB/API는
전혀 건드리지 않고 화면에 표시하는 순간에만** 사람이 읽기 쉬운 한국어 단위(만/억/조)로
변환하는 공통 포맷터를 만들어달라는 요청이었다. 요청에 명시된 "가장 중요한 원칙"(DB 스키마·
원본값·`previous`/`forecast`/`actual` 저장값 불변, Gemini 미사용, 순수 코드로 변환,
디자인/레이아웃 불변, 기존 API 응답 구조 불변, 기존 수집 로직 불변)을 그대로 지켰다.

### 왜 프런트 전용 처리인가

`previous`/`actual`은 `services/calendar.py`에서 이미 문자열에 단위를 붙여
(`"159075천 명"`, `"32486.066십억 달러"`) `calendar_events`에 저장한다(48번 항목).
사용자가 "API 원본 값도 변경하지 마세요"/"DB 스키마는 절대 변경하지 마세요"라고 명시했으므로
백엔드는 전혀 건드리지 않고, 이미 프런트에 동기화돼 있는 이 문자열을 렌더링 시점에만
다시 포맷하는 방식으로 구현했다 - 저장된 값과 화면에 보이는 값이 다르지만, 저장된 값
자체는 그대로다.

### 새로 만든 공통 포맷터 — `frontend/lib/format-economic-value.ts`

```ts
export function formatEconomicValue(raw: string | null | undefined): string;
```

내부적으로 `raw` 문자열을 정규식(`/^(-?\d+(?:\.\d+)?)\s*(.*)$/`)으로 "숫자 부분"과
"단위 부분"으로 나눈 뒤, 단위(공백 제거 후 비교)에 따라 분기한다:

- **"천명"/"천 명"** → `numeric * 1000`을 조/억/만 단위로 쪼개서 "약 1억 5,908만 명"
  형태로 표시(`formatKoreanCount` - 만 단위로 반올림 후 조/억/만을 순서대로 채워나감,
  1000단위 콤마는 `toLocaleString("ko-KR")`)
- **"십억달러"** → 1,000십억 이상이면 `/1000`해서 "약 32.49조 달러"(소수 둘째 자리),
  미만이면 `*10`해서 "약 856억 달러"(정수 또는 소수 첫째 자리)
- **"백만달러"** → 10,000백만 이상 조, 100백만 이상 억, 그 미만은 백만 그대로(현재
  실데이터엔 없지만 스펙에 명시돼 있어 같은 원리로 확장해둠)
- **"원"** → 1억 미만이면 원본 그대로(현재 배당·IPO 금액은 전부 여기 해당), 1억
  이상이면 억/조 원으로 변환(향후 큰 금액의 원화 데이터가 들어올 경우를 대비)
- **그 외(%, 포인트, 조원, 알 수 없는 단위, 단위 없음, 숫자로 안 읽히는 값)** →
  원본 문자열을 그대로 반환 - 임의로 다른 단위를 만들지 않는다
- **`raw`가 없으면(null/undefined/빈 문자열)** → `"-"`

### 적용한 화면 (기존 컴포넌트 재사용, 새 컴포넌트/레이아웃 추가 없음)

- `components/calendar/week-list.tsx`: 주별 표의 "현재"/"이전" 컬럼 - 값을
  `formatEconomicValue()`로 감쌌고, 마우스 오버 시 정확한 원본 문자열을 볼 수 있도록
  `title={n.detail?.actual}`/`title={n.detail?.previous}`를 `<td>`에 추가했다(레이아웃에
  영향 없는 네이티브 브라우저 툴팁이라 "7. 기존 캘린더 디자인/레이아웃 유지" 원칙을
  깨지 않는다 - 사용자가 요청한 "정확한 원본 값은 상세 영역이나 tooltip에서 확인"을
  이 방식으로 충족)
- `app/(main)/calendar/news-panel.tsx`: 날짜 클릭 시 뜨는 상세 팝업의 "이전치" 값
- `app/(main)/calendar/weekly-summary-panel.tsx`: "이번주 AI 요약"의 "주요 경제지표"
  표에서 발표일이 지난 이벤트의 값(53번에서 previous 대신 사용하기로 한 로직은 이 파일이
  아니라 week-list.tsx만 해당돼서 그대로 두고, 표시값만 포맷팅 적용)
- 배당/공모주/실적 라벨(54·55번의 `actualLabelOf`/`actual_label`)과 조합될 때도
  `"{라벨} {포맷된 값}"` 순서를 유지해서 "매출액 79.0조원"처럼 계속 자연스럽게 보이게 했다
  (조원은 변환 대상이 아니라서 그대로 통과)

### 손대지 않은 것 (요청의 "절대 원칙" 그대로 준수)

- `calendar_events` 테이블/컬럼, FRED/ECOS/KIS/DART 수집 로직, `_upsert_event`/
  `get_events_by_month`의 SQL, `services/calendar.py`의 `_with_unit`/`_UNITS` — 전부
  무변경
- `GET /calendar/events` 응답 구조 - `actual`/`previous` 문자열은 지금까지와 동일하게
  내려온다(변환은 프런트에서만 일어남)
- 캘린더 레이아웃/디자인 - 기존 표/카드 구조 그대로, 툴팁만 추가
- `%`, `포인트`, `조원`, 소액 `원` 값 - 기존 표시 그대로 유지(케이스 6·7 테스트로 확인)
- Gemini/LLM 미사용 - 순수 정규식 파싱 + 산술 연산으로만 구현

### 테스트

`npx tsx`로 스펙 9번 항목의 7개 테스트 케이스를 전부 직접 실행해서 확인했다:

| 입력                   | 기대값            | 결과               |
| ---------------------- | ----------------- | ------------------ |
| `"159075천명"`         | 약 1억 5,908만 명 | ✅ 일치            |
| `"159075천 명"`        | 약 1억 5,908만 명 | ✅ 일치            |
| `"32486.066십억 달러"` | 약 32.49조 달러   | ✅ 일치            |
| `"1523.5십억 달러"`    | 약 1.52조 달러    | ✅ 일치            |
| `"85.6십억 달러"`      | 약 856억 달러     | ✅ 일치            |
| `"3.5%"`               | 3.5%              | ✅ 일치(변경 없음) |
| `null`                 | 기존 표시 유지    | ✅ `"-"`           |

추가로 실데이터 경계 케이스도 확인: `"79.0조원"`/`"880원"`/`"326.588포인트"`/`"2.50%"`
전부 원본 그대로 통과함을 확인. `npx tsc --noEmit` 통과, `npm run dev` + Playwright로
`/calendar`의 2026년 2월(고용지표 "약 1억 5,859만 명"/"약 1억 5,843만 명", 실업률
"4.3%"/"4.4%" 그대로, CPI "326.588포인트" 그대로)과 2026년 7월(GDP "약 32.49조
달러"/"약 31.87조 달러")을 직접 렌더링해서 화면에서도 동일하게 확인했다.

### 추가로 단위 처리가 필요할 수 있는 데이터

- 유상증자/무상증자/합병·분할(전부 category="macro")의 비율 값(`fix_rate`/
  `merge_rate`)은 여전히 단위(%) 없이 저장돼 있다 - 53·55번에서도 범위 밖으로 남겨둔
  부분과 동일하다. 화면 포맷터 자체는 필요하면 쉽게 케이스를 추가할 수 있는 구조다.
- 지금은 `calendar_events`의 값만 대상으로 했다 - `market_indicator_service`가 다루는
  실시간 지수/등락률(코스피·코스닥·환율 등, 사이드바 티커)은 이번 요청의 "주가, 등락률...
  은 제외" 원칙에 따라 건드리지 않았다.

## 57. PAYEMS "천 명" 축약값을 실제 인원 수로 DB에 직접 저장 - 56번과 달리 이번엔 DB를 바꿈

사용자가 "calendar_events 테이블의 previous 값이 안 변했는데?"라고 물어서(56번 작업은
DB를 안 건드리고 화면 표시만 바꾸는 것이었으므로 DB 자체가 그대로인 게 맞다고 설명했다),
이어서 "데이터테이블에서 previous와 actual 컬럼에서 천 명이라고 되어 있는 것을 1000명의
수로 표현해줘(158861천 명→158861000 명)"라고 요청했다. "컬럼"이라는 표현과 "158861천
명→158861000 명"이라는 구체적 예시가 DB 저장값 자체를 가리키고 있어서, 56번과 달리 이번엔
DB에 실제로 반영해야 하는 요청인지 애매했다. AskUserQuestion으로 "화면 표시만 바꿀지 DB
값 자체를 바꿀지" 확인했고, 사용자가 "이런 수치(천 명)는 읽기도 보기도 힘드니 수정하는
게 옳다"고 답해서 DB 저장값을 실제로 바꾸는 쪽으로 진행했다.

### 왜 이건 "값을 임의로 바꾸는 것"이 아닌가

앞선 여러 작업(48·55·56번)에서 반복해온 원칙은 "실제 값을 추정·변경·생성하지 않는다"이다.
이번 변경은 그 원칙을 어기지 않는다 - "158861천 명"은 애초에 "158,861,000명"이라는 같은
값을 "천 명" 단위로 축약 표기한 것뿐이고, 1000을 곱해서 실제 인원 수로 풀어 쓰는 것은
정보의 손실이나 추정 없이 완전히 동일한 값을 다른 배수로 다시 쓰는 것이다(158861 × 1000 =
158861000, 수학적으로 항상 성립).

### 변경한 파일

- **`services/calendar.py`**:
  - `_UNITS` 딕셔너리에서 `"PAYEMS": "천 명"` 제거(주석도 갱신)
  - `_expand_payems_thousands(value: str) -> str` 신규 - `round(float(value) * 1000)`으로
    실제 인원 수 문자열을 만든다
  - `_with_unit`에 PAYEMS 전용 분기 추가: `f"{_expand_payems_thousands(value)} 명"`
    (다른 지표는 기존처럼 `_UNITS` 딕셔너리 조회 그대로)
  - `_ingest_from_fred`/`ingest_year_from_fred` 두 곳 다 `_with_unit`을 그대로 호출하므로
    별도 수정 없이 이 변경이 자동으로 적용된다
- **`scripts/expand_payems_thousands.py`**(신규, 1회성 백필): `id LIKE 'fred-PAYEMS-%'`인
  행만 대상으로 `previous`/`actual`이 `"숫자천 명"` 패턴이면 `"{숫자*1000} 명"`으로
  UPDATE. 이미 변환된 값은 정규식이 매치되지 않아 건드리지 않으므로 재실행해도 안전(멱등)
- **`frontend/lib/format-economic-value.ts`**: `formatEconomicValue`가 단위 `"명"`(이미
  실제 인원 수로 풀린 값)을 인식해서 `formatKoreanCount(numeric)`을 그대로 적용하도록
  케이스 추가(기존 `"천명"` 케이스는 혹시 남아있을 옛 데이터를 위해 `numeric * 1000`
  버전 그대로 유지 - 하위 호환)
- `frontend/app/(main)/calendar/news-data.ts`: 19곳의 `"XXXXXX천 명"`을
  `sed -E 's/([0-9]+)천 명/\1000 명/g'`로 `"XXXXXX000 명"`으로 일괄 치환(200개 행 수
  불변, 다른 값은 건드리지 않음을 `grep`으로 확인)

### 검증

- `uv run python scripts/expand_payems_thousands.py` 실행 → "11건 변경, 0건 스킵" 확인
- DB를 직접 조회해서 `fred-PAYEMS-2026-01-01` ~ `-11-01` 11개 행 전부
  `previous`/`actual`이 `"158432000 명"` 형태로 바뀐 것을 확인
- FastAPI 서버를 띄우고 `GET /calendar/events?year=2026&month=2` 직접 호출 →
  `"previous": "158432000 명", "actual": "158592000 명"`로 API 응답에서도 확인
- `npx tsc --noEmit` 통과, `npm run dev` + Playwright로 `/calendar` 화면 확인 -
  "약 1억 5,859만 명"/"약 1억 5,843만 명"으로 56번 때와 동일하게 정상 표시(값 자체가
  바뀐 게 아니라 저장 형식만 바뀌었으므로 화면 결과는 그대로임을 재확인)

### 56번과의 관계

56번에서 만든 화면 포맷터(`formatEconomicValue`)는 "DB는 그대로 두고 화면에서만 변환"
원칙으로 만들었는데, 이번에 DB 저장 형식 자체가 바뀌면서 포맷터도 그에 맞춰 최소한만
수정했다(새 단위 `"명"` 케이스 추가). 다른 지표(CPI/PPI/PCE/GDP/UNRATE)의 저장 형식과
포맷터 동작은 이번 변경과 무관하게 그대로다.

### 후속 수정 - "158861000 명" → "158861000명"(숫자와 "명" 사이 공백 제거)

바로 다음 요청으로 사용자가 공백을 빼달라고 했다. 값은 그대로 두고 표기만 고치는
것이라 간단히 처리했다:

- `services/calendar.py`: `_with_unit`의 PAYEMS 분기를 `f"{...} 명"` → `f"{...}명"`으로
  수정(공백 제거)
- **`scripts/fix_payems_space.py`**(신규, 1회성): `id LIKE 'fred-PAYEMS-%'`인 행의
  `previous`/`actual`에서 `REPLACE(컬럼, ' 명', '명')`만 적용 - 11건 갱신
- `news-data.ts`: `sed -E 's/([0-9]) 명"/\1명"/g'`로 19곳의 `" 명"`을 `"명"`으로 일괄
  치환(패턴을 "숫자 + 공백 + 명 + 닫는 따옴표"로 좁혀서 summary 본문 텍스트 등 다른
  곳의 "명"은 건드리지 않도록 함 - 치환 전후로 개수를 대조해 확인)
- 정규식 파서(`RAW_PATTERN`)가 숫자와 단위 사이 공백을 `\s*`로 이미 허용하고 있어서
  `formatEconomicValue`는 공백 유무와 무관하게 동일하게 동작 - 프런트 포맷터 코드는
  수정할 필요가 없었다

검증: DB 직접 조회로 `"158432000명"` 형태 확인, `tsc --noEmit` 통과, Playwright로
화면의 `title` 툴팁(원본값)이 `"158592000명"`(공백 없음)으로 나오고 표시값("약 1억
5,859만 명")은 그대로임을 확인.

## 58. `front/feat/calendar` pull 시도 - 브랜치 자체에 미해결 병합 충돌이 커밋돼 있어 보류

사용자가 "backend를 push 하고 front/feat/calendar pull해줘"라고 요청했다. backend push는
평소대로 진행했고(`2105e4e`, 57번 PAYEMS 변경 포함), `front/feat/calendar` pull은 51번의
`front/dev` 조사와 같은 방식으로 - 실제 merge 전에 먼저 안전하게 검증하다가 진짜 문제를
발견해서 중단했다.

### 검증 방법 - 격리된 git worktree에서 시험 merge (본 작업 트리는 전혀 건드리지 않음)

`git diff --stat`만으로는 실제 merge 시 충돌이 나는지 알 수 없어서(front/dev 때처럼
"파일이 삭제/치환된 것처럼" 보여도 실제로는 git이 3-way merge로 깔끔하게 합칠 수 있는
경우가 있다), `/tmp/merge-test-worktree`에 `git worktree add --detach`로 현재
`back/feat/calendar` HEAD를 복제한 뒤 그 안에서만 `git merge --no-commit --no-ff
origin/front/feat/calendar`를 실행해서 실제 결과를 확인했다. 이 방식이면 진짜 merge
결과를 볼 수 있으면서도 현재 작업 트리(커밋 안 된 프런트 변경사항 포함)는 전혀 위험에
노출되지 않는다.

### 발견 - git 자체는 충돌 없이 merge에 성공했지만, `front/feat/calendar`의 커밋된 코드에

이미 풀리지 않은 병합 마커가 들어있었다

`git merge`는 "Automatic merge went well"이라고 보고했다(진짜 3-way 충돌은 없었다는
뜻). 하지만 merge 결과물을 열어보니 다음 3개 파일에 `<<<<<<< HEAD` / `=======` /
`>>>>>>> f40daca3...` 형태의 **git 충돌 마커 문자열이 코드 안에 그대로 박혀 있었다**:

- `backend/main.py`
- `backend/src/backend/core/config.py`
- `backend/src/backend/core/kis_client.py`

`git show origin/front/feat/calendar:backend/src/backend/core/config.py`로 직접
확인한 결과, 이 마커는 내 merge 때문에 생긴 게 아니라 **`front/feat/calendar` 브랜치에
이미 이 상태로 커밋되어 있었다**. 커밋 이력을 추적해보니 `f40daca`("feat:heatmap 구현",
`front/dev`)를 `front/feat/calendar`에 합친 커밋(`1a362b3`, "Merge branch 'front/dev'
... into front/feat/calendar")에서 누군가 충돌을 해결하지 않고 그대로 커밋한 것으로
보인다. 즉 지금 GitHub의 `front/feat/calendar` 브랜치는 **이 3개 파일이 Python
문법 오류 상태**라 그대로 pull하면 백엔드 서버 자체가 뜨지 않는다.

### 그 외 확인한 내용(참고용 - 실제 병합은 아직 안 함)

- `models/calendar.py`/`schemas/calendar.py`/`services/calendar.py`(이번 세션에서
  많이 수정한 파일들)는 실제로는 충돌 없이 깔끔하게 merge됐다 - `actual_label` 필드도
  그대로 살아있었다
- `core/kis_client.py`는 (충돌 마커 구간만 빼면) 이 브랜치의 KSD 배당/IPO/선물옵션
  함수와 front 쪽 heatmap 함수(`get_sector_prices`/`get_stock_quotes` 등)가 함께
  들어있어서, 두 기능이 텍스트 레벨에서는 공존 가능한 것으로 보인다
- 프런트 `calendar` 쪽은 이미 52번에서 이 브랜치가 `front/dev`를 기준으로 재구성한
  상태라 `front/feat/calendar`의 최신 구조(`page.tsx`+`components/calendar/*`)와도
  큰 틀에서 호환되는 것으로 보인다(단, 실제 최종 병합 시 재검증 필요)

### 판단 및 다음 단계

3개 파일의 문법 오류는 내가 임의로 고쳐서 병합할 수도 있는 단순한 내용으로 보였지만
(양쪽 내용을 그대로 합치면 될 걸로 보임), `core/` 공용 파일과 다른 팀 브랜치를 고치는
일이라 사용자에게 먼저 확인했다. 사용자가 "지금은 pull 보류, front팀에게 먼저 알림"을
선택해서, **실제 pull/merge는 진행하지 않았고** 시험용 worktree(`/tmp/merge-test-worktree`)는
`git worktree remove --force`로 정리했다. `back/feat/calendar`의 작업 트리와 커밋
이력은 이번 조사로 전혀 변경되지 않았다.

다음 단계: front팀이 `front/feat/calendar`의 저 3개 파일 충돌 마커를 해결해서 다시
푸시하면, 그때 이 worktree 시험 merge 절차를 다시 실행해서 진짜로 깨끗하게 합쳐지는지
재확인한 뒤 진행한다.

## 59. front팀에게 전달할 내용 — `front/feat/calendar`에서 고쳐야 하는 것들

사용자가 "저쪽(front)에서 수정해야하는 내용을 문서로 적어줘"라고 요청했다. 58번 이후
`front/feat/calendar`를 실제로 merge해보면서 새로 발견한 것까지 포함해 front팀에
전달할 체크리스트를 정리한다.

### 1. (58번 재확인) 3개 파일에 git 병합 충돌 마커가 해결 안 된 채 커밋되어 있음

`front/dev`(heatmap, 커밋 `f40daca`)를 `front/feat/calendar`에 합친 커밋(`1a362b3`)에서
충돌을 안 지우고 그대로 커밋했다. 2025-09-16 오늘 다시 fetch해서 재확인했는데도 아직
그대로다(고쳐지지 않음). 영향받는 파일과 해결 방법:

- **`backend/main.py`**: `app.include_router(calendar_router)`와
  `app.include_router(heatmap_router)` 둘 다 남기면 됨(마커 3줄만 삭제).
- **`backend/src/backend/core/config.py`**: heatmap 설정 필드(`heatmap_enabled`,
  `heatmap_requests_per_second`, `heatmap_session_overrides`)와 `database_url`
  둘 다 남기면 됨 - 서로 무관한 필드라 순서 상관없음.
- **`backend/src/backend/core/kis_client.py`**: 충돌 구간(276~635줄)이 커서 두 그룹의
  함수가 통째로 걸렸다. `_download_master` 함수는 front/dev쪽(zip 압축 해제 로직 -
  함수 위 주석과 실제로 일치하는 완성된 구현)을 채택하고, 그 아래 두 그룹의 함수
  (calendar 도메인의 `get_dividend_schedule`/`get_ipo_schedule`/`get_merger_split_schedule`/
  `get_option_month_list`/`get_futures_board`/`get_price` 등과, heatmap 도메인의
  `_read_master_cache`/`get_sector_master`/`_parse_stock_master`/`get_stock_master`
  등)는 전부 삭제 없이 유지하면 됨 - 서로 다른 도메인이 쓰는 별개 함수라 겹치지 않는다.

마커를 다 지운 뒤 `uv run python -c "import backend.main"`으로 문법 오류 없이 import되는지
확인하고 다시 push해달라고 전달할 것.

### 2. (신규) `frontend/lib/api/calendar.ts`의 `CalendarEventDto`가 지금 백엔드 스키마와 안 맞음

`front/feat/calendar`의 프런트는 이미 정적 `NEWS` 배열을 없애고 `GET /calendar/events`를
실시간으로 호출하는 방식으로 발전해 있다(`getCalendarEvents()` + `toNewsItem()`) - 이
자체는 이 세션이 지금까지 해온 "DB export → news-data.ts 수동 동기화" 방식보다 훨씬
올바른 구조다. 문제는 이 DTO 타입이 만들어진 시점(2e0de23 근처)의 백엔드 스키마를
기준으로 하고 있어서, 그 이후 이 브랜치(`back/feat/calendar`)에서 백엔드 스키마가
두 번 바뀐 걸 반영하지 못하고 있다:

```ts
// frontend/lib/api/calendar.ts (front/feat/calendar, 현재)
export interface CalendarEventDto {
  ...
  previous: string | null
  forecast: string | null   // ← 55번에서 calendar_events 컬럼 자체를 삭제함. 백엔드가
                             //   이 필드를 더 이상 응답에 내려주지 않는다.
  actual: string | null
  status: string
  // actual_label이 없음 ← 54번에서 추가한 필드. "주당"/"공모가"/"매출액" 라벨이
  //                        여기 없어서 화면에 반영이 안 된다.
}
```

`toNewsItem()`(`frontend/app/(main)/calendar/news-data.ts`)도 `dto.forecast`를 그대로
읽어서 `detail.forecast`에 매핑하고 있는데, 이제 항상 `undefined`만 오니 죽은 코드다.
front팀에 전달할 수정 내용:

1. `CalendarEventDto`에서 `forecast: string | null` 필드 삭제
2. `CalendarEventDto`에 `actual_label: string | null` 필드 추가
3. `NewsItem["detail"]`에 `actualLabel?: string` 추가, `toNewsItem()`에서
   `if (dto.actual_label) detail.actualLabel = dto.actual_label` 매핑 추가
4. 화면에서 `actual`/`previous` 값을 보여줄 때 `actualLabel`이 있으면
   `"{actualLabel} {값}"` 형태로 같이 보여주면 54번에서 만든 라벨(예: "주당 880원",
   "공모가 8300원", "매출액 79.0조원")이 정상적으로 화면에 나온다

### 3. (참고) 화면 표시 단위 변환(56·57번)은 이 세션에서 이식 예정 - front팀 조치 불필요

`calendar_events`의 `actual`/`previous`는 여전히 API 원본 값 그대로 내려온다
(`"158861000명"`, `"32486.066십억 달러"` 등 - 56·57번에서 DB에는 원본을 그대로 두기로
했고, PAYEMS만 "천 명" 축약을 실제 인원 수로 풀어 저장하도록 바꿨다). 이 값을 "약 1억
5,886만 명"처럼 사람이 읽기 쉽게 바꾸는 `formatEconomicValue()`(`frontend/lib/format-
economic-value.ts`)는 이번에 `back/feat/calendar`에서 `front/feat/calendar` 구조 위로
직접 이식하는 작업이라(59번 뒷부분에서 진행), front팀이 별도로 손댈 필요는 없다.

### 실제로 merge를 완료함 - 위 1·2번 내용을 front팀 대신 직접 반영했다

문서만 써두고 끝낸 게 아니라, 사용자가 "front/feat/calendar를 pull 받아줘"라고 다시
요청해서 실제로 병합까지 완료했다. `back/feat/calendar`의 미커밋 프런트 작업(52~57번)을
먼저 커밋(`18a18de`)한 뒤 `git merge --no-commit --no-ff origin/front/feat/calendar`를
실행했는데, 예상보다 훨씬 큰 충돌이 났다(`page.tsx`/`news-data.ts`/`news-panel.tsx` 및
`components/calendar/*` 8개 파일, `lib/calendar.ts` - 총 10개 파일). 원인은
`front/feat/calendar`가 조사 시점(51번) 이후 스스로도 프런트를 더 발전시켜서, 정적
`NEWS` 배열을 완전히 없애고 `getCalendarEvents()`+`toNewsItem()`으로 백엔드를 실시간
호출하는 구조로 이미 바뀌어 있었기 때문이다 - 이 세션의 "front/dev 기준 재구성"(52번)과
저쪽의 "front/dev 기준 재구성 + 실시간 API화"가 같은 파일들을 서로 다르게 더 발전시킨
것.

결정한 병합 방향(사용자 승인): **저쪽(실시간 API) 구조를 그대로 채택**하고 그 위에
**이 세션에서 만든 기능만 다시 이식**한다. 절차:

1. 충돌난 10개 파일을 전부 `git show origin/front/feat/calendar:<path> > <path>`로
   덮어써서 "저쪽 그대로"로 만듦(`git checkout --theirs`가 이 환경에서 왜인지
   "Updated 0 paths"만 출력하고 실제로 반영이 안 되는 문제가 있어서, 더 확실한
   `git show` 방식으로 바꿔 진행함)
2. 이제 쓸모없어진 `weekly-summary-panel.tsx`(52번에서 만든 팝업 컴포넌트 - 저쪽의 새
   `AiSummaryCard`는 실제 주간 일정을 직접 받아서 렌더링하고 클릭 시 기존
   `DayDetailDialog`를 그대로 열기 때문에 별도 다이얼로그가 필요 없어짐) 삭제
3. 59번 위쪽에서 문서화했던 수정 내용(1~4번)을 front팀 대신 직접 반영:
   `lib/api/calendar.ts`의 `CalendarEventDto`에서 `forecast` 삭제·`actual_label` 추가,
   `news-data.ts`의 `NewsItem.detail`에 `actualLabel` 추가 및 `toNewsItem()` 매핑,
   `week-list.tsx`/`news-panel.tsx`에서 `actualLabel` 접두 + `formatEconomicValue()`
   적용, `lib/calendar.ts`의 `announceLabel`에서 "발표 예정" 접미사 제거(50번 항목의
   요구사항을 새 구조에도 유지)
4. 58·59번에서 발견한, `front/feat/calendar`에 이미 커밋되어 있던 미해결 git 충돌
   마커 3개(`backend/main.py`, `core/config.py`, `core/kis_client.py`)도 함께
   해결했다 - 59번에서 문서화한 방법 그대로: `main.py`/`config.py`는 양쪽 다 유지,
   `kis_client.py`는 Python 스크립트로 정확한 위치에 재조립(`_download_master`는
   zip 압축 해제 버전 채택, calendar/heatmap 양쪽 함수 전부 보존) - 재조립 후
   `python3 -m py_compile`과 `uv run python -c "import main"`으로 문법·임포트 확인함

주의: 처음 merge를 커밋할 때(`4d40ef0`) 이 4번 이식 작업이 실수로 스테이징에서 빠져서
(theirs로 checkout한 뒤 편집한 시점이 `git add`보다 늦었음) 별도 후속 커밋
(`8e9d1e6`)으로 나뉘었다 - `git show HEAD:<path>`로 실제 커밋된 내용에 이식 결과가
들어있는지 재확인해서 잡아냈다.

### 검증 (실사용 화면까지 직접 확인)

- `npx tsc --noEmit` 통과
- 백엔드 서버(`uv run uvicorn main:app`)를 실제로 띄워서 `import main` 문법 오류 없음과
  `GET /calendar/events` 응답에 `forecast` 키가 없고 `actual_label`이 채워져 오는 것을
  확인
- 프런트(`npm run dev`, `NEXT_PUBLIC_API_BASE_URL`이 로컬 `.env.local`에서 8080으로
  지정돼 있어 백엔드도 8080으로 맞춰 띄움)를 Playwright로 직접 조작해서:
  - 실시간으로 불러온 실제 일정이 화면에 정상 표시됨(더 이상 `news-data.ts`의 정적
    스냅샷이 아니라 매번 `GET /calendar/events`를 호출)
  - "공모가 14600원"/"공모가 10000원"(IPO), "주당 880원" 등 라벨이 새 구조에서도
    정상 표시
  - PAYEMS "약 1억 5,859만 명"/"약 1억 5,843만 명"이 새 구조에서도 정상 변환됨
  - 일정을 클릭해 여는 상세 팝업에서 "실제값 주당 880원"이 정상 표시됨(news-panel.tsx
    이식분 확인)
  - "이번주 AI 요약" 카드가 실제 이번 주 일정(예: "와이즈플래닛컴퍼니 공모주 청약")을
    실시간으로 보여줌 - 저쪽 구조가 가진 개선점

### 남은 것

`back/feat/calendar`에는 이제 이 merge 커밋이 로컬에만 있고 아직 push하지 않았다.
push 여부는 사용자 확인 후 진행.

## 60. `front/feat/calendar` 2차 pull — front팀이 그 사이 더 발전시킨 내용 재병합

사용자가 다시 "front/feat/calendar 를 pull"이라고 요청했다. `git fetch`로 확인해보니
59번에서 병합한 시점(`1a362b3`) 이후 front팀이 새 커밋 3개(`b54aeb5`/`c0f97d7`/
`e2a35c8`)를 추가로 푸시해뒀다:

- **`e2a35c8`**: 57번에서 이 브랜치가 만든 PAYEMS 실인원수 저장 수정을 그대로 이식 -
  커밋 메시지에 "back/feat/calendar에서 이미 반영된 수정을 이식"이라고 명시돼 있고
  Claude Sonnet 5 co-author 표기도 있다(front팀도 Claude Code로 작업 중)
- **`b54aeb5`**: 58·59번에서 발견한 `main.py`/`config.py`/`kis_client.py`의 미해결
  git 충돌 마커를 front팀이 스스로 해결. 초보자용 "베끄로 레슨" 기능
  (`beginner-lessons.ts`, `beginner-lesson-dialog.tsx`, `beginner-lesson-teaser.tsx`)과
  로딩 스켈레톤(`calendar-skeletons.tsx`) 추가, `ai-summary-card.tsx` →
  `Weekplan.tsx`로 이름 변경
- **`c0f97d7`**: "2025년으로 넘어가면 데이터 없음 처리" - `news-data.ts`/`page.tsx`
  등 다수 개선(날짜 파싱 검증 강화, `hasTime` 필드 추가), **`format-economic-value.ts`도
  이 커밋에서 이식되어 있었다** - 음수 처리와 `toLocaleString` 활용 등 59번 때보다
  더 다듬어진 버전으로 발전해 있었다

### 재병합 절차 및 충돌 해결

이번엔 `git merge --no-commit --no-ff origin/front/feat/calendar`가 8개 파일에서
충돌을 냈지만, 59번 때와 달리 대부분 "같은 걸 양쪽이 비슷하게 고친" 사소한 충돌이었다
(59번에서 이미 구조를 맞춰뒀기 때문). 파일별 해결:

- `services/calendar.py`: PAYEMS 주석 문구 차이만 있어서 이 브랜치 버전 유지
- `kis_client.py`: front팀이 heatmap 함수 묶음을 `_download_master` 바로 뒤로
  재배치했는데, 이 브랜치의 59번 정리본은 파일 끝에 같은 함수들을 중복으로 갖고
  있었다 - front팀 위치로 통일하고 파일 끝 중복 정의 블록을 삭제
- `format-economic-value.ts`(add/add 충돌): front팀 버전이 더 다듬어져 있어 통째로 채택
- `lib/api/calendar.ts`, `news-data.ts`: `actual_label` 관련 주석 문구 차이뿐 -
  front팀 버전 유지
- `news-panel.tsx`: 이 브랜치는 facts 배열을 만들 때 미리 `formatEconomicValue()`를
  적용했는데, front팀은 `[라벨, 원본값]`만 배열에 담고 렌더링(`<dd>`) 시점에 한 번만
  포맷하는 방식으로 이미 개선해뒀다(코드 다른 곳에 이미 `{formatEconomicValue(v)}`가
  있었음) - 중복 포맷팅을 없애기 위해 front팀 방식 채택
- `lib/calendar.ts`: front팀이 새로 만든 `weekLabelOf`/`weekOwnedRangeOfMonth`
  (월 경계에 걸친 주를 "날짜가 더 많이 속한 달" 기준으로 정확히 배정하는 함수,
  목요일 기준 ISO 8601 방식)는 그대로 채택하고, `announceLabel`은 이 브랜치의
  접미사 없는 버전을 유지(front팀 버전엔 트레일링 공백이 남아있는 사소한 흠이 있었음)
- `week-list.tsx`: front팀이 추가한 `hasTime` 필드 기반 "시간 미정" 표시(시간이
  아예 확인 안 된 이벤트용)와, 이 브랜치의 "발표일이 지나면 -" 규칙(50번 항목)을
  둘 다 살려서 `!hasTime → "시간 미정"`, `지난 경우 → "-"`, `그 외 → announceLabel`
  세 갈래로 합침 - 어느 한쪽만 적용하면 다른 쪽이 다루던 케이스를 놓치게 됨

### 검증

- `npx tsc --noEmit` 통과
- `python3 -m py_compile main.py core/config.py core/kis_client.py
domain/calendar/services/calendar.py` 문법 확인 + `uv run python -c "import main"`
  임포트 확인 - 전부 통과
- 백엔드(8080)+프런트(3000) 재기동 후 `/calendar` 화면 Playwright로 직접 확인:
  - 새로 추가된 "이번 주, 주린이 탈출"(베끄로 레슨 티저)와 "이번 주엔 이런 일정이
    있어요" 카드가 정상 렌더링됨 - 사용자가 이전에 물어봤던 "이번주에는 이런 일정이
    있어요" 문구가 바로 이 front팀의 새 기능이었음이 확인됨(그때는 아직 push되기
    전이라 저장소에 없었던 것)
  - "공모가 14600원"/"공모가 10000원" 등 54번 라벨이 새 구조에서도 계속 정상 표시
  - "시간 미정"(공모주 청약처럼 시간 정보가 없는 이벤트) 표시도 정상 작동

### 남은 것

이번 merge(`a658836`)도 아직 로컬에만 있고 push하지 않았다. `backend/tmp_check_columns.py`/
`backend/tmp_repro_500.py`(front팀이 남긴 디버그용 임시 스크립트로 보임)와
`.claude/settings.json`(front팀의 로컬 Claude Code 권한 설정)도 함께 들어왔는데,
이 브랜치 것이 아니라서 그대로 유지했다 - 필요하면 나중에 정리.

## 61. `back/feat/calendar` → `back/dev` push — "backend만" 분리 push 방식이 정착됨

사용자가 "back/feat/calendar 를 pull로 back/dev에 병합하고 push"를 요청했다가 한 번
"취소"했고("아직 확실히 정할 게 남았다"는 판단으로 보임), 곧바로 "backend를 back/dev에
병합하고 push"로 명확히 재요청했다. 57번 항목에서 정착된 "backend만 분리해서 push"
방식(58~60번에서 front/feat/calendar에 했던 것과 동일한 접근)을 back/dev에도 그대로
적용했다 - 로컬 `back/feat/calendar`(front/feat/calendar와의 전체 merge 이력 포함)를
건드리지 않고, `origin/back/feat/calendar`(60번에서 이미 backend-calendar 전용으로
추출해둔 상태)를 `origin/back/dev`에 병합했다.

### 왜 이번에도 격리된 worktree를 썼는가

39번 항목(calendar 도메인을 back/dev에 처음 통합한 원래 작업)과 완전히 같은 절차를
다시 밟았다 - `back/dev`는 여러 팀원이 공유하는 브랜치라 실수로 로컬 작업 트리를
망가뜨리면 안 되고, 시험 삼아 확인만 하고 버릴 수도 있어야 한다. `git worktree add
--detach /tmp/back-dev-merge origin/back/dev`로 완전히 분리된 작업 공간을 만들고,
거기서만 병합·해결·검증·push까지 다 한 뒤 worktree를 지웠다 - 현재 브랜치
(`back/feat/calendar`)의 커밋 이력이나 작업 트리는 전혀 건드리지 않았다.

### 충돌 3개 - 전부 39번과 같은 성격("서로 다른 걸 각자 추가한 것뿐")

- **`core/config.py`**: `back/dev`가 그새 `supabase_url`/`supabase_service_key`를
  추가했고, `back/feat/calendar`는 `ecos_api_key`를 추가했다 - 텍스트 위치만 겹친
  것이라 둘 다 유지
- **`core/kis_client.py`**: `back/dev`는 이미 heatmap 전용 함수 묶음
  (`_wait_for_request_slot`/`_get`/`get_sector_prices`/`get_stock_master` 등, 60번에서
  front/feat/calendar에도 있었던 것과 같은 계열)을 갖고 있었고, `back/feat/calendar`는
  국내선물옵션(KOSPI200 만기) 함수 묶음(`get_option_month_list`/`get_futures_board`/
  `get_option_callput_board`/`get_price`)을 추가했다 - 서로 다른 함수라 두 블록을
  순서대로 이어붙이는 것으로 해결(39번과 완전히 동일한 패턴)
- **`domain/calendar/services/calendar.py`**: import문에서 `ecos_client` 추가는
  단순했지만, **39번에서 이미 한 번 겪었던 "충돌 없이 조용히 깨지는" 문제가 똑같이
  재발했다** - `back/dev`의 `core/database.py`는 `get_session_factory()`(세션메이커를
  반환, `get_session_factory()() as session`으로 열어 씀) 구조인데, `back/feat/calendar`
  쪽에만 있던 BOK 기준금리(`ingest_bok_rate_decisions`)와 KOSPI200 만기
  (`ingest_kospi200_expiry`) 두 함수가 옛날 `async_session() as session` 패턴 그대로
  텍스트 충돌 없이 병합돼 들어왔다(39번 이후 추가된 함수라 그때 고쳐진 적이 없어서).
  `grep`으로 파일 전체에서 `async_session()` 잔여 호출을 찾아 이 2곳만 `sed`로
  `get_session_factory()()`로 치환해서 해결 - "git 병합 성공 = 실제로 동작함"이 아니라는
  걸 또 한 번 확인시켜준 사례라 39번처럼 기록해둔다

### 검증

- 수정한 6개 파일(`config.py`/`kis_client.py`/`services/calendar.py`/`schemas/calendar.py`/
  `models/calendar.py`/`.env.example`) 전부 `py_compile` 통과
- `uv sync` + `uv run python -c "import main"` 성공(시험용 worktree에 메인 저장소의
  `.env`를 임시로 복사해서 실제 DB 연결까지 확인한 뒤, 커밋 전에 다시 삭제 - `.env`는
  `.gitignore`에 있어서 애초에 스테이징되지도 않지만 이중으로 확인함)
- `uvicorn main:app`으로 실제 기동 - 스케줄러 12개 작업(timeline 8개 + heatmap
  `heatmap_initial`/`heatmap` 2개 + 기존 `market_vix` 등) 정상 등록, "Application
  startup complete" 확인
- `GET /calendar/events?year=2026&month=9` - 15건 응답, `actual_label`("공모가" 등)
  포함해서 정상 확인
- `GET /timeline/indicators`, `GET /` - 둘 다 200 정상(calendar 도메인 재통합이 기존
  timeline/heatmap 도메인에 영향 없음을 확인)

### 결과

- `back/dev`가 `111ee74` → `7989369`(병합 커밋)로 갱신, origin에 push 완료
- `back/feat/calendar` 로컬 브랜치(front/feat/calendar와의 전체 merge 포함)는 그대로
  유지, worktree는 삭제
- `back/feat/calendar`(원격, backend-calendar 전용)와 `back/dev`가 이제 같은
  calendar 도메인 backend 상태를 공유하게 됨

## 62. FOMC 실제 금리(previous/actual) 연결 + status 신선도 버그 수정 + 재수집 스케줄러

사용자가 "FOMC 자세히 보기를 발표 전/후에 따라 동적으로 바꿔달라"는 큰 스펙을 줬다.
분석 결과 이 기능의 핵심 전제("발표 후 실제 금리를 보여준다")부터 막혀 있었다 - FOMC
이벤트는 애초부터 `previous`/`actual`을 항상 `None`으로 고정해뒀기 때문이다(FOMC 회의
일정 자체엔 금리 수치가 없다는 이전 결정). 이번 항목은 그 전제를 해결하는 **backend
데이터 계층**만 구현했고, 원래 스펙의 5섹션 프런트 UI·Gemini 연동은 범위를 좁혀 다음
단계로 남겼다(아래 "이번에 안 한 것" 참고) - 사용자가 도중에 제기한 데이터 출처 문제를
먼저 해결하는 게 우선이라고 판단했다.

### 발견 1 - FRED에 실제 연방기금금리 목표범위 시계열이 있었다

FOMC가 결정하는 건 단일 수치가 아니라 "목표범위"(상단/하단)다. FRED에 이 범위를 그대로
주는 공식 일별 시계열이 있다: **`DFEDTARU`**(상단)/**`DFEDTARL`**(하단). 라이브로 확인한
결과 2026년 들어 지금까지(1~9월 8차례 회의) 계속 3.50~3.75%로 변동이 없었다 - 즉 2026년
FOMC는 지금까지 전부 "동결"이었다는 게 실제 정부 공식 데이터로 확인된 사실이다. 기존에
"FOMC API가 없다"고 알고 있던 제약(`fed_client.py`의 정적 표)은 "회의 일정"에 대한
것이었지 "결정된 금리 값"에 대한 게 아니었다 - 값은 FRED에 이미 있었다.

### 발견 2 - `timeline_news`(다른 도메인 소유)에는 정반대 시나리오가 들어있었다

사용자가 "9월 17일 기준 금리 인상률?"이라고 물어봐서 FRED로 "동결"이라고 답했는데,
이어서 사용자가 "뉴스로는?"이라고 다시 물어서 `timeline_news`를 확인해보니 그 안에는
**"美 연준, 기습 금리인상", "3년 만의 금리인상", "만장일치로 금리 인상 결정"** 같은
완전히 반대되는 내용이 들어있었다. 기사에 "케빈 워시 연준 의장"이라는, 실제로 존재하지
않는 인물이 언급된 걸 보고 이게 timeline 도메인이 데모/테스트용으로 넣어둔 가상
시나리오라는 걸 확인했다.

**판단**: calendar 도메인은 처음부터 "실제 검증 가능한 데이터만 쓴다"는 원칙으로
FRED/DART/KIS/ECOS를 직접 연결해왔다. `timeline_news`는 다른 팀이 소유한 도메인 데이터고
가상 시나리오로 보이는 이상, calendar가 그걸 사실 소스로 끌어다 쓰면 도메인 경계를
넘을 뿐 아니라 실제 서비스에서 사용자가 가짜 뉴스를 진짜로 착각할 위험이 있다.
**FRED만 신뢰할 수 있는 소스로 확정**했다(timeline 담당자에게 이 데이터가 실제
스크래핑인지 테스트 시나리오인지 확인이 필요하다는 것도 별도로 전달할 필요가 있음).

### 발견 3 - FOMC status가 시간이 지나도 안 바뀌는 진짜 버그를 찾음

`_fomc_status()`(현재 시각 vs 발표 시각 비교) 자체의 로직은 맞았지만, 이 계산이
**seed 스크립트를 수동 실행할 때 딱 한 번만 되고 DB에 그대로 저장**된다는 게 문제였다.
calendar 도메인에 재수집 스케줄러가 하나도 없어서(`main.py`에 grep해서 확인 - timeline/
heatmap은 이미 있음), 발표 시각이 지나도 DB의 status는 계속 `SCHEDULED`로 굳어있었다.
실제로 2026-09-16 03:00(KST) 발표 건이 다음날 10시가 넘도록 `SCHEDULED`로 남아있는 걸
직접 확인했다.

### 구현

**`services/calendar.py`**

- `_fomc_rate_range(as_of_date)`: DFEDTARU/DFEDTARL을 `as_of_date` 기준으로 조회해서
  `"하단~상단%"` 문자열로 합침(예: `"3.5~3.75%"`). 관측치가 없으면(미래 날짜 등) `None`
  그대로 반환 - 임의 추정 안 함
- `_fetch_observation()`: FOMC 연도 전체를 채우는 동안 이 함수가 짧은 시간에 여러 번
  연달아 호출되는데, 테스트 중 FRED가 간헐적으로 `ReadTimeout`을 주는 걸 실제로 겪었다
  (단일 호출은 항상 빠르게 성공, 연속 호출일 때만 가끔 실패 - FRED 쪽 순간 스로틀링으로
  추정). 최대 3번까지 짧은 대기(1.5초씩 증가) 후 재시도하고, 그래도 안 되면 값을
  지어내지 않고 예외를 그대로 전파한다
- `_fomc_statement_rates(meeting_start, meeting_end, status)`: `FOMC_STATEMENT`에만
  적용. `previous`는 회의 시작 전날 기준(항상 조회 가능), `actual`은 `status`가
  `RELEASED`일 때만 회의 마지막 날 기준으로 조회(아직 안 끝난 회의의 미래 결정을
  추정하지 않음). `FOMC_SEP`/`FOMC_MINUTES`는 이번에도 `None`으로 유지(금리를
  "결정"하는 이벤트가 아님, 기존 방침 그대로)
- `_fomc_event()`: `meeting_start` 인자를 추가로 받아 위 함수에 전달하도록 시그니처 확장
- `get_events_by_month()` + 신규 `_refresh_fomc_status()`: DB에서 읽어온 FOMC 이벤트 중
  `status`가 아직 `RELEASED`로 확정 안 된 것만 현재 시각으로 재계산해서 즉시 보정한다 -
  "값"(금리 수치)은 재수집이 필요하지만 "상태"는 현재 시각과 비교만 하면 되므로, DB
  갱신을 기다리지 않고도 조회할 때마다 항상 정확한 상태를 보여준다(RELEASED로 이미
  확정된 건 다시 계산 안 함 - 시간은 거꾸로 안 흐름)

**`main.py`**

- `_refresh_fomc()`: `ingest_fomc_year(현재 연도)`를 동기 스케줄러에서 `asyncio.run`으로
  감싸 실행(`_refresh_indicators`와 같은 패턴). 시작 시 1회 + 이후 매시 0분/30분마다
  실행(`_refresh_indicators`와 같은 주기) - upsert라 반복 실행해도 안전

### 검증

- `ingest_fomc_year(2026)` 직접 실행 → 2026년 1~9월(이미 지난 8개 회의 중 6개 STATEMENT가
  RELEASED) 전부 `previous=actual="3.5~3.75%"`로 확인(실제 FRED 데이터와 일치, 8월 회의는
  없음 - fed_client.py 정적 표에 애초에 없는 달), 10월/12월(아직 안 지남)은
  `status=SCHEDULED`, `actual=None`으로 정상
- `uv run uvicorn main:app` 실제 기동 후 `GET /calendar/events?year=2026&month=9` 호출 -
  `fomc-2026-09-16-FOMC_STATEMENT`가 이제 `RELEASED` + `previous`/`actual` 둘 다
  `"3.5~3.75%"`로 정상 응답(수정 전엔 `SCHEDULED`+`None`이었음 - status 버그가 실제로
  고쳐졌음을 확인)
- 백엔드 로그에 예외/에러 없음(스케줄러 시작 시 `_refresh_fomc` 1회 실행분 포함)
- `python3 -m py_compile` 통과

### 이번에 안 한 것 (원래 스펙의 나머지 부분 - 다음 단계)

- **5섹션 "발표 후" 프런트 UI**("한눈에 보는 결과"/"이번 결정의 핵심"/"주린이에게 중요한
  이유"/"미국→한국 전달 경로"/"10초 퀴즈")는 아직 구현 안 함 - 지금은 기존 `news-panel.tsx`
  범용 facts 표시 그대로라 `previous`/`actual`이 채워진 건 보이지만 스펙이 요구한
  전용 레이아웃은 없음
- **Gemini 연동**(`core/gemini_client.py` 신규, 검증된 데이터를 프롬프트로 넘겨 설명문/
  퀴즈 생성)도 아직 안 함 - `config.py`에 `gemini_api_key` 필드는 있지만 실제 클라이언트는
  없음
- **"투표 결과"**는 여전히 이 프로젝트가 연결 가능한 데이터 소스가 전혀 없다(FRED에
  없고, 연준 성명서 원문을 가져오는 클라이언트도 없음) - 나중에 이 부분을 구현할 때도
  "확인 안 됨"으로 처리하고 임의 생성하지 않아야 한다
- 새 엔드포인트(예: `GET /calendar/fomc/{event_id}/detail`)도 아직 안 만듦 - 5섹션 UI를
  실제로 붙일 때 필요

## 63. FRED 지연 발견 + 실제 연준 발표문으로 수정 + summary 발표 전/후 동적 처리

62번에서 "FRED가 진짜 데이터니까 그걸 쓰자"고 결정했는데, 사용자가 화면에서 실제 반영된
값과 다르다고 지적해서 다시 확인해보니 **FRED가 이번 회의 결정을 아직 반영 못 하고
있었다**(DFEDTARU/DFEDTARL이 발표 다음날 오전까지도 "3.5~3.75%"로 남아있었음 - 정부
통계 시계열이 실제 발표보다 며칠 늦게 갱신되는 경우가 있다는 걸 실제로 겪음).

### 61·62번의 판단을 정정함 - `timeline_news`가 가짜가 아니었다

WebSearch로 연준 공식 발표문(federalreserve.gov)과 CNBC/Fox Business 등 복수 출처를
직접 확인한 결과, 62번에서 "케빈 워시는 실존하지 않는 인물이라 `timeline_news`가 가상
시나리오"라고 판단한 게 **틀렸다** - 케빈 워시는 실제 연준 이사 출신이고 이번 회의의
실제 연준 의장이었다. `timeline_news`(금리 인상, 만장일치)가 맞았고, "실제 검증
가능한 API(FRED)가 항상 더 정확하다"는 가정이 이번 경우엔 깨졌다 - **API도 갱신
지연이 있을 수 있다는 걸 놓쳤다.**

**실제 확인된 사실**(federalreserve.gov 공식 발표문, 2026-09-17 직접 확인):

- 기준금리 목표범위 25bp 인상: 3.50~3.75% → **3.75~4.00%**
- 투표: **찬성 12명, 반대 0명(만장일치)**
- 2023년 이후 첫 인상

### 구현 1 - `_FOMC_RATE_OVERRIDES`: FRED가 못 따라온 회의만 공식 발표문으로 직접 보정

`_BOK_RATE_DECISION_DATES`(한국은행 결정일을 공식 페이지로 직접 확인해서 수동 기록해둔
표)와 같은 성격의 예외 표를 추가했다 - "실시간 API가 아직 못 주는 값을, 더 1차적인
공식 출처(연준 발표문 자체)로 직접 확인해서 채워두고, API가 나중에 따라잡으면 결과가
같아지는" 패턴이다. 임의 추정이 아니라 **연준 공식 발표문이라는 이 프로젝트가 참조할 수
있는 가장 권위 있는 출처를 직접 읽고 옮긴 것**이다.

```python
_FOMC_RATE_OVERRIDES: dict[str, dict[str, str]] = {
    "2026-09-16": {
        "rate_range": "3.75~4.00%",
        "vote_result": "찬성 12명, 반대 0명(만장일치)",
    },
}
```

`_fomc_statement_rates()`가 `actual` 계산 시 이 표를 먼저 확인하고, 없으면 기존대로
FRED를 조회한다.

### 구현 2 - summary도 발표 전/후로 동적 분기

사용자가 "발표 후인데 문구가 '~발표하는 날입니다'로 미래형인 게 이상하다"고 추가로
지적한 것도 진짜 버그였다 - 62번에서 previous/actual만 채우고 summary는 그대로 뒀었다.

- `_fomc_rate_change(previous, actual)`: "하단~상단%" 두 문자열을 비교해서 방향(인상/
  인하/동결)과 상단 기준 변화폭(bp)을 계산(상/하단은 항상 같이 움직이므로 상단만
  비교해도 충분) - 이미 검증된 값끼리 비교하는 것뿐이라 추정이 아니다
- `_fomc_statement_summary(previous, actual, meeting_end)`: `actual`이 없으면(아직
  발표 안 됨) 기존 발표 전 문구 그대로, 있으면 실제 결과로 채운 새 문장으로 교체:
  `"...금리 목표범위를 {이전}에서 {현재}로 {방향}했습니다({bp}bp {방향})."` + 투표
  결과가 override 표에 있으면(현재는 9/16 회의만) 그 문장도 이어붙임. "단정하지
  말라"는 원래 지침대로 시장 방향 예측 문장은 넣지 않음
- 동결인 경우(bp=0)엔 "(0bp 동결)" 같은 어색한 표현이 안 나오게 bp 접미사를 생략함

### 검증

- `ingest_fomc_year(2026)` 재실행 결과: 1~7월(동결) 전부 "...동결했습니다"로, 9월(인상)은
  "...3.5~3.75%에서 3.75~4.00%로 인상했습니다(25bp 인상). ... 이번 결정은 찬성 12명,
  반대 0명(만장일치)로 이뤄졌습니다"로 정상 출력. 10/12월(아직 안 지남)은 기존 발표 전
  문구 그대로 유지되는 것도 확인
- `GET /calendar/events?year=2026&month=9` 실제 호출 - `actual`이 `"3.75~4.00%"`로,
  summary가 위 문장으로 정상 응답하는 것을 확인
- `python3 -m py_compile` 통과

### 교훈 - 이 항목은 문서로도 남겨야 하는 실패 사례

"실시간 API가 뉴스보다 정확하다"는 가정 자체가 항상 맞는 건 아니다 - 이번 항목의 핵심
교훈은 **어느 한쪽을 무조건 신뢰하지 말고, 다를 때는 둘 다 실제로 검증해봐야 한다**는
것이다. 이번엔 운 좋게 WebSearch로 1차 출처(연준 공식 발표문)까지 확인할 수 있어서
해결했지만, 이런 실시간 확인이 불가능한 경우를 대비해 "API 값도 지연될 수 있다"는
가능성을 항상 열어둬야 한다.

## 64. 같은 클래스의 버그를 전체 FRED 지표에서 재점검 + 재발 방지 스케줄러 추가

63번(FOMC)에서 찾은 문제가 "FRED만의 특수 사례"인지 "구조적 문제"인지 확인해달라는
요청을 받았다. 결론: **구조적 문제였다.** calendar 도메인 전체에서 재수집 스케줄러가
있는 건 62번에서 FOMC에 추가한 것 하나뿐이었고, FRED 경제지표(CPI/PPI/GDP/PAYEMS/
UNRATE/PCE) 6종은 전부 "한 번 수집하면 그걸로 끝"인 상태였다.

### 실제로 발견한 오류 - PAYEMS(비농업 고용) 8월 값이 증감 방향 자체가 반대로 저장돼 있었다

DB에는 `previous=159,075,000명 → actual=158,913,000명`(162,000명 **감소**)로 저장돼
있었는데, 실제 BLS 8월 고용보고서(WebSearch로 확인, bls.gov 공식 발표 기반 CNBC 보도)는
**+162,000명 증가**였다 - 정확히 같은 크기(162,000)에 부호만 반대라는 게 결정적 단서였다.

원인을 코드에서 직접 추적했다: `ingest_year_from_fred`의 previous/actual 계산 로직
자체(`obs_by_date.get(obs_date)`로 그 달 값을, `prev_dates[-1]`로 직전 달 값을 가져오는
방식)는 **버그가 없었다** - 지금 이 함수를 다시 실행하면 라이브 FRED 값 기준으로 정확히
계산된다. 문제는 이 함수가 **몇 주 전에 한 번 실행된 뒤로 한 번도 다시 실행된 적이
없다**는 것이었다: BLS가 8월 최초 발표 이후 6월(+11,000)·7월(+44,000) 수치를 수정하면서
7월과 8월의 상대적 크기 관계 자체가 처음 수집했을 때와 달라졌는데, 그걸 재수집해서
반영할 방법이 없었다. 즉 61~63번에서 FOMC 하나로 좁혀서 봤던 "재수집 안 되는 문제"가
**FRED 지표 전체에 걸린 구조적 문제**였다는 게 이번에 확인됐다.

### 검증 - CPI/PPI/GDP/UNRATE/PCE는 지금은 정상이었다

PAYEMS와 같은 방식으로 나머지 5개 지표도 전부 `ingest_year_from_fred`를 직접 재실행해서
재수집 전후 값을 대조했다 - **전부 기존 저장값과 동일**했다(아직 이 지표들엔 발표 후
수정이 없었을 뿐, PAYEMS와 똑같은 구조적 위험을 그대로 안고 있다는 뜻). 한국은행
기준금리(ECOS/BOK)는 중앙은행 결정이 발표 즉시 확정이라 "나중에 수정" 개념 자체가
없어서 이 위험이 없다는 것도 함께 확인했다.

### 수정 1 - PAYEMS 8월 값 즉시 정정

`ingest_year_from_fred("PAYEMS", 2026)`을 재실행해서 라이브 FRED 최신값으로 덮어썼다 -
`fred-PAYEMS-2026-08-01`이 이제 `previous=158,913,000명 → actual=159,075,000명`(실제
증가 방향과 일치)으로 정상화됐다.

### 수정 2 - `main.py`에 FRED 지표 재수집 스케줄러 추가(재발 방지)

62번에서 FOMC에 붙인 것과 같은 패턴을 나머지 6개 지표에도 적용했다.

```python
_FRED_INDICATORS = ("CPI", "PPI", "GDP", "PAYEMS", "UNRATE", "PCE")

def _refresh_fred_indicators() -> None:
    year = datetime.now(_KST).year
    for indicator in _FRED_INDICATORS:
        try:
            asyncio.run(calendar_service.ingest_year_from_fred(indicator, year))
        except Exception:
            _logger.exception("FRED %s 갱신 실패: 마지막 수집값을 유지합니다.", indicator)
```

- `ingest_year_from_fred`가 upsert라 반복 실행해도 안전 - 새 아키텍처 없이 그대로 재사용
- 지표 하나가 실패해도(FRED 순간 타임아웃 등) `try/except`로 감싸서 나머지 지표는
  계속 진행 - 한 지표 장애가 전체를 막지 않음
- FOMC(30분마다)보다는 느슨하게, 시작 시 1회 + **6시간마다**로 잡았다 - 월간 지표라
  분 단위로 자주 볼 필요는 없고, 그러면서도 발표 당일 갱신 지연은 하루 안에 잡아낼 수
  있다. 너무 잦으면 FRED 호출 횟수만 낭비된다는 트레이드오프를 감안한 값이다.

### 검증

- `uv run uvicorn main:app` 재기동 - 로그에 에러/예외 없음, 스케줄러 정상 등록
- `GET /calendar/events?year=2026&month=9` 재호출 - PAYEMS(`158913000명 →
159075000명`)와 FOMC(`3.5~3.75% → 3.75~4.00%`) 둘 다 정정된 값으로 정상 응답
- `python3 -m py_compile main.py` 통과

### 이번엔 다루지 않은 것 - DART 기업실적의 "정정 공시" 위험

DART 잠정실적은 **같은 날 올라온 정정 공시**는 이미 `dart_client.get_preliminary_
earnings()`가 자동으로 최신 것을 골라내지만(`rcept_no` 기준 정렬), **다른 날짜에 나중에
따로 올라오는 정정 공시**는 놓칠 수 있는 구조다. 다만 이번 조사에서 실제 사례로 확인된
건 아니라서(FRED/FOMC처럼 실제로 틀린 값을 찾아낸 게 아님), 이번 수정 범위에는
포함하지 않았다 - 필요하면 별도로 조사해서 DART 실적 쪽에도 재수집 스케줄을 붙일 수
있다.

### 앞으로 이런 문제가 다시 생기지 않으려면

1. **"발표됐다"와 "값이 확정됐다"를 같은 뜻으로 보지 않는다** - 특히 정부/기관 통계는
   1차 발표 이후에도 수정되는 게 정상이다(BLS 고용보고서가 매달 직전 1~2개월치를
   같이 수정하는 것처럼). 한 번 수집해서 끝내는 데이터는 전부 "언젠가 조용히 틀려질
   수 있는 데이터"라고 가정해야 한다.
2. **재수집 가능한(upsert) ingest 함수는 반드시 스케줄러에 물린다** - 이번에 FOMC(62번)
   에 이어 FRED 지표 6종에도 물렸다. 앞으로 새 데이터 소스를 추가할 때도 "이 값이
   나중에 바뀔 수 있는가?"를 먼저 따져보고, 그렇다면 처음부터 스케줄러 등록까지 같이
   구현한다(나중에 따로 추가하지 않는다).
3. **API가 실제 뉴스보다 항상 정확하다고 가정하지 않는다**(63번 교훈) - 특히 발표 직후
   짧은 기간은 공식 1차 출처(정부기관 보도자료 등)로 직접 대조해보는 습관이 필요하다.
4. **의심되면 실제 값과 대조한다** - 이번에 PAYEMS 문제를 찾은 방법도 "저장된 증감
   방향이 실제 보도와 반대"라는 걸 실제 BLS 보고서와 대조해서 잡아낸 것이다. 수치가
   있는 데이터는 "그럴듯해 보이는지"가 아니라 실제 1차 출처와 대조해서 확인해야 한다.

## 66. calendar 도메인 API 및 사용 방법 정리

프런트엔드/다른 도메인 개발자가 참고할 수 있도록, 지금까지 만든 calendar 도메인의
API 명세와 실제 데이터가 어떻게 채워지는지를 한곳에 정리한다.

### API - 엔드포인트는 현재 1개뿐이다

```text
GET /calendar/events?year={YYYY}&month={MM}
```

- `year`: 1900~2100 (필수)
- `month`: 1~12 (필수)
- 응답: 그 연/월에 `publishedAt`(한국시간 기준 발표일)이 속하는 `CalendarEvent` 배열
- 인증 없음, region 등으로 필터링하는 옵션은 없다 - 프런트에서 필요하면 응답을 받은
  뒤 클라이언트 쪽에서 걸러야 한다.

요청 예시:

```bash
curl "http://localhost:8000/calendar/events?year=2026&month=9"
```

응답 예시(FOMC 발표 후 이벤트 1건):

```json
{
  "id": "fomc-2026-09-16-FOMC_STATEMENT",
  "publishedAt": "2026-09-16",
  "start_date": null,
  "end_date": null,
  "time": "04:00",
  "region": "미국",
  "category": "macro",
  "title": "미국 FOMC 금리결정",
  "summary": "FOMC(연방공개시장위원회)가 정례회의를 마치고 미국의 기준금리 목표범위를 3.5~3.75%에서 3.75~4.00%로 인상했습니다(25bp 인상). ...",
  "importance": null,
  "previous": "3.5~3.75%",
  "actual": "3.75~4.00%",
  "actual_label": null,
  "status": "RELEASED"
}
```

### 응답 필드(`CalendarEvent`) 의미

`schemas/calendar.py`에 정의돼 있으며, Supabase `calendar_events` 테이블과 필드명이
동일하다.

| 필드                    | 설명                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                    | 소스별 고유 ID(아래 "id 규칙" 참고). upsert 키라서 재수집해도 중복이 안 생긴다.                                                                |
| `publishedAt`           | 한국시간(KST) 기준 발표일. 미국 지표라도 이미 KST로 변환된 값이다.                                                                             |
| `start_date`/`end_date` | 현재 항상 `null`(보류 컬럼).                                                                                                                   |
| `time`                  | 한국시간 기준 발표 시각. 공식적으로 확인된 시각이 없으면 `null`(임의 생성 금지).                                                               |
| `region`                | `"미국"` 또는 `"한국"`.                                                                                                                        |
| `category`              | 아래 "category 종류" 참고.                                                                                                                     |
| `title`/`summary`       | 한국 주식 초보자 기준 한국어 제목/설명.                                                                                                        |
| `importance`            | FRED 등에서 표준 중요도를 제공하지 않아 현재 항상 `null`.                                                                                      |
| `previous`/`actual`     | 직전 발표값/실제 발표값. 단위가 붙는 경우 문자열에 단위까지 포함(`"3.75~4.00%"`, `"159075000명"` 등). 아직 발표 전이면 `actual=null`.          |
| `actual_label`          | `actual`이 구체적으로 무엇에 대한 값인지 알려주는 라벨(`"주당"`, `"공모가"`, `"매출액"`). 제목만으로 맥락이 드러나는 FRED/BOK 이벤트는 `null`. |
| `status`                | `"SCHEDULED"`(발표 전) 또는 `"RELEASED"`(발표 후, `actual` 값 존재).                                                                           |

### category 종류와 데이터 출처

| category       | region | 의미                                     | 데이터 출처                                   |
| -------------- | ------ | ---------------------------------------- | --------------------------------------------- |
| `macro`        | 미국   | CPI/PPI/GDP/PAYEMS/UNRATE/PCE, FOMC 회의 | FRED API, `fed_client`(FOMC 일정 정적 데이터) |
| `macro`        | 한국   | 합병·분할, IPO, 유상증자, 무상증자       | KIS Open API                                  |
| `earnings`     | 한국   | 코스피 대형주 잠정실적 발표              | DART Open API                                 |
| `rate`         | 한국   | 한국은행 기준금리 결정                   | ECOS API(시계열) + 공식 결정일 수동 매핑 표   |
| `dividend`     | 한국   | 배당기준일                               | KIS Open API                                  |
| `optionExpiry` | 한국   | KOSPI200 선물·옵션 만기(트리플위칭 포함) | 정적 계산(매월 둘째 목요일 규칙)              |

### id 규칙(소스별 prefix)

재수집 시 upsert(`ON CONFLICT (id) DO UPDATE`)로 덮어쓰기 때문에, 같은 이벤트를
몇 번을 다시 수집해도 중복 행이 생기지 않는다. 형식:

```text
fred-{series_id}-{observation_date}     예) fred-PAYEMS-2026-08-01
fomc-{event_date}-{event_type}          예) fomc-2026-09-16-FOMC_STATEMENT
dart-earnings-{stock_code}-{rcept_dt}   예) dart-earnings-005930-20260130
bok-rate-{decision_date(YYYYMMDD)}      예) bok-rate-20260827
kis-dividend-{stock_code}-{record_date}
kis-mergersplit-{stock_code}-{record_date}-{seq}
kis-ipo-{stock_code}-{record_date}
kis-paidincap-{stock_code}-{record_date}
kis-bonusissue-{stock_code}-{record_date}
```

### 데이터가 채워지는 방식 - 자동 재수집 vs 수동 스크립트

`main.py`의 스케줄러(62~65번 항목)가 자동으로 반복 재수집하는 대상은 아래 3종류뿐이다.

| 대상                 | 서비스 함수                                                         | 주기                          |
| -------------------- | ------------------------------------------------------------------- | ----------------------------- |
| FOMC 일정/금리       | `ingest_fomc_year`                                                  | 서버 기동 시 1회 + 30분마다   |
| FRED 6개 지표        | `ingest_year_from_fred`(CPI/PPI/GDP/PAYEMS/UNRATE/PCE)              | 서버 기동 시 1회 + 6시간마다  |
| DART 대형주 3사 실적 | `ingest_preliminary_earnings_from_dart`(삼성전자/SK하이닉스/현대차) | 서버 기동 시 1회 + 매일 00:10 |

나머지(한국은행 기준금리, KOSPI200 만기, KIS 배당/합병분할/IPO/유상증자/무상증자)는
아직 스케줄러가 없고 `backend/scripts/seed_*.py`를 수동으로 실행해야 채워지거나
갱신된다. 65번 항목의 원칙("재수집 가능한 ingest 함수는 스케줄러에 물린다")에 따라
필요해지면 나중에 스케줄러를 추가할 수 있다.

### 유의할 점

- `previous`/`actual`은 표시용으로 이미 단위가 붙은 문자열이라, 프런트에서 산술 연산이
  필요하면 파싱해서 써야 한다(예: `"3.75~4.00%"`에서 상단값만 뽑기).
- FRED/DART처럼 발표 후에도 값이 수정(revision)될 수 있는 소스는 재수집 스케줄러가
  붙어 있어도 갱신 주기(FRED 6시간, DART 1일) 사이의 짧은 지연은 있을 수 있다 - "지금
  이 순간의 최신값"을 보장하지는 않는다.

## 65. DART 정정공시 위험 조사 + 재수집 스케줄러 추가 중 발견한 동시성 버그 수정

64번 끝에서 범위 밖으로 미뤄뒀던 "DART 잠정실적 정정공시" 위험을 별도로 조사해달라는
요청을 받았다. 조사 자체는 "실제 오류 없음"으로 끝났지만, 같은 패턴(재수집 스케줄러
추가)을 DART에도 적용하는 과정에서 FOMC/FRED 스케줄러에도 이미 잠재해 있던 실제
동시성 버그를 발견해서 같이 고쳤다 - 그 경위를 기록한다.

### DART 정정공시 조사 결과 - 지금 당장 틀린 값은 없다

`get_preliminary_earnings()`가 이미 **같은 날짜에 올라온** "[기재정정]" 공시는
`rcept_no` 오름차순으로 정렬해서 나중 것(정정본)으로 덮어쓰는 방식으로 처리하고
있었다. 삼성전자는 실제로 같은 날 정정이 올라온 사례가 있었고(예: 20250131 원공시

- 20250131 [기재정정]) 전부 정상적으로 정정본이 선택됐다. SK하이닉스·현대차는 조사
  기간 내 정정 공시 자체가 없었다. 현재 DB에 저장된 21건 전체를 `get_key_accounts()`
  로 실시간 재조회해서 대조한 결과도 전부 일치 - 지금 틀린 값은 없다.

다만 **다른 날짜에 나중에 따로 올라오는 정정**은 이 로직이 애초에 못 잡는 구조이고,
64번에서 정리한 "재수집 안 되면 나중 수정을 놓친다"는 구조적 위험이 DART에도 똑같이
적용된다(공시 자체가 나중에 별도로 정정될 수 있다는 점에서 BLS의 사후 수정과 성격이
같다). 실제 사례로 증명된 문제는 아니지만, 64번에서 정리한 원칙("재수집 가능한 ingest
함수는 발견 즉시가 아니라 처음부터 스케줄러에 물린다")에 따라 예방 차원에서
`_refresh_dart_earnings()` 스케줄러를 `main.py`에 추가했다(자정 10분 후, 분기당
1~2번만 발표되는 지표라 FRED의 6시간 주기보다 훨씬 느슨하게).

### 이 과정에서 발견한 진짜 버그 - 이벤트 루프 간 DB 커넥션 충돌

DART 스케줄러를 FOMC/FRED와 같은 방식(`BackgroundScheduler`의 스레드 풀에서
`asyncio.run()` 호출)으로 추가하고 실제로 기동해보니 `RuntimeError: ... attached to
a different loop`가 발생했다. 원인을 단계별로 추적했다.

1. **1차 원인**: 반복문 안에서 아이템(지표/기업)마다 매번 `asyncio.run()`을 호출하고
   있었다 - `asyncio.run()`은 호출할 때마다 새 이벤트 루프를 만들고 끝나면 닫는데,
   `core/database.py`의 `engine`/`async_session`은 **모듈 전역 싱글턴**이라 커넥션이
   맨 처음 만들어진 루프에 묶인다. 다음 `asyncio.run()`이 새 루프를 열면 그 커넥션을
   재사용할 수 없어서 깨진다. → 반복문 전체를 감싸는 `async def` 함수 하나를 만들고
   `asyncio.run()`을 스케줄러 잡마다 딱 한 번만 부르도록 고쳐서 부분적으로 완화됐다.
2. **2차 원인(더 깊은 문제)**: `BackgroundScheduler`는 스레드 풀에서 잡을 실행한다.
   서버 기동 시 FOMC/FRED/DART 세 재수집 잡이 전부 즉시 실행("date" 트리거)되도록
   등록돼 있어서, **서로 다른 스레드에서 동시에** 각자 `asyncio.run()`을 호출해 서로
   경쟁하는 이벤트 루프를 또 만들어냈다. `threading.Lock()`으로 세 잡이 서로 겹치지
   않게 직렬화했더니 에러 발생 빈도는 줄었지만(24건 → 17건) 완전히 없어지지는
   않았다 - 그리고 결정적으로, 실제 `GET /calendar/events` API 요청이 **500 에러**를
   반환하는 걸 확인했다. 즉 스케줄러 잡끼리의 충돌만이 아니라 **FastAPI 메인
   이벤트 루프의 DB 접근 자체가 오염**되고 있었다는 뜻이다. 락은 스케줄러 잡들끼리만
   직렬화할 뿐 메인 루프와의 충돌은 막지 못했다.
3. **근본 수정**: calendar 도메인 재수집 잡 3개(`_refresh_fomc`,
   `_refresh_fred_indicators`, `_refresh_dart_earnings`)를 `asyncio.run()`/락 없이
   순수 `async def`로 바꾸고, 이들을 등록하는 스케줄러를 기존 `BackgroundScheduler`가
   아니라 별도의 `AsyncIOScheduler`로 분리했다. `AsyncIOScheduler`는 잡을 새 스레드나
   새 루프가 아니라 **자신을 시작시킨 바로 그 이벤트 루프 위의 코루틴**으로 실행한다 -
   `lifespan()`이 FastAPI 자신의 메인 루프 안에서 실행되고 있으므로, 여기서 만든
   `AsyncIOScheduler`도 자동으로 그 메인 루프를 그대로 쓰게 된다. 결과적으로 공유
   DB 엔진이 항상 하나의 이벤트 루프에서만 쓰이게 되어 문제 자체가 원천적으로
   사라진다(락도 불필요 - 같은 루프 안에서는 `await` 지점에서만 다른 코루틴으로
   넘어가므로 안전).

### 근본 수정 직후 발견한 새 문제 - 동기 HTTP 호출이 이벤트 루프를 통째로 멈춤

위 수정을 실제로 기동해서 테스트하니, 재수집 잡이 도는 동안 서버 전체가 응답하지
않는 새로운 문제가 나타났다. 원인: `fred_client.py`/`dart_client.py`는 내부적으로
`httpx.get()`(동기, blocking)을 쓴다. 예전 `BackgroundScheduler`+스레드 풀 구조에서는
이 블로킹 호출이 별도 OS 스레드에서 돌아서 메인 루프에 영향이 없었는데,
`AsyncIOScheduler`로 옮기면서 이 코루틴들이 FastAPI 메인 루프 위에서 직접 실행되게
됐고, 그 안의 동기 `httpx.get()` 호출이 실행되는 동안은 **이벤트 루프 자체가
멈춘다** - calendar와 무관한 timeline/heatmap API 요청까지 전부 응답이 막히는,
DB 충돌 버그를 고치면서 새로 만든 회귀였다.

수정: `services/calendar.py`에서 순수 동기 부분(FRED/DART 클라이언트 호출 + 이벤트
객체 조립, DB 접근 없음)을 별도 함수로 뽑아서 `asyncio.to_thread()`로 스레드 풀에
넘기고, DB 쓰기(`_upsert_event`, `async_session` 사용)만 메인 루프에 남겼다.

```python
def _build_fomc_events(year: int) -> list[CalendarEvent]:
    ...  # fed_client/FRED 호출 포함, 순수 동기

async def ingest_fomc_year(year: int) -> list[CalendarEvent]:
    events = await asyncio.to_thread(_build_fomc_events, year)
    async with async_session() as session:
        for event in events:
            await _upsert_event(session, event)
        await session.commit()
    return events
```

같은 패턴을 `ingest_year_from_fred`(`_build_fred_year_events`)와
`ingest_preliminary_earnings_from_dart`(`_build_dart_earnings_events`)에도
적용했다. `fed_client.get_fomc_meetings()`는 순수 정적 데이터(HTTP 호출 없음)라
스레드로 넘길 필요가 없어서 그대로 뒀다. 함수 시그니처(입출력)는 그대로라
`main.py`의 호출부는 수정할 필요가 없었다.

### 검증

- `python3 -m py_compile services/calendar.py` 통과
- `.venv/bin/python -m uvicorn main:app` 로 실서버 기동 - 기동 직후 FOMC/FRED/DART
  재수집 잡이 전부 동시에 도는 구간(약 30초) 동안 `GET /calendar/events`를 1초
  간격으로 10회 연속 호출 - **전부 200 OK, 응답시간 60~100ms**로 지연/멈춤 없음
- 이 테스트 도중 FRED PPI 쪽에서 실제 `httpcore.ReadTimeout`이 한 번 발생했는데,
  `main.py`의 `try/except`가 정상적으로 잡아서 로그만 남기고 나머지 지표는 계속
  진행됨을 확인(의도한 장애 격리가 정상 동작)
- 로그 전체에서 `"different loop"` 에러 0건 - DB 커넥션 충돌도 재발하지 않음

### 앞으로 이런 문제가 다시 생기지 않으려면

1. **모듈 전역 싱글턴 async DB 엔진은 이벤트 루프를 하나만 가정한다.** 이 프로젝트의
   `core/database.py`가 그렇게 설계돼 있으므로, 이 엔진을 쓰는 코드는 항상 FastAPI의
   메인 이벤트 루프 위에서만 실행되어야 한다 - 새 백그라운드 작업을 추가할 때
   `asyncio.run()`을 쓰고 싶어지면 그 자체가 "다른 루프를 새로 만든다"는 신호이니,
   대신 `AsyncIOScheduler`(또는 메인 루프에 코루틴을 직접 스케줄하는 방식)를 쓴다.
2. **동기(blocking) 클라이언트 호출을 이벤트 루프 위 코루틴에서 직접 부르지 않는다.**
   `fred_client`/`dart_client`/`kis_client`처럼 `httpx.get()`(동기)을 쓰는 core 함수는
   `AsyncIOScheduler`나 다른 async 코드 경로에 넣기 전에 반드시 `asyncio.to_thread()`
   로 감싼다 - 그렇지 않으면 그 호출 하나가 서버 전체를 멈춘다. "DB 접근은 메인
   루프에, 블로킹 I/O는 스레드로"라는 경계를 항상 지킨다.
3. **동시성 수정은 증상 하나를 없애는 걸로 끝났다고 보지 않는다.** 이번에도 락으로
   에러 빈도만 줄이고 넘어j갔다면 메인 API의 500 에러라는 더 큰 문제를 놓칠 뻔했다 -
   "에러가 줄었다"가 아니라 "실제 API 응답이 항상 정상인가"까지 직접 재현해서
   확인해야 한다.

## 67. backend 팀 지시로 push 전 불필요 파일 정리 + `back/feat/calendar` 원격 동기화

backend 팀장이 "backend 파일 정리하고 올리라"고 지시해서, `backend/` 전체를 훑어
GitHub에 올리면 안 되거나 올릴 필요 없는 파일을 찾아 정리하고 `back/feat/calendar`에
반영한 경위를 기록한다.

### 조사 결과 - 이미 안전한 것과 조치가 필요한 것을 구분

`.gitignore`가 이미 커버하고 있어 손댈 필요가 없던 것: `.env`(DART/FRED/GEMINI/KIS
등 실제 API 키), `.cache/kis_token.json`(KIS 실제 인증 토큰), `.venv/`,
`__pycache__/`, `.ruff_cache/`, `.DS_Store`. `git log --all --full-history`로
과거 커밋 이력까지 확인해서 이 파일들이 한 번도 커밋된 적이 없음(유출 이력 없음)을
검증했다.

조치가 필요했던 것:

- `backend/logs/timeline.log`가 `.gitignore`에 빠져서 `git status`에 `??`로 잡힘
- 루트의 `tmp_check_columns.py`/`tmp_repro_500.py`/`test_fred.py` - 이름부터
  애드혹 디버그용으로 보이는 스크립트가 `tests/` 밖에 단독으로 존재
- `scripts/` 안의 15개 스크립트 - 실행 완료된 DB 마이그레이션인지, 아직 필요한
  도구인지 판단이 안 된 상태

### `scripts/` 판단 - "모델이 이미 이 스크립트를 필요로 하는가"로 나눔

`add_actual_label_column.py`/`drop_forecast_column.py`/`expand_payems_thousands.py`/
`fix_payems_space.py` 4개는 [models/calendar.py](../models/calendar.py)를 직접
확인해서 `actual_label` 컬럼은 이미 존재하고 `forecast` 컬럼은 이미 없다는 걸
확인했다 - 즉 이 스크립트들이 만들려던 최종 상태가 이미 모델에 반영되어 있고, 각
스크립트 주석에도 "1회성이다"/"재실행 시 스킵"이라고 명시돼 있어 재실행할 일이 없다.
다만 이 프로젝트는 Alembic 같은 마이그레이션 툴 없이 raw SQL로 스키마를 바꿔왔기
때문에(add_actual_label_column.py 주석 참고), 이 4개가 "DB가 왜 지금 이 형태인지"를
설명하는 유일한 기록이다 - 그래서 삭제하지 않고 로컬에는 남기되 `git rm --cached`로
git 추적만 해제하고 `.gitignore`에 경로를 추가했다.

나머지 `seed_*.py`(7개) / `scripts/test_*.py`(4개)는 `main.py` 스케줄러에 연결되지
않은 수동 데이터 적재·API 연결 확인용 1회성 도구로, 앱 실행 경로 어디에서도
import되지 않는다는 걸 확인하고 완전히 삭제했다. 특히 `seed_kis_merger_splits.py`는
주석에 "정책이 다시 바뀌기 전엔 실행하지 말 것"이라는 경고까지 있어 재사용 가치도
없었다.

### `.gitignore`의 숨은 버그 - 앞 공백 때문에 `logs/`가 무시되지 않고 있었다

`logs/` 규칙이 이미 `.gitignore`에 있었는데도 `backend/logs/`가 계속 `??`
(untracked)로 잡혔다. 원인은 그 줄이 ` logs/`처럼 **앞에 공백이 붙어 있었던 것** -
git의 gitignore 패턴은 앞 공백을 그대로 패턴의 일부로 취급하기 때문에 실제 경로
`logs/`와 매칭되지 않는다. 공백을 제거하고 나서야 정상적으로 무시됨을
`git status`로 재확인했다.

### 브랜치 실수 - `back/feat/backend`를 만들었다가 되돌림

처음엔 "backend를 back/feat/backend에 push"로 요청받아 새 브랜치를 만들어
push했는데, 사용자가 곧바로 "아 실수"라며 정정했다 - 의도는 새 브랜치가 아니라
기존 공유 브랜치 `back/feat/calendar`에 올리는 것이었다. `back/feat/backend`는
로컬/원격 모두 삭제하고 다시 진행했다.

### `back/feat/calendar` 동기화 - 전체 병합 대신 정리 커밋만 분리 push

로컬 `back/feat/calendar`로 옮겨서 바로 push하려다가, 로컬과
`origin/back/feat/calendar`가 심하게 갈라져 있다는 걸 발견했다(로컬에만 있는 커밋
28개, 원격에만 있는 커밋 4개). 심지어 같은 커밋 메시지(`fix(calendar): calendar
재수집 스케줄러...`)를 가진 로컬/원격 커밋을 직접 diff해봤더니 heatmap 관련 파일과
`frontend/app/(main)/calendar/` 구조 등 70개 넘는 파일이 완전히 다른 상태였다 -
전체를 merge/rebase하면 backend 정리와 무관한 대규모 frontend/heatmap 충돌이 날
위험이 컸다.

그래서 61번 항목에서 이미 정착된 "backend만 분리해서 push" 패턴을 그대로 다시
썼다 - 로컬 `back/feat/calendar`(28개 커밋 포함)는 전혀 건드리지 않고,
`origin/back/feat/calendar` 최신 지점에서 임시 브랜치를 만들어 이번 정리 커밋
하나만 `git cherry-pick`한 뒤 그 브랜치를 `back/feat/calendar`로 push했다. 사전에
`git ls-tree`로 원격에도 정리 대상 파일(scripts/, .gitignore, test_fred.py)이
로컬과 동일하게 존재하는 걸 확인해뒀던 덕분에 충돌 없이 fast-forward(`057f278` →
`6f758ff`)로 끝났다. 작업 중이던 `IMPLEMENTATION_LOG.md`/`week-list.tsx` 변경은
`git stash`로 보관했다가 작업이 끝난 뒤 원래 로컬 `back/feat/calendar`로 돌아와서
복원했다 - 이 문서(md) 자체는 사용자 요청에 따라 이번엔 push하지 않았다.

### 결과

- `origin/back/feat/calendar` HEAD가 정리 커밋으로 갱신됨(원격의 기존 4개 커밋은
  그대로 유지, 덮어쓴 것 없음)
- `back/feat/backend` 브랜치는 로컬/원격 모두 삭제
- 로컬 `back/feat/calendar`가 원격보다 앞서 있던 28개 커밋은 이번엔 손대지
  않았다 - 전체 브랜치 동기화는 범위가 커서 별도 작업으로 남겨둠
- 부수적으로 DB를 직접 조회해서 `calendar_events`의 `category='earnings'`가 KOSPI
  100이 아니라 [main.py](../../../../main.py)의 `_DART_MAJOR_COMPANIES`에 하드코딩된
  3개 기업(삼성전자/SK하이닉스/현대차, 각 7건씩 총 21건)뿐임을 확인했다 - 확장은
  코드상으로는 리스트 추가만 하면 되지만, DART 잠정실적 공시가 기업 의무가 아니라
  자율 공시라 100개 중 실제로 공시하는 곳이 몇 개인지 데이터 검증이 더 오래 걸릴
  것으로 판단, 별도 작업으로 미뤄뒀다.

## 68. 코스피 시가총액 상위 100개 기업으로 DART 잠정실적 확장 (67번에서 미뤄둔 작업)

67번 항목 끝에서 "별도 작업으로 미뤄둔" 3사→100사 확장을 실제로 진행했다. 기존
삼성전자/SK하이닉스/현대차 파이프라인(`ingest_preliminary_earnings_from_dart` 등)을
전혀 수정하지 않고 기업 수만 넓히는 방식으로 설계했고, 실행해보니 예상보다 훨씬 많은
기업이 걸러지는 걸 발견했다 - 그 경위와 정확한 원인을 기록한다.

### 작업일

2026-09-18

### 대상 기업 선정 기준 (임의 목록 금지 원칙 준수)

`kis_client.get_stock_master("kospi")`(KIS 공식 종목마스터파일, 코스피 보통주 전종목,
`market_cap` 필드 포함)를 시가총액 내림차순 정렬해서 상위 100개를 뽑았다
(`services/calendar.py`의 신규 함수 `get_kospi_top100_companies()`). **기준일은
스크립트를 실행한 시각(2026-09-18)** - 정적 목록이 아니라 실행 시점 스냅샷이므로,
다음에 같은 스크립트를 재실행하면 그 사이 시총 순위가 바뀐 종목이 있을 경우 결과
집합이 달라질 수 있다.

### DART corp_code 매핑

`dart_client.get_corp_codes()`(전체 상장/비상장사 목록, 캐싱 없음 - 한 번만 호출)와
`find_corp_by_stock_code()`를 그대로 재사용(신규 함수 `map_dart_corp_codes()`가 감쌈).
**100개 전부 매핑 성공, 실패 0건** - 코스피 시총 상위 100개는 전부 DART에 등록된
상장사라 매핑 실패 사례가 없었다.

### 수집한 분기 범위

`start_date="20250101"`(2024 Q4 1차 공시가 2025-01-08경 나온다는 37/38번 항목의 실측
근거보다 이르게 잡음) ~ 실행 시각까지(2026-09-18, `20260918`) - 요청받은 2024
Q4~2026 Q2 범위를 전부 포함한다.

### 저장 결과 - 예상보다 훨씬 낮은 성공률(20/100)의 원인을 실측으로 확인

`scripts/seed_kospi100_earnings.py`(신규, `main.py`의 `_refresh_dart_earnings()`와
동일하게 기업 단위 try/except로 격리)를 실행한 결과:

- **잠정실적 공시가 확인되어 정상 저장된 기업: 20개**(기존 3사 포함) - 신규 저장
  101건, 기존 21건과 id 일치(중복 없이 upsert로 재확인만 됨) - 총 122건
- **공시 자체가 없었던 기업(정상, 오류 아님): 9개** - DART 잠정실적 공시는 의무가
  아닌 자율 공시라는 게 기존 문서에도 이미 명시돼 있었고, 이번에 실측으로도 확인됨
- **수집 중 오류로 실패한 기업: 71개** - **전부 동일한 원인**:
  `_dart_quarter_period()`가 1차 공시 발표월을 1/4/7/10월(12월 결산 + 분기 종료 후
  7~9일 이내라는, 삼성전자/SK하이닉스/현대차 3사 실측으로만 검증된 초고속 공시
  패턴)로만 인정하는데, 실제로는 대부분의 기업이 분기 종료 후 더 늦게(약 1~2개월
  뒤인 2월/3월/5월/8월/11월 등) 1차 잠정실적을 낸다. 예: KB금융 `20250205`, 신한지주
  `20250206`, NAVER `20250207`, POSCO홀딩스 `20250203`, 카카오 `20250213`,
  하이브 `20250225`, 삼성생명 `20250813` 등 - 71개 전부 같은 `ValueError`("1차
  잠정실적 공시로 보이지 않는 발표월입니다")로 실패했다. **이건 12월 결산이 아닌
  기업 문제가 아니라, "분기 종료 후 며칠 만에 공시하는가"가 회사마다 다른데 기존
  로직이 삼성전자 수준의 초고속 공시만 정상 케이스로 가정하고 있었기 때문**이다.

### 정정 공시 처리

기존 `dart_client.get_preliminary_earnings()`의 로직(같은 날짜에 여러 건이 올라오면
`rcept_no` 오름차순 중 마지막=정정본을 채택, 그 외엔 45일 간격으로 분기를 나눠 그룹의
첫 날짜만 1차 공시로 채택)을 전혀 수정하지 않고 그대로 재사용했다. 어떤 공시를
선택했는지는 이 함수 내부에서 결정되고, 이번 작업에서 별도로 판단을 추가하지 않았다 -
"다른 날짜에 나중에 따로 올라오는 정정을 못 잡는다"는 65번 항목에서 이미 기록된
한계도 그대로 상속된다(100개로 늘었다고 새로 생긴 위험은 아님).

### 시간 정보 처리

전부 `time=null`로 저장됨을 122건 전수 조회로 확인(DART가 접수일만 주고 접수시각은
안 주므로 `_dart_earnings_event()`가 항상 `time=None`으로 채우는 기존 동작 그대로).

### 확인된 제한사항

1. **가장 중요한 제한**: `_dart_quarter_period()`의 1/4/7/10월 고정 가정이 100대
   기업의 71%에서 실패의 원인이었다 - 이 함수를 "분기 종료월 기준 ±N개월 이내"처럼
   더 넓게 일반화하지 않는 한 100대 기업의 상당수는 계속 수집되지 않는다. 이번
   작업에서는 사용자가 사전에 "기존 함수는 수정하지 않는다"로 확정했기 때문에 고치지
   않았다 - 다음 단계로 남겨둔다.
2. `_PRELIMINARY_EARNINGS_KEYWORD`("연결재무제표기준영업(잠정)실적")가 종목별로 다른
   report_nm과 오탐될 위험(40번 항목에서 현대차 사례로 이미 확인된 유형)은 이번 100개
   확장에서 개별 재검증하지 않았다 - 20개 성공 기업의 summary(매출액/영업이익/당기순이익)
   값이 상식적인 범위인지 육안 확인만 했다.
3. DART API 호출량 증가(100개 기업 × 평균 7~8회 호출)에 대한 rate limit
   재시도/백오프 로직은 여전히 없다 - 이번 실행은 문제없이 끝났지만 향후 스케줄러에
   통합할 경우 재검토가 필요하다.
4. `main.py`의 매일 자동 재수집 스케줄러(`_DART_MAJOR_COMPANIES`)는 기존 3사 그대로
   두고 100개로 확장하지 않았다 - 위 71개 실패 문제를 먼저 해결하지 않으면 확장해도
   실효성이 낮다.
5. summary에 "잠정실적 공시 여부"/"정정 공시 여부"를 명시하는 문구는 추가하지
   않았다(기존 3사 summary 텍스트를 이번 작업으로 바꾸지 않기 위한 선택, 사용자와
   사전 확인함).

### 실행한 테스트

- `python3 -m py_compile`로 `services/calendar.py`, `scripts/seed_kospi100_earnings.py`
  통과
- `uv run python scripts/seed_kospi100_earnings.py` 실제 KIS/DART 라이브 API + Supabase
  대상 실행 - 위 결과대로 100건 중 매핑 100/100, 저장 성공 20개 기업 122건
- 실행 전후로 기존 3사(21건) 스냅샷을 떠서 비교 - **값이 바뀐 행 0건**(수정하지 않기로
  한 원칙이 실제로 지켜졌음을 확인)
- 전체 122건 전수 조회로 `category`가 전부 `'earnings'`, `publishedAt`이
  `YYYY-MM-DD` 형식, `time`이 전부 `null`, `summary`에 기업명이 전부 포함됨을 확인
- `uv run uvicorn main:app`으로 임시 기동 후 `GET /calendar/events?year=2026&month=7`
  호출 - 200 OK, earnings 20건 정상 응답(LG에너지솔루션/LG전자/삼성전자 등) 확인 후
  서버 종료

## 69. `_dart_quarter_period()` 일반화로 68번의 71개 실패 기업 중 70개 복구

68번에서 "가장 중요한 제한"으로 남겨둔 "1/4/7/10월 고정 가정" 문제를 바로 이어서
해결했다 - 사용자가 "다음단계"로 진행을 요청했고, 분석해보니 이 함수를 고쳐도 기존
데이터에 영향이 없다는 게 확인되어 안전하게 처리할 수 있었다.

### 무엇을 바꿨나

`services/calendar.py`의 `_dart_quarter_period()`를 "발표월이 1/4/7/10월인가"로
판단하던 방식에서, "가장 최근에 끝난 분기 종료일(3/31, 6/30, 9/30, 12/31)로부터 며칠
지났는가"로 판단하는 방식으로 바꿨다. 분기 종료일로부터 90일 이내(분기 간격 약
91~92일보다 작게 잡아 다음 분기의 초고속 공시와 겹치지 않도록 함)에 가장 가까운
분기를 고른다. 68번 실측에서 확인된 최대 지연(약 44일, 한국금융지주/삼성증권 등)보다
충분히 여유 있는 값이다. 그 외 날짜 파싱/캐시 없음/에러 처리 등 나머지 로직은 전혀
건드리지 않았다.

### 왜 "기존 데이터 보호" 원칙을 어기지 않는가

수정 직전에 기존 122건(3사 21건 + 68번에서 새로 추가된 20개 기업 101건) 전부의
`rcept_dt`에 대해 **구 로직과 신 로직의 출력을 전수 비교**했고, 122건 전부 완전히
동일한 결과(같은 `bsns_year`/`reprt_code`/분기 라벨)가 나옴을 확인했다 - 이 함수가
바뀌어도 이미 저장된 기업들의 실적 수치·summary·status는 재실행해도 달라지지 않는다는
뜻이다. 그래서 "기존 삼성전자/SK하이닉스/현대차 데이터를 바꾸지 않는다"는 원칙을 어기지
않고도 이 함수를 고칠 수 있다고 판단했다(67/68번에서 이 원칙 때문에 손대지 않기로 했던
`_dart_earnings_event`의 summary 템플릿은 이번에도 그대로 두었다 - 그건 회귀 검증이
불가능한 별개의 함수라서).

### 재실행 결과

수정 후 `scripts/seed_kospi100_earnings.py`를 코스피 100개 전체에 대해 다시 실행(재실행
자체가 idempotent함을 `_upsert_event`의 `ON CONFLICT DO UPDATE`로 이미 보장받음):

- 잠정실적 공시가 확인되어 저장된 기업: **20개 -> 90개**
- 공시 자체가 없었던 기업: 9개(68번과 동일)
- 수집 오류로 남은 기업: **71개 -> 1개**(한전기술)
- calendar_events 총 이벤트: 122건 -> **573건**(신규 451건 추가, 기존 122건은 값
  변경 없이 재확인만 됨 - 재실행 전후 전체 필드 diff로 검증)

### 남은 실패 1건 - 한전기술, 원인이 다른 별개의 버그

한전기술만 `ValueError: invalid literal for int() with base 10: '-'`로 여전히
실패한다. 이번에 고친 분기 판별 문제가 아니라, `dart_client.get_key_accounts()`의
숫자 파싱(`int(raw.replace(",", ""))`)이 DART가 값 없음을 `"-"`(대시 한 글자)로 표시하는
경우를 처리하지 못해서 발생한다(콤마 제거는 되지만 `"-"` 자체를 정수로 바꾸려다 실패).
이 함수도 3사를 포함한 모든 기업이 공유하므로, 고치려면 별도로 회귀 검증을 거쳐야 한다 -
이번 작업 범위에서는 손대지 않고 남겨둔다.

### 검증

- `python3 -m py_compile services/calendar.py` 통과
- 수정 전 122건 전수에 대해 구/신 로직 출력 일치 여부를 오프라인 스크립트로 검증 - 불일치
  0건
- `uv run python scripts/seed_kospi100_earnings.py` 재실행 - 위 결과대로 90/100 성공
- 재실행 전후 122건 전체 필드(publishedAt/title/summary/actual/status) diff - 변경 0건
- 최종 573건 전수 검사 - `time` 전부 null, `publishedAt` 전부 `YYYY-MM-DD`, `summary`
  전부 기업명 포함, `category` 전부 `earnings`
- `uv run uvicorn main:app` 재기동 후 `GET /calendar/events?year=2026&month=7` - 200
  OK, earnings 60건(68번의 20건에서 증가) 확인 후 서버 종료

## 70. 한전기술 실패 원인(`"-"` 파싱 오류) 수정 - 69번의 마지막 1건까지 복구

69번에서 남겨둔 마지막 1건(한전기술)까지 이어서 고쳤다. `dart_client.py`의
`get_key_accounts()._find()`가 `thstrm_amount`의 콤마만 제거하고 바로
`int()`로 바꾸려 했는데, DART가 값이 없는 계정을 대시 한 글자(`"-"`)로 주는
경우가 있어서 `int("-")`가 `ValueError`를 던지고 있었다. 콤마 제거 후 빈 문자열이거나
`"-"`이거나 그 외 숫자로 못 바꾸는 값이면 임의로 0을 만들지 않고 `None`(확인 안 됨)으로
처리하도록 고쳤다 - 스펙의 "API에서 확인되지 않은 값은 null로 처리" 원칙 그대로다.

이 함수는 3사를 포함한 모든 기업이 공유하지만, 수정 전에 이미 성공적으로 저장된
573건은 전부 `_find()`가 크래시 없이 정상적으로 숫자를 반환했던 경우들이라(크래시가
났다면 애초에 그 기업 전체가 저장되지 못했을 것이다) 이 수정으로 영향받을 수 없다는 게
논리적으로 보장된다 - 그래도 재확인차 수정 전후 573건 전체를 diff했다.

- 한전기술만 대상으로 재수집: 5건 저장(2025 Q1~2026 Q2). 그중 2025년 1분기(`20250508`)는
  매출액 자체가 `"-"`였던 게 실제 원인이라 `actual=None`으로 정상 처리됨(임의로 0 등을
  채우지 않음)
- 기존 573건 diff - 값이 바뀐 행 0건, 신규 5건만 추가됨
- **최종 결과: calendar_events earnings 총 578건, 91개 기업**(코스피 100 중 90개는
  분기 판별로 복구됐고, 한전기술까지 더해 91개가 전부 정상 저장됨. 나머지 9개는 애초에
  DART 잠정실적 공시 자체가 없는 기업)

## 71. FOMC 매시 정각 갱신 실패(FRED 5xx) 대응 + API key 로그 노출 보안 수정

### 문제 1 - FOMC 캘린더가 매시 :00에 반복 실패

사용자가 다음을 실측으로 확인해 전달했다: 같은 서버에서 FRED를 40회 연속 호출하면
40/40 성공하고 `_build_fomc_events(2026)` 자체도 약 7.4초에 17건 정상 생성되는데,
`calendar_fomc` 예약 작업(`main.py`, 매시 0·30분)만 매시 정각(:00)에 반복 실패한다 -
API key 만료·IP 차단·잘못된 파라미터는 아니고, 다른 예약 작업(`indicator_bar`·
`market_vix`·`market_exchange_rate` 등)의 외부 호출이 몰리는 정각에 FRED가 간헐적으로
5xx를 주는 것으로 판단됨. 원인 코드 두 곳을 확인했다:

- `fred_client._get()`이 `response.raise_for_status()`만 쓰고 있어 5xx/timeout에 대한
  재시도가 전혀 없었다 - 첫 5xx가 바로 예외로 전파됨.
- `calendar.py`의 `_build_fomc_events(year)`가 회의(meeting)들을 순회하며 이벤트를
  만드는데, 한 회의(`_fomc_event` 내부의 FRED DFEDTARU/DFEDTARL 조회)에서 예외가 나면
  `for` 루프 전체가 중단돼 그 앞에서 이미 만든 다른 회의의 이벤트까지 전부 버려졌다 -
  연 8회 회의 중 1개만 실패해도 2026 FOMC 17건 전체 갱신이 실패로 끝남.

### 무엇을 바꿨나

1. **`core/fred_client.py`** - `_get()`에 `kis_client._send_with_retry`와 같은 원칙의
   재시도를 추가했다: 명시적 timeout(10초), 5xx·timeout은 최대 3회까지 지수 backoff로
   재시도, 4xx는 즉시 실패(재시도 안 함). 모든 공개 함수(`get_series_observations` 등)가
   `_get()`을 거치므로 이 보호가 공통 적용된다. 새 예외 `FredAPIError(status_code=...)`를
   추가해 호출부가 4xx/5xx를 구분할 수 있게 했다.
2. **`domain/calendar/services/calendar.py`**
   - `_fetch_observation()`: 기존에는 `httpx.TimeoutException`만 잡아 재시도했는데(5xx는
     `httpx.HTTPStatusError`라 이 catch에 안 걸림 - 이게 진짜 원인이었다), 이제
     `fred_client.FredAPIError`를 잡아 status_code가 5xx/None(timeout)이면 재시도, 4xx면
     즉시 전파하도록 고쳤다.
   - `_build_fomc_events()`: 회의 하나를 만드는 코드(`STATEMENT`/`SEP`/`MINUTES`)를
     `try/except FredAPIError`로 감싸, 한 회의가 최종 실패해도 `logger.exception()`으로
     어떤 회의(`meeting_start`/`meeting_end`)가 왜 실패했는지 남기고 그 회의만 건너뛴 뒤
     나머지 회의는 계속 처리하도록 바꿨다. 예외를 조용히 삼키지 않는다(로그에 항상 남음).
3. **`main.py`** - `calendar_fomc`만 `CronTrigger(minute="0,30")` → `minute="5,35"`로
   옮겼다(같은 파일의 `market_vix`/`market_exchange_rate`도 "0,30"을 쓰지만 이건 FOMC와
   무관한 별개 작업이라 건드리지 않았다). FOMC 일정은 분 단위로 바뀌는 데이터가 아니므로
   5분 늦게 가도 서비스 목적에 문제없다.

### 문제 2 - FRED API key가 로그에 평문 노출될 수 있는 구조

`fred_client._get()`이 `response.raise_for_status()`를 쓰면, 5xx/4xx일 때 그 예외의
기본 메시지에 **api_key가 포함된 요청 URL 전체**가 그대로 담긴다(httpx 기본 동작). 이
예외가 `logger.exception()`(main.py `_refresh_fomc`/`_refresh_fred_indicators`)을 타고
그대로 로그 파일에 남으면 API key가 평문으로 기록된다.

`raise_for_status()`를 아예 쓰지 않고, 상태 코드를 직접 확인해서 `path`(쿼리 제외)와
`context`(series_id/release_id)만 담은 안전한 메시지로 `FredAPIError`를 발생시키도록
바꿨다. timeout·5xx·4xx 모든 경로에서 `from None`으로 원본 예외를 체이닝하지 않는다
(원본 `httpx.TimeoutException`/응답 객체 자체가 traceback에 다시 노출되는 것을 막기
위함). 대신 status/attempt/path/context는 로그에 남겨서 원인 추적은 여전히 가능하다.

### 문제 3 - 같은 구조의 문제가 있던 다른 클라이언트

`dart_client.py`(crtfc_key를 query parameter로 전달)와 `ecos_client.py`(api_key를 URL
**경로 자체**에 넣는 구조 - query보다 더 위험함)도 동일하게
`response.raise_for_status()`를 쓰고 있어 HTTP 오류 시 인증키가 그대로 노출될 수 있었다.

- `dart_client.py`: 공용 `_get(path, params)` 헬퍼를 추가해 `get_corp_codes`/
  `get_disclosure_list`/`get_key_accounts` 3곳 모두에 적용했다. 실패 메시지는
  `path`(쿼리 제외)만 담는다. 기존에 body-level 오류(`DartApiError`, 상태코드 013 등)를
  처리하던 로직은 그대로 뒀다 - 이건 원래도 안전했다(파싱된 JSON body 기반이라 URL을
  담지 않음).
- `ecos_client.py`: api_key가 URL 경로에 박혀 있어 `_get` 헬퍼로 일반화할 수 없었다(경로
  형식이 다른 API와 다름) - 대신 `httpx.get()` 호출을 try/except로 감싸 실패 시
  `EcosApiError`로 안전하게 재발생시키고, 상태 코드도 직접 확인하도록 고쳤다.
- 둘 다 명시적 timeout(10초)을 추가했다(기존엔 없어서 무제한에 가깝게 걸릴 수 있었음).
- 재시도(5xx/timeout 반복 시도)는 이번 범위에 넣지 않았다 - 사용자가 실측으로 보고한
  장애는 FRED/FOMC 한정이고, DART/ECOS는 이미 91개 기업·578건이 안정적으로 쌓인
  코드라 불필요한 동작 변경을 피하기 위해 시크릿 마스킹과 timeout만 최소로 적용했다.

### 문제 4 - 기존 로그 파일에 이미 남은 secret 확인

`backend/logs/timeline.log`(현재 파일, git 추적 대상 아님 - `.gitignore`의 `logs/` 규칙
적용됨) 전체를 `api_key`/`apikey`/`crtfc_key`/`stlouisfed`로 검색했으나 일치하는 줄이
없었다 - 현재 로그 파일에는 평문 key가 남아 있지 않다. 삭제·정리가 필요한 대상은 없었다.

### 문제 5 - Git history 전수 조사 (이번에 새로 발견한 사실)

`.env`/로그 파일이 git 추적에서 제외된 게 현재 상태일 뿐, **history 자체에는 실제로
남아 있는지** `git log --all`로 확인했다:

- 커밋 `5edb099`("모바일 반응형 수정중")에 `backend/.env`가 실제 값과 함께 커밋돼 있었고
  (`FRED_API_KEY`/`DART_API_KEY`/`KIS_APP_KEY`/`KIS_APP_SECRET`/`DATABASE_URL` 전부
  평문 포함 - 값은 마스킹해서만 확인, 실제 값은 어디에도 출력하지 않았다), 이후 커밋
  `db08a44`("chore: backend/.env를 git 추적에서 제거...")에서 추적만 제거됐다. 이
  커밋 메시지 자체에 "이미 push된 커밋 히스토리에는 값이 남아 있으므로 키 교체가
  필요하다"라고 이미 명시돼 있었다 - 이번 조사로 그게 여전히 유효한 미해결 사실임을
  재확인한 것이다.
- 커밋 `5882ae8`("feat: env 수정")에 `backend/logs/timeline.log` 1572줄이 통째로
  커밋된 이력도 있었다. 내용을 확인한 결과 실제 API key 값 노출은 없었고(NAVER 키가
  `.env`에 없다는 런타임 에러 메시지만 있었음, 값 자체는 없음), 이 커밋은 `back/dev`의
  조상도 아니다(다른 브랜치 이력).
- 두 커밋 모두 `back/dev`의 직접 조상은 아니지만, 같은 저장소의 `.git` object store를
  worktree 전체가 공유하므로 `git log --all`로는 계속 조회된다 - 즉 저장소 차원의
  history 노출이며 `back/dev`만 정리한다고 없어지지 않는다.
- **history를 실제로 rewrite(filter-repo/BFG)하는 작업은 이번 범위에서 하지 않았다** -
  이미 push된 공유 히스토리를 다시 쓰는 것은 강제 push가 필요한 파괴적 작업이고 다른
  팀(front)의 브랜치에도 영향을 줄 수 있어, 팀 차원의 합의 없이 단독으로 진행하지 않는
  것이 맞다고 판단했다. **대신 문제 5 원칙대로 FRED_API_KEY를 포함한 노출된 키들은
  재발급이 필요하다**는 것을 결과로 남긴다.

### 재발급이 필요한 것으로 간주해야 하는 키

`5edb099`에 평문으로 커밋됐던 값 전부: `FRED_API_KEY`, `DART_API_KEY`, `KIS_APP_KEY`,
`KIS_APP_SECRET`, `DATABASE_URL`(Supabase 접속 정보). 재발급 후 `backend/.env`에만
반영하면 된다(코드에는 어디에도 하드코딩하지 않았다).

### 실행한 테스트

- `python3 -m py_compile`로 `fred_client.py`/`dart_client.py`/`ecos_client.py`/
  `calendar.py`/`main.py` 전부 통과
- `fred_client` 단위 테스트(임시 스크립트, monkeypatch로 `httpx.get` 대체, 배포 코드
  아님) 6개 시나리오 전부 통과:
  1. 정상 호출 - timeout 파라미터가 명시적으로 전달되는지, 1회에 성공하는지
  2. 500 → 500 → 200 - 3번째 시도에서 재시도로 복구되는지
  3. 500이 재시도 후에도 계속 실패 - `FredAPIError(status_code=500)`로 최종 실패하고
     메시지에 테스트용 가짜 key(`SECRET_TEST_KEY`)가 전혀 포함되지 않는지
  4. timeout → 200 - 재시도로 복구되는지
  5. 400 - 재시도 없이(정확히 1회 호출) 즉시 실패하는지
  6. 위 5개 시나리오에서 캡처한 `fred_client` 로거의 모든 로그 줄을 합쳐서
     `SECRET_TEST_KEY` 문자열이 단 한 번도 등장하지 않는지
- **FRED 실제 라이브 호출**: `fred_client.get_series_observations("CPIAUCSL", limit=2)`
  정상 응답 확인 (기존 CPI 기능이 깨지지 않았음을 실측으로 확인)
- **DART 실제 라이브 호출**: `dart_client.get_corp_codes()` 정상 응답(119,391건) 확인
  (수정한 `_get` 헬퍼가 zip 파싱까지 포함한 기존 흐름을 그대로 유지하는지 실측 확인)
- **ECOS 실제 라이브 호출**: `ecos_client.get_base_rate_series("202401", "202412")`
  정상 응답(12건) 확인
- **ECOS/DART 오류 마스킹**: `httpx.get`을 가짜 502/503 응답으로 대체해 테스트용 가짜
  key(`SECRET_ECOS_KEY`/`SECRET_DART_KEY`)가 예외 메시지에 전혀 포함되지 않는지 확인
  (ECOS는 URL 경로 자체에 key가 들어가는 구조라 더 위험했던 케이스)
- **`_build_fomc_events(2026)` 실제 라이브 실행**: 17건 정상 생성(8.9초) - 기존 로직이
  깨지지 않았음을 재확인
- **회의 단위 격리 테스트**: `_fomc_statement_rates`를 monkeypatch해서 2026-06-17
  회의(6/16~6/17)에서만 `FredAPIError(500)`를 강제로 던지게 한 뒤 재실행 - 로그에
  `FOMC 이벤트 생성 실패 - meeting_start=2026-06-16 meeting_end=2026-06-17, 이
  회의만 건너뜁니다.`가 정확히 남고, 그 회의에 속한 STATEMENT/SEP/MINUTES 3건만
  빠진 14건이 정상 생성됨을 확인(나머지 7개 회의는 전혀 영향받지 않음) - "한 회의
  실패가 전체를 중단시키지 않는다"는 요구사항이 실제로 동작함을 실측으로 검증
- 현재 `logs/timeline.log` 전체를 `api_key`/`apikey`/`crtfc_key`로 grep - 일치 없음

### DB 스키마/기존 로직 관련

- Supabase 테이블 스키마는 전혀 건드리지 않았다.
- FRED CPI/PPI를 포함한 기존 지표 수집 로직, FOMC 이벤트 생성 로직(제목/요약/금리
  계산 등)은 재작성하지 않았다 - 오류 처리·재시도·로그 안전성만 감싸 넣었다.

## 72. 미국 지수선물·옵션 만기(2026년 전체) 캘린더 추가 - 기존 optionExpiry category 재사용

71번(FRED/FOMC 장애 대응)과 별개 작업으로, 71번에서 손댄 파일(`fred_client.py`/
`dart_client.py`/`ecos_client.py`/`main.py`의 FOMC cron)은 이번 작업에서 전혀 다시
건드리지 않았다.

### 왜 KIS 실시간 조회가 아니라 정적 표인가

이미 구현된 KOSPI200 선물·옵션 만기(`ingest_kospi200_expiry`)는 KIS API로 실시간 조회할
수 있지만, 미국 지수선물·옵션(CME/Cboe)은 이 프로젝트에 연동된 API가 없다. FOMC 일정을
`fed_client.py`의 연준 공식 캘린더 정적 표로 처리하는 것과 같은 방식으로, Cboe/CME
공식 캘린더를 직접 확인해 2026년 12개월치를 정적 표로 옮겨 적었다 - "세번째 금요일"을
코드로 계산해서 채우지 않았다(요구사항의 "임의로 날짜를 계산하지 말 것" 원칙).

### 데이터 출처 및 검증 (3개 공식/준공식 출처 교차 확인)

- Cboe 공식 2026 Options Expiration Calendar(PDF) -
  https://cdn.cboe.com/resources/options/Cboe2026OPTIONSCalendar.pdf
- macroption.com 2026 Options Expiration Calendar(위 Cboe 캘린더를 표로 정리한 2차 출처) -
  https://www.macroption.com/options-expiration-calendar/
- CME Group E-mini S&P 500(ES) 선물 공식 만기 캘린더 -
  https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.calendar.html

세 출처 모두 동일하게 확인한 사실: 표준 월간 만기는 "그 달 세번째 금요일"이되, **2026년
6월만 예외**다 - 세번째 금요일인 2026-06-19가 Juneteenth(미국 증시 공식 휴장일)라서 Cboe
옵션·CME 선물(ES) 모두 만기를 하루 앞당긴 **2026-06-18(목)**로 공식 확정했다. Python
`date(2026,6,19).weekday()`로 실제로 금요일이 맞는지, 나머지 11개월의 세번째 금요일이
다른 휴장일(신정·MLK데이·부활절·독립기념일 관측일·노동절·추수감사절·크리스마스)과 겹치지
않는지도 직접 계산해서 교차 확인했다 - 겹치는 달은 6월 하나뿐이었다.

### 무엇을 만들었나

**`services/calendar.py`** (KOSPI200 만기 섹션 바로 뒤, `_upsert_event` 앞에 새 섹션 추가):

- `_US_OPTION_EXPIRY_2026`: `(날짜, is_quarterly)` 12쌍의 검증된 정적 표. 3·6·9·12월은
  `is_quarterly=True`(지수옵션 분기만기 + S&P500/나스닥100/러셀2000 지수선물(ES/NQ/RTY)
  동시만기 = Quadruple Witching, CME 분기 계약 최종거래일도 같은 날짜로 확인됨).
- `_us_option_expiry_event()`: `category="optionExpiry"`, `region="US"`, `time=null`
  (거래소가 날짜만 공시하고 정확한 시각 개념이 없어 임의 생성 안 함), `previous`/`actual`은
  경제지표가 아니므로 항상 `null`. 분기월이면 `title="미국 네 마녀의 날"`, 그 외엔
  `title="미국 옵션 만기"` - id는 각각 `us-quad-witching-YYYYMMDD`/
  `us-option-expiry-YYYYMMDD`.
- `ingest_us_option_expiry_year(year)`: `_US_OPTION_EXPIRY_2026`에 없는 연도(2026 외)를
  주면 임의로 "세번째 금요일"을 계산하지 않고 `ValueError`로 명시적으로 거부한다 -
  검증 안 된 데이터가 조용히 생성되는 걸 막기 위함. 기존 `_upsert_event`(id 기준
  `ON CONFLICT DO UPDATE`)를 그대로 재사용해 중복 방지를 별도로 구현하지 않았다.

**`scripts/seed_us_option_expiry.py`**(신규) - `ingest_us_option_expiry_year(2026)`을
호출하고, 실행 전/후 id 집합을 비교해 신규/중복 건수, category 일치 여부, 1~12월 전체
커버리지, 이벤트별 상세를 출력한다. 스크립트 작성 중 기존 `scripts/seed_kospi100_earnings.py`가
`from backend.core.database import async_session`를 쓰는데 **그 이름이 현재
`database.py`에 없어 이미 깨져 있는 것을 발견했다**(무관한 기존 버그, 이번 범위 밖이라
손대지 않음) - 새 스크립트는 현재 실제로 존재하는 `get_session_factory()`를 썼다.

### 상품 구성 - 왜 상품별로 이벤트를 쪼개지 않았나

S&P500/나스닥100/러셀2000의 지수옵션과(분기월엔) 지수선물은 CME/Cboe 표준 만기 주기상
**항상 같은 날짜**(그 달 세번째 금요일, 2026년 6월만 예외적으로 같은 날인 06-18)에
함께 만기된다 - 실제로 다른 날짜를 쓰는 상품이 없어서 "상품별로 실제 만기일이 다르면
각각 별도 이벤트로 저장"할 대상 자체가 없었다. KOSPI200 만기를 상품별이 아니라
"동시만기"/"옵션 만기" 두 종류로 묶어 처리한 기존 방식과 같은 논리로, 월 1건(총 12건)으로
구성하고 summary에 어떤 상품들이 걸리는지 전부 명시했다.

### 실행 결과

- `uv run python scripts/seed_us_option_expiry.py` 1차 실행: 12건 전부 신규 저장,
  2026-01~12 전 달 커버리지 확인(빠진 달 없음)
- 동일 스크립트 재실행: 신규 0건, 기존 12건과 id 동일(중복 없이 upsert 재확인만 됨) -
  idempotent 요구사항 실측 확인
- `GET /calendar/events?year=2026&month=3` - `us-quad-witching-20260320` 정상 응답,
  같은 응답에 `fomc-2026-03-18-*` 이벤트도 그대로 남아 있음을 확인(FOMC 영향 없음)
- `GET /calendar/events?year=2026&month=6` - `us-quad-witching-20260618`(Juneteenth로
  하루 당겨진 날짜)로 정상 응답
- `calendar_events` 전체 category 집계: `earnings=578`(71번 이전과 동일, 손상 없음),
  `optionExpiry=23`(기존 KOSPI200 11건 + 신규 미국 12건), `macro`/`rate`/`dividend`도
  그대로 - 기존 데이터가 전혀 삭제되지 않았음을 확인
- `python3 -m py_compile`로 `calendar.py`/`seed_us_option_expiry.py` 통과
- `uv run uvicorn main:app` 기동 후 위 GET 호출 확인, 정상 종료

### 결과 요약(① ~ ⑧)

1. 수정한 파일: `src/backend/domain/calendar/services/calendar.py`(섹션 추가만, 기존
   함수는 수정하지 않음)
2. 새로 만든 파일: `scripts/seed_us_option_expiry.py`
3. 주요 변경: `_US_OPTION_EXPIRY_2026` 정적 표, `_us_option_expiry_event()`,
   `ingest_us_option_expiry_year()` 추가. 새 category 없음(기존 `optionExpiry` 재사용).
4. 2026년 1~12월 이벤트 수: **12건**(월 1건씩, 빠진 달 없음) - 3·6·9·12월(4건)은
   "네 마녀의 날", 나머지 8건은 "미국 옵션 만기"
5. 데이터 출처: Cboe 공식 2026 Options Expiration Calendar(PDF) + macroption.com(2차
   교차확인) + CME Group E-mini S&P500 공식 만기 캘린더, 3개 출처 교차 확인. 6월만
   Juneteenth로 06-19→06-18 조정된 것도 확인됨.
6. 중복 방지: 기존 `_upsert_event`의 `id` 기준 `ON CONFLICT DO UPDATE` 그대로 재사용 -
   재실행 시 신규 0건/중복 12건으로 실측 확인.
7. FastAPI 테스트: 서버 정상 기동, `GET /calendar/events`로 3월·6월 `optionExpiry` 조회
   성공, 기존 `earnings`(578건)·FOMC 데이터 손상 없음 확인.
8. 캘린더 표시: 분기월(3·6·9·12월) → "미국 네 마녀의 날", 그 외 8개월 → "미국 옵션 만기"
   (둘 다 `region="US"`, `category="optionExpiry"`, `time=null`).

## 73. `scripts/seed_us_option_expiry.py` 삭제 - `main.py` 스케줄러 자동 등록으로 교체 (72번 실행 방식 변경)

72번에서 별도 seed 스크립트로 만들었던 것을, 사용자 요청으로 스크립트 없이 실행되도록
바꿨다. `_US_OPTION_EXPIRY_2026`/`_us_option_expiry_event()`/`ingest_us_option_expiry_year()`
(services/calendar.py)는 72번 내용 그대로 전혀 수정하지 않았다 - 그 함수를 "누가 언제
부르는가"만 바뀌었다.

### 왜 관리용 POST API(X-Admin-Key)가 아니라 스케줄러 등록을 골랐나

두 가지 대안을 검토했다:

- **관리용 POST API**: `timeline/routers/timeline.py`의 `require_admin_key`(X-Admin-Key
  헤더 검증) 패턴을 calendar 라우터에도 추가하는 방식. 하지만 이 인증 로직은 현재
  timeline 도메인에만 있고, timeline은 팀장이 별도로 작업 중인 영역이라 그 파일을
  import하거나 로직을 가져다 중복 구현하는 것 둘 다 불필요한 결합/중복이라고 판단해
  피했다.
- **`main.py` 스케줄러 등록**(채택): 같은 calendar 도메인 안에 이미 있는
  `calendar_fomc`/`calendar_fred`/`calendar_dart`와 완전히 같은 패턴이다. 다른 도메인에
  전혀 의존하지 않고, calendar 관련 파일(`main.py`+`services/calendar.py`)만으로
  끝난다.

### 무엇을 바꿨나

- `scripts/seed_us_option_expiry.py` 삭제 (72번에서 만든 파일, 더 이상 없음)
- `main.py`에 `_refresh_us_option_expiry()`(다른 `_refresh_*`와 같은 try/except +
  `logger.exception` 패턴) 추가, `_register_calendar_jobs()`의 작업 목록에
  `calendar_us_option_expiry`(매일 00:20, `calendar_dart`의 00:10과 안 겹치게 10분 뒤)
  등록. 상단 예약 작업 요약 주석 표에도 한 줄 추가.
- 이 작업은 FOMC/FRED/DART처럼 "발표 후 값이 정정될 수 있어 주기적으로 다시 받아야
  하는" 데이터가 아니라 이미 검증이 끝난 정적 표라서, 매일 재실행해도 실제로 달라지는
  내용은 없다 - 그래도 `_upsert_event`가 idempotent(`ON CONFLICT DO UPDATE`)라 매일
  자동으로 다시 확인하는 것 자체는 부작용이 없다. 서버가 재시작될 때마다(`next_run_time`)
  1회 즉시 실행되므로, 처음 배포할 때 사람이 스크립트를 따로 실행할 필요가 없어졌다.

### 검증

- `python3 -m py_compile main.py` 통과
- `uv run uvicorn main:app` 기동 - 로그에 `calendar_us_option_expiry`를 포함한 19개
  작업이 정상 등록됨을 확인(에러 없음)
- `GET /calendar/events?year=2026&month=6` - 서버가 시작 시 자동 재실행한 뒤에도
  `us-quad-witching-20260618` 그대로 정상 응답(중복 생성 없음)
- `calendar_events` category 집계 재확인 - `optionExpiry=23`(변화 없음),
  `earnings=578`(변화 없음) - 자동 재실행이 기존 데이터를 건드리지 않음을 확인
- 72번에서 스크립트로 이미 채워둔 12건은 DB에 그대로 남아 있고, 이번엔 그 위에
  `main.py`가 서버 기동 시 같은 12건을 upsert로 재확인만 했다(신규/중복 데이터 없음)

### 결과 요약(① ~ ⑧, 72번 내용 중 바뀐 항목만)

1. 수정한 파일: `main.py`(스케줄러 등록 추가) - `services/calendar.py`는 72번 그대로,
   이번엔 수정하지 않음
2. 새로 만든 파일: **없음**(72번에서 만들었던 `scripts/seed_us_option_expiry.py`는
   삭제함)
3. 주요 변경: `_refresh_us_option_expiry()` + `_register_calendar_jobs()`에
   `calendar_us_option_expiry`(매일 00:20, 서버 시작 직후 1회) 등록
4~6, 8은 72번과 동일(데이터 자체와 출처·중복방지 방식은 안 바뀜)
7. FastAPI 테스트: 서버 기동 시 자동 실행 로그 확인 + `GET /calendar/events` 정상 응답
   재확인 + category 집계로 기존 데이터 무손상 재확인

## 74. `scripts/seed_kospi100_earnings.py` 삭제 - 이미 목적을 다한 깨진 스크립트

사용자가 파일을 열어보다가 "필요없는 파일이 있나" 질문해서 `scripts/` 전체를 점검하던 중
발견해 삭제했다. calendar 로직(`services/calendar.py`) 자체는 이번에도 전혀 건드리지
않았다.

### 왜 삭제했나

- **이미 실행이 불가능한 상태였다**: 71번 작업 중 `from backend.core.database import
  async_session`이 실제로 `ImportError`를 내는 걸 확인했다 - `database.py`에는
  `get_session_factory()`만 있고 `async_session`은 없다(리팩터 이후 이 스크립트만
  안 고쳐진 것으로 보임).
- **목적을 이미 다했다**: 68~70번 항목에서 이 스크립트로 코스피 시총 상위 100개 기업의
  DART 잠정실적을 이미 백필했고(91개 기업, 578건), 그 데이터는 지금도 `calendar_events`에
  그대로 있다(74번 작업 시점 재확인: `earnings=578` 그대로). 재실행 계획이 없어 import만
  고쳐서 살려둘 이유가 없다고 판단, 사용자도 삭제를 선택했다.
- 같은 폴더의 `scripts/__pycache__/`(디스크에만 있던 빌드 산물, git 비추적)도 같이
  정리했다 - 이 스크립트가 없어지면서 같이 정리하는 게 맞다고 판단했다.

### 확인

- `git status`로 삭제 전 `scripts/` 아래에 추적되지 않은 다른 변경이 없는지 먼저 확인
- `git rm scripts/seed_kospi100_earnings.py`로 삭제(작업 디렉터리와 git 추적 양쪽에서
  제거, 실수로 미추적 상태만 지우는 것과 구분)
- 삭제 후 `calendar_events`의 `earnings` 건수가 578건 그대로임을 재확인 - 스크립트
  삭제가 이미 DB에 들어간 데이터에는 전혀 영향을 주지 않음(스크립트는 DB에 쓰기만 하는
  일회성 도구였고, 실행 결과는 DB에 남아있지 삭제한다고 같이 지워지지 않는다)
