"""KIS 시세를 업종별로 집계하고 마지막 성공 화면을 보관한다.

KIS 요청 양식/인증은 core.kis_client, 기간 계산/캐시는 이 서비스가 담당한다.
main.py의 백그라운드 작업이 매분 refresh_all()을 호출하면 실제 시세 요청은
정규장 10분 간격으로만 실행한다. GET 요청은 메모리 캐시만 읽는다.
"""

from __future__ import annotations

import json
import logging
import math
import threading
import time as clock
from datetime import UTC, date, datetime, time, timedelta
from itertools import zip_longest
from pathlib import Path
from zoneinfo import ZoneInfo

from backend.core import kis_client
from backend.core.config import get_settings
from backend.domain.heatmap.schemas.heatmap import (
    Coverage,
    HeatmapResponse,
    HeatmapSector,
    HeatmapStock,
    Market,
    Period,
    TopSector,
)
from backend.domain.heatmap.services.related_sectors import related_sectors

_LOGGER = logging.getLogger(__name__)
_KST = ZoneInfo("Asia/Seoul")
_MARKETS: tuple[Market, ...] = ("kospi", "kosdaq")
_PERIODS: tuple[Period, ...] = ("day", "week", "month")
_CACHE_DIR = Path(__file__).resolve().parents[5] / ".cache" / "heatmap"
_CACHE_PATH = _CACHE_DIR / "snapshot.json"
_CACHE_VERSION = 1
_HISTORY_DAYS = 70  # 전월 말 기준가까지 포함; 월간은 이번 달 누적이다.
_REFRESH_BUDGET_SECONDS = 45
_MAX_HISTORY_BATCH = 220
_lock = threading.RLock()
_refresh_lock = threading.Lock()
_initialized = False
_refreshing = False
_snapshots: dict[tuple[str, str], HeatmapResponse] = {}
_masters: dict[str, list[dict]] = {}
_master_dates: dict[str, str] = {}
_sector_names: dict[str, str] = {"unclassified": "기타·미분류"}
_sector_names_date: str | None = None
_histories: dict[str, dict[str, dict]] = {}
_history_checked: dict[str, str] = {}
_history_fetched_at: dict[str, str] = {}
_history_retry_at: dict[str, float] = {}
_calendar: dict[str, bool] = {}
_calendar_checked: str | None = None
_calendar_error: str | None = None
_quotes: dict[str, dict] = {}
_completed_slots: dict[str, str] = {}
_errors: dict[str, str] = {}


def _local_now(now: datetime | None = None) -> datetime:
    # 테스트용 naive datetime도 서버 OS 시간대와 무관하게 한국 시간으로 해석한다.
    if now is None:
        return datetime.now(_KST)
    return now.replace(tzinfo=_KST) if now.tzinfo is None else now.astimezone(_KST)


def _number(value, default: float = 0) -> float:
    try:
        result = float(str(value).replace(",", ""))
        return result if math.isfinite(result) else default
    except (TypeError, ValueError):
        return default


def _rows(raw: dict, key: str) -> list[dict]:
    # HTTP 200이어도 KIS 업무 오류(rt_cd)가 있으면 성공 데이터로 저장하지 않는다.
    if str(raw.get("rt_cd", "0")) != "0":
        raise ValueError("KIS 데이터 조회가 완료되지 않았습니다.")
    rows = raw.get(key, [])
    if not isinstance(rows, list):
        raise ValueError("KIS 응답 목록 형식이 올바르지 않습니다.")
    return rows


