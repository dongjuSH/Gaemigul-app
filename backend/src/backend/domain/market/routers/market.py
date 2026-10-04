# market.py
# market 도메인의 API 엔드포인트 (메인 페이지 시장 데이터). 실제 처리는 services에 있고 여기서는 연결만 한다.
# 모두 서비스의 메모리 캐시만 읽는다 (KIS 호출 없음). 서버 시작 뒤 첫 갱신 전이면 503

from fastapi import APIRouter, HTTPException

from backend.domain.market.schemas.exchange_rate import ExchangeRatePeriod, ExchangeRateResponse
from backend.domain.market.schemas.investor_flow import InvestorFlowResponse
from backend.domain.market.schemas.sentiment import SentimentResponse
from backend.domain.market.schemas.trading_value import TradingValueDistributionResponse
from backend.domain.market.schemas.vix import VixResponse
from backend.domain.market.services import exchange_rate_service, investor_flow_service, sentiment_service, trading_value_service, vix_service

router = APIRouter(prefix="/market", tags=["market"])


# GET /market/vix - VIX(미국 변동성 지수, "공포지수") 현재값과 전일 대비 포인트
@router.get("/vix", response_model=VixResponse)
def get_vix() -> VixResponse:
    cached = vix_service.get_vix()
    if cached is None:
        raise HTTPException(status_code=503, detail="VIX 데이터가 아직 준비되지 않았습니다.")
    return cached


# GET /market/sentiment - 개미굴 시장심리지수 0~100점. 점수 구간 라벨은 프런트가 붙인다
@router.get("/sentiment", response_model=SentimentResponse)
def get_sentiment() -> SentimentResponse:
    cached = sentiment_service.get_sentiment()
    if cached is None:
        raise HTTPException(status_code=503, detail="개미굴 시장심리지수가 아직 준비되지 않았습니다.")
    return cached


# GET /market/exchange-rate?period=today|5d|1m - 원/달러 환율 차트. period를 빼면 today, 목록 밖 값이면 422
@router.get("/exchange-rate", response_model=ExchangeRateResponse)
def get_exchange_rate(period: ExchangeRatePeriod = "today") -> ExchangeRateResponse:
    cached = exchange_rate_service.get_exchange_rate(period)
    if cached is None:
        raise HTTPException(status_code=503, detail="원/달러 환율 데이터가 아직 준비되지 않았습니다.")
    return cached


# GET /market/investor-flow - 개인·기관·외국인 순매수 금액 (코스피+코스닥, 백만원, 음수 = 순매도)
@router.get("/investor-flow", response_model=InvestorFlowResponse)
def get_investor_flow() -> InvestorFlowResponse:
    cached = investor_flow_service.get_investor_flow()
    if cached is None:
        raise HTTPException(status_code=503, detail="투자자 수급 데이터가 아직 준비되지 않았습니다.")
    return cached


# GET /market/trading-value-distribution - 정규장 30분 구간별 거래대금 14개 (오늘 15:30 봉이 생기기 전에는 전 거래일)
@router.get("/trading-value-distribution", response_model=TradingValueDistributionResponse)
def get_trading_value_distribution() -> TradingValueDistributionResponse:
    cached = trading_value_service.get_trading_value_distribution()
    if cached is None:
        raise HTTPException(status_code=503, detail="시간대별 거래대금 데이터가 아직 준비되지 않았습니다.")
    return cached
