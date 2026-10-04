# glossary_favorite.py
# "관심 용어 즐겨찾기" - glossary_view_log(열람 기록)와는 별개 테이블이다. "봤다"와
# "즐겨찾기했다"는 다른 개념이라 섞지 않는다(요구사항 그대로).

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base

_KST = ZoneInfo("Asia/Seoul")


def _now_kst() -> datetime:
    return datetime.now(_KST).replace(tzinfo=None)


class GlossaryFavorite(Base):
    __tablename__ = "glossary_favorite"

    __table_args__ = (UniqueConstraint("user_id", "term_id", name="uq_glossary_favorite_user_term"),)

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(ForeignKey("auth_user.id", ondelete="CASCADE"))
    term_id: Mapped[int] = mapped_column(ForeignKey("glossary_term.id", ondelete="CASCADE"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)
