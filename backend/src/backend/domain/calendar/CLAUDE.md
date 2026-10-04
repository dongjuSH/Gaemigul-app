# CLAUDE.md

# 1. 프로젝트 목적

이 프로젝트는 주식투자를 처음 시작하는 한국 초보 투자자(주린이)를 위한
금융·경제 이벤트 캘린더 서비스이다.

사용자가 미국 경제지표와 금융 이벤트를 보고 다음 내용을 쉽게 이해할 수 있도록 만든다.

- 무엇을 의미하는지
- 언제 발표되는지
- 이전 값은 얼마였는지
- 실제 발표값은 얼마인지
- 왜 중요한 경제지표인지
- 주식시장에 어떤 영향을 줄 수 있는지

전문 투자자용 서비스가 아니라
금융과 주식에 익숙하지 않은 한국 사용자가 이해하기 쉬운 서비스를 만드는 것이 핵심이다.

현재 1단계에서는 FRED API의 미국 경제지표 데이터를 이용한다.

전체 데이터 흐름:

```text
FRED API
   ↓
FastAPI Service
   ↓
Supabase
   ↓
FastAPI Router
   ↓
Next.js
   ↓
Calendar UI
```

---

# 2. 가장 중요한 개발 원칙

## 기존 프로젝트 구조를 반드시 유지한다.

현재 프로젝트의 정상적으로 동작하는 코드와 폴더 구조를 임의로 변경하지 않는다.

새로운 프레임워크나 라이브러리를 임의로 추가하지 않는다.

기존 Router / Service / Schema / Model 구조가 있다면 그대로 활용한다.

작업 전에 반드시 현재 프로젝트를 분석한다.

분석 대상:

1. 프로젝트 폴더 구조
2. FastAPI 실행 구조
3. Router
4. Service
5. Schema
6. Model
7. Supabase 연결 코드
8. `.env`
9. Next.js 구조
10. 기존 Calendar 컴포넌트
11. 기존 API 호출 방식

기존 Calendar UI가 있다면 새로 만들지 않는다.

기존 UI를 최대한 유지하고 실제 API 데이터만 연결한다.

---

# 3. 이번 단계의 구현 범위

이번 단계에서는 다음 순서로 구현한다.

````text
1. 현재 프로젝트 분석
2. FRED API 연결 확인
3. CalendarEvent Schema 정리
4. Supabase calendar_events 테이블 생성/수정
5. CPI 데이터 연결
6. Supabase에 CPI 저장
7. FastAPI GET API 구현
8. Swagger에서 확인
9. Next.js에서 API 호출
10. Calendar에 CPI 표시
11. CPI 성공 후 PPI 추가
12. 이후 GDP / 고용 / 실업률 / 금리 추가


처음부터 모든 지표를 구현하지 않는다.

반드시 CPI부터 성공시킨다.

---

# 4. Supabase 테이블

Supabase 테이블 이름:

```text
calendar_events
````

중요:

Supabase의 컬럼명과 FastAPI의 `CalendarEvent` 컬럼명을 동일하게 유지한다.

DB 전용 컬럼을 별도로 만들지 않는다.

---

# 5. 최종 Supabase 컬럼

`calendar_events` 테이블은 다음 컬럼을 사용한다.

| 컬럼명        | 타입    | NULL | 설명                 |
| ------------- | ------- | ---: | -------------------- |
| `id`          | text    |   NO | 이벤트 고유 ID       |
| `publishedAt` | text    |   NO | 한국시간 기준 발표일 |
| `start_date`  | text    |  YES | 보류                 |
| `end_date`    | text    |  YES | 보류                 |
| `time`        | text    |  YES | 한국시간 발표시간    |
| `region`      | text    |   NO | 국가                 |
| `category`    | text    |   NO | 카테고리             |
| `title`       | text    |   NO | 한국어 이벤트명      |
| `summary`     | text    |   NO | 한국 주린이용 설명   |
| `importance`  | integer |  YES | 현재 보류            |
| `previous`    | text    |  YES | 직전 발표값          |
| `forecast`    | text    |  YES | 현재 보류            |
| `actual`      | text    |  YES | 실제 발표값          |
| `status`      | text    |   NO | 발표 상태            |

## 삭제된 컬럼

다음 컬럼은 사용하지 않는다.

```text
source_url
```

Supabase 테이블에서도 삭제한다.

FastAPI Schema에서도 삭제한다.

Next.js에서도 사용하지 않는다.

---

# 6. CalendarEvent Schema

최종 `CalendarEvent`는 다음 구조를 사용한다.

```python
from typing import Optional
from pydantic import BaseModel


