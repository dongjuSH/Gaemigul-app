# models > timeline.py
# 타임라인 콘텐츠 테이블 9개 + 문구 검수 테이블 1개 (SQLAlchemy ORM 모델).
#
# [테이블 관계] 슬롯 하나에 아래 자식 행들이 붙는다
#   timeline_slot ─┬─ timeline_briefing_insight      브리핑 포인트 3행
#                  ├─ timeline_beginner_guide        불개미 해설 3행
#                  ├─ timeline_news                  뉴스 4~8행
#                  ├─ timeline_indicator             지표 6행 (07:30)
#                  ├─ timeline_intraday_change       장중 변화 3행 (15:30)
#                  ├─ timeline_top_gainer            급상승 종목 3행 (08:30 / 17:30 / 20:00)
#                  └─ timeline_leading_sector        주도 섹터 3행 (09:30 / 12:00 / 14:00 / 15:30)
#                        └─ timeline_leading_sector_stock   대표 종목 1~2행
#
# [용어]
#   ForeignKey         자식 테이블의 부모 id 칼럼. 실제 연결은 이것이 한다
#   relationship       slot.news처럼 코드에서 자식·부모를 꺼내 쓰는 장치 (DB 구조에는 영향 없음)
#   cascade            파이썬에서 부모를 지우면 자식도 지운다
#   ondelete=CASCADE   SQL로 부모를 지워도 DB가 자식을 지운다
#
# 테이블을 추가하면: 여기 모델 추가 -> Supabase에 테이블 생성(create_tables.py)
#   -> timeline_repository._EAGER_LOAD에 등록 -> 저장·응답 코드 추가

from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.core.database import Base

_KST = ZoneInfo("Asia/Seoul")


# created_at 기본값. 시간대 없는 한국 시간으로 저장한다 (time_slot이 한국 시간이라 기준을 맞춘다)
# DB에도 DEFAULT (now() AT TIME ZONE 'Asia/Seoul')가 걸려 있다
def _now_kst() -> datetime:
    return datetime.now(_KST).replace(tzinfo=None)


# 타임라인 슬롯 - 하루 최대 8행
class TimelineSlot(Base):
    __tablename__ = "timeline_slot"

    # 같은 날짜 + 같은 시간대는 한 행만 (반드시 튜플로 감쌀 것 - 끝의 콤마가 없으면 모델 로딩이 실패한다)
    __table_args__ = (UniqueConstraint("trade_date", "time_slot", name="uq_timeline_slot_date_time"),)

    # 식별 번호
    id: Mapped[int] = mapped_column(primary_key=True)

    # 거래일 (예: 2026-09-14)
    trade_date: Mapped[date] = mapped_column(Date)

    # 시간대 "07:30" / "08:30" / "09:30" / "12:00" / "14:00" / "15:30" / "17:30" / "20:00"
    time_slot: Mapped[str] = mapped_column(String(5))

    # 브리핑 헤드라인 (LLM 실패 시 NULL)
    briefing_headline: Mapped[str | None] = mapped_column(String(200), default=None)

    # 브리핑 부제
    briefing_subtitle: Mapped[str | None] = mapped_column(String(300), default=None)

    # 저장 시각 (한국 시간)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)

    # 자식 테이블 연결. 모두 순서를 정해 꺼낸다 (seq 칼럼이 있으면 seq, 없으면 저장 순서인 id)
    # DB는 행을 수정하면 저장 위치가 바뀌어 order_by가 없으면 순서가 섞인다
    insights: Mapped[list["TimelineBriefingInsight"]] = relationship(back_populates="slot", cascade="all, delete-orphan", order_by="TimelineBriefingInsight.seq")
    beginner_guides: Mapped[list["TimelineBeginnerGuide"]] = relationship(back_populates="slot", cascade="all, delete-orphan", order_by="TimelineBeginnerGuide.seq")
    news: Mapped[list["TimelineNews"]] = relationship(back_populates="slot", cascade="all, delete-orphan", order_by="TimelineNews.seq")
    indicators: Mapped[list["TimelineIndicator"]] = relationship(back_populates="slot", cascade="all, delete-orphan", order_by="TimelineIndicator.id")
    intraday_changes: Mapped[list["TimelineIntradayChange"]] = relationship(back_populates="slot", cascade="all, delete-orphan", order_by="TimelineIntradayChange.id")
    leading_sectors: Mapped[list["TimelineLeadingSector"]] = relationship(back_populates="slot", cascade="all, delete-orphan", order_by="TimelineLeadingSector.id")
    top_gainers: Mapped[list["TimelineTopGainer"]] = relationship(back_populates="slot", cascade="all, delete-orphan", order_by="TimelineTopGainer.seq")


