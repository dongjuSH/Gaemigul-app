# glossary_term.py
# "개미 용어 사전" 테이블. 용어사전 페이지·타임라인 호버 툴팁·홈 "오늘의 한 입"이 이 데이터를 쓴다.
# timeline 도메인의 glossary.py(하드코딩 dict)와는 분리된 별도 데이터다 - glossary.py는 레거시로
# 남아 있고 브리핑 보고서의 용어 선정(report_service._pick_terms)에만 쓰인다.
#
# [난이도 관련 컬럼 2가지, 헷갈리지 않도록 구분]
#   difficulty                이 용어 자체의 고유 난이도 배지 (예: "공매도"=청년 개미). 페이지의
#                              "전체/애기/청년/고참" 필터는 이 값으로 목록을 거르지 않는다.
#   easy/mid/hard_description  같은 용어를 3가지 톤으로 풀어쓴 설명. 페이지 상단 필터는 목록을
#                              줄이지 않고, 카드마다 보여줄 설명을 이 중 하나로 전환하는 용도다.
#                              필터가 "전체"면 프런트가 각 카드의 difficulty에 맞는 톤을 기본으로 보여준다.

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import DateTime, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base

_KST = ZoneInfo("Asia/Seoul")

# difficulty 컬럼에 들어갈 수 있는 값. Postgres native enum을 쓰지 않고 문자열로 두는 건
# 팀이 다른 도메인(calendar.category 등)에서도 써온 방식과 맞춘 것 - 값 추가·변경 시 마이그레이션 없이
# 이 상수만 고치면 된다.
DIFFICULTIES = ("애기 개미", "청년 개미", "고참 개미")

# category 컬럼에 들어갈 수 있는 값(주제·주체별 분류). difficulty와 같은 이유로 문자열로 둔다.
# 순서가 용어사전 "전체" 화면의 그룹 순서다. GET /glossary/terms?category= 검증에도 쓴다.
# 프런트 lib/glossary.ts의 GLOSSARY_CATEGORIES와 값·순서를 맞출 것
CATEGORIES = (
    "시장&지수",  # 지수·거래 규모·변동성, 시장을 움직이는 금리·물가·환율
    "기업 분석&가치 평가",  # 실적과 주가 수준으로 기업 가치를 따지는 지표
    "기업 금융&공시",  # 자금 조달·주식 수 변동·배당·상장·공시
    "매매 기법&시장 현상",  # 수급·매매 행위와 차트로 흐름을 읽는 방법
    "제도&매매 안전장치",  # 거래 시간·주문 방식·가격 제한·거래정지 같은 규칙
    "파생상품&기타 금융",  # 옵션·선물·ETF·ADR 등 주식 외 금융상품
)


def _now_kst() -> datetime:
    return datetime.now(_KST).replace(tzinfo=None)


# 용어 사전 카드 - 용어 하나당 한 행
class GlossaryTerm(Base):
    __tablename__ = "glossary_term"

    __table_args__ = (UniqueConstraint("term", name="uq_glossary_term_term"),)

    id: Mapped[int] = mapped_column(primary_key=True)

    # 용어명 (예: "공매도"). 검색창이 이 컬럼을 대상으로 한다
    term: Mapped[str] = mapped_column(String(50))

    # 이 용어 고유의 난이도 배지. DIFFICULTIES 중 하나
    difficulty: Mapped[str] = mapped_column(String(20))

    # 용어 종류. CATEGORIES 중 하나. 기존 테이블에 나중에 추가한 칼럼이라 NULL 허용
    # (scripts/add_glossary_category_column.py로 추가 -> seed_glossary_terms.py 재실행으로 채운다)
    category: Mapped[str | None] = mapped_column(String(20), default=None)

    # 난이도별 설명 3종 - 같은 용어를 다른 톤으로 풀어쓴 것. 하나의 필수 데이터로 세 톤 모두 보유
    easy_description: Mapped[str] = mapped_column(Text)
    mid_description: Mapped[str] = mapped_column(Text)
    hard_description: Mapped[str] = mapped_column(Text)

    # 연관 용어 태그 - 쉼표로 이어 한 칸에 저장 (timeline_beginner_guide.tags와 같은 방식).
    # 용어명 그대로 적어 프런트에서 태그 클릭 시 그 용어 카드로 이동/검색할 수 있게 한다
    related_terms: Mapped[str | None] = mapped_column(String(200), default=None)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)