class CalendarEvent(BaseModel):

    # 아이디
    id: str

    # 발표 날짜
    # 한국시간 기준
    publishedAt: str

    # 시작날짜
    # 현재 보류
    start_date: Optional[str] = None

    # 종료날짜
    # 현재 보류
    end_date: Optional[str] = None

    # 발표시간
    # 한국시간 기준
    time: Optional[str] = None

    # 국가
    region: str

    # 카테고리
    category: str

    # 이벤트명
    # 한국어로 표시
    title: str

    # 자세한 내용
    # 한국 주린이가 이해하기 쉬운 설명
    summary: str

    # 중요도
    # FRED에서 직접 제공하지 않으므로 현재 보류
    importance: Optional[int] = None

    # 이전 값
    # 직전 발표값
    previous: Optional[str] = None

    # 예측 값
    # FRED에서 시장 예상값을 제공하지 않으므로 현재 보류
    forecast: Optional[str] = None

    # 실제 값
    actual: Optional[str] = None

    # 발표 상태
    status: str
```

## 중요

기존의 오타:

```python
summaty
```

는 사용하지 않는다.

반드시:

```python
summary
```

를 사용한다.

프로젝트 전체에서 `summaty`라는 이름을 제거한다.

---

# 7. 컬럼 구조의 핵심 원칙

최종 구조는 다음과 같다.

```text
calendar_events
│
├── id
├── publishedAt
├── start_date
├── end_date
├── time
├── region
├── category
├── title
├── summary
├── importance
├── previous
├── forecast
├── actual
└── status
```

FastAPI:

```text
CalendarEvent
│
├── id
├── publishedAt
├── start_date
├── end_date
├── time
├── region
├── category
├── title
├── summary
├── importance
├── previous
├── forecast
├── actual
└── status
```

Supabase와 FastAPI Schema의 필드명을 동일하게 유지한다.

---

# 8. 날짜와 시간은 한국시간

이 프로젝트의 사용자는 한국 투자자이다.

따라서 Calendar에 표시되는 날짜와 시간은 반드시
한국시간(KST)을 기준으로 한다.

Timezone:

```text
Asia/Seoul
```

한국시간:

```text
KST
UTC+09:00
```

을 사용한다.

---

# 9. publishedAt

`publishedAt`은 경제지표의 발표일을 의미한다.

반드시 한국시간 기준으로 처리한다.

미국에서 발표된 시간 때문에 한국에서는 날짜가 다음 날로 넘어가는 경우가 있을 수 있다.

따라서 미국 날짜 문자열을 단순히 복사하지 않는다.

Timezone을 사용하여 정확하게 변환한다.

Python에서는 가능하면:

```python
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
```

를 사용한다.

---

# 10. start_date / end_date

현재 `start_date`와 `end_date`는 **보류**한다.

컬럼은 유지한다.

현재 단계에서는 임의의 값을 만들지 않는다.

```text
start_date = null
end_date = null
```

로 저장할 수 있다.

향후 여러 날에 걸쳐 진행되는 이벤트가 필요할 경우 사용한다.

예:

```text
FOMC 회의
기업 행사
컨퍼런스
```

현재 CPI, PPI 등의 경제지표에서는 사용하지 않는다.

---

# 11. time

발표 시간이 정확하게 확인되는 경우에만 입력한다.

반드시 한국시간으로 변환한다.

확실하지 않은 경우:

```text
time = null
```

로 처리한다.

임의의 발표시간을 생성하지 않는다.

---

# 12. region

미국 경제지표의 경우 사용자에게 다음과 같이 표시한다.

```text
미국
```

예:

```json
{
  "region": "미국"
}
```

개발자가 아닌 한국 사용자가 바로 이해할 수 있도록 한다.

---

# 13. category

`category`는 데이터 분류를 위한 값이다.

다음과 같이 사용한다.

```text
CPI
PPI
GDP
EMPLOYMENT
INTEREST_RATE
```

예:

```text
category = "CPI"
```

화면에서는 필요한 경우 한국어 명칭으로 표시한다.

```text
CPI
→ 소비자물가지수

