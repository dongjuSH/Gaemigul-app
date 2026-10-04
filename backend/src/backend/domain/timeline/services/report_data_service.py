# report_data_service.py
# 일간·주간 보고서의 수치(카드·차트에 들어가는 숫자)를 KIS에서 모은다. LLM 문구·이미지는 report_service가 만든다.
#   collect_daily_data            일간 수치 수집 (동기 - KIS 호출이 동기라서. async 코드에서는 asyncio.to_thread로 부른다)
#   collect_and_save_daily        일간 수치를 수집해 report_repository에 저장 (업종 등락 분포도 같이 돌려준다 - LLM 재료)
#   collect_weekly_data           주간 수치 수집 (동기)
#   collect_weekly_top_sector     주간 등락률 1위 업종의 섹터 카드 + 업종 등락 분포 (동기)
#
# 일간·주간은 같은 항목을 기간만 바꿔 만든다
#   투자자 순매수   그날 값 / 그 주 거래일 합           (KIS 투자자 일별 기록)
#   외국인 뱃지     일 단위 비교 / 주 단위 비교
#   VKOSPI         그날 종가·전일 대비 / 주 마지막 거래일 종가·전주 대비
#   분기 차트       보고서 종료일 기준 현 분기 + 직전 5개
#   섹터 카드       코스피 21개 업종 중 그날 종가 기준 등락률 1위 / 그 주 등락률 1위
#
# 항목마다 따로 실패를 처리한다. 한 항목이 실패하면 경고 로그만 남기고 그 키를 결과에서 뺀다
#   (report_repository.save_report_data는 없는 키의 기존 값을 유지한다)
# 금액 단위는 전부 백만원 (KIS 응답 그대로)

import asyncio
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from backend.core import kis_client
from backend.domain.timeline.models.report import TimelineReport
from backend.domain.timeline.services import leading_sector_service, report_repository

_KST = ZoneInfo("Asia/Seoul")

logger = logging.getLogger(__name__)

# VKOSPI 업종코드
_VKOSPI_CODE = "0503"

# 원달러 환율 심볼 (해외 기간별 시세)
_FX_SYMBOL = "FX@KRW"

# 차트에 넣는 분기 수 (현 분기 포함). 바꾸면 차트 막대 수가 바뀐다
_QUARTER_COUNT = 6

# 투자자 매매동향을 과거로 거슬러 받을 최대 호출 수 (1회 300거래일 = 약 14개월). 분기 6개면 2회로 충분하다
_INVESTOR_MAX_CALLS = 3

# 외국인 뱃지를 "OO 이후 최대"로 바꾸는 기준. 오늘보다 크게 판(산) 날이 이 거래일 수(주간은 주 수) 이상 전이어야 한다
# 줄이면 "최대" 뱃지가 자주 나오고, 늘리면 드물게 나온다 (나머지 날은 연속·전환 뱃지)
_BADGE_MAX_DAYS = 20
_BADGE_MAX_WEEKS = 4

# 업종명 -> 업종코드 (leading_sector_service.KOSPI_SECTOR_CODES를 뒤집는다. 업종 표는 그쪽에서 고친다)
_SECTOR_NAME_TO_CODE = {name: code for code, name in leading_sector_service.KOSPI_SECTOR_CODES.items()}


# "20260911" 형태로
def _ymd(day: date) -> str:
    return day.strftime("%Y%m%d")


# "20260911" -> date
def _parse_ymd(value: str) -> date:
    return datetime.strptime(value, "%Y%m%d").date()


# 분기 (연도, 1~4)
def _quarter_of(day: date) -> tuple[int, int]:
    return day.year, (day.month - 1) // 3 + 1


