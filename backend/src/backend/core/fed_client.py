# fed_client.py
#
# Federal Reserve 공식 FOMC 캘린더(federalreserve.gov/monetarypolicy/fomccalendars.htm)의
# 회의 일정을 담은 클라이언트. FRED/KIS와 달리 이 일정 자체를 주는 API·JSON·ICS가 없어서
# (공식 페이지도 HTML 표만 제공), 이 표가 유일한 데이터 소스다 - 연준이 매년 말 발표하는
# 다음 해 일정을 그대로 옮겨 적은 정적(static) 데이터이며 이후 거의 바뀌지 않는다.
#
# 각 필드는 federalreserve.gov에서 실제로 확인한 값만 채운다:
# - start_date/end_date: 공식 캘린더에 적힌 회의 첫날/마지막 날(성명서 발표일, 미국 동부시간 기준)
# - has_sep: 공식 캘린더에서 "*"(Summary of Economic Projections 동반)로 표시된 회의인지
# - minutes_date: 공식 캘린더의 "Minutes ... (Released ...)" 표기. 아직 연준이 공식 발표하지
#   않은 회의는 None으로 둔다 - 3주 뒤라는 관례로 임의 추정하지 않는다.
#
# 매년 다음 해 일정이 공식 발표되면 이 파일에 그 해 리스트를 추가해야 한다(연 1회 수동 갱신).

from dataclasses import dataclass


@dataclass(frozen=True)
class FomcMeeting:
    start_date: str
    end_date: str
    has_sep: bool
    minutes_date: str | None


_FOMC_MEETINGS_2026: list[FomcMeeting] = [
    FomcMeeting(start_date="2026-01-27", end_date="2026-01-28", has_sep=False, minutes_date="2026-02-18"),
    FomcMeeting(start_date="2026-03-17", end_date="2026-03-18", has_sep=True, minutes_date="2026-04-08"),
    FomcMeeting(start_date="2026-04-28", end_date="2026-04-29", has_sep=False, minutes_date="2026-05-20"),
    FomcMeeting(start_date="2026-06-16", end_date="2026-06-17", has_sep=True, minutes_date="2026-07-08"),
    FomcMeeting(start_date="2026-07-28", end_date="2026-07-29", has_sep=False, minutes_date="2026-08-19"),
    # 9월/10월/12월 회의는 아직 열리지 않았거나(9월) 열리지 않아서 의사록 공개일이 연준
    # 공식 캘린더에 아직 게시되지 않았다 - "3주 뒤"라는 관례로 임의 계산하지 않고 None으로 둔다
    FomcMeeting(start_date="2026-09-15", end_date="2026-09-16", has_sep=True, minutes_date=None),
    FomcMeeting(start_date="2026-10-27", end_date="2026-10-28", has_sep=False, minutes_date=None),
    FomcMeeting(start_date="2026-12-08", end_date="2026-12-09", has_sep=True, minutes_date=None),
]

_MEETINGS_BY_YEAR: dict[int, list[FomcMeeting]] = {
    2026: _FOMC_MEETINGS_2026,
}


def get_fomc_meetings(year: int) -> list[FomcMeeting]:
    return list(_MEETINGS_BY_YEAR.get(year, []))
