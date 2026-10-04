# briefing_service.py
# 수집한 데이터로 LLM 브리핑과 불개미(주식 입문자) 해설을 만든다.
#   1) 브리핑: 수집 데이터 -> 헤드라인 + 부제 + 포인트 3개
#      부제·포인트 1은 코드가 확정 수치로 쓰고(_fact_subtitle·_fact_point, 숫자·형식 오류 방지), LLM은 헤드라인과 뉴스 기반 포인트 2개를 쓴다
#   2) 불개미 해설: 수집 데이터 + 브리핑 -> 문단 3개 (해설만 _GUIDE_MODEL). 문단마다 유형(kind)을 고르게 한다
#   3) 자동 검사: 퍼센트 표기·비교 표현을 코드로 고치고(text_review), 사실이 틀릴 수 있는 문단에 사유(review_note)를 붙인다
#      문단은 빼지 않는다. 사유가 붙으면 화면에 "확인 중"으로 표시되고 검수 테이블(timeline_text_hold)에도 남는다
#      코드가 쓴 부제·포인트 1은 확정 수치라 검사하지 않는다
# 프롬프트 문구는 prompts.py에 있다.

import json
import logging
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from backend.core import llm_client
from backend.domain.timeline.services import prompts, text_review

_KST = ZoneInfo("Asia/Seoul")

logger = logging.getLogger(__name__)

# 급상승 종목 등락률(전일 종가 대비)에 정규장 상승분이 들어가는 슬롯. 자동 검사에서 "애프터마켓에서 올랐다"를 잡는다
_AFTERMARKET_SLOTS = {"17:30", "20:00"}

# 해설 모델. 해설은 "왜 그런지" 설명을 만들며 원인을 지어내기 쉬워 기본 모델(flash-lite)보다 사실 오류가 적은 모델을 쓴다
# 이 모델은 무료 하루 20회다 (해설 8회 + 보고서 1~2회). 실패하면(한도 초과 등) 기본 모델로 한 번 더 만든다. None이면 처음부터 기본 모델
# 브리핑·뉴스 선별은 기본 모델 그대로다
_GUIDE_MODEL = "gemini-3.6-flash"

# 브리핑 포인트·해설 문단 개수. 바꾸면 저장되는 개수가 바뀐다 (프롬프트의 출력 형식도 같이 맞출 것)
_POINT_COUNT = 3


# 확정 수치 문장(부제·포인트 1)에 쓰는 이름. 지표 API 이름 -> 화면 이름
_DISPLAY_NAMES = {"NASDAQ": "나스닥", "S&P500": "S&P500", "NIKKEI": "니케이", "KOSPI": "코스피", "KOSDAQ": "코스닥", "USD/KRW": "원·달러 환율"}

# 포인트 1(확정 수치) 소제목. 슬롯 재료가 없으면 포인트 1을 코드로 만들지 않고 LLM이 3개를 다 쓴다
_FACT_POINT_TITLES = {
    "07:30": "밤사이 해외 증시와 환율",
    "08:30": "프리마켓 급상승 종목 TOP3",
    "09:30": "코스피 업종 등락률 TOP3",
    "12:00": "코스피 업종 등락률 TOP3",
    "14:00": "코스피 업종 등락률 TOP3",
    "15:30": "지수·환율 마감",
    "17:30": "애프터마켓 급상승 종목 TOP3",
    "20:00": "애프터마켓 급상승 종목 TOP3",
}


# 등락률 -> "0.85%" (부호 없이 소수 둘째 자리. 방향은 _direction으로 따로 쓴다)
def _rate(value: float) -> str:
    return f"{abs(value):.2f}%"


# 등락률 -> 방향 단어
def _direction(value: float) -> str:
    return "상승" if value > 0 else "하락" if value < 0 else "보합"


# 가격 -> "6,627.26" / "46,700"
def _number(value: float) -> str:
    return f"{int(value):,}" if float(value).is_integer() else f"{value:,.2f}".rstrip("0").rstrip(".")


