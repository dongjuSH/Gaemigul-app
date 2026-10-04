# report.py
# 브리핑 탭 일간·주간 보고서 응답 형태(DTO). GET /timeline/report, POST /timeline/report/daily·weekly가 쓴다.
# 필드 이름은 models/report.py의 테이블 칼럼과 맞춘다. 필드를 추가하면 report_service.to_response도 고칠 것
# 금액은 전부 백만원 단위 숫자로 내려준다 (억·조 표기는 프런트가 한다)
# LLM이 실패한 보고서는 문구 필드가 None이고 목록이 비어 있다 (수치는 채워져 있을 수 있다)

from datetime import date, datetime

from pydantic import BaseModel


# 섹션 핵심 요약 한 줄
class ReportPointItem(BaseModel):
    seq: int  # 표시 순서 (1, 2, 3)
    body: str
    review_status: str  # "ok" / "checking" - checking이면 확인 중 표시를 붙인다 (문구는 응답의 review_message)


# 섹션 하나 (1 핵심 이슈(원인 분석) / 2 시장 전체 반응(결과 & 실증 데이터) / 3 주목할 섹터(실제 사례))
class ReportSectionItem(BaseModel):
    seq: int  # 섹션 번호 (1, 2, 3)
    title: str | None
    description: str | None
    image_url: str | None  # 섹션1만 있다
    points: list[ReportPointItem]  # 핵심 요약 3개
    review_status: str  # description에 대한 검사 결과


# 섹션2 차트의 분기 하나
class ReportQuarterItem(BaseModel):
    label: str  # "26/Q3"
    usd_krw: float | None  # 원달러 환율
    foreign_net_buy: int | None  # 외국인 순매수 합계(백만원)
    is_current: bool  # 진행 중인 분기


# 섹션3 주목할 섹터 카드 (일간은 그날 종가 기준 코스피 업종 등락률 1위, 주간은 그 주 등락률 1위)
class ReportSectorItem(BaseModel):
    sector_name: str  # 업종명
    change_rate: float | None  # 업종 등락률(%). 일간은 전일 대비, 주간은 전주 대비
    rising_count: int | None  # 상승 종목 수 (일간은 그날, 주간은 그 주 종가가 전주보다 오른 종목). 조회 실패 시 None
    total_count: int | None  # 업종 전체 종목 수
    rising_ratio: float | None  # 상승 종목 비율(%) = rising_count / total_count
    trade_amount: int | None  # 거래대금(백만원). 일간은 당일, 주간은 그 주
    prev_trade_amount: int | None  # 비교 거래대금(백만원). 일간은 전일, 주간은 전주
    trade_amount_change_rate: float | None  # 거래대금 증감률(%)


# 결론 영역 섹션별 쉬운 요약 하나 (주식 입문자용)
class ReportKeywordItem(BaseModel):
    title: str
    description: str
    review_status: str  # description에 대한 검사 결과


# 결론 어려운 용어 하나
class ReportTermItem(BaseModel):
    term: str
    description: str


# 보고서 목록의 보고서 하나 (브리핑 탭 우측 목록 카드)
class ReportListItem(BaseModel):
    report_type: str  # "DAILY" / "WEEKLY"
    start_date: date  # 일간은 그날, 주간은 그 주 첫 거래일
    end_date: date  # 일간은 그날, 주간은 그 주 마지막 거래일 (상세 조회 GET /timeline/report의 date로 쓴다)
    title: str
    summary: str | None  # 카드 설명 두 줄


# 보고서 목록의 주 묶음 하나 (월~금, 월요일이 속한 달의 주)
class ReportWeekGroup(BaseModel):
    year: int  # 월요일 기준 연도
    month: int  # 월요일 기준 월 (9/28~10/2 주는 9)
    week_of_month: int  # 그 달의 몇 번째 월요일인지 (9/28 → 4)
    week_label: str  # "9월 4주차" (주간 카드 배지)
    start_date: date  # 그 주 첫 거래일 (휴장일 제외, 묶음 제목 "9.28 - 10.2")
    end_date: date  # 그 주 마지막 거래일
    weekly: ReportListItem | None  # 주간 보고서 (없으면 null - 일간만 보여준다)
    dailies: list[ReportListItem]  # 일간 보고서, 날짜순


# 보고서 목록 응답 (GET /timeline/reports)
class ReportListResponse(BaseModel):
    year: int
    month: int
    weeks: list[ReportWeekGroup]  # 최신 주가 먼저


# 보고서 전체 응답
class ReportResponse(BaseModel):
    report_type: str  # "DAILY" / "WEEKLY"
    start_date: date  # 일간은 그날, 주간은 그 주 첫 거래일
    end_date: date  # 일간은 그날, 주간은 그 주 마지막 거래일
    published_at: datetime | None  # 발행 시각 (KST). 문구 생성 전이면 None
    title: str | None
    title_review_status: str  # "ok" / "checking"
    summary: str | None  # 메인 한 줄 요약 (보고서 전체 요약)
    summary_review_status: str
    main_image_url: str | None
    review_message: str  # review_status가 "checking"인 문구에 띄울 안내 문구 (문구마다 같다)
    sections: list[ReportSectionItem]  # 메인 화면의 섹션 타이틀 3개도 여기서 쓴다
    foreign_net_buy: int | None  # 섹션2 외국인 순매수(백만원). 주간은 주간 합계
    foreign_badge: str | None  # 외국인 카드 뱃지 (예: "4거래일 연속 순매도", "8/25 이후 최대 순매도"). 순매수 0이거나 데이터 없으면 None
    vkospi: float | None  # 섹션2 VKOSPI
    vkospi_change_rate: float | None  # 일간은 전일 대비, 주간은 전주 대비(%)
    vkospi_badge: str | None  # VKOSPI 카드 뱃지 (예: "+18.2% 급등"). ±10% 이상 급등·급락, 그 안은 상승·하락, 0이면 보합
    quarters: list[ReportQuarterItem]  # 섹션2 차트 6개, 오래된 분기부터
    sector: ReportSectorItem | None  # 섹션3 카드 (박스 3개: 등락률 / 상승 종목 비율 / 거래대금). 업종 등락률을 받지 못하면 None
    conclusion: str | None  # 결론 영역 한 줄 요약 (주식 입문자용 쉬운 풀이)
    conclusion_review_status: str
    keywords: list[ReportKeywordItem]  # 결론 영역 번호 항목 3개. 순서대로 섹션1·2·3을 쉽게 다시 요약한 것
    terms: list[ReportTermItem]  # 3개
