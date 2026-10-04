# vix.py
# VIX 응답 형태(DTO). GET /market/vix가 쓴다.

from datetime import date, datetime

from pydantic import BaseModel


class VixResponse(BaseModel):
    value: float  # 현재(장 마감 뒤에는 마지막) VIX 값
    change_value: float  # 전일 종가 대비 포인트 차이 (음수 = 하락)
    market_date: date | None  # 값의 미국 거래일 (응답에 없으면 None)
    updated_at: datetime  # 캐시 갱신 시각 (UTC)