PPI
→ 생산자물가지수

GDP
→ 국내총생산

EMPLOYMENT
→ 고용

INTEREST_RATE
→ 금리
```

---

# 14. title

`title`은 반드시 한국어로 표시한다.

영어 약어만 표시하지 않는다.

잘못된 예:

```text
US CPI
US PPI
US GDP
US Nonfarm Payrolls
US Unemployment Rate
US Federal Funds Rate
```

올바른 예:

```text
미국 소비자물가지수(CPI)
미국 생산자물가지수(PPI)
미국 국내총생산(GDP)
미국 비농업 고용
미국 실업률
미국 연방기금금리
```

주식 초보자가 처음 보더라도 무슨 지표인지 이해할 수 있어야 한다.

---

# 15. CPI title

CPI는:

```text
미국 소비자물가지수(CPI)
```

로 표시한다.

단순히:

```text
CPI
```

라고 표시하지 않는다.

---

# 16. PPI title

PPI는:

```text
미국 생산자물가지수(PPI)
```

로 표시한다.

---

# 17. GDP title

GDP는:

```text
미국 국내총생산(GDP)
```

로 표시한다.

---

# 18. PAYEMS title

PAYEMS는:

```text
미국 비농업 고용
```

으로 표시한다.

필요한 경우:

```text
미국 비농업 고용(Nonfarm Payrolls)
```

형태를 사용할 수 있다.

---

# 19. UNRATE title

UNRATE는:

```text
미국 실업률
```

로 표시한다.

---

# 20. FEDFUNDS title

FEDFUNDS는:

```text
미국 연방기금금리
```

로 표시한다.

주의:

FEDFUNDS는 FOMC 회의 일정이 아니다.

```text
FOMC
→ 미국 연방공개시장위원회 회의 일정

