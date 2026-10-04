# calendar.py
# Supabase calendar_events 테이블에 매핑되는 SQLAlchemy ORM 모델.
#
# 지금 services/calendar.py는 이 클래스를 쓰지 않고 raw SQL(sqlalchemy.text)로 직접
# calendar_events를 조회/저장한다 - ORM 모델 선례가 없어 새 패턴을 도입하지 않기로 한
# 팀 결정 때문이다(IMPLEMENTATION_LOG.md 1번 항목). 이 파일은 그 결정을 뒤집는 것이 아니라,
# 테이블 구조를 Python 쪽에도 정의해두기 위한 것이라 지금 당장 어디서도 import되어 쓰이지 않는다.
#
# 컬럼 구성은 Claude.md 5·6번 항목 및 schemas/calendar.py의 Pydantic CalendarEvent와
# 동일하게 유지한다. 테이블은 이미 Supabase에 SQL로 직접 생성돼 있으므로, 이 클래스로
# Base.metadata.create_all()을 실행하지 않는다.

from __future__ import annotations

from sqlalchemy import Integer, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base


class CalendarEvent(Base):
    __tablename__ = "calendar_events"

    id: Mapped[str] = mapped_column(Text, primary_key=True)

    # 한국시간(KST) 기준 발표일. camelCase 컬럼이라 Postgres에서 큰따옴표로 quoting되는데,
    # SQLAlchemy는 컬럼명이 전부 소문자가 아니면 자동으로 quoting해준다.
    publishedAt: Mapped[str] = mapped_column("publishedAt", Text)

    # 다일 이벤트(FOMC 등)용 - CPI/PPI 등 단일 발표 지표에서는 항상 NULL
    start_date: Mapped[str | None] = mapped_column(Text, default=None)
    end_date: Mapped[str | None] = mapped_column(Text, default=None)

    time: Mapped[str | None] = mapped_column("time", Text, default=None)

    region: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    summary: Mapped[str] = mapped_column(Text)

    # FRED가 표준 중요도(★)를 제공하지 않으므로 현재 항상 NULL
    importance: Mapped[int | None] = mapped_column(Integer, default=None)

    previous: Mapped[str | None] = mapped_column(Text, default=None)

    actual: Mapped[str | None] = mapped_column(Text, default=None)

    # actual이 무엇에 대한 값인지 알려주는 짧은 라벨(예: "주당", "공모가", "매출액").
    # schemas/calendar.py의 CalendarEvent.actual_label 설명 참고.
    actual_label: Mapped[str | None] = mapped_column(Text, default=None)

    status: Mapped[str] = mapped_column(Text)
