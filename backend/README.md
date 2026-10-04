# Gaemigul backend

FastAPI 서버. 도메인별 코드는 `src/backend/domain/`, 외부 API 호출은 `src/backend/core/`에 있다.
담당 도메인 설명과 작업 기록은 각 도메인의 `Claude.md`를 본다 (예: `src/backend/domain/timeline/Claude.md`).

## 실행

```bash
uv sync                      # 의존성 설치
cp .env.example .env         # 키 입력 (커밋하지 말 것)
uv run python create_tables.py   # 없는 테이블만 생성
uv run fastapi run main.py   # 서버 실행 (자동 재시작 없음 - 코드를 고치면 직접 재시작)
```

- API 문서: `http://127.0.0.1:8000/docs`
- 프런트엔드의 `NEXT_PUBLIC_API_BASE_URL`도 같은 주소를 쓴다. KIS 키와 토큰은 백엔드에만 둔다
- 로그: 터미널 + `logs/timeline.log` (14일 보관)

## 예약 작업

서버가 떠 있는 동안에만 동작한다. 시각·주기는 `main.py` 맨 위 목록 참고.
타임라인 슬롯 8회, 일간·주간 보고서(20:10), 지표 바, market 데이터(VIX·환율·수급·시장심리·거래대금), 히트맵(정규장 10분 간격).

## 주의

- `.env`와 `.cache/`(KIS 토큰 예비 파일·히트맵 캐시)는 커밋하지 않는다.
- KIS 토큰은 DB `kis_token` 테이블로 기기 간 공유한다 (`core/kis_token_store.py`). DB를 못 쓸 때만 `.cache/kis_token.json`을 쓴다.
- KIS 토큰은 계좌 단위라 `kis_client.get_access_token()`만 쓴다. 따로 발급하면 계좌 주인에게 알림이 간다.
- 같은 DB를 보는 서버를 두 대 이상 켜지 않는다. 수집이 중복되고 저장이 충돌한다.

## 히트맵

`GET /heatmap?market=kospi&period=day`

- `market`: `kospi`, `kosdaq`
- `period`: `day`, `week`, `month`. 연간은 제공하지 않습니다.
- 시가총액·가격은 원, 거래량은 주, 등락률과 거래량 비중은 0~100 기준 백분율입니다.
- 응답에는 `sectors[].stocks[]`, `top_sector`, `related_sectors`, `coverage`, `as_of_date`, `updated_at`, `next_update_at`, `market_status`, `is_stale`, `is_refreshing`, `message`가 포함됩니다.
- `updated_at`은 실제 수집 시각이며 GET 요청 시각으로 덮어쓰지 않습니다. `as_of_date`는 데이터 기준 거래일입니다.
- 초기 수집 중에는 HTTP 200과 부분 데이터/빈 목록 및 진행 상태를 반환합니다. 일부 종목이 누락되면 `top_sector=null`; 이전 전체 스냅샷이 있으면 이를 유지하고 지연 상태를 표시합니다.

### 집계 기준

KIS 종목마스터의 보통주(ST)와 외국주권(FS)을 대상으로 우선주·SPAC·ETF·ETN·주식예탁증서 등 별도 상품을 제외합니다. 가장 세부적인 유효 업종으로 묶고, 선택한 시장·기간의 종목 등락률을 시가총액으로 가중 평균해 업종 상승률 1위를 정합니다. 화면의 15개 업종 밖에 있는 업종도 1위가 될 수 있습니다. 동률이면 시가총액, 업종 코드 순입니다. 모두 하락하면 가장 높은 등락률(가장 작은 하락폭)을 선택합니다. 등락률이 없는 신규 상장은 가중 평균에서 제외하며, 전체 시세가 불완전하거나 등락률을 계산할 수 없는 업종이 있으면 1위를 확정하지 않습니다. 기존 거래량 기준 캐시는 조회·복원 시 새 기준으로 재계산합니다.

일간 등락률은 전 거래일 종가 대비, 주간은 이번 주 시작 전 마지막 거래일 종가 대비, 월간은 이번 달 시작 전 마지막 거래일 종가 대비입니다. 주간·월간 기준가격은 수정주가 일봉을 사용합니다. 기준가격이 없는 신규 상장은 등락률을 `null`로 표시합니다. 거래량은 해당 달력 기간의 일봉 거래량에 현재 거래일의 누적 거래량을 한 번만 더합니다. 10분마다 받은 누적 거래량을 서로 더하지 않습니다.

마스터에 기준가와 시가총액이 모두 0인 레코드가 남아 있으면 주식기본조회(`CTPF1002R`)의 해당 시장 상장폐지일을 확인합니다. 이미 상장폐지된 종목만 대상에서 제외하고, 단순 조회 실패나 가격 미제공은 임의로 제외하지 않습니다.

시가총액은 수집 가격×상장주수입니다. 초기에는 마스터의 천주 단위 상장주수를 변환하고, 기간시세 응답에서 정확한 상장주수를 확보하면 보완합니다. 프론트는 기업 5개 이상인 업종 중 시가총액 상위 15개, 각 업종 상위 5개 기업(총 75개)을 표시합니다. 면적은 시가총액의 0.35제곱 비중 60%와 균등 비중 40%를 혼합해 작은 업종도 보이게 합니다. 실제 시가총액은 상세에서 확인할 수 있습니다.

### 수집과 캐시

기존 APScheduler에서 한국 시간으로 매분 30초에 수집 필요 여부를 검사합니다. KRX 정규장 09:00~15:30 동안 개장 기준 10분 간격으로 갱신하고, 마감 체결 반영을 위해 15:30:30에 마지막 수집을 시작합니다. 전체 종목은 순차 조회하므로 모든 종목이 정확히 동일한 순간의 시세는 아닙니다. 브라우저 조회와 UPDATE 버튼은 저장된 결과만 읽습니다.