FEDFUNDS
→ 미국 연방기금금리 실제 데이터
```

두 데이터를 혼동하지 않는다.

---

# 21. summary

`summary`는 한국 주식 초보자가 이해하기 쉬운 한국어로 작성한다.

FRED의 영어 설명을 그대로 화면에 보여주지 않는다.

가능하면 다음 내용을 포함한다.

1. 무엇인지
2. 무엇을 측정하는지
3. 왜 중요한지
4. 주식시장과 어떤 관계가 있는지

---

# 22. CPI summary 예시

```text
미국 소비자물가지수(CPI)는 미국에서 소비자가 구입하는 상품과 서비스의 가격 변화를 보여주는 대표적인 물가 지표입니다. 물가가 예상보다 높게 나오면 인플레이션 우려가 커지고 미국의 금리 인하 기대가 약해질 수 있어 주식시장에 부담으로 작용할 수 있습니다.
```

---

# 23. PPI summary 예시

```text
미국 생산자물가지수(PPI)는 기업이 상품과 서비스를 생산하면서 받는 가격의 변화를 보여주는 지표입니다. 생산 단계의 물가 흐름을 확인할 수 있어 향후 소비자물가와 인플레이션 흐름을 판단할 때 참고합니다.
```

---

# 24. GDP summary 예시

```text
미국 국내총생산(GDP)은 미국 경제가 얼마나 성장하고 있는지를 보여주는 대표적인 경제지표입니다. 예상보다 경제성장이 강하면 경기 회복 신호가 될 수 있지만 미국 금리 인하 기대에는 영향을 줄 수 있습니다.
```

---

# 25. summary 작성 시 주의

이 서비스는 투자 초보자를 위한 정보 서비스이다.

따라서 특정 종목의 매수·매도를 직접 지시하지 않는다.

잘못된 예:

```text
CPI가 높으면 삼성전자를 매도하세요.
CPI가 낮으면 무조건 주식을 매수하세요.
```

올바른 방향:

```text
CPI가 예상보다 높게 나오면 인플레이션 우려가 커지고
금리 인하 기대가 약해질 수 있어 주식시장에 부담이 될 수 있습니다.
```

정보를 제공하고 판단은 사용자가 하도록 한다.

---

# 26. previous

`previous`는 **직전 발표값**을 의미한다.

"1년 전 같은 시기의 값"으로 처리하지 않는다.

예:

```text
현재 CPI = 325.000
직전 CPI = 323.500
```

이면:

```json
{
  "previous": "323.500",
  "actual": "325.000"
}
```

으로 저장한다.

전년동월비(YoY)는 향후 별도의 기능으로 구현한다.

---

# 27. forecast

FRED에서 시장 컨센서스 예상값을 제공하지 않는 경우가 있으므로
임의로 forecast 값을 생성하지 않는다.

현재:

```json
{
  "forecast": null
}
```

로 처리한다.

다음과 같은 방식은 금지한다.

```text
forecast = actual
forecast = previous
forecast = 임의의 예상값
```

향후 별도의 시장 컨센서스 데이터 소스를 연결할 경우 추가한다.

---

# 28. importance

FRED에는 일반적인 경제 캘린더에서 사용하는

```text
★
★★
★★★
```

형태의 표준 중요도 값이 없다.

따라서 현재:

```json
{
  "importance": null
}
```

로 처리한다.

CPI=3, PPI=2 등 임의의 중요도 숫자를 만들지 않는다.

향후 자체 중요도 알고리즘을 별도로 구현한다.

---

# 29. actual

`actual`은 FRED Series Observation의 실제 값을 사용한다.

예:

```text
actual = "325.000"
```

FRED API에서 값이:

```text
.
```

로 반환되면 실제 값이 없다는 의미이므로:

```text
actual = null
```

로 처리한다.

---

# 30. status

발표 전:

```text
SCHEDULED
```

발표 후 실제 값이 존재하면:

```text
RELEASED
```

를 사용한다.

예:

```python
if actual is None:
    status = "SCHEDULED"
else:
    status = "RELEASED"
```

단, FRED의 release date 및 observation 데이터를 확인하여 판단한다.

---

# 31. FRED Series

현재 사용할 FRED Series는 다음과 같다.

| 카테고리      | Series ID | 한국어 명칭         |
| ------------- | --------- | ------------------- |
| CPI           | CPIAUCSL  | 미국 소비자물가지수 |
| PPI           | PPIACO    | 미국 생산자물가지수 |
| GDP           | GDP       | 미국 국내총생산     |
| EMPLOYMENT    | PAYEMS    | 미국 비농업 고용    |
| EMPLOYMENT    | UNRATE    | 미국 실업률         |
| INTEREST_RATE | FEDFUNDS  | 미국 연방기금금리   |

구현 순서:

```text
CPI
↓
PPI
↓
GDP
↓
비농업 고용
↓
실업률
↓
연방기금금리
```

---

# 32. 첫 번째 구현은 CPI

첫 번째 구현은 CPI 하나만 한다.

FRED Series ID:

```text
CPIAUCSL
```

목표:

```text
FRED CPI
    ↓
데이터 수집
    ↓
한국시간 변환
    ↓
한국어 title 생성
    ↓
한국어 summary 생성
    ↓
CalendarEvent 변환
    ↓
Supabase calendar_events 저장
    ↓
FastAPI GET
    ↓
Next.js
    ↓
Calendar
```

CPI가 정상적으로 표시된 후 PPI를 추가한다.

---

# 33. CPI 데이터 예시

최종 API 응답은 다음과 같은 형태를 목표로 한다.

```json
{
  "id": "fred-CPIAUCSL-2026-08-01",
  "publishedAt": "한국시간 발표일",
  "start_date": null,
  "end_date": null,
  "time": "한국시간 발표시간 또는 null",
  "region": "미국",
  "category": "CPI",
  "title": "미국 8월소비자물가지수(CPI)발표",
  "summary": "미국 소비자물가지수(CPI)는 미국에서 소비자가 구입하는 상품과 서비스의 가격 변화를 보여주는 대표적인 물가 지표입니다. 물가가 예상보다 높게 나오면 인플레이션 우려가 커지고 미국의 금리 인하 기대가 약해질 수 있어 주식시장에 부담으로 작용할 수 있습니다.",
  "importance": null,
  "previous": "직전 발표값",
  "forecast": null,
  "actual": "실제 발표값",
  "status": "RELEASED"
}
```

`source_url`은 포함하지 않는다.

---

# 34. FastAPI Service

FRED API 호출은 Router에서 직접 하지 않는다.

잘못된 구조:

```python
@router.get("/calendar")
def get_calendar():
    requests.get(FRED_URL)
