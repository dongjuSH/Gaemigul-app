# 개미굴 (Gaemigul)

주식을 막 시작한 사람은 봐야 할 데이터가 너무 많고 여기저기 흩어져 있어서, 언제 무엇을 봐야 할지 모르고 봐도 무슨 뜻인지 모릅니다.
개미굴은 하루 8번 정해진 시각에 필요한 것만 모아 보여주며 모든 내용을 AI가 이해하기 쉬운 말로 설명합니다.
앞으로의 일정은 캘린더로 미리 알려주며, 시장 전체 흐름은 히트맵으로 한눈에 보여줍니다.

```
외부 데이터(KIS·네이버·FRED·DART·Gemini) → 백엔드(FastAPI + 예약 작업) → Supabase(DB·이미지) → 프런트엔드(Next.js)
```

| 폴더 | 내용 |
|---|---|
| `backend/` | FastAPI 서버. `src/backend/core/`(외부 API·DB 클라이언트), `src/backend/domain/`(timeline · market · calendar · heatmap · glossary · auth · attendance) |
| `frontend/` | Next.js(App Router) 대시보드. `app/`(화면), `components/`, `lib/api/`(백엔드 호출) |
| `docs/` | QA 체크리스트, 요구사항, 트러블슈팅 보고서 |

- 도메인별 설계·작업 기록은 각 도메인의 `Claude.md`를 본다 (예: `backend/src/backend/domain/timeline/Claude.md`).
- 서버 주소와 API 문서(`/docs`) 경로는 저장소에 적지 않는다. 팀 채널에서 공유한 주소를 쓴다 (아래 [4. 운영 규칙](#4-운영-규칙)).

## 1. 실행

**준비물**: Python 3.14 + [uv](https://docs.astral.sh/uv/), Node.js 20 이상, Supabase PostgreSQL 접속 정보, 팀이 공유한 `.env`

```bash
# 백엔드
cd backend
uv sync
cp .env.example .env              # 키 입력 (설명은 .env.example, 커밋 금지)
uv run python create_tables.py    # 처음 한 번, 없는 테이블만 생성 (기존 테이블에 칼럼이 늘면 SQL로 직접 ALTER)
uv run fastapi run main.py        # http://127.0.0.1:8000 (API 문서 /docs)

# 프런트엔드
cd frontend
npm install
cp .env.example .env.local        # NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 (커밋 금지)
npm run dev                       # http://localhost:3000
```

- `.env` 항목은 `.env.example`에 설명이 있다. KIS·Gemini·네이버·FRED·DART·Supabase·SMTP 키와 `ADMIN_API_KEY`, 세션 쿠키 설정, 히트맵 옵션이 들어간다. **키는 백엔드에만 둔다.**
- 자동 재시작이 없다. 코드를 고치면 직접 다시 띄운다. 로그는 터미널 + `backend/logs/timeline.log`(14일 보관).
- 새 모델 파일을 만들면 `create_tables.py`의 import에 넣어야 인식된다.
- CORS 허용 출처는 `main.py`에 있다: `http://localhost:3000` · `http://127.0.0.1:3000` · 배포 도메인. 허용 메서드는 `GET · POST · PATCH · DELETE`이고 쿠키를 함께 보낸다(`allow_credentials`). 배포 도메인이 바뀌면 이 목록을 고쳐야 한다.
- 프런트엔드는 환경변수가 `NEXT_PUBLIC_API_BASE_URL` 하나뿐이고, 값이 없으면 `http://localhost:8000`을 쓴다. **외부 API 키는 프런트엔드에 두지 않는다** — 브라우저는 백엔드만 호출한다. 화면·컴포넌트 설명은 `frontend/README.md`를 본다.
- **백엔드를 켜면 예약 작업이 바로 돈다.** 운영 서버가 따로 있으므로 로컬 백엔드는 필요할 때만 켠다 ([4. 운영 규칙](#4-운영-규칙)).

### 백엔드 운영 서버 구축 (Oracle Cloud Always Free, Ubuntu 24.04)

1. VM 생성 후 공용 IP 지정, 보안 목록에 TCP 8000 수신 허용
2. 서버 설정
   ```bash
   sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
   sudo timedatectl set-timezone Asia/Seoul
   sudo apt update && sudo apt install -y fonts-noto-cjk git          # 한글 폰트: 보고서 이미지 합성용
   sudo iptables -I INPUT -p tcp --dport 8000 -m state --state NEW -j ACCEPT && sudo netfilter-persistent save
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```
3. `git clone -b dev <저장소> ~/Gaemigul-app-public` → `cd backend && uv sync` → `.env`를 `scp`로 복사(권한 600)
4. systemd 서비스 `gaemigul` 등록 후 `sudo systemctl enable --now gaemigul`
   ```ini
   [Service]
   User=ubuntu
   WorkingDirectory=/home/ubuntu/Gaemigul-app-public/backend
   ExecStart=/home/ubuntu/Gaemigul-app-public/backend/.venv/bin/fastapi run main.py --host 0.0.0.0 --port 8000
   Restart=always
   RestartSec=5
   Environment=PYTHONUNBUFFERED=1
   ```

**코드 반영**

```bash
cd ~/Gaemigul-app-public && git pull && sudo systemctl restart gaemigul   # 의존성이 바뀌면 uv sync 먼저
```

**DB 칼럼이 늘어난 변경을 반영할 때는 순서가 있다.** 새 코드가 없는 칼럼을 조회하면 그 엔드포인트가 500으로 떨어지므로, **칼럼 추가 스크립트를 재시작보다 먼저** 돌린다.

```bash
cd ~/Gaemigul-app-public && git pull                       # 코드만 받고 아직 재시작하지 않는다
cd backend && uv run python scripts/add_glossary_category_column.py
uv run python scripts/add_nickname_changed_at_column.py
sudo systemctl restart gaemigul                            # 매시 40~55분
uv run python scripts/seed_glossary_terms.py               # 용어 사전 데이터(현재 89개) 적재
```

`backend/scripts/`의 수동 스크립트는 넷이다. 모두 여러 번 돌려도 안전하다(`ADD COLUMN IF NOT EXISTS` · upsert).

| 스크립트 | 하는 일 |
|---|---|
| `add_glossary_category_column.py` | `glossary_term.category` 칼럼 추가 |
| `add_nickname_changed_at_column.py` | `auth_user.nickname_changed_at` 칼럼 추가 |
| `add_newsletter_columns.py` | 개미레터 관련 칼럼 추가 |
| `seed_glossary_terms.py` | 용어 사전 데이터 적재·갱신 (난이도 3톤 설명 · 카테고리 · 연관 용어) |

- 재시작은 **예약 작업 시각을 피해 매시 40~55분**에 한다. 슬롯·보고서 시각에 걸리면 그 회차가 빠진다.
- 서버를 옮길 때는 `backend/.env`(권한 600), `backend/.cache/`(KIS 토큰 예비 파일·히트맵 캐시), `backend/logs/`를 새 경로로 함께 옮긴다. 토큰 캐시를 빼먹으면 **KIS 토큰이 재발급되어 계좌 주인에게 알림이 간다.**

### 프런트엔드 배포 (Vercel)

- 배포는 Vercel 프로젝트에서 최신 `dev` 기준으로 다시 배포한다. **백엔드만 반영하고 프런트를 다시 배포하지 않으면, 새 API는 살아 있는데 화면에 기능이 안 보인다.**
- 브라우저는 백엔드를 직접 부르지 않고 **같은 도메인의 `/api/*`** 를 부른다. `frontend/vercel.json`의 `rewrites`가 이를 백엔드로 넘긴다. https 페이지에서 http 백엔드를 직접 부르면 브라우저가 막기 때문이다.
- 그래서 프런트에는 백엔드 주소를 넣을 필요가 없다. 로컬에서만 `NEXT_PUBLIC_API_BASE_URL`로 `http://localhost:8000`을 가리킨다.
- 쿼리 값에 `&`가 들어가는 API가 있다(예: 용어 카테고리 `시장&지수`). 호출할 때 **`encodeURIComponent`로 인코딩**하지 않으면 값이 잘려 422가 난다.

## 2. 데이터 갱신

**자동** — 서버 안 예약 작업 **20개**. 한국 시간 기준이고, 국내 휴장일에는 슬롯·보고서를 생략한다. 시각·주기는 `backend/main.py` 맨 위 목록에 정리돼 있다.

| 대상 | 시각 |
|---|---|
| 타임라인 슬롯 8개 | 07:30 · 08:30 · 09:30 · 12:00 · 14:00 · 15:34(장 마감) · 17:30 · 20:00 |
| 일간·주간 보고서 | 20:10 (주간은 그 주 마지막 거래일에 일간 직후) |
| 지표 바 | 10분마다 |
| VIX · 원/달러 환율 차트 | 매시 00 · 30분 |
| 투자자 수급 · 시장심리지수 | 평일 09:05, 09:30~15:00 30분마다, 15:35(장 마감 반영) |
| 시간대별 거래대금 | 평일 15:34:30 |
| 히트맵 | 매분 30초 확인 → 정규장 10분 간격 갱신 (`HEATMAP_ENABLED`) |
| 캘린더 | FOMC 매시 05 · 35분 / FRED 6시간마다 / DART 매일 00:10 / 미국 지수선물·옵션 만기 매일 00:20 |
| 개미레터(뉴스레터) | 매주 월요일 08:00 — 그 주 캘린더 일정 요약 메일 |

캘린더·히트맵은 서버 시작 직후에도 1회 실행된다(개미레터는 제외 — 재시작마다 메일이 나가면 안 된다).

**수동** — 슬롯이 빠졌거나 보고서를 다시 만들 때. `.env`의 `ADMIN_API_KEY`가 필요하다(헤더가 틀리면 401, 서버에 키가 없으면 503).

```bash
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://<서버>:8000/timeline/collect/1400"                 # 슬롯 (0730~2000)
curl -X POST -H "X-Admin-Key: $ADMIN_API_KEY" "http://<서버>:8000/timeline/report/daily?date=2026-09-18"  # 보고서 (weekly도 같음)
```

수동 수집은 **실행한 시점의 값**을 저장한다. 보고서의 업종 상승 종목 수는 다음 개장(09:00) 전까지만 다시 받을 수 있다.

## 3. 기본 점검

```bash
curl http://<서버>:8000/                       # {"message":"hello world"} → 서버 정상
sudo systemctl status gaemigul                 # active (running), NRestarts가 늘지 않는지
grep "스케줄러 시작" backend/logs/timeline.log | tail -1     # "작업 20개"
grep -E "WARNING|ERROR" backend/logs/timeline.log | tail -20
```

```bash
curl -s "http://<서버>:8000/glossary/terms" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))"   # 용어 수 (현재 89)
```

배포된 화면은 브라우저에서 확인한다. 메인(지표·차트가 채워지는지) → 타임라인(그날 시점 카드) → 용어 사전(카테고리 탭 전환) → 마이페이지(로그인 필요). 화면은 나오는데 값이 비면 백엔드를, 값은 API로 내려오는데 화면에 없으면 프런트 배포 버전을 먼저 의심한다.

**점검 시점**: 평일 슬롯 직후 `저장 완료` 로그, 20:10 뒤 `GET /timeline/report?type=daily&date=오늘`, 하루 한 번 `WARNING|ERROR` 로그

| 증상 | 대응 |
|---|---|
| KIS 호출이 500, 로그에 `EGW00123` | 공유 토큰이 무효 → 거절된 토큰을 버리고 1회 자동 재발급한다(10분 안에 이미 발급했으면 하지 않고 ERROR 로그). 반복되면 옛 코드로 켜진 로컬 서버를 끈다 |
| DB 연결 실패 `ECIRCUITBREAKER` | 틀린 DB 비밀번호로 접속하는 서버가 있음 → 옛 `.env` 서버를 끄면 몇 분 뒤 자동 해제 |
| 슬롯·보고서가 비어 있음 | 로그 확인 후 [2. 데이터 갱신](#2-데이터-갱신)의 수동 갱신 |
| 보고서 이미지 없음 | Pollinations 잔액(402)·한글 폰트(`fonts-noto-cjk`) 확인 |
| 캘린더 값이 안 바뀜, 로그에 `FRED … 갱신 실패` | FRED가 간헐적으로 5xx·timeout을 준다. 3회 재시도하고, 모두 실패하면 마지막 값을 유지한 채 다음 주기에 다시 시도한다 |
| 코드가 반영 안 됨 | 자동 재시작이 없으므로 `sudo systemctl restart gaemigul` |

API 전체 목록과 요청·응답 형식은 서버의 `/docs`에서 확인한다.

## 4. 운영 규칙

- **백엔드 서버는 한 대만 켠다.** 같은 DB를 보는 서버가 둘이면 수집이 중복되고 Gemini 호출이 2배가 된다.
  로컬 백엔드를 켜면 안 되는 시간은 다음과 같다.
  - 평일 슬롯 시각 여덟 번의 앞뒤 5~15분
  - 보고서 시각인 19시 55분부터 20시 40분까지
- 로컬 실행은 **최신 `dev` + 팀이 공유한 최신 `.env`** 로만 한다. KIS 토큰은 DB `kis_token` 표로 공유하며(`core/kis_token_store.py`), 옛 코드는 토큰을 따로 발급해 운영 서버 토큰을 무효로 만든다.
- KIS 토큰은 계좌 단위라 `kis_client.get_access_token()`만 쓴다. 따로 발급하면 계좌 주인에게 알림이 간다.
- `.env`, `backend/.cache/`는 커밋하지 않는다. **운영 서버 주소·포트도 저장소에 적지 않는다**(공개 저장소이고, 서버는 http라 스캔 대상이 된다).
- **AI가 만든 문구는 참고용임을 화면에 안내한다.** 브리핑·해설·보고서는 Gemini가 생성하므로, 콘텐츠와 푸터에 AI 생성 안내를 노출한다. 문구를 사람이 매일 검수하지는 않는다.
- 작업 흐름: 기능 브랜치 push → 확인 후 `dev` 병합 → 운영 서버 `git pull` + 재시작 → **필요하면 프런트엔드 재배포**.
- 백엔드와 프런트엔드는 따로 배포된다. 한쪽만 올리면 화면과 API가 어긋나므로, 기능 하나를 마치면 **양쪽이 모두 최신인지 확인한다.**
