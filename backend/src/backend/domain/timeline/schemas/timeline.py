# timeline.py
# 타임라인 슬롯 응답 형태(DTO). GET /timeline, POST /timeline/collect가 쓴다.
# 필드 이름은 models/timeline.py의 테이블 칼럼과 맞춘다. 필드를 추가하면 timeline_service._from_db도 고칠 것

from datetime import date, datetime

from pydantic import BaseModel


# 주도 섹터의 대표 종목 한 줄
class LeadingSectorStockItem(BaseModel):
    name: str  # 종목명
    change_rate: float  # 등락률(%)
    label: str  # "상승 1위" / "거래 1위" / "상승·거래 1위"


# 주도 섹터 한 개
class LeadingSectorItem(BaseModel):
    name: str  # 업종명
    change_rate: float  # 업종 등락률(%, 전일 종가 대비)
    stocks: list[LeadingSectorStockItem]  # 대표 종목 1~2개


# 브리핑 포인트 한 줄
class BriefingPointItem(BaseModel):
    seq: int  # 표시 순서 (1, 2, 3)
    title: str
    body: str
    # 자동 검사 결과. "ok"면 그대로 보여주고, "checking"이면 문단에 확인 중 표시를 붙인다 (문구는 응답의 review_message)
    review_status: str


# 불개미 해설 한 줄
class BeginnerGuideItem(BaseModel):
    seq: int
    title: str
    body: str
    tags: list[str]  # 핵심 키워드 최대 3개
    review_status: str  # 브리핑 포인트와 같다


# 뉴스 한 줄
class NewsItem(BaseModel):
    seq: int  # 표시 순서. 1번이 가장 중요한 기사
    title: str
    summary: str
    url: str
    published_at: datetime | None  # 기사 발행 시각 (KST)


# 지표 한 줄 (07:30 슬롯)
class SlotIndicatorItem(BaseModel):
    name: str
    price: float
    change_rate: float


# 급상승 종목 한 줄 (08:30 / 17:30 / 20:00 슬롯)
class TopGainerItem(BaseModel):
    seq: int  # 표시 순서 (1, 2, 3)
    name: str  # 종목명
    change_rate: float  # 등락률(%)
    price: float  # 넥스트레이드 현재가 (08:30 프리마켓, 17:30·20:00 애프터마켓)


# 장중 변화 한 줄 (15:30 슬롯)
class IntradayChangeItem(BaseModel):
    name: str
    morning_price: float  # 07:30 가격
    closing_price: float  # 마감 가격
    change_rate: float  # 07:30 대비 변동률(%)


# 슬롯 하나의 전체 응답
class TimelineSlotResponse(BaseModel):
    slot_key: str  # URL용 ("0730")
    time_slot: str  # DB용 ("07:30")
    title: str  # 화면 명칭 ("글로벌 시황")
    collected_at: datetime  # 수집 시각
    review_message: str  # review_status가 "checking"인 문단에 띄울 안내 문구 (문단마다 같다)
    briefing_headline: str | None  # LLM 실패 시 None
    briefing_subtitle: str | None
    briefing_points: list[BriefingPointItem]  # 최대 3개
    beginner_guides: list[BeginnerGuideItem]  # 최대 3개
    leading_sectors: list[LeadingSectorItem]  # 09:30 / 12:00 / 14:00 / 15:30만
    top_gainers: list[TopGainerItem]  # 08:30 / 17:30 / 20:00만
    news: list[NewsItem]  # 4~8건
    indicators: list[SlotIndicatorItem]  # 07:30만
    intraday_changes: list[IntradayChangeItem]  # 15:30만


# 확인이 필요한 문단 한 줄 (GET /timeline/holds - 관리용). 화면에는 "확인 중"으로 표시된 채 나가 있다
class TextHoldItem(BaseModel):
    id: int
    target_date: date
    source: str  # 슬롯 시각("07:30") 또는 보고서 종류("DAILY" / "WEEKLY")
    part: str  # "briefing_point" / "guide" / "report_point" / "report_section"
    seq: int
    kind: str | None  # 해설 문단 유형 ("news" / "mechanism" / "meaning")
    title: str | None
    body: str
    tags: str | None
    issues: str  # 걸린 사유. 여러 건이면 줄바꿈으로 이어져 있다
    created_at: datetime
