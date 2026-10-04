# main.py
# FastAPI 앱 진입점. 로그 설정, 스케줄러, CORS, 라우터 등록.
# 예약 작업 (한국 시간)
#   indicator_bar          지표 바              10분마다
#   market_vix             VIX                  매시 00·30분
#   market_session         투자자 수급·시장심리  평일 09:05·09:30~15:00 30분마다 + 15:35 (장 마감 반영)
#   market_exchange_rate   원/달러 환율 차트     매시 00·30분 (서버 시작 직후 1회)
#   market_trading_value   시간대별 거래대금      평일 15:34:30
#   slot_0730 ~ slot_2000  타임라인 슬롯 8개      timeline_service.SLOT_COLLECT_TIMES
#   timeline_reports       일간·주간 보고서       매일 20:10 (휴장일 판단은 작업 안에서, 주간은 일간 직후)
#   heatmap                히트맵                 매분 30초 확인, 정규장 10분 간격 갱신 (HEATMAP_ENABLED)
#   calendar_fomc          FOMC 일정             매시 05·35분 (다른 작업과 겹치는 00·30분을 피함, 서버 시작 직후 1회)
#   calendar_fred          미국 경제지표(FRED)    6시간마다 (서버 시작 직후 1회)
#   calendar_dart          주요 기업 잠정실적      매일 00:10 (서버 시작 직후 1회)
#   calendar_us_option_expiry  미국 지수선물·옵션 만기(2026 정적 표)  매일 00:20 (서버 시작 직후 1회)
# KIS 키가 없으면 전부 등록하지 않는다. 시작 직후 1회 실행은 next_run_time으로 한다 (서버 시작을 막지 않도록)

import logging
from contextlib import asynccontextmanager
from datetime import datetime
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.combining import OrTrigger
from apscheduler.triggers.cron import CronTrigger
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.core.config import get_settings
from backend.core.logging_config import setup_logging
from backend.domain.attendance.routers.attendance import router as attendance_router
from backend.domain.auth.routers.auth import router as auth_router
from backend.domain.auth.services import newsletter_service
from backend.domain.calendar.routers.calendar import router as calendar_router
from backend.domain.glossary.routers.glossary_term import router as glossary_router
from backend.domain.calendar.services import calendar as calendar_service
from backend.domain.heatmap.routers.heatmap import router as heatmap_router
from backend.domain.heatmap.services import heatmap
from backend.domain.market.routers.market import router as market_router
from backend.domain.market.services import exchange_rate_service, investor_flow_service, sentiment_service, trading_value_service, vix_service
from backend.domain.timeline.routers.timeline import router as timeline_router
from backend.domain.timeline.services import market_indicator_service, report_service, timeline_service

logger = logging.getLogger(__name__)
_KST = ZoneInfo("Asia/Seoul")

# 예약 작업 스케줄러 (한국 시간 기준)
# AsyncIOScheduler는 서버의 이벤트 루프에서 돌아 async 함수를 실행할 수 있다. 서버가 떠 있을 때만 동작한다
# misfire_grace_time: 예약 시각보다 이 초만큼 늦어도 실행한다. 늘리면 맥이 잠들었다 깬 뒤에도
#   지난 슬롯이 실행되는데, 그러면 그 시각이 아닌 값이 저장되므로 짧게 둔다
_scheduler: AsyncIOScheduler | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _scheduler
    # 로그 설정을 가장 먼저 한다 (작업 등록 중 경고도 파일에 남도록)
    setup_logging()

    # async 작업은 이벤트 루프에서, 동기 수집은 executor에서 실행한다.
    # lifespan마다 새로 만들어 이전 실행의 닫힌 이벤트 루프를 재사용하지 않는다.
    _scheduler = AsyncIOScheduler(
        timezone=_KST,
        job_defaults={"misfire_grace_time": 10, "max_instances": 1, "coalesce": True},
    )
    heatmap.initialize()  # 외부 호출 없이 저장된 캐시만 복원한다.
    settings = get_settings()
    if settings.kis_app_key and settings.kis_app_secret:
        _register_indicator_job()
        _register_vix_job()
        _register_sentiment_job()
        _register_exchange_rate_job()
        _register_trading_value_job()
        _register_slot_jobs()
        _register_report_job()
        _register_heatmap_job()
    else:
        logger.warning("KIS 키가 없어 시세 수집을 시작하지 않습니다. 저장된 데이터와 API는 사용할 수 있습니다.")

    # 개미레터는 KIS 시세 수집과 무관하므로 KIS 키 여부와 별개로 등록한다 (DATABASE_URL만 있으면 된다)
    _register_newsletter_job()
    # 캘린더 재수집은 FRED·DART·Fed 사이트를 주로 써서 KIS 키와 따로 등록한다
    _register_calendar_jobs()

    jobs = _scheduler.get_jobs()
    if jobs:
        _scheduler.start()
        logger.info("스케줄러 시작 - 작업 %d개 (%s)", len(jobs), ", ".join(job.id for job in jobs))
    else:
        logger.warning("등록된 예약 작업이 없습니다. .env의 KIS 키와 DATABASE_URL을 확인해주세요.")

    try:
        yield
    finally:
        if _scheduler.running:
            _scheduler.shutdown(wait=False)
            logger.info("스케줄러 종료")