```

올바른 구조:

```text
Router
   ↓
Service
   ↓
FRED API
   ↓
Supabase
```

Service가 담당하는 작업:

```text
FRED API 호출
↓
데이터 변환
↓
한국시간 변환
↓
한국어 title 생성
↓
한국어 summary 생성
↓
CalendarEvent 변환
↓
Supabase 저장
```

Router는 HTTP 요청과 응답을 담당한다.

---

# 35. Supabase 저장

FRED 데이터를 `calendar_events` 테이블에 저장한다.

DB와 Schema의 컬럼을 동일하게 유지한다.

다음 컬럼만 사용한다.

```text
id
publishedAt
start_date
end_date
time
region
category
title
summary
importance
previous
forecast
actual
status
```

`source_url`은 저장하지 않는다.

---

# 36. 중복 데이터 방지

같은 FRED 데이터를 여러 번 가져와도
중복 데이터가 발생하지 않도록 한다.

고유 ID:

```text
fred-{series_id}-{observation_date}
```

예:

```text
fred-CPIAUCSL-2026-08-01
```

이미 존재하는 경우 INSERT 대신 UPDATE 또는 UPSERT를 사용한다.

---

# 37. 환경변수

FRED API Key는 코드에 직접 작성하지 않는다.

`.env`:

```text
FRED_API_KEY=실제_API_KEY
```

Supabase 관련 Key도 동일하게 환경변수로 관리한다.

절대로 코드에 실제 Secret Key를 작성하지 않는다.

---

# 38. Next.js

Next.js에서 FRED API를 직접 호출하지 않는다.

다음 구조를 유지한다.

```text
Next.js
   ↓
FastAPI
   ↓
Supabase
```

기존 Calendar 컴포넌트가 있다면 유지한다.

FastAPI에서 받은 `CalendarEvent` 데이터를
기존 Calendar UI에 연결한다.

---

# 39. Calendar 표시 원칙

사용자가 Calendar에서 보는 정보는 한국어 중심으로 표시한다.

예:

```text
🇺🇸 미국

미국 소비자물가지수(CPI)

실제값: 325.000
이전값: 323.500
예상값: -
```

단, 실제값의 단위가 필요한 경우 단위를 함께 표시한다.

사용자가 숫자의 의미를 모를 수 있으므로
가능한 한 단위를 명확하게 표시한다.

---

# 40. 미국 날짜를 그대로 표시하지 않는다.

FRED에서 받은 미국 기준 날짜를 그대로 Calendar에 표시하지 않는다.

반드시 한국시간 기준으로 변환한다.

특히 미국 발표시간이 한국시간으로 다음 날이 되는 경우
한국 날짜가 변경될 수 있음을 고려한다.

```text
미국 발표
    ↓
Timezone 변환
    ↓
Asia/Seoul
    ↓
한국 Calendar 날짜
```

---

# 41. FOMC 주의사항

FOMC 회의 일정과 FEDFUNDS는 서로 다른 데이터이다.

```text
FOMC
→ 미국 연방공개시장위원회 회의 일정

