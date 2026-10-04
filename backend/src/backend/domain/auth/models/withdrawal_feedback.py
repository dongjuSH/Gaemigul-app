# withdrawal_feedback.py
# 회원 탈퇴 사유 - 탈퇴 계정과 완전히 무관한 익명 통계 테이블이다. user_id를 아예 저장하지
# 않는다(auth_user가 삭제돼도 이 행은 그대로 남아 통계로만 쓰인다 - 요구사항 그대로).

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base

_KST = ZoneInfo("Asia/Seoul")


def _now_kst() -> datetime:
    return datetime.now(_KST).replace(tzinfo=None)


class WithdrawalFeedback(Base):
    __tablename__ = "withdrawal_feedback"

    id: Mapped[int] = mapped_column(primary_key=True)

    # 객관식 사유 문구 그대로 저장 (REASON_OPTIONS 참고). "기타"도 이 값 그대로 들어간다
    reason: Mapped[str] = mapped_column(String(50))

    # "기타" 선택 시 직접 입력한 텍스트. 그 외엔 None
    custom_text: Mapped[str | None] = mapped_column(String(500), default=None)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)
