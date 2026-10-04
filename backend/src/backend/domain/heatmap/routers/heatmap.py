"""읽기 전용 히트맵 API. 화면 조회와 UPDATE 버튼은 KIS를 직접 호출하지 않는다."""

from fastapi import APIRouter

from backend.domain.heatmap.schemas.heatmap import HeatmapNewsResponse, HeatmapResponse, Market, Period
from backend.domain.heatmap.services import heatmap, news

router = APIRouter(prefix="/heatmap", tags=["heatmap"])


@router.get("", response_model=HeatmapResponse)
def get_heatmap(market: Market = "kospi", period: Period = "day") -> HeatmapResponse:
    return heatmap.get_heatmap(market, period)


@router.get("/news", response_model=HeatmapNewsResponse)
def get_heatmap_news(market: Market = "kospi", period: Period = "day") -> HeatmapNewsResponse:
    return news.get_news(market, period)
