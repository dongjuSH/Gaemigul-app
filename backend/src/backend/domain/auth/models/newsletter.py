# newsletter.py
# 개미레터(뉴스레터) 발송 이력. 매주 월요일 스케줄러가 같은 주(week_start)에 같은 유저에게
# 중복 발송하지 않도록 막는 용도 - (user_id, week_start) 유니크 제약으로 보장한다.

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base

_KST = ZoneInfo("Asia/Seoul")


def _now_kst() -> datetime:
    return datetime.now(_KST).replace(tzinfo=None)


class NewsletterLog(Base):
    __tablename__ = "newsletter_log"

    __table_args__ = (UniqueConstraint("user_id", "week_start", name="uq_newsletter_log_user_week"),)

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(ForeignKey("auth_user.id", ondelete="CASCADE"))

    # 발송 대상 주의 월요일 날짜("YYYY-MM-DD")
    week_start: Mapped[str] = mapped_column(String(10))

    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)