def initialize() -> None:
    """서버 시작 시 파일 캐시만 복원한다. 네트워크 요청 없이 즉시 끝난다."""
    global _initialized, _sector_names_date, _calendar_checked
    with _lock:
        if _initialized:
            return
        _initialized = True
        if not _CACHE_PATH.exists():
            return
        try:
            payload = json.loads(_CACHE_PATH.read_text(encoding="utf-8"))
            if payload.get("version") != _CACHE_VERSION:
                return
            for value in payload.get("snapshots", []):
                snapshot = HeatmapResponse.model_validate(value)
                _refresh_insights(snapshot)
                _snapshots[(snapshot.market, snapshot.period)] = snapshot
            _masters.update(payload.get("masters", {}))
            if payload.get("universe_version") == 2:
                _master_dates.update(payload.get("master_dates", {}))
            _sector_names.update(payload.get("sector_names", {}))
            _sector_names_date = payload.get("sector_names_date")
            _histories.update(payload.get("histories", {}))
            _history_checked.update(payload.get("history_checked", {}))
            _history_fetched_at.update(payload.get("history_fetched_at", {}))
            _quotes.update(payload.get("quotes", {}))
            _completed_slots.update(payload.get("completed_slots", {}))
            _calendar.update(payload.get("calendar", {}))
            _calendar_checked = payload.get("calendar_checked")
        except (OSError, ValueError, TypeError):
            _LOGGER.warning("히트맵 파일 캐시를 읽지 못해 새 데이터를 준비합니다.")


def _persist() -> None:
    # 임시 파일을 원자적으로 교체해 수집 도중 프로세스가 종료돼도 이전 캐시를 지킨다.
    try:
        with _lock:
            payload = {
                "version": _CACHE_VERSION,
                "universe_version": 2,
                "snapshots": [item.model_dump() for item in _snapshots.values()],
                "masters": _masters,
                "master_dates": _master_dates,
                "sector_names": _sector_names,
                "sector_names_date": _sector_names_date,
                "histories": _histories,
                "history_checked": _history_checked,
                "history_fetched_at": _history_fetched_at,
                "quotes": _quotes,
                "completed_slots": _completed_slots,
                "calendar": _calendar,
                "calendar_checked": _calendar_checked,
            }
            encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        _CACHE_DIR.mkdir(parents=True, exist_ok=True)
        temporary = _CACHE_PATH.with_suffix(".tmp")
        temporary.write_text(encoded, encoding="utf-8")
        temporary.replace(_CACHE_PATH)
    except OSError:
        _LOGGER.warning("히트맵 파일 캐시 저장에 실패했습니다. 메모리 데이터는 유지합니다.")


def _session_overrides() -> dict:
    return getattr(get_settings(), "heatmap_session_overrides", {})


def _session(day: date) -> tuple[bool | None, datetime, datetime]:
    overrides = _session_overrides().get(day.isoformat(), {})
    opens = time.fromisoformat(overrides.get("open", "09:00"))
    closes = time.fromisoformat(overrides.get("close", "15:30"))
    opened = _calendar.get(day.isoformat())
    if day.weekday() >= 5:
        opened = False
    if str(overrides.get("closed", "false")).lower() in {"true", "1", "yes"}:
        opened = False
    elif "open" in overrides or "close" in overrides:
        opened = True
    return opened, datetime.combine(day, opens, _KST), datetime.combine(day, closes, _KST)


def _market_status(now: datetime) -> str:
    opened, starts, closes = _session(now.date())
    if opened is None:
        return "unknown"
    if not opened:
        return "holiday"
    if now < starts:
        return "pre_open"
    if now < closes:
        return "open"
    return "closed"