# 브리핑 포인트 - 슬롯당 3행
class TimelineBriefingInsight(Base):
    __tablename__ = "timeline_briefing_insight"

    id: Mapped[int] = mapped_column(primary_key=True)

    # 소속 슬롯
    timeline_slot_id: Mapped[int] = mapped_column(ForeignKey("timeline_slot.id", ondelete="CASCADE"))

    # 표시 순서 (1, 2, 3)
    seq: Mapped[int] = mapped_column()

    # 포인트 제목
    title: Mapped[str] = mapped_column(String(200))

    # 자동 검사에 걸린 사유. NULL이면 정상 문구다
    # 값이 있으면 응답의 review_status가 "checking"이 되어 화면에 "확인 중"으로 표시된다 (문단을 빼지는 않는다)
    review_note: Mapped[str | None] = mapped_column(Text, default=None)

    # 포인트 설명
    body: Mapped[str] = mapped_column(Text)

    # 저장 시각 (한국 시간)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)

    slot: Mapped["TimelineSlot"] = relationship(back_populates="insights")


# 불개미 해설 - 슬롯당 3행
class TimelineBeginnerGuide(Base):
    __tablename__ = "timeline_beginner_guide"

    id: Mapped[int] = mapped_column(primary_key=True)

    # 소속 슬롯
    timeline_slot_id: Mapped[int] = mapped_column(ForeignKey("timeline_slot.id", ondelete="CASCADE"))

    # 표시 순서 (1, 2, 3)
    seq: Mapped[int] = mapped_column()

    # 해설 제목
    title: Mapped[str] = mapped_column(String(200))

    # 해설 내용
    body: Mapped[str] = mapped_column(Text)

    # 태그 - 쉼표로 이어 한 칸에 저장 (예: "금리, 외국인")
    tags: Mapped[str | None] = mapped_column(String(200), default=None)

    # 자동 검사에 걸린 사유. NULL이면 정상 문구다 (브리핑 포인트와 같은 뜻)
    review_note: Mapped[str | None] = mapped_column(Text, default=None)

    # 저장 시각 (한국 시간)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)

    slot: Mapped["TimelineSlot"] = relationship(back_populates="beginner_guides")


# 주요 뉴스 - 슬롯당 4~8행
class TimelineNews(Base):
    __tablename__ = "timeline_news"

    id: Mapped[int] = mapped_column(primary_key=True)

    # 소속 슬롯
    timeline_slot_id: Mapped[int] = mapped_column(ForeignKey("timeline_slot.id", ondelete="CASCADE"))

    # 표시 순서 (1이 가장 중요). DB는 순서를 보장하지 않아서 이 값으로 정렬한다
    seq: Mapped[int] = mapped_column(default=1)

    # 기사 제목
    title: Mapped[str] = mapped_column(String(500))

    # 기사 요약
    summary: Mapped[str | None] = mapped_column(Text, default=None)

    # 기사 링크
    url: Mapped[str] = mapped_column(String(1000))

    # 기사 발행 시각 (한국 시간)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), default=None)

    # 저장 시각 (한국 시간)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)

    slot: Mapped["TimelineSlot"] = relationship(back_populates="news")


# 지표 6종 - 07:30 슬롯에만 6행 (코스피·코스닥·나스닥·S&P500·환율·니케이)
class TimelineIndicator(Base):
    __tablename__ = "timeline_indicator"

    id: Mapped[int] = mapped_column(primary_key=True)

    # 소속 슬롯
    timeline_slot_id: Mapped[int] = mapped_column(ForeignKey("timeline_slot.id", ondelete="CASCADE"))

    # 지표 이름 (예: "KOSPI")
    name: Mapped[str] = mapped_column(String(50))

    # 가격
    price: Mapped[float] = mapped_column(Float)

    # 전일 대비 등락률(%)
    change_rate: Mapped[float] = mapped_column(Float)

    # 저장 시각 (한국 시간)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)

    slot: Mapped["TimelineSlot"] = relationship(back_populates="indicators")


# 장중 변화 - 15:30 슬롯에만 3행 (코스피·코스닥·환율)
class TimelineIntradayChange(Base):
    __tablename__ = "timeline_intraday_change"

    id: Mapped[int] = mapped_column(primary_key=True)

    # 소속 슬롯
    timeline_slot_id: Mapped[int] = mapped_column(ForeignKey("timeline_slot.id", ondelete="CASCADE"))

    # 지표 이름 (예: "KOSPI")
    name: Mapped[str] = mapped_column(String(50))

    # 07:30 가격
    morning_price: Mapped[float] = mapped_column(Float)

    # 마감 가격 (15:30 수집 시점)
    closing_price: Mapped[float] = mapped_column(Float)

    # 07:30 대비 변동률(%)
    change_rate: Mapped[float] = mapped_column(Float)

    # 저장 시각 (한국 시간)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)

    slot: Mapped["TimelineSlot"] = relationship(back_populates="intraday_changes")


