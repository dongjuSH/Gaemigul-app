"""상승률 1위 업종의 최신 경제 뉴스. 시세 조회와 분리된 읽기 전용 캐시."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from email.utils import parsedate_to_datetime
from difflib import SequenceMatcher
from html import unescape
from html.parser import HTMLParser
import ipaddress
import re
import threading
import time
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from backend.core import news_rss_client
from backend.domain.heatmap.schemas.heatmap import HeatmapNewsItem, HeatmapNewsResponse, HeatmapSector, Market, Period
from backend.domain.heatmap.services import heatmap

_TTL_SECONDS = 600
_RETRY_SECONDS = 60
_MAX_CACHE_KEYS = 64
_lock = threading.Lock()
_inflight: dict[tuple[str, str], threading.Event] = {}


@dataclass
class _Entry:
    response: HeatmapNewsResponse
    expires_at: float


_cache: dict[tuple[str, str], _Entry] = {}

# KIS의 묶음 업종 이름을 기사에 실제 등장하는 단어로 풀어 쓴다.
_ALIASES = {
    "전기·전자": ("전기전자", "반도체", "전자", "전력기기", "배터리"),
    "기계·장비": ("기계", "장비", "로봇"),
    "운송장비·부품": ("자동차", "조선", "선박", "항공기", "자동차부품"),
    "의료·정밀기기": ("의료기기", "진단", "정밀기기"),
    "음식료·담배": ("식품", "음료", "담배", "음식료"),
    "섬유·의류": ("섬유", "의류", "패션"),
    "가죽·신발": ("가죽", "신발"),
    "종이·목재": ("제지", "종이", "목재"),
    "운송·창고": ("물류", "해운", "운송", "항공"),
    "전기·가스": ("전력", "도시가스", "발전"),
    "IT 서비스": ("IT서비스", "소프트웨어", "클라우드", "정보기술"),
    "오락·문화": ("엔터테인먼트", "콘텐츠", "게임", "문화"),
    "출판·매체복제": ("출판", "인쇄", "매체복제"),
    "금속": ("철강", "비철금속", "금속"),
    "비금속": ("시멘트", "유리", "세라믹", "비금속"),
    "제약": ("제약", "바이오", "신약"),
}
_ECONOMIC = re.compile(r"경제|증시|증권|주가|주식|투자|매출|영업|실적|수익|상장|수주|계약|수출|수입|공급|생산|산업|기업|금융|시장|사업|자본|공시|인수|합병|금리|환율|고용|관세|물가|경기|흑자|적자|배당")


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.hidden += 1

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.hidden = max(0, self.hidden - 1)

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def _text(value, limit: int) -> str:
    parser = _TextExtractor()
    parser.feed(unescape(str(value or "")))
    text = re.sub(r"[\x00-\x1f\x7f]", " ", "".join(parser.parts))
    return re.sub(r"\s+", " ", text).strip()[:limit]


def _normalized(value: str) -> str:
    return re.sub(r"[^가-힣a-z0-9]", "", value.casefold())


def _safe_url(value) -> str | None:
    try:
        url = urlsplit(str(value or "").strip())
        if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password:
            return None
        host = url.hostname.lower()
        if "." not in host or host == "localhost" or host.endswith((".localhost", ".local")):
            return None
        try:
            if not ipaddress.ip_address(host).is_global:
                return None
        except ValueError:
            pass
        if url.port not in {None, 80, 443}:
            return None
        query = urlencode([(key, value) for key, value in parse_qsl(url.query, keep_blank_values=True) if not key.lower().startswith("utm_") and key.lower() not in {"fbclid", "gclid"}])
        return urlunsplit((url.scheme, url.netloc, url.path, query, ""))
    except (ValueError, TypeError):
        return None


def _terms(leader: HeatmapSector) -> tuple[list[str], list[str]]:
    aliases = list(_ALIASES.get(leader.name, (leader.name,)))
    companies = [stock.name for stock in sorted(leader.stocks, key=lambda stock: (-stock.market_cap, stock.code))[:2]]
    return aliases, companies


def _mentions_company(body: str, company: str) -> bool:
    # 현대차증권처럼 이름 접두사만 같은 다른 회사는 자동차 기사로 분류하지 않는다.
    name = re.escape(company).replace(r"\ ", r"\s*")
    suffix = r"(?=$|[\s\W]|(?:그룹|가|는|의|를|와|도|에|은|이|을|과|로)(?=$|[\s\W]))"
    return bool(re.search(r"(?<![가-힣A-Za-z0-9])" + name + suffix, body, flags=re.IGNORECASE))


def _same_headline(first: str, second: str) -> bool:
    # 숫자가 다른 실적·계약은 합치지 않고, 표현만 조금 바뀐 동일 기사만 제거한다.
    return re.findall(r"\d+", first) == re.findall(r"\d+", second) and SequenceMatcher(None, first, second).ratio() >= 0.8


def _select_items(raw_items: list[dict], leader: HeatmapSector, now: datetime) -> list[HeatmapNewsItem]:
    aliases, companies = _terms(leader)
    terms = [_normalized(term) for term in aliases if _normalized(term)]
    candidates: list[HeatmapNewsItem] = []
    for raw in raw_items:
        if not isinstance(raw, dict):
            continue
        title = _text(raw.get("title"), 240)
        summary = _text(raw.get("description"), 500)
        body = title + " " + summary
        if not title or not _ECONOMIC.search(body) or not (any(term in _normalized(body) for term in terms) or any(_mentions_company(body, company) for company in companies)):
            continue
        url = _safe_url(raw.get("originallink")) or _safe_url(raw.get("link"))
        if url is None:
            continue
        try:
            published = parsedate_to_datetime(str(raw.get("pubDate", "")))
            if published.tzinfo is None:
                continue
            published = published.astimezone(UTC)
        except (ValueError, TypeError, OverflowError):
            continue
        # 날짜 없는 기사, 미래 기사, 오래된 검색 결과를 '최신'으로 표시하지 않는다.
        if published > now + timedelta(minutes=5) or published < now - timedelta(days=30):
            continue
        source = _text(raw.get("source"), 80) or urlsplit(url).hostname or "언론사"
        candidates.append(HeatmapNewsItem(title=title, url=url, source=source, published_at=published.isoformat(), summary=summary))
    result = []
    seen_urls: set[str] = set()
    seen_titles: set[str] = set()
    for item in sorted(candidates, key=lambda item: (item.published_at, item.url), reverse=True):
        title_key = _normalized(item.title)
        if item.url in seen_urls or title_key in seen_titles or any(_same_headline(title_key, seen) for seen in seen_titles):
            continue
        seen_urls.add(item.url)
        seen_titles.add(title_key)
        result.append(item)
        if len(result) == 4:
            break
    return result


def _collect(leader: HeatmapSector, now: datetime) -> list[HeatmapNewsItem]:
    aliases, companies = _terms(leader)
    # 캐시 갱신당 최대 3개 검색. 시세 GET에는 이 경로를 호출하지 않는다.
    queries = list(dict.fromkeys([f"{aliases[0]} 경제", *companies]))[:3]
    items: list[dict] = []
    completed = 0
    for query in queries:
        try:
            payload = news_rss_client.search_news(query, display=20, sort="date")
            rows = payload.get("items")
            if not isinstance(rows, list):
                raise ValueError("뉴스 응답 형식 오류")
            items.extend(rows)
            completed += 1
        except Exception:
            continue
    if not completed:
        raise RuntimeError("뉴스 검색을 완료하지 못했습니다.")
    return _select_items(items, leader, now)


def get_news(market: Market = "kospi", period: Period = "day") -> HeatmapNewsResponse:
    snapshot = heatmap.get_heatmap(market, period)
    if snapshot.top_sector is None:
        return HeatmapNewsResponse(message="상승률 1위 업종이 확정되면 관련 경제 뉴스를 표시합니다.")
    leader = next((sector for sector in snapshot.sectors if sector.code == snapshot.top_sector.code), None)
    if leader is None:
        return HeatmapNewsResponse(message="상승률 1위 업종 데이터를 준비하고 있습니다.")
    key = (market, leader.code)
    with _lock:
        cached = _cache.get(key)
        if cached and cached.expires_at > time.monotonic():
            return cached.response.model_copy(deep=True)
        pending = _inflight.get(key)
        if pending is None:
            pending = threading.Event()
            _inflight[key] = pending
            owns_request = True
        else:
            owns_request = False
    if not owns_request:
        pending.wait(timeout=30)
        with _lock:
            cached = _cache.get(key)
            if cached:
                return cached.response.model_copy(deep=True)
        return HeatmapNewsResponse(sector_code=leader.code, sector_name=leader.name, message="관련 경제 뉴스를 불러오고 있습니다. 잠시 후 다시 확인해 주세요.")
    try:
        now = datetime.now(UTC)
        items = _collect(leader, now)
        message = None if len(items) == 4 else f"최근 30일 안의 관련 경제 뉴스 {len(items)}건을 확인했습니다."
        response = HeatmapNewsResponse(sector_code=leader.code, sector_name=leader.name, updated_at=now.isoformat(), is_stale=False, message=message, items=items)
        ttl = _TTL_SECONDS
    except Exception:
        # 다른 업종의 마지막 뉴스로 빈자리를 채우지 않는다.
        response = cached.response.model_copy(deep=True) if cached else HeatmapNewsResponse(sector_code=leader.code, sector_name=leader.name)
        response.is_stale = True
        response.message = "최신 뉴스를 확인하지 못했습니다. 잠시 후 다시 시도합니다." + (" 같은 업종의 마지막 뉴스를 표시합니다." if response.items else "")
        ttl = _RETRY_SECONDS
    with _lock:
        if key not in _cache and len(_cache) >= _MAX_CACHE_KEYS:
            oldest = min(_cache, key=lambda item: _cache[item].expires_at)
            _cache.pop(oldest)
        _cache[key] = _Entry(response=response, expires_at=time.monotonic() + ttl)
        _inflight.pop(key, None)
        pending.set()
    return response.model_copy(deep=True)