def _next_update(now: datetime) -> str | None:
    opened, starts, closes = _session(now.date())
    if opened:
        first = starts + timedelta(seconds=30)
        final = closes + timedelta(seconds=30)
        if now < first:
            return first.isoformat()
        if now < final:
            elapsed = (now - first).total_seconds()
            candidate = first + timedelta(minutes=(int(elapsed // 600) + 1) * 10)
            return min(candidate, final).isoformat()
    for offset in range(1, 15):
        future = now.date() + timedelta(days=offset)
        future_open, starts, _ = _session(future)
        if future_open:
            return (starts + timedelta(seconds=30)).isoformat()
    return None


def _refresh_calendar(now: datetime) -> None:
    global _calendar_checked, _calendar_error
    today = now.date().isoformat()
    if _calendar_checked == today:
        return
    # 실패하더라도 같은 날 매분 원장 API를 재호출하지 않는다.
    _calendar_checked = today
    try:
        # 이전 거래일도 필요하므로 먼저 과거 기준으로 조회한다. 반환 범위가 짧으면
        # 오늘 기준 응답도 합친다. 휴장일을 단순한 평일로 추정해 수집하지 않는다.
        bases = [(now.date() - timedelta(days=7)).strftime("%Y%m%d"), now.strftime("%Y%m%d")]
        for base in bases:
            for row in _rows(kis_client.get_market_calendar(base), "output"):
                compact = str(row.get("bass_dt", ""))
                if len(compact) != 8 or row.get("opnd_yn") not in {"Y", "N"}:
                    continue
                day = datetime.strptime(compact, "%Y%m%d").date().isoformat()
                _calendar[day] = row["opnd_yn"] == "Y"
            if today in _calendar and any(day > today for day in _calendar):
                break
        if today not in _calendar:
            raise ValueError("오늘의 개장 여부를 확인하지 못했습니다.")
        _calendar_checked = today
        _calendar_error = None
    except Exception:
        _calendar_error = "거래일 정보를 확인하지 못했습니다. 마지막 수집 데이터를 표시합니다."
        _LOGGER.warning("히트맵 거래일 조회 실패; 기존 달력과 시세를 유지합니다.")


def _last_business_day(on_or_before: date) -> date | None:
    for offset in range(_HISTORY_DAYS):
        candidate = on_or_before - timedelta(days=offset)
        opened, _, _ = _session(candidate)
        if opened:
            return candidate
    return None


def _collection_target(now: datetime) -> tuple[date | None, str | None, bool]:
    """(시세 기준 거래일, 10분 수집 슬롯, 현재가 API 사용 여부)를 반환한다."""
    opened, starts, closes = _session(now.date())
    if opened is None:
        return None, None, False
    if opened and starts <= now < closes:
        elapsed = int((now - starts).total_seconds() // 600)
        slot = starts + timedelta(minutes=elapsed * 10)
        return now.date(), slot.isoformat(), True
    if opened and closes <= now < closes + timedelta(seconds=30):
        # 동시호가 결과가 반영되기 전의 값을 마감 확정값으로 저장하지 않는다.
        return now.date(), None, False
    if opened and now >= closes + timedelta(seconds=30):
        # 마감 수집이 늦어졌거나 장외에 서버를 켰다면 일봉 확정값으로 복원한다.
        return now.date(), f"{now.date().isoformat()}:close", now <= closes + timedelta(minutes=2)
    previous = _last_business_day(now.date() - timedelta(days=1))
    return previous, f"{previous.isoformat()}:close" if previous else None, False


def _load_universe(market: Market, now: datetime) -> None:
    global _sector_names_date
    today = now.date().isoformat()
    if _master_dates.get(market) != today:
        stocks = kis_client.get_stock_master(market)
        if not stocks:
            raise ValueError("종목 목록이 비어 있습니다.")
        # 중복 코드가 있으면 거래량이 두 번 합산되므로 코드당 한 행만 유지한다.
        active = []
        for stock in stocks:
            if _number(stock.get("market_cap")) <= 0 and _number(stock.get("reference_price")) <= 0:
                try:
                    raw = kis_client.get_stock_info(stock["code"])
                    if str(raw.get("rt_cd", "0")) != "0":
                        raise ValueError("주식기본조회 실패")
                    field = "scts_mket_lstg_abol_dt" if market == "kospi" else "kosdaq_mket_lstg_abol_dt"
                    abolished = str(raw.get("output", {}).get(field, "")).strip()
                    if len(abolished) == 8 and abolished != "00000000" and datetime.strptime(abolished, "%Y%m%d").date() <= now.date():
                        continue
                except Exception:
                    _LOGGER.warning("종목 %s 상장 상태 확인 실패; 확인 없이 대상에서 제외하지 않습니다.", stock["code"])
            active.append(stock)
        _masters[market] = list({str(stock["code"]): stock for stock in active}.values())
        _master_dates[market] = today
    if _sector_names_date != today:
        names = kis_client.get_sector_master()
        if names:
            _sector_names.update({str(key): value for key, value in names.items()})
            _sector_names_date = today


def _collect_quotes(market: Market, target: date, now: datetime) -> dict:
    stocks = _masters[market]
    quotes: dict[str, dict] = {}
    for index in range(0, len(stocks), 30):
        codes = [stock["code"] for stock in stocks[index : index + 30]]
        try:
            rows = _rows(kis_client.get_stock_quotes(codes), "output")
        except Exception:
            _LOGGER.warning("히트맵 %s 시세 묶음 조회 실패; 누락 데이터를 0으로 채우지 않습니다.", market)
            continue
        for row in rows:
            code = str(row.get("inter_shrn_iscd", "")).strip()
            price = _number(row.get("inter2_prpr"))
            raw_volume = row.get("acml_vol")
            if code not in codes or price <= 0 or raw_volume in (None, ""):
                continue
            quotes[code] = {
                "price": price,
                "previous_close": _number(row.get("inter2_prdy_clpr")),
                "volume": max(0, int(_number(raw_volume))),
            }
    for stock in stocks:
        code = stock["code"]
        if code not in quotes and stock.get("suspended") and _number(stock.get("reference_price")) > 0:
            # 마스터에서 거래정지로 확인된 종목만 기준가·거래량 0을 사용할 수 있다.
            reference = _number(stock["reference_price"])
            quotes[code] = {"price": reference, "previous_close": reference, "volume": 0}
    # 종목은 순차 수집하므로 조회 완료 시각을 표시한다.
    finished = max(now, datetime.now(_KST)) if now.date() == datetime.now(_KST).date() else now
    return {"date": target.isoformat(), "updated_at": finished.astimezone(UTC).isoformat(), "rows": quotes, "source": "live"}


def _history_bounds(now: datetime) -> tuple[str, str]:
    _, _, closes = _session(now.date())
    # 정규장 마감 시세를 확보했다면 오늘 거래량은 그 스냅샷으로 고정한다.
    # 장외에 뒤늦게 시작했을 때만 당일 일봉을 불러오며 시간외 거래가 포함될 수 있다.
    close_slot = f"{now.date().isoformat()}:close"
    has_final = all(_quotes.get(market, {}).get("slot") == close_slot and len(_quotes[market]["rows"]) == len(_masters.get(market, [])) for market in _MARKETS)
    end = now.date() if now >= closes + timedelta(seconds=30) and not has_final else now.date() - timedelta(days=1)
    return (end - timedelta(days=_HISTORY_DAYS)).strftime("%Y%m%d"), end.strftime("%Y%m%d")


def _history_key(now: datetime) -> str:
    return f"{now.date().isoformat()}:{_history_bounds(now)[1]}"


def _warm_histories(now: datetime, deadline: float) -> bool:
    generation = _history_key(now)
    start, end = _history_bounds(now)
    retry_now = clock.monotonic()
    pending = [[stock for stock in _masters.get(market, []) if _history_checked.get(stock["code"]) != generation and _history_retry_at.get(stock["code"], 0) <= retry_now] for market in _MARKETS]
    # 두 시장을 번갈아 준비해 한 시장의 주·월간 데이터만 오래 기다리지 않게 한다.
    candidates = [stock for pair in zip_longest(*pending) for stock in pair if stock is not None]
    changed = False
    for stock in candidates[:_MAX_HISTORY_BATCH]:
        if clock.monotonic() >= deadline:
            break
        code = stock["code"]
        try:
            raw = kis_client.get_stock_history(code, start, end)
            rows = _rows(raw, "output2")
            history = {}
            for row in rows:
                compact = str(row.get("stck_bsop_date", ""))
                close = _number(row.get("stck_clpr"))
                if len(compact) != 8 or close <= 0 or row.get("acml_vol") in (None, ""):
                    continue
                day = datetime.strptime(compact, "%Y%m%d").date().isoformat()
                if compact <= end:
                    history[day] = {"close": close, "volume": max(0, int(_number(row["acml_vol"])))}
            # 비어 있는 일봉을 거래량 0인 정상 종목으로 취급하지 않는다.
            if not history and not stock.get("suspended"):
                raise ValueError("일봉 데이터가 비어 있습니다.")
            _histories[code] = history
            _history_checked[code] = generation
            _history_fetched_at[code] = now.astimezone(UTC).isoformat()
            # 기간시세 output1의 상장주수는 마스터(천주)보다 정확한 주 단위다.
            exact_shares = _number(raw.get("output1", {}).get("lstn_stcn"))
            if exact_shares > 0:
                stock["listed_shares"] = exact_shares
            _history_retry_at.pop(code, None)
            changed = True
        except Exception:
            # 실패한 앞쪽 종목이 나머지 전체 종목의 초기 수집을 막지 않도록 뒤로 미룬다.
            _history_retry_at[code] = clock.monotonic() + 5 * 60
            _LOGGER.warning("히트맵 종목 %s 기간 데이터 조회 실패; 다음 작업에서 재시도합니다.", code)
    return changed


def _historical_quotes(market: Market, target: date, now: datetime) -> dict:
    rows = {}
    day = target.isoformat()
    for stock in _masters[market]:
        code = stock["code"]
        if _history_checked.get(code) != _history_key(now):
            continue
        history = _histories.get(code, {})
        available = sorted(key for key in history if key <= day)
        current = history.get(day)
        if current is None and stock.get("suspended"):
            price = history[available[-1]]["close"] if available else _number(stock.get("reference_price"))
            current = {"close": price, "volume": 0}
        if current is None or current["close"] <= 0:
            continue
        previous_dates = [key for key in available if key < day]
        previous_close = history[previous_dates[-1]]["close"] if previous_dates else 0
        rows[code] = {"price": current["close"], "volume": current["volume"], "previous_close": previous_close}
    timestamps = [_history_fetched_at[code] for code in rows if code in _history_fetched_at]
    return {"date": day, "updated_at": max(timestamps) if timestamps else None, "rows": rows, "source": "history"}


def _period_start(day: date, period: Period) -> date:
    if period == "week":
        return day - timedelta(days=day.weekday())
    if period == "month":
        return day.replace(day=1)
    return day


def _weighted_change(stocks: list[HeatmapStock]) -> float | None:
    # 개별 등락률은 시가총액 가중 평균으로 업종 색상에 사용한다.
    # 기준가가 없는 신규 상장 종목은 수익률 평균에서만 제외한다.
    available = [stock for stock in stocks if stock.change_rate is not None and math.isfinite(stock.change_rate) and math.isfinite(stock.market_cap) and stock.market_cap > 0]
    weight = sum(stock.market_cap for stock in available)
    return sum(stock.change_rate * stock.market_cap for stock in available) / weight if weight else None


def _refresh_insights(result: HeatmapResponse) -> None:
    """이전 거래량 1위 캐시도 현재 정책으로 재계산한다. 네트워크 요청은 없다."""
    result.top_sector = None
    result.related_sectors = []
    for sector in result.sectors:
        sector.change_rate = _weighted_change(sector.stocks)
    coverage = result.coverage
    if not result.sectors or coverage.total_stocks <= 0 or coverage.missing_stocks or coverage.priced_stocks != coverage.total_stocks:
        return
    if any(sector.change_rate is None or not math.isfinite(sector.change_rate) for sector in result.sectors):
        return
    # 모두 하락한 날에도 가장 높은 등락률을 고른다. 동률은 시가총액, 업종 코드 순이다.
    winner = min(result.sectors, key=lambda sector: (-sector.change_rate, -sector.market_cap, sector.code))
    total_volume = sum(sector.volume for sector in result.sectors)
    result.top_sector = TopSector(code=winner.code, name=winner.name, volume=winner.volume, volume_share=winner.volume / total_volume * 100 if total_volume else 0, change_rate=winner.change_rate)
    result.related_sectors = related_sectors(result.sectors, winner)


def _build_snapshot(market: Market, period: Period, samples: dict, now: datetime) -> HeatmapResponse:
    day = date.fromisoformat(samples["date"])
    start = _period_start(day, period).isoformat()
    grouped: dict[str, list[HeatmapStock]] = {}
    for master in _masters[market]:
        code = master["code"]
        quote = samples["rows"].get(code)
        if quote is None:
            continue
        history = _histories.get(code, {})
        if period != "day" and _history_checked.get(code) != _history_key(now):
            continue
        previous = quote["previous_close"]
        volume = quote["volume"]
        if period != "day":
            baseline_dates = [record for record in history if record < start]
            previous = history[max(baseline_dates)]["close"] if baseline_dates else 0
            # 현재 거래일은 현재가 API의 장 시작 이후 누적값을 한 번만 더한다.
            # 일봉 응답에 같은 날짜가 있어도 포함하지 않아 이중 합산을 막는다.
            volume += sum(record["volume"] for record_day, record in history.items() if start <= record_day < samples["date"])
        price = quote["price"]
        shares = _number(master.get("listed_shares"))
        market_cap = price * shares if shares > 0 else _number(master.get("market_cap"))
        change_rate = ((price / previous) - 1) * 100 if previous > 0 else None
        sector = str(master.get("sector_code") or "unclassified")
        grouped.setdefault(sector, []).append(HeatmapStock(code=code, name=master["name"], price=price, market_cap=market_cap, change_rate=change_rate, volume=volume))
    sectors = []
    for code, stocks in grouped.items():
        stocks.sort(key=lambda stock: (-stock.market_cap, stock.code))
        sectors.append(HeatmapSector(code=code, name=_sector_names.get(code, f"업종 {code}"), market_cap=sum(stock.market_cap for stock in stocks), volume=sum(stock.volume for stock in stocks), change_rate=_weighted_change(stocks), stocks=stocks))
    sectors.sort(key=lambda sector: (-sector.market_cap, sector.code))
    priced = sum(len(sector.stocks) for sector in sectors)
    total = len(_masters[market])
    coverage = Coverage(total_stocks=total, priced_stocks=priced, missing_stocks=total - priced)
    message = None
    if coverage.missing_stocks:
        message = f"{total:,}개 종목 중 {priced:,}개를 준비했습니다. 전체 데이터 확인 후 상승률 1위를 표시합니다."
    elif any(sector.change_rate is None for sector in sectors):
        message = "등락률을 계산할 수 없는 업종이 있어 상승률 1위를 아직 표시하지 않습니다."
    elif samples.get("source") == "history":
        message = "장외 초기 수집은 KIS 일봉 기준입니다. 거래량에 시간외 거래가 포함될 수 있습니다."
    result = HeatmapResponse(market=market, period=period, updated_at=samples["updated_at"], as_of_date=samples["date"], coverage=coverage, sectors=sectors, is_stale=coverage.missing_stocks > 0, message=message)
    _refresh_insights(result)
    return result


def _publish(market: Market, periods: tuple[Period, ...], samples: dict, now: datetime) -> None:
    for period in periods:
        result = _build_snapshot(market, period, samples, now)
        with _lock:
            previous = _snapshots.get((market, period))
            if result.coverage.missing_stocks and previous and previous.sectors and previous.coverage.missing_stocks == 0:
                # 실패한 일부 종목만 새 값으로 섞으면 순위가 뒤집힐 수 있다.
                # 이전 전체 스냅샷을 유지하고 조회 시 지연 사실을 표시한다.
                _snapshots[(market, period)] = previous.model_copy(update={"is_stale": True, "message": "일부 종목을 확인하지 못해 마지막 전체 수집 데이터를 표시합니다."})
            else:
                _snapshots[(market, period)] = result


def refresh_all(now: datetime | None = None, *, force: bool = False) -> None:
    """매분 호출하되 시세는 10분마다, 기간 이력은 거래일당 한 번 준비한다.

    force는 서버 시작 시 장외 캐시 복원에도 사용한다. 프론트 요청에서는 호출하지 않는다.
    스케줄러가 겹치면 기존 수집을 그대로 두고 중복 작업은 건너뛴다.
    """
    global _refreshing
    if not getattr(get_settings(), "heatmap_enabled", True) or not _refresh_lock.acquire(blocking=False):
        return
    initialize()
    local = _local_now(now)
    deadline = clock.monotonic() + _REFRESH_BUDGET_SECONDS
    try:
        with _lock:
            _refreshing = True
        calendar_before = _calendar_checked
        _refresh_calendar(local)
        target, slot, use_live = _collection_target(local)
        if target is None or slot is None:
            _persist()
            return
        if not use_live and all(
            _completed_slots.get(market) == slot and all(
                (snapshot := _snapshots.get((market, period))) is not None
                and snapshot.as_of_date == target.isoformat()
                and snapshot.coverage.missing_stocks == 0
                and bool(snapshot.sectors)
                for period in _PERIODS
            )
            for market in _MARKETS
        ):
            # 정규장 종료 이후 같은 스냅샷의 시각을 새로 찍거나 KIS를 계속 조회하지 않는다.
            if calendar_before != _calendar_checked:
                _persist()
            return
        # 휴장·장외에는 초기 복원/진행 중인 이력 준비/마감 미수집만 수행한다.
        for market in _MARKETS:
            try:
                _load_universe(market, local)
                if use_live and (force or _completed_slots.get(market) != slot):
                    samples = _collect_quotes(market, target, local)
                    samples["slot"] = slot
                    _quotes[market] = samples
                    _publish(market, ("day",), samples, local)
                    if len(samples["rows"]) == len(_masters[market]):
                        _completed_slots[market] = slot
                        _errors.pop(market, None)
                    else:
                        _errors[market] = "일부 종목 시세를 확인하지 못했습니다. 다음 수집에서 다시 확인합니다."
            except Exception:
                _errors[market] = "시세를 갱신하지 못했습니다. 마지막 수집 데이터를 표시합니다."
                _LOGGER.warning("히트맵 %s 수집 실패; 마지막 스냅샷을 유지합니다.", market)
        _warm_histories(local, deadline)
        for market in _MARKETS:
            if market not in _masters:
                continue
            if use_live:
                samples = _quotes.get(market)
                if samples and samples["date"] == target.isoformat():
                    _publish(market, ("week", "month"), samples, local)
            else:
                final = _quotes.get(market)
                if final and final.get("slot") == slot and len(final["rows"]) == len(_masters[market]):
                    samples = final
                else:
                    samples = _historical_quotes(market, target, local)
                _publish(market, _PERIODS, samples, local)
                if len(samples["rows"]) == len(_masters[market]):
                    _completed_slots[market] = slot
                    _errors.pop(market, None)
        _persist()
    except Exception:
        # 한 백그라운드 작업의 실패가 FastAPI 또는 다음 예약 작업을 중단하지 않는다.
        _LOGGER.exception("히트맵 백그라운드 갱신을 완료하지 못했습니다.")
    finally:
        with _lock:
            _refreshing = False
        _refresh_lock.release()


def get_heatmap(market: Market = "kospi", period: Period = "day", now: datetime | None = None) -> HeatmapResponse:
    """메모리만 읽는 조회. updated_at은 응답 생성 시각이 아닌 시세 수집 시각이다."""
    local = _local_now(now)
    with _lock:
        result = _snapshots.get((market, period), HeatmapResponse(market=market, period=period)).model_copy(deep=True)
        _refresh_insights(result)
        if result.message and "거래량 1위" in result.message:
            result.message = result.message.replace("거래량 1위", "상승률 1위")
        result.market_status = _market_status(local)
        result.next_update_at = _next_update(local)
        result.is_refreshing = _refreshing
        if not result.sectors or result.coverage.missing_stocks:
            # 서버의 초기 이력 수집은 매분 진행한다. 다음 개장까지 화면 갱신을 미루지 않는다.
            result.next_update_at = (local + timedelta(minutes=1)).isoformat()
        target, slot, _ = _collection_target(local)
        stale = result.is_stale or not result.sectors or target is None or result.as_of_date != target.isoformat()
        if result.updated_at and result.market_status == "open":
            updated = datetime.fromisoformat(result.updated_at)
            stale = stale or (local - updated).total_seconds() >= 11 * 60
        if slot and slot.endswith(":close") and result.updated_at and target == local.date():
            _, _, closes = _session(local.date())
            stale = stale or datetime.fromisoformat(result.updated_at) < closes
        result.is_stale = bool(stale or _calendar_error or market in _errors)
        if _calendar_error:
            result.message = _calendar_error
        elif market in _errors:
            result.message = _errors[market]
        elif not result.sectors:
            result.message = "히트맵 데이터를 준비하고 있습니다. 잠시 후 다시 확인해 주세요."
        elif result.is_stale and not result.message:
            result.message = "마지막 수집 데이터를 표시합니다. 갱신 시각을 확인해 주세요."
        return result
