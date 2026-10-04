"""Google 뉴스 공개 RSS 검색. 인증키 없이 기사 제목·출처·발행일·링크만 읽는다."""

from xml.etree import ElementTree

import httpx

_ENDPOINT = "https://news.google.com/rss/search"
_MAX_FEED_BYTES = 2_000_000


def search_news(query: str, display: int = 20, sort: str = "date") -> dict:
    """NAVER 검색과 같은 items 키를 반환해 도메인의 필터·캐시를 재사용한다.

    Google RSS는 정렬 옵션을 제공하지 않는다. 최종 최신순 정렬은 도메인에서
    pubDate를 해석해 수행한다. 기사 본문을 스크랩하거나 요약을 생성하지 않는다.
    """
    if not query.strip() or not 1 <= display <= 100:
        raise ValueError("뉴스 검색어와 1~100 사이의 조회 건수가 필요합니다.")
    if sort != "date":
        raise ValueError("히트맵 뉴스는 최신순 조회만 지원합니다.")
    response = httpx.get(
        _ENDPOINT,
        params={"q": query, "hl": "ko", "gl": "KR", "ceid": "KR:ko"},
        timeout=httpx.Timeout(10.0, connect=5.0),
        follow_redirects=False,
    )
    response.raise_for_status()
    contents = response.content
    if len(contents) > _MAX_FEED_BYTES or b"<!DOCTYPE" in contents.upper() or b"<!ENTITY" in contents.upper():
        raise ValueError("뉴스 피드의 크기 또는 XML 형식이 올바르지 않습니다.")
    root = ElementTree.fromstring(contents)
    if root.tag != "rss" or root.find("channel") is None:
        raise ValueError("Google 뉴스 RSS 응답을 확인할 수 없습니다.")
    items = []
    for item in root.findall("./channel/item"):
        title = item.findtext("title", "").strip()
        source = item.findtext("source", "").strip()
        # RSS 제목 끝에 붙는 언론사 이름은 별도 source 필드로 표시한다.
        suffix = f" - {source}"
        if source and title.endswith(suffix):
            title = title[:-len(suffix)].rstrip()
        items.append({
            "title": title,
            # Google RSS description은 제목·링크 반복이며 기사 요약이 아니다.
            "description": "",
            "link": item.findtext("link", "").strip(),
            "originallink": "",
            "pubDate": item.findtext("pubDate", "").strip(),
            "source": source,
        })
    # RSS 자체 순서에 의존해 먼저 자르면 최신 기사가 빠질 수 있다.
    # 도메인에서 전체 후보를 검증·정렬한 뒤 화면용 4개를 선택한다.
    return {"items": items[:100]}
