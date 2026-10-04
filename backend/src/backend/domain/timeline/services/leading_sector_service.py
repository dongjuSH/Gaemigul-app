# leading_sector_service.py
# 주도 섹터를 뽑는다: 코스피 업종 등락률 TOP3 + 각 업종의 상승 1위·거래대금 1위 종목.
# 정규장 슬롯(09:30 / 12:00 / 14:00 / 15:30)에서만 쓴다. 한 번 실행에 KIS 7회 호출.

from backend.core import kis_client

# 주도 섹터 후보로 쓸 코스피 업종 (업종코드: 업종명)
# 업종 목록 API에는 종합·대형주·VKOSPI·전략지수 같은 비업종이 섞여 와서 여기 있는 것만 쓴다
# 금융(0021)의 하위인 증권(0024)·보험(0025)은 금융과 겹쳐서 뺐다
# 업종을 추가·제외하려면 이 표를 고친다
KOSPI_SECTOR_CODES = {
    "0005": "음식료·담배",
    "0006": "섬유·의류",
    "0007": "종이·목재",
    "0008": "화학",
    "0009": "제약",
    "0010": "비금속",
    "0011": "금속",
    "0012": "기계·장비",
    "0013": "전기·전자",
    "0014": "의료·정밀기기",
    "0015": "운송장비·부품",
    "0016": "유통",
    "0017": "전기·가스",
    "0018": "건설",
    "0019": "운송·창고",
    "0020": "통신",
    "0021": "금융",
    "0026": "일반서비스",
    "0028": "부동산",
    "0029": "IT 서비스",
    "0030": "오락·문화",
}

# 종목 옆에 붙는 꼬리표. 바꾸면 화면 문구가 바뀐다
_LABEL_TOP_GAINER = "상승 1위"
_LABEL_TOP_TRADED = "거래 1위"
_LABEL_BOTH = "상승·거래 1위"


# 순위 응답에서 1위 행만 꺼낸다 (없으면 None). 거래대금 순위에 쓴다 (API 순서 = 거래대금 순)
def _top_row(raw: dict) -> dict | None:
    rows = raw.get("output") or []
    return rows[0] if rows else None


# 등락률 순위 응답에서 등락률(prdy_ctrt)이 가장 높은 행 (없으면 None)
# API 순서를 그대로 믿지 않고 화면에 보여주는 숫자로 고른다
def _top_gainer_row(raw: dict) -> dict | None:
    rows = [row for row in raw.get("output") or [] if row.get("prdy_ctrt")]
    return max(rows, key=lambda row: float(row["prdy_ctrt"])) if rows else None


# 업종 하나의 대표 종목 [{name, change_rate, label}] 0~2개
# 상승 1위와 거래대금 1위가 같은 종목이면 "상승·거래 1위" 한 줄로 합친다
def _collect_sector_stocks(sector_code: str) -> list[dict]:
    top_gainer = _top_gainer_row(kis_client.get_fluctuation_ranking(sector_code))
    top_traded = _top_row(kis_client.get_volume_ranking(sector_code))

    stocks = []
    if top_gainer and top_traded and top_gainer["hts_kor_isnm"] == top_traded["hts_kor_isnm"]:
        stocks.append(
            {
                "name": top_gainer["hts_kor_isnm"],
                "change_rate": float(top_gainer["prdy_ctrt"]),
                "label": _LABEL_BOTH,
            }
        )
        return stocks

    if top_gainer:
        stocks.append(
            {
                "name": top_gainer["hts_kor_isnm"],
                "change_rate": float(top_gainer["prdy_ctrt"]),
                "label": _LABEL_TOP_GAINER,
            }
        )
    if top_traded:
        stocks.append(
            {
                "name": top_traded["hts_kor_isnm"],
                "change_rate": float(top_traded["prdy_ctrt"]),
                "label": _LABEL_TOP_TRADED,
            }
        )
    return stocks


# 주도 섹터 [{code, name, change_rate, stocks}]를 돌려준다. limit를 바꾸면 뽑는 업종 수가 바뀐다
# 등락률은 전일 종가 대비다. 시장 전체가 빠진 날은 "가장 덜 빠진" 3개가 나온다(마이너스 값)
def collect(limit: int = 3) -> list[dict]:
    raw = kis_client.get_index_category_price("K")
    rows = raw.get("output2") or []

    # 업종 목록은 업종코드 순으로 오므로 받은 뒤 등락률로 정렬한다
    sectors = [row for row in rows if row.get("bstp_cls_code") in KOSPI_SECTOR_CODES]
    sectors.sort(key=lambda row: float(row["bstp_nmix_prdy_ctrt"]), reverse=True)

    result = []
    for row in sectors[:limit]:
        sector_code = row["bstp_cls_code"]
        result.append(
            {
                "code": sector_code,
                "name": row["hts_kor_isnm"],
                "change_rate": float(row["bstp_nmix_prdy_ctrt"]),
                "stocks": _collect_sector_stocks(sector_code),
            }
        )
    return result