# 지표 바 갱신 작업 등록 (10분마다). minute 값을 바꾸면 주기가 바뀐다 (예: "0,30"이면 30분마다)
# 초기 수집도 스케줄러에서 실행해 KIS/DB 응답을 기다리며 서버 시작을 막지 않는다.
# 첫 수집에 실패해도 예약 작업은 남아 다음 주기에 재시도한다.
def _refresh_indicator_bar() -> None:
    market_indicator_service.refresh_all(force=not bool(market_indicator_service.get_cache_snapshot()))


def _register_indicator_job() -> None:
    _scheduler.add_job(
        _refresh_indicator_bar,
        CronTrigger(minute="0,10,20,30,40,50", timezone=_KST),
        id="indicator_bar",
        next_run_time=datetime.now(_KST),
    )


# VIX 갱신 작업 등록 (매시 00·30분). minute 값을 바꾸면 주기가 바뀐다
# 서버 시작 직후 한 번 채운다. 실패해도 다음 00·30분에 다시 시도한다 (그 전까지 GET /market/vix는 503)
def _register_vix_job() -> None:
    _scheduler.add_job(
        vix_service.refresh,
        CronTrigger(minute="0,30", timezone=_KST),
        id="market_vix",
        next_run_time=datetime.now(_KST),
        max_instances=1,
        coalesce=True,
    )


# 투자자 수급 -> 시장심리지수 순으로 갱신한다. 수급에서 받은 KIS 원본을 시장심리지수가 재사용한다 (KIS 2회 절약)
# 수급이 실패해도 시장심리지수는 자체 조회로 시도한다. 둘 다 실패하면 각자 기존 캐시를 유지한다
def _refresh_market_session() -> None:
    investor_raw = None
    try:
        investor_raw = investor_flow_service.refresh()
    except Exception as error:
        logger.warning("투자자 수급 갱신 실패 - %s: %s", type(error).__name__, error)

    try:
        sentiment_service.refresh(investor_raw)
    except Exception as error:
        logger.warning("개미굴 시장심리지수 갱신 실패 - %s: %s", type(error).__name__, error)


# 투자자 수급·시장심리지수 작업 등록 (평일 09:05·09:30~15:00 30분마다 + 15:35). 서버 시작 직후 한 번 채운다
# 첫 회차만 09:00이 아니라 09:05다. 09:00:00에는 거래소가 상승·하락 종목 수를 아직 채우지 않아 시장심리지수 계산이 실패한다
#   (2026-09-21 09:00:04 "코스피·코스닥 상승·하락 종목 수가 비어 있습니다" - 같은 날 09:30 회차는 정상)
# 마지막은 15:30이 아니라 15:35다. 15:30:00에는 종가 동시호가(15:20~15:30) 체결이 수급·등락률에 아직 안 들어가 있다
# 15:34:00(15:30 슬롯)·15:34:30(거래대금)과 KIS 호출이 겹치지 않게 15:35:00에 둔다. 15:35 값이 다음 날 09:05까지 유지된다
def _register_sentiment_job() -> None:
    _scheduler.add_job(
        _refresh_market_session,
        OrTrigger(
            [
                CronTrigger(day_of_week="mon-fri", hour=9, minute="5,30", timezone=_KST),
                CronTrigger(day_of_week="mon-fri", hour="10-14", minute="0,30", timezone=_KST),
                CronTrigger(day_of_week="mon-fri", hour=15, minute="0,35", timezone=_KST),
            ]
        ),
        id="market_session",
        next_run_time=datetime.now(_KST),
        max_instances=1,
        coalesce=True,
    )


