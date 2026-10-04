# 담당 업무: 메인 페이지 백엔드 (calendar 도메인)

## 담당 범위

- 메인 페이지 백엔드 구현 (`src/backend/domain/calendar`)
- 실사용 API(FRED, 한국투자증권 등) 데이터 확인 및 기획된 기능의 구현 가능 여부 검증
- 프로젝트 진행 중 미흡한 부분 지원

## 메인 페이지 구성 (내 작업 대상)

- **캘린더**: 각종 발표 이벤트 일정 (미국, 한국)
  미국
  FOMC발표, CPI, PPI, GDP, 미국 고용지표, 미국 기준금리, 미국 증시 휴장일,
  기업 실적 발표 : NVIDIA , APPLE, Microsoft, Oracle등 주요 기업 ,
  미국 선물 만기, 미국 옵션 만기, 선물 옵션 동시 만기, 미국 월물옵션, 기업/시장 이벤트(신제품 발표, NVIDA GTC, CES, 테슬라 이벤트, 기업Investor Day, IPO, 주요기업M&A)
  한국
  한국 기준금리, 주요 기업 실적 발표, 주요 금융 뉴스, 정책/관세 뉴스, 한국 증시 휴장일, 한국 옵션 만기, 한국 선물 만기, 한국 옵션 선물 동시 만기

- **메인 섹션**: 캘린더별 정보 표시
- **우측 사이드바**: 캘린더 내용 상세

## 브랜치

- `back/feat/calendar` 에서 작업 (main 기준으로 분기)

## 기술 스택

- FastAPI, uv
- DB: Supabase — 팀 공용 프로젝트 사용, 연결 정보는 `.env`로 관리(커밋 금지)

## 내 작업 위치

```
backend/src/backend/domain/calendar/
├── models/
│   └── calendar.py            (아직 빈 파일 - 타임라인 이벤트 기능용, 미착수)
├── routers/
│   └── calendar.py            (GET /calendar/indicators)
├── schemas/
│   └── calendar.py            (아직 빈 파일 - 캘린더인 이벤트 기능용, 미착수)
└── services/
    └── calendar.py             (아직 빈 파일 - 캘린더)

ackend/src/backend/core는 백엔드팀 공용폴더
`fred_client.py`는 여러 도메인이 같이 쓸 수 있게 `backend/src/backend/core/fred_client.py`로 옮겨져 있다 — API 호출 파일은 도메인 안에 두지 않고 core에 모아서 전역으로 쓰는 것으로 팀 규칙이 정해졌다(2026-09-10).
```
