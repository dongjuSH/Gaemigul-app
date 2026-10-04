# market_indicator.py
# 최상단 지표 바 응답 형태(DTO). GET /timeline/indicators가 쓴다.

from datetime import datetime

from pydantic import BaseModel


# 지표 하나
class MarketIndicatorItem(BaseModel):
    code: str  # 내부 구분값 (kospi, kosdaq 등)
    name: str  # 화면 이름 (KOSPI, KOSDAQ 등)
    price: float  # 현재가 (장이 닫혀 있으면 마지막 값)
    change_rate: float  # 전일 대비 등락률(%)


# 지표 바 전체 응답
class IndicatorBarResponse(BaseModel):
    updated_at: datetime  # 응답을 만든 시각
    items: list[MarketIndicatorItem]