# [(이름, 등락률)] -> "나스닥 0.56%·S&P500 0.48% 하락, 니케이 0.09% 상승" (같은 방향끼리 묶는다)
def _joined_rates(items: list[tuple[str, float]]) -> str:
    groups: dict[str, list[str]] = {}
    for name, value in items:
        groups.setdefault(_direction(value), []).append(f"{name} {_rate(value)}" if value else name)
    return ", ".join(f"{'·'.join(names)} {direction}" for direction, names in groups.items())


# 부제를 확정 수치로 만든다 (명사형). 재료가 없으면 None -> LLM 부제를 쓴다
def _fact_subtitle(time_slot: str, indicators: list[dict], sectors: list[dict], top_gainers: list[dict], intraday_changes: list[dict]) -> str | None:
    by_name = {item["name"]: item for item in indicators}
    if time_slot == "07:30" and {"NASDAQ", "S&P500", "USD/KRW"} <= by_name.keys():
        overseas = [(_DISPLAY_NAMES[name], by_name[name]["change_rate"]) for name in ("NASDAQ", "S&P500")]
        return f"{_joined_rates(overseas)}, 원·달러 환율 {_number(by_name['USD/KRW']['price'])}원"
    if time_slot in ("08:30", "17:30", "20:00") and top_gainers:
        return _joined_rates([(row["name"], row["change_rate"]) for row in top_gainers])
    if time_slot in ("09:30", "12:00", "14:00") and sectors:
        return _joined_rates([(sector["name"], sector["change_rate"]) for sector in sectors])
    if time_slot == "15:30" and intraday_changes:
        closes = [(_DISPLAY_NAMES.get(row["name"], row["name"]), row["change_rate"]) for row in intraday_changes if row["name"] in ("KOSPI", "KOSDAQ")]
        if closes:
            subtitle = _joined_rates(closes)
            return f"{subtitle}, {_joined_rates([(sectors[0]['name'], sectors[0]['change_rate'])])}" if sectors else subtitle
    return None


# 포인트 1을 확정 수치로 만든다 ({"title", "body"}). 재료가 없으면 None
def _fact_point(time_slot: str, indicators: list[dict], sectors: list[dict], top_gainers: list[dict], intraday_changes: list[dict]) -> dict | None:
    body = None
    if time_slot == "07:30" and indicators:
        by_name = {item["name"]: item for item in indicators}

        def price_rate(name: str, unit: str = "") -> str:
            item = by_name[name]
            return f"{_DISPLAY_NAMES[name]} {_number(item['price'])}{unit}({_rate(item['change_rate'])} {_direction(item['change_rate'])})"

        overseas = [price_rate(name) for name in ("NASDAQ", "S&P500", "NIKKEI") if name in by_name]
        domestic = [price_rate(name) for name in ("KOSPI", "KOSDAQ") if name in by_name]
        rest = ([price_rate("USD/KRW", "원")] if "USD/KRW" in by_name else []) + (["전 거래일 " + "·".join(domestic)] if domestic else [])
        sentences = [f"{', '.join(part)}입니다." for part in (overseas, rest) if part]
        body = " ".join(sentences) or None
    elif time_slot in ("08:30", "17:30", "20:00") and top_gainers:
        stocks = ", ".join(f"{row['name']} {_number(row['price'])}원({_rate(row['change_rate'])} {_direction(row['change_rate'])})" for row in top_gainers)
        basis = "넥스트레이드 프리마켓" if time_slot == "08:30" else "한국거래소 애프터마켓 가격 기준으로"
        basis_word = "전일 종가(상장 첫날 종목은 공모가) 대비"
        body = f"{basis}에서 {basis_word} 등락률이 가장 높은 종목은 {stocks}입니다." if time_slot == "08:30" else f"{basis} {basis_word} 등락률이 가장 높은 종목은 {stocks}입니다."
    elif time_slot in ("09:30", "12:00", "14:00") and sectors:
        ranks = ", ".join(f"{sector['name']}({_rate(sector['change_rate'])} {_direction(sector['change_rate'])})" for sector in sectors)
        leader = sectors[0]
        stocks = ", ".join(f"{stock['name']}({_rate(stock['change_rate'])} {_direction(stock['change_rate'])}, {stock['label']})" for stock in leader["stocks"])
        body = f"코스피 업종 등락률 상위는 {ranks} 순입니다."
        if stocks:
            body += f" 1위 {leader['name']}의 대표 종목은 {stocks}입니다."
    elif time_slot == "15:30" and intraday_changes:
        order = {"KOSPI": 0, "KOSDAQ": 1, "USD/KRW": 2}
        rows = ", ".join(
            f"{_DISPLAY_NAMES.get(row['name'], row['name'])} {_number(row['closing_price'])}{'원' if row['name'] == 'USD/KRW' else ''}({_rate(row['change_rate'])} {_direction(row['change_rate'])})"
            for row in sorted(intraday_changes, key=lambda row: order.get(row["name"], 9))
        )
        body = f"07:30 대비 마감 기준으로 {rows}입니다."
        if sectors:
            body += f" 코스피 업종 등락률 1위는 {sectors[0]['name']}({_rate(sectors[0]['change_rate'])} {_direction(sectors[0]['change_rate'])})입니다."
    return {"title": _FACT_POINT_TITLES[time_slot], "body": body} if body else None