종목/업종 마스터는 하루 단위로 저장합니다. 주·월간용 최근 70일 일봉은 하루에 한 번 준비하고 초기 준비는 매분 제한된 시간 동안 나누어 진행합니다. 따라서 최초 실행은 전체 종목 수와 API 지연에 따라 여러 분 이상 걸립니다. 장중에는 일간 시세를 먼저 표시하고 기간 데이터가 준비되는 대로 주간·월간을 채웁니다. 날짜·가격·분류·스냅샷은 `backend/.cache/heatmap/`에 저장되며 Git에서 제외됩니다. 토큰은 `kis_client.get_access_token()`을 공유합니다.

정규장 마감에 확보한 시세는 파일에 저장해 서버 재시작 후에도 유지합니다. **장외에 처음 실행하여 마감 스냅샷이 없는 경우 KIS 일봉으로 복원하며, 그 거래량에는 시간외 거래가 포함될 수 있습니다.** 이 경우 화면에도 일봉 기준임을 표시합니다. 다음 정규장 마감부터 예약 수집한 값으로 고정됩니다.

휴장일 API는 당일에 한 번 확인해 캐시합니다. 신규 조회 실패 시 개장일을 평일로 추정하지 않습니다. 휴장일 API는 특별 개장시간까지 제공하지 않으므로, 수능일·연초 개장 등은 KRX 공지에 맞춰 `.env`에 설정합니다.

```dotenv
HEATMAP_ENABLED=true
HEATMAP_REQUESTS_PER_SECOND=5
HEATMAP_SESSION_OVERRIDES={"2026-01-02":{"open":"10:00","close":"15:30"}}
```

날짜별 `{"closed":"true"}`로 특별 휴장도 지정할 수 있습니다. 날짜 예시는 형식 안내이며 실제 거래 일정은 운영 시 확인해야 합니다. 호출 속도는 지표 바와 히트맵을 합친 프로세스 공용 제한입니다. **스케줄러와 토큰 잠금은 프로세스 내에서 공유하므로 서버 worker는 1개로 실행합니다.** 다중 서버/worker 배포 시 수집 전용 worker 및 공유 캐시/잠금으로 분리해야 합니다.

### 연관 업종과 최신 경제 뉴스

`related_sectors`는 상승률 1위 업종의 산업 연결 규칙에 따라 최대 3개 업종과 각 업종의 시가총액 상위 실제 기업 2개를 제공합니다. `relationship_kind=industry`는 소재·설비·유통 등 명시된 산업 연결이며 주가 상승의 인과관계나 기업 간 직접 계약을 의미하지 않습니다. 해당 시장에서 규칙을 채울 수 없으면 `market_trend`로 같은 시장의 등락률 상위 업종을 구분해서 표시합니다.

`GET /heatmap/news?market=kospi&period=day`는 현재 1위 업종의 Google 뉴스 RSS 검색 결과를 제공합니다. 별도 API 키가 필요하지 않습니다. 업종 검색어·대표 기업 검색을 합쳐 경제 관련성, 발행일과 링크를 검사하고 중복을 제거해 최신순 최대 4건을 선택합니다. 30일보다 오래되거나 미래 시각인 기사는 제외하며 부족한 건수를 가짜 기사로 채우지 않습니다. 기사 본문은 수집하거나 생성하지 않습니다.

뉴스는 시세 API와 분리해 조회하며 같은 시장·업종별 10분 캐시, 동시 요청 병합, 실패 후 60초 재시도 제한을 적용합니다. 실패 시 같은 업종의 마지막 기사만 지연 표시합니다. 응답은 `sector_code`, `sector_name`, `items[{title,url,source,published_at,summary}]`, `updated_at`, `is_stale`, `message`입니다. RSS의 `summary`는 빈 문자열입니다.

### 코드 위치와 KIS 요청 양식

- `src/backend/core/kis_client.py`: 인증·재시도·공용 속도 제한, API 경로/TR ID/요청 파라미터/응답 필드와 단위 주석, 종목·업종 마스터 파싱.
- `src/backend/domain/heatmap/services/heatmap.py`: 기간 계산, 휴장/세션 판정, 상승률 순위, 캐시 및 오류 처리.
- `src/backend/domain/heatmap/schemas/heatmap.py`: 화면 응답 모델.
- `src/backend/domain/heatmap/routers/heatmap.py`: 캐시 조회 라우터.

참조한 공식 KIS 예제: [업종별 전체시세](https://github.com/koreainvestment/open-trading-api/tree/main/examples_llm/domestic_stock/inquire_index_category_price), [복수 종목 시세](https://github.com/koreainvestment/open-trading-api/tree/main/examples_llm/domestic_stock/intstock_multprice), [수정주가 일봉](https://github.com/koreainvestment/open-trading-api/tree/main/examples_llm/domestic_stock/inquire_daily_itemchartprice), [휴장일](https://github.com/koreainvestment/open-trading-api/tree/main/examples_llm/domestic_stock/chk_holiday), [종목·업종정보파일](https://github.com/koreainvestment/open-trading-api/tree/main/stocks_info).

### 검증

```powershell
uv run python -m unittest discover -s tests
```

테스트는 실제 KIS 요청 없이 토큰 재사용, 업무 오류·속도 제한 재시도, 마스터 단위/분류, 일·주·월 기준가격, 거래량 중복 방지, 불완전 순위, 휴장/특별시간, 마감 저장·복원, 캐시 전용 GET을 검사합니다.
