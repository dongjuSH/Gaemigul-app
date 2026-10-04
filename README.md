# 🐜 개미굴 (Gaemigul)

주식 초보를 위한 AI 시황 대시보드. 하루 8번 시장 데이터와 뉴스를 모아 AI가 쉬운 말로 설명합니다.

**서비스** https://gaemigul-app.vercel.app

## 주요 기능

- **시황 타임라인** — 하루 8개 시점의 지표·주도 업종·뉴스를 AI 브리핑과 입문자용 해설로 정리
- **일간·주간 브리핑** — 장 마감 후 AI 보고서 자동 작성
- **시장 지표** — 지표 바, VIX, 원/달러, 투자자 수급, 자체 시장심리지수
- **경제 캘린더 · 업종 히트맵 · 용어 사전**
- **회원 기능** — 로그인, 투자 등급 진단, 출석, 주간 일정 메일

## 기술 스택

| 구분 | 기술 |
|---|---|
| Frontend | Next.js, TypeScript, Tailwind CSS |
| Backend | FastAPI, Python 3.14, APScheduler |
| DB · Infra | Supabase(PostgreSQL · Storage), Vercel, Oracle Cloud |
| 외부 API | 한국투자증권, 네이버 뉴스, Gemini, FRED, DART |

## 담당 역할

팀 프로젝트 · **백엔드 메인** — 메인 페이지(시황 타임라인·브리핑·시장 데이터) 백엔드, 운영 서버 구축·운영

## 폴더 구조

```
backend/    FastAPI 서버 (core: 외부 API·DB 클라이언트, domain: 기능별 코드)
frontend/   Next.js 대시보드
docs/       구축·운영 가이드
```

## 로컬 실행

```bash
# 백엔드
cd backend && uv sync
cp .env.example .env              # 키 입력
uv run fastapi run main.py        # http://localhost:8000

# 프런트엔드
cd frontend && npm install
npm run dev                       # http://localhost:3000
```

서버 구축·배포·운영 절차는 [docs/OPERATIONS.md](docs/OPERATIONS.md)를 참고하세요.

> 브리핑·해설·보고서는 AI가 생성한 참고용 콘텐츠이며 투자 권유가 아닙니다.
