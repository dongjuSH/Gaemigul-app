# exchange_rate.py
# 원/달러 환율 차트 응답 형태(DTO). GET /market/exchange-rate가 쓴다.

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# 조회 기간. 값을 추가하면 exchange_rate_service.refresh의 캐시에도 같은 키를 만들어야 한다
ExchangeRatePeriod = Literal["today", "5d", "1m"]


# 차트 점 하나
class ExchangeRatePoint(BaseModel):
    timestamp: datetime  # 관측 시각 (+09:00). 1m은 그날 00:00
    value: float = Field(gt=0)  # 원/달러 환율 (원, 소수 2자리)


class ExchangeRateResponse(BaseModel):
    period: ExchangeRatePeriod  # 요청한 기간
    points: list[ExchangeRatePoint]  # 시간순, 최대 requested_point_count개 (쌓인 관측값이 적으면 더 적다)
    requested_point_count: int = 8  # 목표 점 개수 (today는 개수 제한이 없어 받은 점 수와 같다)
    is_complete: bool  # 목표 범위가 실제 관측값으로 다 찼는지. false면 프런트가 "수집 중" 등으로 표시
    updated_at: datetime  # 캐시 갱신 시각 (UTC)
