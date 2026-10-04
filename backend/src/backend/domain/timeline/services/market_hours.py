# market_hours.py
# 장이 열려 있는지 판단한다.
#   is_market_open  지표 바가 지표별로 갱신할지 정할 때 쓴다 (주말·국내 휴장일·장 운영시간)
#   is_trading_day  국내 개장일인지. 슬롯 수집을 건너뛸지 정할 때도 쓴다

import logging
from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from backend.core import kis_client

_KST = ZoneInfo("Asia/Seoul")
_US_EASTERN = ZoneInfo("America/New_York")

logger = logging.getLogger(__name__)

# 지표별 (시간대, 개장, 마감, 국내 휴장일 적용 여부)
# 시각을 바꾸면 그 지표의 갱신 시간이 바뀐다. 마지막 값을 True로 하면 국내 휴장일에 갱신을 멈춘다
# 미국 동부시간은 서머타임이 자동 반영된다. 해외 지표는 해외 공휴일을 보지 않는다
_MARKET_HOURS: dict[str, tuple[ZoneInfo, time, time, bool]] = {
    "kospi": (_KST, time(9, 0), time(15, 30), True),
    "kosdaq": (_KST, time(9, 0), time(15, 30), True),
    "nikkei": (_KST, time(9, 0), time(15, 30), False),
    "sp500": (_US_EASTERN, time(9, 30), time(16, 0), False),
    "nasdaq": (_US_EASTERN, time(9, 30), time(16, 0), False),
}

# 장 운영시간과 상관없이 항상 갱신하는 지표 (환율은 마감이 없다)
ALWAYS_REFRESH_CODES = {"usdkrw"}


# 지금 이 지표의 장이 열려 있는지. code는 _MARKET_HOURS의 키
# 주말 -> (국내 지표만) 국내 휴장일 -> 운영시간 순으로 본다
def is_market_open(code: str, now: datetime | None = None) -> bool:
    if code not in _MARKET_HOURS:
        raise ValueError(f"'{code}'는 market_hours 대상이 아닙니다 (ALWAYS_REFRESH_CODES 확인).")

    tz, open_time, close_time, follows_domestic_holiday = _MARKET_HOURS[code]
    local_now = now.astimezone(tz) if now else datetime.now(tz)

    if local_now.weekday() >= 5:  # 5=토요일, 6=일요일
        return False

    if follows_domestic_holiday and not is_trading_day(local_now.date()):
        return False

    return open_time <= local_now.time() <= close_time


# 국내 개장일 캐시. {날짜: 개장 여부}. 휴장일 API가 한 번에 20여 일치를 준다
_open_day_cache: dict[date, bool] = {}


# 휴장일 API(CTCA0903R) 응답으로 캐시를 채운다
def _load_open_days(base_day: date) -> None:
    rows = kis_client.get_holiday_calendar(base_day.strftime("%Y%m%d")).get("output") or []
    for row in rows:
        parsed = datetime.strptime(row["bass_dt"], "%Y%m%d").date()
        _open_day_cache[parsed] = row["opnd_yn"] == "Y"


# 그날 국내 장이 열리는지 (주말·공휴일·임시공휴일이면 False). day를 안 주면 오늘
# 조회에 실패하면 개장일로 본다 - 개장일을 건너뛰면 그 슬롯을 다시 채울 수 없기 때문이다
def is_trading_day(day: date | None = None) -> bool:
    day = day or datetime.now(_KST).date()

    if day not in _open_day_cache:
        try:
            _load_open_days(day)
        except Exception as error:
            logger.warning("휴장일 조회 실패, 개장일로 보고 진행합니다 - %s: %s", type(error).__name__, error)
            return True

    return _open_day_cache.get(day, True)