# 가격을 LLM에 넘길 모양으로 바꾼다. 소수점 아래가 0이면 정수로 넘긴다 (46700.0을 그대로 주면 "46700.0원"처럼 옮겨 쓴다)
def _price(value: float) -> float | int:
    return int(value) if float(value).is_integer() else value


# LLM 입력용 JSON 문자열을 만든다. 슬롯마다 채워진 항목만 들어간다
#   지표(07:30) / 장중 변화(15:30) / 주도 섹터(정규장 슬롯) / 급상승 종목(정규장 밖 슬롯) / 뉴스
# 시세 값은 "확정 수치", 기사는 "뉴스"로 나눈다. 프롬프트가 둘을 구분해서 쓰게 하기 위해서다
# 새 재료를 LLM에 넘기려면 확정 딕셔너리에 항목을 추가한다
def _build_data(indicators: list[dict], sectors: list[dict], top_gainers: list[dict], intraday_changes: list[dict], news: list[dict]) -> str:
    확정 = {
        "지표": [{"이름": item["name"], "가격": _price(item["price"]), "등락률(%)": item["change_rate"]} for item in indicators],
        "장중 변화": [
            {"이름": row["name"], "07:30 가격": _price(row["morning_price"]), "마감 가격": _price(row["closing_price"]), "변동률(%)": row["change_rate"]}
            for row in intraday_changes
        ],
        "주도 섹터": [
            {
                "업종": sector["name"],
                "등락률(%)": sector["change_rate"],
                "종목": [{"이름": stock["name"], "등락률(%)": stock["change_rate"], "구분": stock["label"]} for stock in sector["stocks"]],
            }
            for sector in sectors
        ],
        "급상승 종목": [{"이름": row["name"], "전일 종가(상장 첫날 종목은 공모가) 대비 등락률(%)": row["change_rate"], "가격(원)": _price(row["price"])} for row in top_gainers],
    }

    # 빈 항목은 넣지 않는다 (빈 배열이 있으면 LLM이 "데이터가 없다" 쪽으로 글을 짧게 쓴다)
    payload = {
        "확정 수치": {key: value for key, value in 확정.items() if value},
        "뉴스": [{"발행시각": f"{item['published_at']:%m-%d %H:%M}", "제목": item["title"], "요약": item["summary"]} for item in news],
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)


