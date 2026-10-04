# top_gainer_service.py
# 정규장 밖 슬롯(08:30 / 17:30 / 20:00)에 넣을 급상승 종목 TOP3를 뽑는다.
# 이 시간대에는 업종 지수가 산출되지 않아 주도 섹터 대신 이 값을 쓴다.

from backend.core import kis_client

# 뽑을 종목 수. 바꾸면 슬롯에 저장되는 급상승 종목 개수가 바뀐다
_TOP_COUNT = 3

# 슬롯별 조회 방식. slot_key -> 방식 (그 시간대에 거래되는 시장 중 종목이 가장 넓은 곳을 쓴다)
#   "nxt"      : 넥스트레이드 등락률 순위 - 08:30 프리마켓 (KRX는 프리마켓이 없다)
#   "krx"      : 한국거래소 등락률 순위 - 17:30·20:00 애프터마켓 (16:00~20:00, 코스피·코스닥 전 종목. NXT는 600여 종목)
# KRX 프리마켓이 열리면 "0830"도 "krx"로 옮길지 검토한다
# 여기 없는 슬롯은 급상승 종목을 넣지 않는다. 바꾸면 prompts.SLOT_FOCUS와 BRIEFING_PROMPT의 시장 이름도 같이 고친다
SOURCE_BY_SLOT = {
    "0830": "nxt",
    "1730": "krx",
    "2000": "krx",
}

# 방식 -> 등락률 순위 시장구분코드
_MARKET_BY_SOURCE = {"nxt": "NX", "krx": "J"}


# 순위 응답을 [{seq, name, change_rate, price}] 형태의 TOP3로 만든다
# 화면에 보여주는 등락률(prdy_ctrt)로 한 번 더 정렬한다 (API 정렬 기준이 바뀌어도 순서가 틀리지 않도록)
# 등락률이 같으면(상한가 종목이 여럿일 때) 누적 거래량(acml_vol)이 많은 종목을 앞에 둔다
def _to_rows(raw: dict) -> list[dict]:
    rows = raw.get("output") or []

    parsed = []
    for item in rows:
        # 숫자가 비어 오는 행은 건너뛴다
        try:
            change_rate = float(item["prdy_ctrt"])
            price = float(item["stck_prpr"])
        except (KeyError, TypeError, ValueError):
            continue
        try:
            volume = int(item.get("acml_vol") or 0)
        except ValueError:
            volume = 0
        parsed.append(({"name": item["hts_kor_isnm"], "change_rate": change_rate, "price": price}, volume))

    parsed.sort(key=lambda pair: (pair[0]["change_rate"], pair[1]), reverse=True)
    return [{"seq": seq, **row} for seq, (row, _) in enumerate(parsed[:_TOP_COUNT], start=1)]


# 슬롯의 급상승 종목 TOP3를 돌려준다. SOURCE_BY_SLOT에 없는 슬롯이면 빈 목록
def collect(slot_key: str) -> list[dict]:
    source = SOURCE_BY_SLOT.get(slot_key)
    if source is None:
        return []

    return _to_rows(kis_client.get_fluctuation_ranking(sector_code="0000", market_div_code=_MARKET_BY_SOURCE[source]))