# 보고서 날짜의 분기 + 직전 분기들 (오래된 분기부터 _QUARTER_COUNT개). 날짜로 계산하므로 분기가 바뀌면 자동으로 밀린다
def _quarter_window(day: date) -> list[tuple[int, int]]:
    year, quarter = _quarter_of(day)
    index = year * 4 + (quarter - 1)
    return [(i // 4, i % 4 + 1) for i in range(index - _QUARTER_COUNT + 1, index + 1)]


# 분기 첫날
def _quarter_start(year: int, quarter: int) -> date:
    return date(year, 3 * (quarter - 1) + 1, 1)


# 차트 라벨 (예: "26/Q3")
def _quarter_label(year: int, quarter: int) -> str:
    return f"{year % 100:02d}/Q{quarter}"


# 투자자 매매동향 행을 earliest 날짜까지 거슬러 모은다 (최신부터, 날짜 중복 없음)
# 한 번에 300거래일이 오므로 가장 오래된 행의 전날로 기준일을 옮겨 다시 부른다
def _investor_rows(day: date, earliest: date) -> list[dict]:
    rows: list[dict] = []
    base = day
    for _ in range(_INVESTOR_MAX_CALLS):
        output = kis_client.get_investor_daily_by_market(_ymd(base)).get("output") or []
        new_rows = [row for row in output if row.get("stck_bsop_date") and _parse_ymd(row["stck_bsop_date"]) <= base]
        if not new_rows:
            break
        rows.extend(new_rows)
        oldest = min(_parse_ymd(row["stck_bsop_date"]) for row in new_rows)
        if oldest <= earliest:
            break
        base = oldest - timedelta(days=1)
    return rows


# 그날 코스피 투자자별 순매수 {"foreign_net_buy", "institution_net_buy", "individual_net_buy"}. 그날 행이 없으면 None
def _daily_investor(rows: list[dict], day: date) -> dict | None:
    for row in rows:
        if row.get("stck_bsop_date") == _ymd(day):
            return {
                "foreign_net_buy": int(row["frgn_ntby_tr_pbmn"]),
                "institution_net_buy": int(row["orgn_ntby_tr_pbmn"]),
                "individual_net_buy": int(row["prsn_ntby_tr_pbmn"]),
            }
    return None


# 투자자 행 -> [(날짜, 외국인 순매수)] 날짜 중복 없이 최신부터, day 이하만
def _foreign_series(rows: list[dict], day: date) -> list[tuple[date, int]]:
    by_date: dict[date, int] = {}
    for row in rows:
        if row.get("stck_bsop_date") and row.get("frgn_ntby_tr_pbmn") not in (None, ""):
            by_date[_parse_ymd(row["stck_bsop_date"])] = int(row["frgn_ntby_tr_pbmn"])
    return sorted(((d, v) for d, v in by_date.items() if d <= day), reverse=True)


# 외국인 순매수 흐름 뱃지. series는 최신부터 [(기간 키, 순매수)], 첫 값이 이번 기간이다. 순매수 0이면 None
#   1) 같은 방향으로 이번보다 컸던 기간이 max_gap 이상 전이면 -> 일간 "8/25 이후 최대 순매도" / 주간 "5주 만에 최대 주간 순매도"
#      받은 기록 전체에 없으면 -> "600거래일 중 최대 순매도" / "130주 중 최대 주간 순매도"
#      (같은 방향 기간이 max_gap보다 적으면 비교 대상이 부족하므로 "최대"를 쓰지 않는다 - 막 전환한 날이 "최대"로 나오는 것을 막는다)
#   2) 아니면 같은 방향이 이어진 기간 수 -> "4거래일 연속 순매도" / "3주 연속 순매도", 1이면 "순매도 전환"
#   unit: "거래일" / "주", max_gap: 1)로 바꾸는 기준(_BADGE_MAX_DAYS / _BADGE_MAX_WEEKS)
def _flow_badge(series: list[tuple[date, int]], unit: str, max_gap: int, weekly: bool) -> str | None:
    if not series or series[0][1] == 0:
        return None
    value = series[0][1]
    side = "순매도" if value < 0 else "순매수"
    prefix = "주간 " if weekly else ""

    bigger = next((i for i, (_, past) in enumerate(series[1:], start=1) if (past < 0) == (value < 0) and abs(past) >= abs(value)), None)
    same_side = sum(1 for _, past in series[1:] if past != 0 and (past < 0) == (value < 0))
    if bigger is None and same_side >= max_gap:
        return f"{len(series)}{unit} 중 최대 {prefix}{side}"
    if bigger is not None and bigger >= max_gap:
        return f"{bigger}주 만에 최대 {prefix}{side}" if weekly else f"{series[bigger][0].month}/{series[bigger][0].day} 이후 최대 {side}"

    streak = 1
    for _, past in series[1:]:
        if past == 0 or (past < 0) != (value < 0):
            break
        streak += 1
    if streak == 1 and len(series) > 1:
        return f"{side} 전환"
    return f"{streak}{unit} 연속 {side}"


# 그날 VKOSPI 종가·전일 대비 등락률 {"vkospi", "vkospi_change_rate"}. 그날 행이 없으면 None
def _daily_vkospi(day: date) -> dict | None:
    output2 = kis_client.get_index_daily_price(_VKOSPI_CODE, _ymd(day), "D").get("output2") or []
    for row in output2:
        if row.get("stck_bsop_date") == _ymd(day):
            return {"vkospi": float(row["bstp_nmix_prpr"]), "vkospi_change_rate": float(row["bstp_nmix_prdy_ctrt"])}
    return None


# 분기 차트 6행 [{"label", "usd_krw", "foreign_net_buy", "is_current"}] (오래된 분기부터)
#   외국인: 분기 안 거래일 순매수 합 (현 분기는 보고서 날짜까지). 그 분기 행이 하나도 없으면 None
#   환율: 지난 분기는 분기 안 가장 늦은 달의 월간 종가, 현 분기는 보고서 날짜(없으면 그 전 가장 가까운 날)의 일별 값. 0 값은 버린다
#     월별 조회는 종료일이 최근 거래일보다 앞이면 이번 달 행을 주지 않아서(9/10로 조회하면 9월 행 없음) 현 분기는 일별로 받는다
def _quarters(day: date, investor_rows: list[dict]) -> list[dict]:
    window = _quarter_window(day)
    start = _quarter_start(*window[0])
    current = window[-1]

    fx_rows = kis_client.get_overseas_period_price("X", _FX_SYMBOL, _ymd(start), _ymd(day), "M").get("output2") or []
    fx_by_quarter: dict[tuple[int, int], tuple[date, float]] = {}
    for row in fx_rows:
        price = float(row.get("ovrs_nmix_prpr") or 0)
        if not row.get("stck_bsop_date") or price <= 0:
            continue
        month = _parse_ymd(row["stck_bsop_date"])
        key = _quarter_of(month)
        if key != current and (key not in fx_by_quarter or month > fx_by_quarter[key][0]):
            fx_by_quarter[key] = (month, price)

    daily_rows = kis_client.get_overseas_period_price("X", _FX_SYMBOL, _ymd(day - timedelta(days=14)), _ymd(day), "D").get("output2") or []
    latest = max(
        ((_parse_ymd(row["stck_bsop_date"]), float(row["ovrs_nmix_prpr"])) for row in daily_rows if row.get("stck_bsop_date") and float(row.get("ovrs_nmix_prpr") or 0) > 0 and _parse_ymd(row["stck_bsop_date"]) <= day),
        default=None,
    )
    if latest is not None:
        fx_by_quarter[current] = latest

    foreign_by_quarter: dict[tuple[int, int], int] = {}
    seen_dates: set[str] = set()
    for row in investor_rows:
        ymd = row.get("stck_bsop_date")
        if not ymd or ymd in seen_dates:
            continue
        seen_dates.add(ymd)
        row_date = _parse_ymd(ymd)
        if row_date < start or row_date > day:
            continue
        key = _quarter_of(row_date)
        foreign_by_quarter[key] = foreign_by_quarter.get(key, 0) + int(row["frgn_ntby_tr_pbmn"])

    return [
        {
            "label": _quarter_label(*key),
            "usd_krw": fx_by_quarter[key][1] if key in fx_by_quarter else None,
            "foreign_net_buy": foreign_by_quarter.get(key),
            "is_current": key == current,
        }
        for key in window
    ]


# 업종 카드들의 등락 분포 {"상승", "하락", "보합", "전체"} (LLM 재료 - "홀로 상승" 같은 비교 표현을 확정 수치로 확인하게 한다)
def _sector_breadth(cards: list[dict]) -> dict:
    rates = [card["change_rate"] for card in cards if card["change_rate"] is not None]
    return {"상승": sum(rate > 0 for rate in rates), "하락": sum(rate < 0 for rate in rates), "보합": sum(rate == 0 for rate in rates), "전체": len(rates)}


# 섹터 카드 1개 {"sector_name", "change_rate", "rising_count", "total_count", "trade_amount", "prev_trade_amount"}
#   등락률·거래대금은 output2의 그날 행, 전일 거래대금은 그 바로 전 행에서 가져온다 (날짜 지정이 되므로 나중에도 정확)
#   상승·전체 종목 수는 output1에만 있고 output1은 항상 최근 거래일 값이다
#     -> output1 거래대금이 그날 행과 같을 때(= 최근 거래일이 그날)만 채우고, 아니면 None (경고는 1위 카드를 고른 뒤 한 번만 남긴다)
#   업종명이 업종 표에 없으면 경고를 남기고 이름만 있는 카드를 돌려준다
def _sector_card(name: str, day: date) -> dict:
    card = {"sector_name": name, "change_rate": None, "rising_count": None, "total_count": None, "trade_amount": None, "prev_trade_amount": None}

    code = _SECTOR_NAME_TO_CODE.get(name)
    if code is None:
        logger.warning("섹터 카드 - 업종 표에 없는 업종명이라 값을 비웁니다: %s", name)
        return card

    body = kis_client.get_index_daily_price(code, _ymd(day), "D")
    output1 = body.get("output1") or {}
    output2 = body.get("output2") or []

    index = next((i for i, row in enumerate(output2) if row.get("stck_bsop_date") == _ymd(day)), None)
    if index is None:
        logger.warning("섹터 카드 - %s %s 일자 행이 없습니다.", name, day)
        return card

    today_row = output2[index]
    card["change_rate"] = float(today_row["bstp_nmix_prdy_ctrt"])
    card["trade_amount"] = int(today_row["acml_tr_pbmn"])
    if index + 1 < len(output2):
        card["prev_trade_amount"] = int(output2[index + 1]["acml_tr_pbmn"])

    if output1.get("acml_tr_pbmn") == today_row.get("acml_tr_pbmn"):
        rising = int(output1["ascn_issu_cnt"])
        card["rising_count"] = rising
        card["total_count"] = rising + int(output1["down_issu_cnt"]) + int(output1["stnr_issu_cnt"])

    return card


# 일간 보고서 수치 수집 -> report_repository.save_report_data의 data 형식
#   + "sector_breadth" 코스피 21개 업종 등락 분포 (저장하지 않는 키 - save_report_data는 모르는 키를 무시한다)
#   day  보고서 날짜 (거래일). 섹터 카드의 상승 종목 수는 그날(다음 개장 전)에만 정확하다
# 실패한 항목은 키를 빼고 돌려준다
def collect_daily_data(day: date) -> dict:
    data: dict = {}
    window_start = _quarter_start(*_quarter_window(day)[0])

    investor_rows: list[dict] = []
    try:
        investor_rows = _investor_rows(day, window_start)
        investor = _daily_investor(investor_rows, day)
        if investor is None:
            logger.warning("일간 보고서 %s - 투자자 매매동향에 그날 행이 없습니다.", day)
        else:
            data.update(investor)
            data["foreign_badge"] = _flow_badge(_foreign_series(investor_rows, day), "거래일", _BADGE_MAX_DAYS, weekly=False)
    except Exception as error:
        logger.warning("일간 보고서 %s - 투자자 매매동향 조회 실패 - %s: %s", day, type(error).__name__, error)

    try:
        vkospi = _daily_vkospi(day)
        if vkospi is None:
            logger.warning("일간 보고서 %s - VKOSPI 그날 행이 없습니다.", day)
        else:
            data.update(vkospi)
    except Exception as error:
        logger.warning("일간 보고서 %s - VKOSPI 조회 실패 - %s: %s", day, type(error).__name__, error)

    # 투자자 행이 없으면 분기 외국인 합이 전부 비므로 차트를 저장하지 않는다 (기존 차트 유지)
    if investor_rows:
        try:
            data["quarters"] = _quarters(day, investor_rows)
        except Exception as error:
            logger.warning("일간 보고서 %s - 분기 차트 계산 실패 - %s: %s", day, type(error).__name__, error)

    # 섹터 카드 - 코스피 21개 업종 중 그날 종가 기준 등락률 1위 (업종마다 KIS 1회)
    cards = []
    for name in _SECTOR_NAME_TO_CODE:
        try:
            card = _sector_card(name, day)
        except Exception as error:
            logger.warning("일간 보고서 %s - 섹터 %s 조회 실패 - %s: %s", day, name, type(error).__name__, error)
            continue
        if card["change_rate"] is not None:
            cards.append(card)
    if cards:
        data["sector_breadth"] = _sector_breadth(cards)
        top = max(cards, key=lambda card: card["change_rate"])
        if top["rising_count"] is None:
            logger.warning("일간 보고서 %s - %s 상승 종목 수를 비웁니다 (최근 거래일이 그날이 아니다. 다음 개장 전까지만 받을 수 있다).", day, top["sector_name"])
        data["sectors"] = [top]
    else:
        logger.warning("일간 보고서 %s - 업종 등락률을 하나도 받지 못해 섹터 카드를 만들지 않습니다.", day)

    return data


# 일간 수치를 모아 저장하고 (저장된 보고서, 업종 등락 분포 또는 None)을 돌려준다. day를 비우면 오늘(한국 시간)
async def collect_and_save_daily(session: AsyncSession, day: date | None = None) -> tuple[TimelineReport, dict | None]:
    day = day or datetime.now(_KST).date()

    data = await asyncio.to_thread(collect_daily_data, day)
    report = await report_repository.save_report_data(session, report_repository.DAILY, day, day, data)
    return report, data.get("sector_breadth")


# 주간 VKOSPI 종가·전주 대비 등락률. 주별 행의 날짜는 그 주 월요일이다. 그 주 행이 없으면 None
def _weekly_vkospi(start_date: date, end_date: date) -> dict | None:
    monday = start_date - timedelta(days=start_date.weekday())
    output2 = kis_client.get_index_daily_price(_VKOSPI_CODE, _ymd(end_date), "W").get("output2") or []
    for row in output2:
        if row.get("stck_bsop_date") and monday <= _parse_ymd(row["stck_bsop_date"]) <= end_date:
            return {"vkospi": float(row["bstp_nmix_prpr"]), "vkospi_change_rate": float(row["bstp_nmix_prdy_ctrt"])}
    return None


# 주간 섹터 카드 1개. 주별 output2의 그 주 행(등락률·거래대금)과 바로 전 행(전주 거래대금)
# 상승·전체 종목 수는 업종 지수에 주간 값이 없어서 여기서는 None이다 (1위 업종만 _weekly_rising_counts로 채운다)
def _weekly_sector_card(name: str, start_date: date, end_date: date) -> dict:
    card = {"sector_name": name, "change_rate": None, "rising_count": None, "total_count": None, "trade_amount": None, "prev_trade_amount": None}

    code = _SECTOR_NAME_TO_CODE.get(name)
    if code is None:
        logger.warning("주간 섹터 카드 - 업종 표에 없는 업종명이라 값을 비웁니다: %s", name)
        return card

    monday = start_date - timedelta(days=start_date.weekday())
    output2 = kis_client.get_index_daily_price(code, _ymd(end_date), "W").get("output2") or []
    index = next((i for i, row in enumerate(output2) if row.get("stck_bsop_date") and monday <= _parse_ymd(row["stck_bsop_date"]) <= end_date), None)
    if index is None:
        logger.warning("주간 섹터 카드 - %s %s 주 행이 없습니다.", name, start_date)
        return card

    card["change_rate"] = float(output2[index]["bstp_nmix_prdy_ctrt"])
    card["trade_amount"] = int(output2[index]["acml_tr_pbmn"])
    if index + 1 < len(output2):
        card["prev_trade_amount"] = int(output2[index + 1]["acml_tr_pbmn"])
    return card


# 주간 보고서 수치 수집 -> save_report_data의 data 형식 (섹터 카드는 collect_weekly_top_sector가 따로 만든다)
# 투자자 순매수는 KIS 일별 기록에서 그 주(start_date~end_date) 거래일 값을 더한다 (외국인 주간 뱃지와 같은 원천)
# 차트 분기는 주 마지막 거래일 기준으로 다시 계산한다
def collect_weekly_data(start_date: date, end_date: date) -> dict:
    data: dict = {}

    try:
        vkospi = _weekly_vkospi(start_date, end_date)
        if vkospi is None:
            logger.warning("주간 보고서 %s - VKOSPI 주간 행이 없습니다.", start_date)
        else:
            data.update(vkospi)
    except Exception as error:
        logger.warning("주간 보고서 %s - VKOSPI 조회 실패 - %s: %s", start_date, type(error).__name__, error)

    investor_rows: list[dict] = []
    try:
        investor_rows = _investor_rows(end_date, _quarter_start(*_quarter_window(end_date)[0]))
        week_rows = {row["stck_bsop_date"]: row for row in investor_rows if row.get("stck_bsop_date") and start_date <= _parse_ymd(row["stck_bsop_date"]) <= end_date}
        if week_rows:
            data["foreign_net_buy"] = sum(int(row["frgn_ntby_tr_pbmn"]) for row in week_rows.values())
            data["institution_net_buy"] = sum(int(row["orgn_ntby_tr_pbmn"]) for row in week_rows.values())
            data["individual_net_buy"] = sum(int(row["prsn_ntby_tr_pbmn"]) for row in week_rows.values())
        else:
            logger.warning("주간 보고서 %s - 투자자 매매동향에 그 주 행이 없습니다.", start_date)
        if investor_rows:
            data["quarters"] = _quarters(end_date, investor_rows)
    except Exception as error:
        logger.warning("주간 보고서 %s - 투자자 매매동향·분기 차트 실패 - %s: %s", start_date, type(error).__name__, error)

    # 외국인 주간 뱃지 - 주 단위(월요일 기준) 합계로 비교한다. 이번 주는 end_date까지
    if investor_rows:
        try:
            weeks: dict[date, int] = {}
            for row_date, value in _foreign_series(investor_rows, end_date):
                monday = row_date - timedelta(days=row_date.weekday())
                weeks[monday] = weeks.get(monday, 0) + value
            data["foreign_badge"] = _flow_badge(sorted(weeks.items(), reverse=True), "주", _BADGE_MAX_WEEKS, weekly=True)
        except Exception as error:
            logger.warning("주간 보고서 %s - 외국인 뱃지 계산 실패 - %s: %s", start_date, type(error).__name__, error)

    return data


# 코스피 종목 마스터 파일(kis_client.get_kospi_master)의 줄 형식. 바이트 기준 고정 폭이다 (종목명이 cp949라 문자 기준으로 자르면 어긋난다)
#   [0:9] 종목코드  [21:61] 종목명  [64:68] [68:72] [72:76] 지수업종 대·중·소분류  [121] 거래정지 여부("Y")
#   지수업종 코드는 업종 지수 코드와 같다 (건설 0018은 대분류, 화학 0008은 제조 0027 아래 중분류)
#   KIS가 형식을 바꾸면 위치가 틀어져 명단이 비거나 줄어든다 -> 업종 지수 종목 수와 비교해 경고를 남긴다
_MASTER_CODE = slice(0, 9)
_MASTER_SECTORS = (slice(64, 68), slice(68, 72), slice(72, 76))
_MASTER_HALTED = slice(121, 122)


# 업종 종목코드 명단. 마스터 파일에서 지수업종 대·중·소분류 중 하나가 code인 종목, 거래정지 종목은 뺀다
# (이 조건으로 21개 업종 모두 업종 지수의 상승+하락+보합 종목 수와 같다. ETF·ETN 줄에는 업종 코드가 없다)
def _sector_members(master: bytes, code: str) -> list[str]:
    members = []
    for line in master.splitlines():
        if len(line) < _MASTER_HALTED.stop or line[_MASTER_HALTED] == b"Y":
            continue
        if any(line[part].decode("ascii", "ignore") == code for part in _MASTER_SECTORS):
            members.append(line[_MASTER_CODE].decode("ascii", "ignore").strip())
    return members


# 업종 종목들의 주간 상승·전체 종목 수 (rising_count, total_count). 실패하면 (None, None)
#   종목 명단: 종목 마스터 파일(오늘 기준 명단 - 지난 주를 다시 만들면 그 사이 상장·폐지분이 다를 수 있다)
#   판정: 종목 주봉에서 그 주 종가 > 전주 종가면 상승. 보합·하락은 상승이 아니다. 주봉이 없는 종목(신규 상장 등)은 전체에서 뺀다
#   종목마다 KIS를 한 번씩 부른다 (건설 35개 약 2초, 화학 122개 약 8초)
def _weekly_rising_counts(code: str, start_date: date, end_date: date) -> tuple[int | None, int | None]:
    members = _sector_members(kis_client.get_kospi_master(), code)
    if not members:
        logger.warning("주간 섹터 카드 - 종목 마스터 파일에서 업종 %s 종목을 찾지 못했습니다 (파일 형식 변경 확인).", code)
        return None, None

    index_total = _index_member_count(code)
    if index_total is not None and index_total != len(members):
        logger.warning("주간 섹터 카드 - 업종 %s 명단 %d개가 업종 지수 종목 수 %d개와 다릅니다.", code, len(members), index_total)

    monday = start_date - timedelta(days=start_date.weekday())
    search_start = _ymd(monday - timedelta(days=14))
    rising = total = 0
    for stock_code in members:
        rows = kis_client.get_stock_period_price(stock_code, search_start, _ymd(end_date), "W").get("output2") or []
        rows = sorted((row for row in rows if row.get("stck_bsop_date") and row.get("stck_clpr")), key=lambda row: row["stck_bsop_date"], reverse=True)
        index = next((i for i, row in enumerate(rows) if monday <= _parse_ymd(row["stck_bsop_date"]) <= end_date), None)
        if index is None or index + 1 >= len(rows):
            continue
        total += 1
        if float(rows[index]["stck_clpr"]) > float(rows[index + 1]["stck_clpr"]):
            rising += 1
    return (rising, total) if total else (None, None)


# 업종 지수의 최근 거래일 종목 수(상승+하락+보합). 명단 검증용이라 실패하면 None
def _index_member_count(code: str) -> int | None:
    try:
        output1 = kis_client.get_index_daily_price(code, _ymd(datetime.now(_KST).date()), "D").get("output1") or {}
        return int(output1["ascn_issu_cnt"]) + int(output1["down_issu_cnt"]) + int(output1["stnr_issu_cnt"])
    except Exception:
        return None


# 주간 섹터 카드 - 코스피 업종(leading_sector_service.KOSPI_SECTOR_CODES) 중 그 주 등락률 1위 업종 하나
# 업종마다 주별 지수를 한 번씩 조회한다. 실패한 업종은 경고를 남기고 비교에서 뺀다
# 1위 업종은 종목별 주봉으로 주간 상승·전체 종목 수를 채운다 (실패하면 두 값만 None)
# 반환: ([카드] 또는 빈 목록, 주간 업종 등락 분포 또는 None)
def collect_weekly_top_sector(start_date: date, end_date: date) -> tuple[list[dict], dict | None]:
    cards = []
    for name in _SECTOR_NAME_TO_CODE:
        try:
            card = _weekly_sector_card(name, start_date, end_date)
        except Exception as error:
            logger.warning("주간 섹터 카드 %s 조회 실패 - %s: %s", name, type(error).__name__, error)
            continue
        if card["change_rate"] is not None:
            cards.append(card)
    if not cards:
        return [], None
    top = max(cards, key=lambda card: card["change_rate"])
    try:
        top["rising_count"], top["total_count"] = _weekly_rising_counts(_SECTOR_NAME_TO_CODE[top["sector_name"]], start_date, end_date)
    except Exception as error:
        logger.warning("주간 섹터 카드 %s 상승 종목 수 계산 실패 - %s: %s", top["sector_name"], type(error).__name__, error)
    return [top], _sector_breadth(cards)