# 원/달러 환율 작업 등록 (매시 00·30분, DB 적재). DATABASE_URL이 없으면 등록하지 않는다
# 첫 실행은 next_run_time으로 스케줄러 시작 직후에 한다 (async 작업이라 여기서 바로 부를 수 없다)
# 시작 직후 실행은 30분 칸 시각과 멀어 DB에 저장하지 않고 캐시만 채운다 (exchange_rate_service._SNAPSHOT_TOLERANCE)
def _register_exchange_rate_job() -> None:
    if not get_settings().database_url:
        logger.warning("원/달러 환율 차트 비활성화 - DATABASE_URL이 .env에 없습니다.")
        return

    _scheduler.add_job(
        exchange_rate_service.refresh,
        CronTrigger(minute="0,30", timezone=_KST),
        id="market_exchange_rate",
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(_KST),
    )


# 시간대별 거래대금 작업 등록 (평일 15:34:30). 서버 시작 직후 최근 완성 거래일로 한 번 채운다
# 15:30 봉이 생긴 뒤 오늘 분포로 바꾸는 시각이다. 같은 분(15:34:00)에 시작하는 15:30 슬롯과 KIS 호출이 겹치지 않게 30초 늦춘다
def _register_trading_value_job() -> None:
    _scheduler.add_job(
        trading_value_service.refresh,
        CronTrigger(day_of_week="mon-fri", hour=15, minute=34, second=30, timezone=_KST),
        id="market_trading_value",
        next_run_time=datetime.now(_KST),
        max_instances=1,
        coalesce=True,
    )


# 슬롯 수집 작업 등록 (하루 8회). 시각은 timeline_service.SLOT_COLLECT_TIMES에서 바꾼다
# DATABASE_URL이 없으면 등록하지 않는다. 휴장일 판단은 작업 안에서 한다
def _register_slot_jobs() -> None:
    if not get_settings().database_url:
        logger.warning("타임라인 슬롯 수집 비활성화 - DATABASE_URL이 .env에 없습니다.")
        return

    for slot_key, (hour, minute) in timeline_service.SLOT_COLLECT_TIMES.items():
        _scheduler.add_job(
            timeline_service.run_scheduled_collect,
            CronTrigger(hour=hour, minute=minute, timezone=_KST),
            args=[slot_key],
            id=f"slot_{slot_key}",
        )


# 보고서 작업 등록 (매일 20:10). 휴장일·주간 여부는 report_service.run_scheduled_reports가 판단한다
# 20:00 직후에는 KIS 투자자 수급·업종 거래대금이 아직 정산 중이라 10분 늦춘다. 값이 덜 정산되면 minute를 늦춘다
# 주간 보고서는 따로 등록하지 않는다 - 같은 작업이 일간을 만든 직후 그 주 마지막 거래일이면 이어서 만든다
def _register_report_job() -> None:
    if not get_settings().database_url:
        return

    _scheduler.add_job(
        report_service.run_scheduled_reports,
        CronTrigger(hour=20, minute=10, timezone=_KST),
        id="timeline_reports",
        max_instances=1,
        coalesce=True,
    )


# 개미레터(뉴스레터) - 매주 월요일 08:00에 그 주(월~금) 비축 캘린더 일정을 요약해 발송한다.
def _register_newsletter_job() -> None:
    if not get_settings().database_url:
        logger.warning("개미레터 비활성화 - DATABASE_URL이 .env에 없습니다.")
        return

    _scheduler.add_job(
        newsletter_service.run_scheduled_newsletter,
        CronTrigger(day_of_week="mon", hour=8, minute=0, timezone=_KST),
        id="newsletter",
        max_instances=1,
        coalesce=True,
    )


# 히트맵 작업 등록. HEATMAP_ENABLED가 false면 등록하지 않는다
def _register_heatmap_job() -> None:
    if not get_settings().heatmap_enabled:
        return
    # 시작 직후 및 매분 30초에 확인한다. 실제 시세 갱신은 서비스의 10분 구간 판정을 따른다.
    _scheduler.add_job(
        heatmap.refresh_all,
        CronTrigger(second=30, timezone=_KST),
        id="heatmap",
        next_run_time=datetime.now(_KST),
    )


# 캘린더 재수집 작업 (FOMC·FRED·DART). 발표 뒤 수치 정정(revision)을 따라가려고 주기적으로 다시 받아 upsert한다
# async 작업이라 서버와 같은 이벤트 루프에서 돈다 (다른 루프에서 돌면 DB 커넥션 풀이 깨진다). 실패하면 마지막 수집값을 유지한다
async def _refresh_fomc() -> None:
    try:
        await calendar_service.ingest_fomc_year(datetime.now(_KST).year)
    except Exception:
        logger.exception("FOMC 캘린더 갱신 실패: 마지막 수집값을 유지합니다.")


