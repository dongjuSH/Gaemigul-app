# sentiment.py
# 개미굴 시장심리지수 응답 형태(DTO). GET /market/sentiment가 쓴다.
# 라벨(공포·탐욕 등)은 보내지 않는다 - 프런트가 점수 구간에 맞춰 붙인다

from datetime import date, datetime

from pydantic import BaseModel, Field


class SentimentResponse(BaseModel):
    score: float = Field(ge=0, le=100)  # 0~100점 (소수 1자리, 높을수록 낙관)
    market_date: date  # 계산 기준 거래일
    updated_at: datetime  # 캐시 갱신 시각 (UTC)
