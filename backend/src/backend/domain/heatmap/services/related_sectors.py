"""KIS 업종 이름에 적용하는 설명 가능한 산업 연결 규칙.

실시간 자금 유입이나 인과관계를 추정하지 않는다. 업종 코드가 다른 두 시장에
같은 규칙을 적용하되 현재 시장에 존재하는 업종/기업만 반환한다.
"""

import math

from backend.domain.heatmap.schemas.heatmap import HeatmapSector, RelatedSector


# (관련 업종, 산업 구조상 연결 이유). 표시 순서는 규칙의 순서이며 매수 추천이 아니다.
_RELATIONS: dict[str, tuple[tuple[str, str], ...]] = {
    "전기·전자": (("기계·장비", "전자제품·반도체 생산에 쓰이는 제조 장비"), ("화학", "반도체·전자부품에 쓰이는 소재"), ("IT 서비스", "전자 하드웨어와 연결되는 소프트웨어·정보 서비스"), ("금속", "전자부품의 금속 소재")),
    "기계·장비": (("금속", "산업 기계의 금속 원재료·부품"), ("전기·전자", "기계 제어·자동화에 쓰이는 전자부품"), ("운송장비·부품", "자동차·선박 생산에 쓰이는 제조 설비")),
    "운송장비·부품": (("금속", "차량·선박의 금속 소재"), ("기계·장비", "운송장비 생산 설비·기계 부품"), ("화학", "운송장비에 쓰이는 고무·플라스틱·배터리 소재")),
    "화학": (("전기·전자", "전자제품·배터리에 쓰이는 화학 소재"), ("운송장비·부품", "차량 부품에 쓰이는 화학 소재"), ("섬유·의류", "합성섬유와 의류 원료")),
    "제약": (("의료·정밀기기", "의약품과 함께 쓰이는 진단·치료 장비"), ("화학", "의약품 원료·합성 소재"), ("유통", "의약품의 도소매·유통 경로")),
    "의료·정밀기기": (("제약", "진단·치료 과정에서 함께 쓰이는 의약품"), ("전기·전자", "의료기기의 전자 센서·부품"), ("기계·장비", "정밀기기 제작·생산 설비")),
    "금속": (("기계·장비", "금속을 가공하고 사용하는 산업 기계"), ("운송장비·부품", "철강·비철금속을 사용하는 차량·선박"), ("건설", "건축·토목에 쓰이는 금속 자재")),
    "비금속": (("건설", "시멘트·유리 등 건설 자재"), ("기계·장비", "비금속 소재의 생산·가공 장비"), ("전기·전자", "전자부품에 쓰이는 유리·세라믹 소재")),
    "건설": (("비금속", "시멘트·유리 등 건설 자재 공급"), ("금속", "철강 등 건설 자재 공급"), ("기계·장비", "건설 현장의 기계·장비")),
    "전기·가스": (("기계·장비", "발전·에너지 공급 설비"), ("전기·전자", "송배전·전력 제어 장비"), ("건설", "발전소·에너지 기반시설 시공")),
    "음식료·담배": (("유통", "식음료의 도소매 판매 경로"), ("운송·창고", "식음료 운송·보관 물류"), ("종이·목재", "식음료의 종이 포장재")),
    "섬유·의류": (("화학", "합성섬유·염료 등 의류 원료"), ("유통", "의류의 도소매 판매 경로"), ("운송·창고", "의류 운송·보관 물류")),
    "가죽·신발": (("섬유·의류", "패션 제품의 소재·의류 생태계"), ("유통", "신발·가죽제품의 도소매 판매 경로"), ("화학", "신발·가죽제품의 합성 소재")),
    "종이·목재": (("유통", "상품 포장·판매에 쓰이는 종이 자재"), ("출판·매체복제", "인쇄·출판에 쓰이는 종이"), ("건설", "건축에 쓰이는 목재 자재"), ("음식료·담배", "식음료의 종이 포장 수요")),
    "출판·매체복제": (("종이·목재", "출판·인쇄에 쓰이는 종이 원료"), ("오락·문화", "출판물과 연결되는 문화 콘텐츠"), ("유통", "출판물의 판매 경로")),
    "유통": (("운송·창고", "상품 운송·보관 물류"), ("음식료·담배", "주요 소비재 공급 업종"), ("섬유·의류", "주요 패션 소비재 공급 업종")),
    "운송·창고": (("운송장비·부품", "물류에 쓰이는 차량·선박"), ("유통", "상품 유통의 운송·보관 수요"), ("화학", "물류 운송과 연결되는 연료·화학 소재")),
    "IT 서비스": (("전기·전자", "정보 서비스에 쓰이는 서버·전자 장비"), ("통신", "정보 서비스의 통신망"), ("오락·문화", "디지털 콘텐츠의 제작·서비스"), ("기계·장비", "산업 자동화의 정보 시스템")),
    "통신": (("전기·전자", "통신망의 전자 장비·부품"), ("IT 서비스", "통신망 위에서 제공되는 정보 서비스"), ("오락·문화", "통신망으로 유통되는 미디어 콘텐츠")),
    "오락·문화": (("IT 서비스", "디지털 콘텐츠·플랫폼 운영"), ("통신", "콘텐츠 전송·배급망"), ("전기·전자", "콘텐츠 제작·시청에 쓰이는 전자 장비"), ("출판·매체복제", "문화 콘텐츠의 출판·복제")),
    "금융": (("증권", "기업·가계의 자본시장 금융 서비스"), ("보험", "금융 자산 운용·위험 보장"), ("부동산", "부동산 개발·운영 자금 조달")),
    "증권": (("금융", "예금·대출과 연결되는 자본시장 자금"), ("보험", "기관 자산 운용과 자본시장"), ("부동산", "부동산 투자·개발 금융")),
    "보험": (("금융", "금융 자산 운용·위험 관리"), ("증권", "보험 자산의 자본시장 운용"), ("의료·정밀기기", "건강 보장과 연결되는 진단·치료 산업")),
    "부동산": (("건설", "부동산의 개발·시공"), ("금융", "부동산의 자금 조달"), ("비금속", "건축물에 쓰이는 비금속 자재")),
}


