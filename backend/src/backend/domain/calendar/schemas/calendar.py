# calendar.py
# GET /calendar/events 응답에 쓰이는 CalendarEvent DTO
#
# Supabase calendar_events 테이블과 필드명을 동일하게 유지한다 (CLAUDE.md 6, 7번 항목).
# "summaty" 오타는 쓰지 않는다 - 반드시 "summary".
#
# 삭제된 컬럼: forecast(시장 컨센서스 예상값) - FRED/KIS/DART 어느 소스도 이 값을 제공하지
# 않아서 항상 None이었다. 55번 항목에서 실제로 쓰이지 않는 컬럼이라 Supabase 테이블/이
# 스키마/ORM 모델에서 모두 제거했다.

from typing import Optional

from pydantic import BaseModel


class CalendarEvent(BaseModel):
    id: str

    # 발표 날짜. 한국시간(KST) 기준 경제지표 발표일이다.
    # FRED가 주는 미국 기준 날짜를 그대로 복사하지 않고, Service에서 Asia/Seoul로 변환한 값만 들어온다.
    publishedAt: str

    # 시작/종료 날짜 - 현재 보류, 항상 None
    start_date: Optional[str] = None
    end_date: Optional[str] = None

    # 발표 시각. 한국시간 기준. 정확히 확인되지 않으면 None (임의 생성 금지)
    time: Optional[str] = None

    region: str
    category: str
    title: str
    summary: str

    # FRED가 표준 중요도(★)를 제공하지 않으므로 현재 항상 None
    importance: Optional[int] = None

    # 직전 발표값
    previous: Optional[str] = None

    # 실제 발표값
    actual: Optional[str] = None

    # actual이 구체적으로 "무엇"에 대한 값인지 알려주는 짧은 라벨(예: "주당", "공모가", "매출액").
    # 배당/공모주/실적처럼 previous가 항상 없고 actual만 단위(원/조원)째로 있어서 제목을 따로
    # 읽지 않으면 의미가 안 드러나는 이벤트에만 채운다. FRED 지표·BOK 기준금리처럼 제목에
    # 이미 맥락이 있는 경우는 None으로 둔다(53번 항목에서 프런트 전용으로 만들었던
    # actualLabelOf()를 백엔드 컬럼으로 옮긴 것).
    actual_label: Optional[str] = None

    status: str
