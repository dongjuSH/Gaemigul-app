# investor_flow.py
# 투자자별 수급 응답 형태(DTO). GET /market/investor-flow가 쓴다.

from datetime import date, datetime

from pydantic import BaseModel


class InvestorFlowResponse(BaseModel):
    individual: int  # 개인 순매수 (코스피+코스닥, 음수 = 순매도)
    institution: int  # 기관계 순매수
    foreign: int  # 외국인 순매수
    unit: str = "million_krw"  # 금액 단위 (백만원)
    market_date: date  # 집계 거래일
    updated_at: datetime  # 캐시 갱신 시각 (UTC)
