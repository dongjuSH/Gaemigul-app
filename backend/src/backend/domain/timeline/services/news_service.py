# news_service.py
# 슬롯별 주요 뉴스를 모은다.
# 네이버 뉴스 검색(검색어 여러 개) -> 슬롯 구간 필터 -> 중요도 점수로 후보 추림 -> LLM이 최종 선별

import html
import logging
import re

import httpx
from datetime import date, datetime, time, timedelta
from email.utils import parsedate_to_datetime
from zoneinfo import ZoneInfo

from backend.core import llm_client, naver_client
from backend.domain.timeline.services import prompts

_KST = ZoneInfo("Asia/Seoul")

logger = logging.getLogger(__name__)

# 슬롯별 검색어. 바꾸면 그 슬롯에 모이는 기사가 바뀐다
# 짧은 단어·기사 말머리("개장시황")가 잘 맞고, 일상어("환율")는 좁혀서("원달러 환율") 쓴다
_SLOT_KEYWORDS = {
    "07:30": ["뉴욕증시", "미국 증시", "나스닥", "국제유가", "미국 국채금리", "원달러 환율"],
    "08:30": ["증시 전망", "코스피 개장", "글로벌 증시", "원달러 환율", "국제유가"],
    "09:30": ["개장시황", "코스피", "코스닥", "특징주", "외국인 순매수"],
    "12:00": ["장중시황", "코스피", "코스닥", "특징주", "외국인 순매수"],
    "14:00": ["장중시황", "코스피", "코스닥", "특징주", "기관 순매수"],
    "15:30": ["마감시황", "코스피", "코스닥", "특징주", "증시 마감"],
    "17:30": ["마감시황", "코스피", "코스닥", "특징주", "증시 마감"],
    "20:00": ["증시 전망", "시황", "내일 증시", "코스피", "글로벌 증시"],
}

# 검색어 하나당 받아올 기사 수. 네이버 API 최대값이 100이다
# 호출 1번에 받는 건수라 늘려도 호출 수(한도 기준)는 그대로다. 30건일 때 오후 슬롯은 구간 안 후보가 3~4건뿐이었다(9/15 15:30)
_FETCH_PER_KEYWORD = 100

# 슬롯별 뉴스 구간 시작. (시작 시각, 전날인지) - 끝은 그 슬롯 시각이다
# 구간은 [시작, 끝)이라 슬롯끼리 겹치지도 비지도 않는다 (07:30 슬롯 = 전날 20:00 ~ 07:29)
# 시작 시각을 바꾸면 그 슬롯이 담는 기사의 시간 범위가 바뀐다
_SLOT_WINDOW = {
    "07:30": ("20:00", True),
    "08:30": ("07:30", False),
    "09:30": ("08:30", False),
    "12:00": ("09:30", False),
    "14:00": ("12:00", False),
    "15:30": ("14:00", False),
    "17:30": ("15:30", False),
    "20:00": ("17:30", False),
}

# 구간 안 기사가 _MIN_ITEMS건 미만이면 끝에서 _FALLBACK_HOURS시간 전까지 넓혀 다시 거른다 (넓히면 앞 슬롯 기사가 섞일 수 있다)
# _PICK_MIN과 같게 둔다. 작으면 후보가 하한보다 적어도 넓히지 않아 하한을 못 채운다
_MIN_ITEMS = 4
_FALLBACK_HOURS = 6

# 중요도 점수 = 검색어별 순위를 1/(_RANK_BIAS + 순위)로 바꿔 합산
# 키우면 "여러 검색어에 걸렸는지"가, 줄이면 "각 검색어에서 1등인지"가 더 중요해진다
_RANK_BIAS = 60

# LLM에게 넘길 후보 기사 수 (기본값 / 슬롯별 예외). 07:30은 구간이 길어 두 배로 둔다
_CANDIDATE_LIMIT_DEFAULT = 30
_CANDIDATE_LIMITS = {"07:30": 60}

# 슬롯당 실을 기사 수의 하한·상한. 바꾸면 저장·응답에 그대로 반영된다
# (timeline_service._NEWS_LIMIT이 _PICK_MAX를 가져다 쓴다)
_PICK_MIN = 4
_PICK_MAX = 8

# LLM에게 요구하는 최소 건수. 하한(_PICK_MIN)보다 크게 두면 기사가 많은 시간대에 LLM이 하한만 고르는 것을 막는다
# 후보가 이보다 적으면 후보 수만큼만 요구한다 (기사가 적은 시간대는 _PICK_MIN까지 줄어든다)
_PICK_TARGET = 5