FEDFUNDS
→ 미국 연방기금금리 실제 데이터
```

FEDFUNDS 데이터를 이용하여 FOMC 회의일을 임의로 생성하지 않는다.

FOMC 일정은 향후 Federal Reserve 공식 데이터를 별도로 연결한다.

---

# 42. 이번 단계에서 구현하지 않는 데이터

현재 FRED 1단계에서는 다음 데이터를 구현하지 않는다.

```text
FOMC 회의 일정
미국 증시 휴장일
미국 옵션 만기
미국 선물 만기
Triple Witching
NVIDIA 실적
Apple 실적
Microsoft 실적
Oracle 실적
Tesla 이벤트
Apple 신제품 발표
NVIDIA GTC
CES
IPO
M&A
한국은행 기준금리
한국 증시 휴장일
한국 옵션 만기
한국 선물 만기
한국 기업 실적
한국 금융뉴스
트럼프 발언
시장 컨센서스 Forecast
```

향후 각각 적절한 API 또는 공식 데이터 소스를 연결한다.

---

# 43. 개발 작업 방식

Claude Code는 코드를 수정하기 전에 반드시 현재 프로젝트를 분석하고
다음 내용을 먼저 보고한다.

```text
1. 현재 프로젝트 구조
2. Router 구조
3. Service 구조
4. Schema 구조
5. Supabase 연결 방식
6. .env 사용 방식
7. Next.js 구조
8. Calendar 구조
9. 현재 calendar_events 테이블 상태
10. 수정할 파일
11. 새로 생성할 파일
```

분석 결과를 먼저 설명한 후 코드를 수정한다.

---

# 44. 기존 코드 보호

현재 정상적으로 작동하는 코드가 있다면 임의로 삭제하지 않는다.

특히:

```text
Router
Service
Schema
Supabase 연결
Next.js Calendar
```

를 전체적으로 다시 작성하지 않는다.

필요한 부분만 최소한으로 수정한다.

---

# 45. 구현 시 오류가 발생한 경우

오류가 발생하면 무조건 새로운 구조를 만들지 않는다.

먼저:

```text
1. 오류 메시지 확인
2. 오류가 발생한 파일 확인
3. 기존 코드 확인
4. 원인 분석
5. 최소 수정
6. 다시 실행
```

순서로 해결한다.

---

# 46. 최종 목표

최종적으로 다음 구조를 만든다.

```text
                 ┌─────────────────┐
                 │      FRED       │
                 │   미국 경제지표 │
                 └────────┬────────┘
                          ↓
                 ┌─────────────────┐
                 │     Service     │
                 │ 데이터 수집     │
                 │ 한국시간 변환   │
                 │ 한국어 변환     │
                 │ 데이터 가공     │
                 └────────┬────────┘
                          ↓
                 ┌─────────────────┐
                 │    Supabase     │
                 │ calendar_events │
                 └────────┬────────┘
                          ↓
                 ┌─────────────────┐
                 │     FastAPI     │
                 │     Router      │
                 └────────┬────────┘
                          ↓
                 ┌─────────────────┐
                 │     Next.js     │
                 │    Calendar     │
                 └─────────────────┘
```

첫 번째 성공 기준:

```text
FRED CPI
   ↓
한국시간 변환
   ↓
한국어 title
   ↓
한국어 summary
   ↓
Supabase calendar_events
   ↓
FastAPI
   ↓
Next.js
   ↓
Calendar 표시
```

CPI가 정상적으로 작동한 후:

```text
PPI
↓
GDP
↓
비농업 고용
↓
실업률
↓
연방기금금리
```

순서로 추가한다.

---

# 47. 서비스의 핵심 사용자 원칙

이 서비스는 주식을 처음 접하는 한국 주린이를 위한 서비스이다.

따라서 모든 데이터는 다음 원칙을 따른다.

```text
영어만 사용하지 않는다.
        ↓
한국어 명칭을 우선한다.
        ↓
필요한 경우 영어 약어를 괄호로 표시한다.
        ↓
한국시간으로 표시한다.
        ↓
무엇인지 쉽게 설명한다.
        ↓
왜 중요한지 설명한다.
        ↓
이전값과 실제값을 구분한다.
        ↓
예상값이 없으면 "-" 또는 null로 표시한다.
        ↓
투자 판단은 사용자가 하도록 한다.
```

목표는 단순히 경제지표 데이터를 보여주는 것이 아니다.

주식 초보자가 Calendar를 보고

"이게 무엇이지?"
"왜 중요한 거지?"
"주식시장하고 무슨 관계가 있지?"

라는 질문에 쉽게 답을 얻을 수 있는 서비스를 만드는 것이다.