# 브리핑을 만든다. 실패하면 None (브리핑이 없어도 슬롯의 나머지는 저장된다)
#   fact_point  코드가 확정 수치로 쓴 포인트 1. 있으면 LLM은 나머지 포인트만 뉴스로 쓰고, 결과 맨 앞에 붙인다
#   fact_subtitle  코드가 확정 수치로 쓴 부제. 있으면 LLM 부제 대신 쓴다
def _generate_briefing(time_slot: str, data: str, now: datetime, fact_point: dict | None = None, fact_subtitle: str | None = None) -> dict | None:
    llm_point_count = _POINT_COUNT - 1 if fact_point else _POINT_COUNT
    written = (
        f"아래 포인트는 코드가 [확정 수치]로 이미 작성해 화면 맨 앞에 붙인다. points에 이 포인트를 다시 넣거나 이 수치를 다시 나열하지 마라.\n{json.dumps(fact_point, ensure_ascii=False)}"
        if fact_point
        else "없음"
    )
    try:
        answer = llm_client.generate_json(
            prompts.BRIEFING_PROMPT.format(
                time_slot=time_slot,
                title=prompts.SLOT_TITLES[time_slot],
                focus=prompts.SLOT_FOCUS[time_slot],
                now=f"{now:%Y-%m-%d %H:%M}",
                data=data,
                written=written,
                point_count=llm_point_count,
            )
        )
    except (RuntimeError, ValueError, KeyError, httpx.HTTPError) as error:
        logger.warning("브리핑 생성 실패 - %s: %s", type(error).__name__, error)
        return None

    points = [point for point in answer.get("points", []) if isinstance(point, dict) and point.get("title") and point.get("body")]
    if not answer.get("headline") or not points:
        logger.warning("브리핑 응답에 필요한 값이 없습니다.")
        return None

    # LLM이 코드가 쓴 포인트 1을 그대로 옮겨 쓰면 뺀다 (제목이 같거나 본문 앞부분이 같으면)
    if fact_point:
        points = [point for point in points if point["title"] != fact_point["title"] and not (len(point["body"]) >= 25 and point["body"][:25] in fact_point["body"])]
    points = ([fact_point] if fact_point else []) + points[:llm_point_count]
    return {
        "headline": text_review.normalize_percent(answer["headline"]),
        "subtitle": fact_subtitle or text_review.normalize_percent(answer.get("subtitle") or ""),
        "points": [{"seq": seq, "title": text_review.normalize_percent(point["title"]), "body": text_review.normalize_percent(point["body"])} for seq, point in enumerate(points, start=1)],
    }


# 불개미 해설을 만든다. 재료는 수집 데이터(data)와 브리핑
# 브리핑이 없거나 실패하면 빈 목록
def _generate_beginner_guides(data: str, briefing: dict | None) -> list[dict]:
    if briefing is None:
        return []

    prompt = prompts.BEGINNER_PROMPT.format(data=data, briefing=json.dumps(briefing, ensure_ascii=False))
    points = []
    for model in dict.fromkeys([_GUIDE_MODEL or llm_client.DEFAULT_MODEL, llm_client.DEFAULT_MODEL]):
        try:
            answer = llm_client.generate_json(prompt, timeout=120.0, model=model)
        except (RuntimeError, ValueError, KeyError, httpx.HTTPError) as error:
            logger.warning("불개미 해설 생성 실패 (%s) - %s: %s", model, type(error).__name__, error)
            continue
        points = [point for point in answer.get("points", []) if isinstance(point, dict) and point.get("title") and point.get("body")]
        if points:
            break
        logger.warning("불개미 해설 응답에 문단이 없습니다 (%s).", model)
    if not points:
        return []

    return [
        {
            "seq": seq,
            # 문단 유형. BEGINNER_PROMPT가 고르게 한 값이고 text_review.guide_issues가 검사한다 (DB에는 보류될 때만 남는다)
            "kind": str(point.get("kind") or ""),
            "title": text_review.normalize_percent(point["title"]),
            "body": text_review.normalize_percent(point["body"]),
            # 태그는 최대 3개. DB에는 쉼표로 이어붙여 한 칸에 저장한다
            "tags": [str(tag) for tag in point.get("tags", []) if tag][:3],
        }
        for seq, point in enumerate(points[:_POINT_COUNT], start=1)
    ]