# 네이버가 넣어 보내는 <b> 태그와 &quot; 같은 HTML 특수문자를 없앤다
def _clean_text(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", "", value)).strip()


# 기사 요약에 섞여 오는 언론사 바이라인·기자 메일. 그대로 두면 화면과 LLM 입력에 들어간다
#   "아주경제=양보연 기자 byeony@ajunews.com 코스피가…" / "[서울=뉴스핌] 이건주 기자 = 14일…" / "…하락하고 있다. | 서울=한스경제 김유진 기자 |"
# 본문에 나온 "기자"까지 지우지 않도록, 요약 맨 앞이거나 괄호·막대로 감싼 칸일 때만 지운다 (제목에는 쓰지 않는다)
_EMAIL = re.compile(r"[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}")
_BYLINE_BAR = re.compile(r"\|\s*[^|]{1,30}기자\s*\|")
_BYLINE_BRACKET = re.compile(r"(?:\([^)]{1,25}\)|\[[^\]]{1,25}\])\s*(?:[가-힣]{2,4}\s+)*[가-힣]{2,4}\s*기자\s*=\s*")
_BYLINE_NAMED = re.compile(r"[가-힣A-Za-z]{2,12}\s*=\s*[가-힣]{2,4}\s*기자\s*(?:[=|]\s*)?")
_BYLINE_HEAD = re.compile(r"^\s*(?:[\[(|][^\])|]{1,25}[\])|]\s*)?(?:[가-힣A-Za-z]{2,12}\s*=\s*)?(?:[가-힣]{2,4}\s+){1,2}기자\s*(?:[=|]\s*)?")
_CAPTION = re.compile(r"\[사진[^\]]{0,40}\]")
_SPACES = re.compile(r"\s{2,}")

# 바이라인을 지우고 남는 홀로 된 구분 기호 ("… 있다. /사진=김유진 기자 | …" -> "… 있다. /")
_DANGLING = re.compile(r"\s[/|]+(?=\s|$)")


def _strip_byline(summary: str) -> str:
    summary = _BYLINE_BAR.sub(" ", _EMAIL.sub(" ", _CAPTION.sub(" ", summary)))
    summary = _BYLINE_HEAD.sub("", _BYLINE_NAMED.sub("", _BYLINE_BRACKET.sub("", summary)))
    return _SPACES.sub(" ", _DANGLING.sub("", summary)).strip()


# pubDate("Thu, 10 Sep 2026 11:00:00 +0900")를 한국 시간 datetime으로 바꾼다
def _parse_pub_date(value: str) -> datetime:
    return parsedate_to_datetime(value).astimezone(_KST)


# 후보 중 실을 기사를 LLM이 번호로 고른다 (기사 내용은 원본 그대로 쓴다)
# 실패하거나 아무것도 안 고르면 점수 상위 limit건, 하한보다 적게 고르면 점수순으로 채운다
def _select_with_llm(time_slot: str, candidates: list[dict], limit: int) -> list[dict]:
    if not candidates:
        return []

    listed = "\n".join(f"{index}. [{item['published_at']:%m-%d %H:%M}] {item['title']} / {item['summary'][:80]}" for index, item in enumerate(candidates))

    try:
        answer = llm_client.generate_json(
            prompts.NEWS_SELECT_PROMPT.format(
                time_slot=time_slot,
                title=prompts.SLOT_TITLES[time_slot],
                focus=prompts.SLOT_FOCUS[time_slot],
                pick_count=limit,
                min_count=min(_PICK_TARGET, len(candidates)),
                candidates=listed,
            )
        )
        # 범위를 벗어난 번호와 중복 번호는 버린다
        seen = set()
        chosen = [index for index in answer.get("selected", []) if isinstance(index, int) and 0 <= index < len(candidates) and not (index in seen or seen.add(index))]
    except (RuntimeError, ValueError, KeyError, httpx.HTTPError) as error:
        logger.warning("뉴스 LLM 선별 실패, 점수순으로 대체합니다 - %s: %s", type(error).__name__, error)
        return candidates[:limit]

    if not chosen:
        logger.warning("뉴스 LLM이 아무것도 고르지 않아 점수순으로 대체합니다.")
        return candidates[:limit]

    selected = [candidates[index] for index in chosen[:limit]]

    if len(selected) < min(_PICK_MIN, len(candidates)):
        already = {item["url"] for item in selected}
        selected += [item for item in candidates if item["url"] not in already][: _PICK_MIN - len(selected)]

    return selected


# "07:30" 형태를 그날의 한국 시간 datetime으로 바꾼다
def _at(day: date, hhmm: str) -> datetime:
    hour, minute = (int(part) for part in hhmm.split(":"))
    return datetime.combine(day, time(hour, minute), tzinfo=_KST)


# 슬롯의 뉴스 구간 (시작, 끝). 끝이 아직 안 왔으면 지금까지로 자른다
def _window(time_slot: str, trade_day: date, now: datetime) -> tuple[datetime, datetime]:
    start_hhmm, starts_yesterday = _SLOT_WINDOW[time_slot]
    start_day = trade_day - timedelta(days=1) if starts_yesterday else trade_day

    start = _at(start_day, start_hhmm)
    end = min(_at(trade_day, time_slot), now)
    return start, end


# 슬롯에 실을 뉴스 목록을 중요도 순으로 돌려준다
#   time_slot  "07:30" 형태. _SLOT_KEYWORDS에 없으면 ValueError
#   limit      최대 건수 (기본 _PICK_MAX)
#   trade_date 어느 날의 슬롯인지 (기본 오늘)
#   now        기준 시각 (기본 지금)
#   use_llm    False면 LLM 선별 없이 점수 상위 limit건
# 반환: [{title, summary, url, published_at, score}] - score는 선별용이라 화면에는 안 나간다
def collect(time_slot: str, *, limit: int = _PICK_MAX, trade_date: date | None = None, now: datetime | None = None, use_llm: bool = True) -> list[dict]:
    if time_slot not in _SLOT_KEYWORDS:
        raise ValueError(f"'{time_slot}'는 뉴스 검색어가 정해지지 않은 슬롯입니다 (_SLOT_KEYWORDS 확인).")

    now = now or datetime.now(_KST)
    start, end = _window(time_slot, trade_date or now.date(), now)

    # 검색어별 결과를 링크 기준으로 합치고, 여러 검색어에 걸린 기사는 점수를 더한다
    # 정렬은 sim(정확도순)이어야 한다. date(최신순)는 검색어와 무관한 기사가 섞인다
    collected: dict[str, dict] = {}
    for keyword in _SLOT_KEYWORDS[time_slot]:
        for rank, item in enumerate(naver_client.search_news(keyword, display=_FETCH_PER_KEYWORD, sort="sim")["items"]):
            # 네이버 뉴스 주소(link)를 쓰고 없으면 언론사 원문(originallink)
            url = item["link"] or item["originallink"]
            if not url:
                continue

            if url in collected:
                collected[url]["score"] += 1 / (_RANK_BIAS + rank)
                continue

            collected[url] = {
                "title": _clean_text(item["title"]),
                "summary": _strip_byline(_clean_text(item["description"])),
                "url": url,
                "published_at": _parse_pub_date(item["pubDate"]),
                "score": 1 / (_RANK_BIAS + rank),
            }

    # 구간 [start, end)에 드는 기사만 남긴다. 너무 적으면 구간을 넓힌다
    picked = [item for item in collected.values() if start <= item["published_at"] < end]
    if len(picked) < _MIN_ITEMS:
        widened = end - timedelta(hours=_FALLBACK_HOURS)
        picked = [item for item in collected.values() if widened <= item["published_at"] < end]

    # 요약이 빈 기사는 뺀다 (제목만 남아 화면이 비고 LLM도 판단할 근거가 없다). 실호출 500건 중 4건뿐이라 후보가 줄어들 걱정은 없다
    # 단 이것 때문에 하한을 못 채우게 되면 그대로 둔다
    with_summary = [item for item in picked if item["summary"]]
    if len(with_summary) >= _MIN_ITEMS:
        picked = with_summary

    # 점수순으로 LLM 후보를 추린다 (최신순으로 자르면 긴 구간의 중요한 기사가 잘린다)
    picked.sort(key=lambda x: x["score"], reverse=True)
    candidates = picked[: _CANDIDATE_LIMITS.get(time_slot, _CANDIDATE_LIMIT_DEFAULT)]

    selected = _select_with_llm(time_slot, candidates, limit) if use_llm else candidates[:limit]

    # 화면에는 이 순서(중요한 기사가 앞) 그대로 나간다
    return selected
