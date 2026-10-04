# glossary_view_log.py
# 로그인한 유저가 어떤 용어를 열람했는지 기록 - 등급 시스템의 "활동 점수"(용어 열람 개수, 중복 제외)
# 산정에 쓴다. glossary_term(용어 콘텐츠)과는 별개 테이블 - 콘텐츠는 그대로 두고 새로 추가했다.
#
# unique(user_id, term_id)라서 같은 용어를 여러 번 봐도 한 행만 남는다(= "중복 제외"가 DB
# 제약으로 자동 보장됨). 언제 또 봤는지는 안 남긴다 - "총 몇 개 봤는지"만 중요하기 때문이다.

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base

_KST = ZoneInfo("Asia/Seoul")


def _now_kst() -> datetime:
    return datetime.now(_KST).replace(tzinfo=None)


class GlossaryViewLog(Base):
    __tablename__ = "glossary_view_log"

    __table_args__ = (UniqueConstraint("user_id", "term_id", name="uq_glossary_view_log_user_term"),)

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(ForeignKey("auth_user.id", ondelete="CASCADE"))
    term_id: Mapped[int] = mapped_column(ForeignKey("glossary_term.id", ondelete="CASCADE"))

    viewed_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)
