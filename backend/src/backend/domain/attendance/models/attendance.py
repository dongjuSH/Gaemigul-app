# attendance.py
# "굴 파기 기록"(마이페이지 출석 히트맵) 테이블. domain/heatmap(단물 지도 - 종목 히트맵)과는
# 전혀 다른 기능이라 이름이 겹치지 않게 도메인을 attendance로 분리했다(요구사항 문서 4번).
#
# 하루 최대 1행 (user_id + log_date 유니크). 그날 카운트된 슬롯을 visited_slots에 쌓아간다.
# 진하기(0~8단계)는 visited_slots 길이로 프런트에서 계산한다(저장 안 함).

from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import Date, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base

_KST = ZoneInfo("Asia/Seoul")


def _now_kst() -> datetime:
    return datetime.now(_KST).replace(tzinfo=None)


class AttendanceLog(Base):
    __tablename__ = "attendance_log"

    __table_args__ = (UniqueConstraint("user_id", "log_date", name="uq_attendance_log_user_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(ForeignKey("auth_user.id", ondelete="CASCADE"))

    log_date: Mapped[date] = mapped_column(Date)

    # 그날 카운트된 슬롯 키 - 쉼표로 이어 한 칸에 저장 (예: "0730,0930,1200"), glossary_term.related_terms와 같은 방식
    visited_slots: Mapped[str] = mapped_column(String(100), default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)
