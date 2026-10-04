# trading_value.py
# 시간대별 거래대금 분포 응답 형태(DTO). GET /market/trading-value-distribution이 쓴다.

from datetime import date, datetime

from pydantic import BaseModel, Field


# 30분 구간 막대 하나
class TradingValuePoint(BaseModel):
    time_slot: str  # 구간 이름 "09:00" ~ "15:30" (분봉 시각)
    amount: int = Field(ge=0)  # 그 구간 거래대금 (코스피+코스닥, 백만원)


class TradingValueDistributionResponse(BaseModel):
    market_date: date  # 분포의 거래일 (오늘 15:30 봉이 생기기 전에는 전 거래일)
    points: list[TradingValuePoint]  # 시간순 14개
    unit: str = "million_krw"  # 금액 단위 (백만원)
    updated_at: datetime  # 캐시 갱신 시각 (UTC)
