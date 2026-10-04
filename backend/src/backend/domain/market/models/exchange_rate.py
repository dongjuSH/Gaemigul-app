# exchange_rate.py
# 원/달러 환율 30분 스냅샷 테이블 (SQLAlchemy ORM 모델). 오늘·5일 차트의 실제 관측값을 쌓는다.
# 쓰기·정리(10일 보관)는 exchange_rate_service가 한다. 테이블은 create_tables.py로 만든다

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import DateTime, Float, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base

_KST = ZoneInfo("Asia/Seoul")


# created_at 기본값. 시간대 없는 한국 시간으로 저장한다 (sampled_at과 기준을 맞춘다)
def _now_kst() -> datetime:
    return datetime.now(_KST).replace(tzinfo=None)


# 30분 칸 하나 = 한 행 (하루 최대 48행)
class ExchangeRateSnapshot(Base):
    __tablename__ = "market_exchange_rate_snapshot"

    # 같은 칸은 한 행만 (반드시 튜플로 감쌀 것 - 끝의 콤마가 없으면 모델 로딩이 실패한다)
    __table_args__ = (UniqueConstraint("sampled_at", name="uq_market_exchange_rate_sampled_at"),)

    # 식별 번호
    id: Mapped[int] = mapped_column(primary_key=True)

    # 30분 칸 시각 (한국 시간, 예: 2026-09-17 12:00:00)
    sampled_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), index=True)

    # 원/달러 환율 (원)
    value: Mapped[float] = mapped_column(Float)

    # 저장 시각 (한국 시간)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)