def related_sectors(sectors: list[HeatmapSector], leader: HeatmapSector) -> list[RelatedSector]:
    """관련 업종 3개와 각 업종 시가총액 상위 2개 실제 기업을 선택한다."""
    eligible = {
        sector.code: sector for sector in sectors
        if sector.code != leader.code
        and sector.change_rate is not None and math.isfinite(sector.change_rate)
        and len([stock for stock in sector.stocks if math.isfinite(stock.market_cap) and stock.market_cap > 0]) >= 2
    }
    result: list[RelatedSector] = []
    used: set[str] = set()

    def add(sector: HeatmapSector, reason: str, kind: str) -> None:
        used.add(sector.code)
        stocks = sorted((stock for stock in sector.stocks if math.isfinite(stock.market_cap) and stock.market_cap > 0), key=lambda stock: (-stock.market_cap, stock.code))[:2]
        result.append(RelatedSector(code=sector.code, name=sector.name, change_rate=sector.change_rate, reason=reason, relationship_kind=kind, stocks=stocks))

    for name, reason in _RELATIONS.get(leader.name, ()):
        matches = sorted((sector for sector in eligible.values() if sector.name == name and sector.code not in used), key=lambda sector: (-sector.market_cap, sector.code))
        if matches:
            add(matches[0], reason, "industry")
        if len(result) == 3:
            return result
    # 업종 분류가 거칠거나 해당 시장에 연결 업종이 없으면 연관성이 있다고 꾸미지 않는다.
    for sector in sorted(eligible.values(), key=lambda item: (-item.change_rate, -item.market_cap, item.code)):
        if sector.code not in used:
            add(sector, "산업 연관 규칙이 부족해 같은 시장의 등락률 상위 업종을 함께 표시합니다.", "market_trend")
        if len(result) == 3:
            break
    return result