# FRED 경제지표. 지표 하나가 실패해도 나머지는 계속한다
_FRED_INDICATORS = ("CPI", "PPI", "GDP", "PAYEMS", "UNRATE", "PCE")


async def _refresh_fred_indicators() -> None:
    year = datetime.now(_KST).year
    for indicator in _FRED_INDICATORS:
        try:
            await calendar_service.ingest_year_from_fred(indicator, year)
        except Exception:
            logger.exception("FRED %s 갱신 실패: 마지막 수집값을 유지합니다.", indicator)


# DART 잠정실적 대상 기업. corp_code는 dart_client.get_corp_codes()로 실제 조회해 확인한 값
_DART_MAJOR_COMPANIES = (
    {"corp_code": "00126380", "corp_name": "삼성전자", "stock_code": "005930"},
    {"corp_code": "00164779", "corp_name": "SK하이닉스", "stock_code": "000660"},
    {"corp_code": "00164742", "corp_name": "현대차", "stock_code": "005380"},
)


async def _refresh_dart_earnings() -> None:
    today = datetime.now(_KST)
    start_date = f"{today.year - 1}0101"
    end_date = today.strftime("%Y%m%d")
    for company in _DART_MAJOR_COMPANIES:
        try:
            await calendar_service.ingest_preliminary_earnings_from_dart(
                company["corp_code"], company["stock_code"], company["corp_name"], start_date, end_date
            )
        except Exception:
            logger.exception("DART %s 실적 갱신 실패: 마지막 수집값을 유지합니다.", company["corp_name"])


# 미국 지수선물·옵션 만기(2026, Cboe/CME 공식 캘린더로 검증한 정적 표 - calendar.py의
# _US_OPTION_EXPIRY_2026 참고). FOMC/FRED/DART와 달리 발표 후 수치가 바뀌는 데이터가 아니라
# 재수집해도 내용이 달라지지 않지만, 별도 seed 스크립트 대신 다른 캘린더 작업과 같은 자동
# 등록 패턴을 따라 서버 시작 시 한 번 upsert되도록 등록한다(idempotent라 반복 실행해도 안전).
async def _refresh_us_option_expiry() -> None:
    try:
        await calendar_service.ingest_us_option_expiry_year(2026)
    except Exception:
        logger.exception("미국 지수선물·옵션 만기 갱신 실패: 마지막 수집값을 유지합니다.")


# 캘린더 작업 등록. DATABASE_URL이 없으면 등록하지 않는다. 주기는 CronTrigger 값을 바꾼다
def _register_calendar_jobs() -> None:
    if not get_settings().database_url:
        logger.warning("캘린더 재수집 비활성화 - DATABASE_URL이 .env에 없습니다.")
        return

    for job_id, func, trigger in (
        # 매시 정각(:00)은 indicator_bar/market_vix/market_exchange_rate 등 다른 예약 작업의
        # KIS·외부 호출이 몰리는 시각이라 FRED가 간헐적으로 5xx를 준다(실측 확인). FOMC 일정은
        # 분 단위로 바뀌는 데이터가 아니므로 :05·:35로 5분 옮겨 그 충돌을 피한다.
        ("calendar_fomc", _refresh_fomc, CronTrigger(minute="5,35", timezone=_KST)),
        ("calendar_fred", _refresh_fred_indicators, CronTrigger(hour="*/6", minute=0, timezone=_KST)),  # 월간 지표라 하루 4번
        ("calendar_dart", _refresh_dart_earnings, CronTrigger(hour=0, minute=10, timezone=_KST)),  # 분기 실적이라 하루 1번
        ("calendar_us_option_expiry", _refresh_us_option_expiry, CronTrigger(hour=0, minute=20, timezone=_KST)),  # 정적 표, calendar_dart(00:10)와 안 겹치게 10분 뒤
    ):
        _scheduler.add_job(func, trigger, id=job_id, next_run_time=datetime.now(_KST))


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "https://gaemigul-app.vercel.app"],
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["*"],
    allow_credentials=True,
)


@app.get("/")
def read_root():
    return {"message": "hello world"}


app.include_router(timeline_router)
app.include_router(calendar_router)
app.include_router(heatmap_router)
app.include_router(market_router)
app.include_router(glossary_router)
app.include_router(auth_router)
app.include_router(attendance_router)