# 주도 섹터 - 정규장 슬롯에 3행 (코스피 업종 등락률 TOP3)
class TimelineLeadingSector(Base):
    __tablename__ = "timeline_leading_sector"

    id: Mapped[int] = mapped_column(primary_key=True)

    # 소속 슬롯
    timeline_slot_id: Mapped[int] = mapped_column(ForeignKey("timeline_slot.id", ondelete="CASCADE"))

    # 업종명 (예: "화학")
    name: Mapped[str] = mapped_column(String(100))

    # 업종 등락률(%, 전일 종가 대비)
    change_rate: Mapped[float] = mapped_column(Float)

    # 이 업종의 대표 종목 (sector.stocks). 저장 순서(상승 1위 -> 거래 1위) 그대로 id순으로 읽는다
    stocks: Mapped[list["TimelineLeadingSectorStock"]] = relationship(back_populates="sector", cascade="all, delete-orphan", order_by="TimelineLeadingSectorStock.id")

    # 저장 시각 (한국 시간)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)

    slot: Mapped["TimelineSlot"] = relationship(back_populates="leading_sectors")


# 주도 섹터의 대표 종목 - 업종당 1~2행 (상승 1위·거래대금 1위, 같은 종목이면 1행)
class TimelineLeadingSectorStock(Base):
    __tablename__ = "timeline_leading_sector_stock"

    id: Mapped[int] = mapped_column(primary_key=True)

    # 소속 업종
    sector_id: Mapped[int] = mapped_column(ForeignKey("timeline_leading_sector.id", ondelete="CASCADE"))

    # 종목명
    name: Mapped[str] = mapped_column(String(100))

    # 종목 등락률(%)
    change_rate: Mapped[float] = mapped_column(Float)

    # 꼬리표 "상승 1위" / "거래 1위" / "상승·거래 1위" (문구는 leading_sector_service에서 정한다)
    label: Mapped[str] = mapped_column(String(30))

    # 저장 시각 (한국 시간)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)

    sector: Mapped["TimelineLeadingSector"] = relationship(back_populates="stocks")


# 급상승 종목 - 08:30 / 17:30 / 20:00 슬롯에 3행
class TimelineTopGainer(Base):
    __tablename__ = "timeline_top_gainer"

    id: Mapped[int] = mapped_column(primary_key=True)

    # 소속 슬롯
    timeline_slot_id: Mapped[int] = mapped_column(ForeignKey("timeline_slot.id", ondelete="CASCADE"))

    # 표시 순서 (1, 2, 3)
    seq: Mapped[int] = mapped_column()

    # 종목명
    name: Mapped[str] = mapped_column(String(100))

    # 등락률(%)
    change_rate: Mapped[float] = mapped_column(Float)

    # 넥스트레이드 현재가 (08:30 프리마켓, 17:30·20:00 애프터마켓)
    price: Mapped[float] = mapped_column(Float)

    # 저장 시각 (한국 시간)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)

    slot: Mapped["TimelineSlot"] = relationship(back_populates="top_gainers")


# LLM 문구 검수 대기 - 자동 검사에 걸린 문단을 남긴다 (슬롯에 딸리지 않는 독립 테이블)
# 슬롯을 다시 저장하면 자식 행은 지워지므로, 검수 기록이 살아남도록 슬롯과 연결하지 않는다
# 문단은 화면에서 빼지 않는다 - 본 테이블에 review_note가 붙은 채로 저장되고 화면에는 "확인 중"으로 표시된다
# 이 테이블은 그 이력이다. 확인이 끝나면 resolved를 True로 바꾼다. 하루 한 번 GET /timeline/holds로 남은 것을 본다
class TimelineTextHold(Base):
    __tablename__ = "timeline_text_hold"

    id: Mapped[int] = mapped_column(primary_key=True)

    # 대상 날짜 (슬롯은 거래일, 보고서는 시작일)
    target_date: Mapped[date] = mapped_column(Date)

    # 어디서 나왔는지 - 슬롯 시각("07:30") 또는 보고서 종류("DAILY" / "WEEKLY")
    source: Mapped[str] = mapped_column(String(20))

    # 문단 종류 - "briefing_point" / "guide" / "report_point" / "report_section"
    part: Mapped[str] = mapped_column(String(30))

    # 그 종류 안에서의 순서 (1부터)
    seq: Mapped[int] = mapped_column()

    # 해설 문단 유형 ("news" / "mechanism" / "meaning"). 나머지는 NULL
    kind: Mapped[str | None] = mapped_column(String(20), default=None)

    # 문단 제목·본문 (검수용 원문)
    title: Mapped[str | None] = mapped_column(String(300), default=None)
    body: Mapped[str] = mapped_column(Text)

    # 태그 목록을 쉼표로 이어 한 칸에 저장한다 (해설만)
    tags: Mapped[str | None] = mapped_column(String(200), default=None)

    # 걸린 사유. 여러 건이면 줄바꿈으로 이어 붙인다
    issues: Mapped[str] = mapped_column(Text)

    # 사람이 확인을 끝냈으면 True
    resolved: Mapped[bool] = mapped_column(Boolean, default=False)

    # 저장 시각 (한국 시간)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)