# 브리핑과 불개미 해설을 한 번에 만든다. timeline_service가 호출한다
# 실패해도 예외를 올리지 않는다. 반환: (브리핑 또는 None, 해설 목록, 확인 필요 문단 목록)
# 확인 필요 문단은 검수 테이블에 저장한다 (본 문단은 review_note가 붙은 채로 그대로 저장된다)
def generate(
    time_slot: str,
    *,
    indicators: list[dict],
    sectors: list[dict],
    top_gainers: list[dict],
    intraday_changes: list[dict],
    news: list[dict],
    now: datetime | None = None,
) -> tuple[dict | None, list[dict]]:
    data = _build_data(indicators, sectors, top_gainers, intraday_changes, news)
    now = now or datetime.now(_KST)
    fact_point = _fact_point(time_slot, indicators, sectors, top_gainers, intraday_changes)
    fact_subtitle = _fact_subtitle(time_slot, indicators, sectors, top_gainers, intraday_changes)
    briefing = _generate_briefing(time_slot, data, now, fact_point, fact_subtitle)
    guides = _generate_beginner_guides(data, briefing)
    if briefing is None:
        return None, guides, []
    return _check(time_slot, data, briefing, guides, fact_point is not None)


# 브리핑·해설을 자동 검사해 (브리핑, 해설, 확인 필요 목록) 으로 돌려준다
# 문단은 빼지 않는다. 사실이 틀릴 수 있는 문단에는 사유(review_note)를 붙여 화면에 "확인 중"으로 표시한다
#   has_fact_point True면 포인트 1은 코드가 확정 수치로 쓴 문장이라 검사하지 않는다
# 17:30·20:00은 급상승 종목 등락률 기준(전일 종가 대비) 표현도 검사한다
def _check(time_slot: str, data: str, briefing: dict, guides: list[dict], has_fact_point: bool) -> tuple[dict, list[dict], list[dict]]:
    aftermarket = time_slot in _AFTERMARKET_SLOTS

    head = text_review.check(
        f"{time_slot} 브리핑 제목",
        {"headline": briefing["headline"], "subtitle": briefing["subtitle"]},
        data,
        aftermarket_basis=aftermarket,
    )
    # 부제는 명사형이어야 한다 (프롬프트 subtitle 규칙). 문장으로 끝나면 경고만 남긴다
    if head["subtitle"].rstrip(". ").endswith(("니다", "어요", "해요")):
        logger.warning("%s 브리핑 부제가 문장형입니다 (저장 후 확인 필요): %s", time_slot, head["subtitle"])

    # 코드가 쓴 포인트 1은 확정 수치라 검사 대상에서 빼고 그대로 앞에 붙인다
    fact_points = briefing["points"][:1] if has_fact_point else []
    llm_points = briefing["points"][1:] if has_fact_point else briefing["points"]
    points, flagged_points = text_review.review(f"{time_slot} 브리핑 포인트", llm_points, data, aftermarket_basis=aftermarket)
    reviewed_guides, flagged_guides = text_review.review(f"{time_slot} 해설", guides, data, aftermarket_basis=aftermarket)

    checked = {
        "headline": head["headline"],
        "subtitle": head["subtitle"],
        "points": [
            {"seq": seq, "title": point["title"], "body": point["body"], "review_note": _review_note(point)}
            for seq, point in enumerate(fact_points + points, start=1)
        ],
    }
    guides_out = [
        {"seq": seq, "kind": guide["kind"], "title": guide["title"], "body": guide["body"], "tags": guide["tags"], "review_note": _review_note(guide)}
        for seq, guide in enumerate(reviewed_guides, start=1)
    ]
    flagged = [_hold_row("briefing_point", item) for item in flagged_points] + [_hold_row("guide", item) for item in flagged_guides]
    return checked, guides_out, flagged


# 문단에 붙은 사유를 한 칸에 담는다 (없으면 None = 정상 문구)
def _review_note(item: dict) -> str | None:
    return "\n".join(item.get("issues", [])) or None


# 확인이 필요한 문단 하나를 검수 테이블 형태로 바꾼다 (timeline_repository가 그대로 저장한다)
def _hold_row(part: str, item: dict) -> dict:
    return {
        "part": part,
        "seq": item.get("seq", 0),
        "kind": item.get("kind") or None,
        "title": item.get("title"),
        "body": item.get("body", ""),
        "tags": ", ".join(item.get("tags", [])) or None,
        "issues": "\n".join(item.get("issues", [])),
    }
