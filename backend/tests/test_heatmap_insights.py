"""상승률 순위·산업 연결·뉴스 안전성/캐시 회귀 검사. 모든 외부 요청은 모의한다."""

from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from email.utils import format_datetime
import threading
import unittest
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.domain.heatmap.routers.heatmap import router
from backend.domain.heatmap.schemas.heatmap import Coverage, HeatmapResponse, HeatmapSector, HeatmapStock, TopSector
from backend.domain.heatmap.services import heatmap, news
from backend.domain.heatmap.services.related_sectors import related_sectors


def sector(code, name, rate, cap=1000, volume=100):
    stocks = [HeatmapStock(code=f"{code}{i}", name=f"{name}기업{i}", price=100, market_cap=cap / 3 * (i + 1), change_rate=rate, volume=volume // 2) for i in range(2)]
    return HeatmapSector(code=code, name=name, market_cap=cap, volume=volume, change_rate=rate, stocks=stocks)


def snapshot(sectors):
    count = sum(len(item.stocks) for item in sectors)
    result = HeatmapResponse(market="kospi", period="day", coverage=Coverage(total_stocks=count, priced_stocks=count), sectors=sectors)
    heatmap._refresh_insights(result)
    return result


class RankingTests(unittest.TestCase):
    def test_returns_ranked_over_volume_and_cap_with_negative_and_zero_volume(self):
        result = snapshot([sector("01", "화학", -4, volume=10000), sector("02", "제약", -1, volume=0)])
        self.assertEqual(result.top_sector.code, "02")
        self.assertEqual(result.top_sector.change_rate, -1)
        self.assertEqual(result.top_sector.volume_share, 0)
        result = snapshot([sector("01", "화학", 0, volume=0), sector("02", "제약", 0, cap=2000, volume=0)])
        self.assertEqual(result.top_sector.code, "02")
        self.assertEqual(result.top_sector.volume_share, 0)

    def test_cap_weighted_return_and_deterministic_ties(self):
        weighted = sector("01", "화학", 0)
        weighted.stocks[0].change_rate = 10
        result = snapshot([weighted, sector("02", "제약", 2)])
        self.assertAlmostEqual(result.top_sector.change_rate, 10 / 3)
        self.assertEqual(result.top_sector.code, "01")
        result = snapshot([sector("02", "제약", 2), sector("01", "화학", 2)])
        self.assertEqual(result.top_sector.code, "01")

    def test_missing_sector_return_or_incomplete_coverage_hides_ranking(self):
        result = snapshot([sector("01", "화학", 1), sector("02", "제약", None)])
        self.assertIsNone(result.top_sector)
        self.assertEqual(result.related_sectors, [])
        result = snapshot([sector("01", "화학", 1)])
        result.coverage.missing_stocks = 1
        heatmap._refresh_insights(result)
        self.assertIsNone(result.top_sector)

    def test_cache_read_replaces_old_volume_winner_without_mutating_snapshot(self):
        result = snapshot([sector("01", "화학", 10, volume=1), sector("02", "제약", 2, volume=99)])
        result.top_sector = TopSector(code="02", name="제약", volume=99, volume_share=99, change_rate=2)
        with patch.dict(heatmap._snapshots, {("kospi", "day"): result}, clear=True), patch.object(heatmap, "get_settings", return_value=type("Settings", (), {"heatmap_session_overrides": {}})()):
            actual = heatmap.get_heatmap()
        self.assertEqual(actual.top_sector.code, "01")
        self.assertEqual(result.top_sector.code, "02")

    def test_new_listing_without_baseline_excluded_from_weight_only(self):
        item = sector("01", "화학", 5)
        item.stocks[0].change_rate = None
        result = snapshot([item])
        self.assertEqual(result.top_sector.change_rate, 5)


class RelatedTests(unittest.TestCase):
    def test_three_real_industry_neighbors_and_two_largest_companies_each(self):
        leader = sector("0013", "전기·전자", 10)
        neighbors = [sector("0012", "기계·장비", 1), sector("0008", "화학", 2), sector("0029", "IT 서비스", -1), sector("0011", "금속", 0)]
        neighbors[0].stocks.append(HeatmapStock(code="extra", name="작은기업", market_cap=1, change_rate=1, volume=0, price=1))
        actual = related_sectors([leader, *neighbors], leader)
        self.assertEqual([item.name for item in actual], ["기계·장비", "화학", "IT 서비스"])
        self.assertEqual(len({item.code for item in actual}), 3)
        for item in actual:
            self.assertEqual(len(item.stocks), 2)
            self.assertEqual(item.relationship_kind, "industry")
            self.assertGreaterEqual(item.stocks[0].market_cap, item.stocks[1].market_cap)

    def test_kosdaq_codes_same_names_and_explicit_market_fallback(self):
        leader = sector("1028", "전기·전자", 10)
        candidates = [leader, sector("1027", "기계·장비", 2), sector("1023", "화학", 3), sector("1014", "금융", 4)]
        actual = related_sectors(candidates, leader)
        self.assertEqual([item.code for item in actual], ["1027", "1023", "1014"])
        self.assertEqual(actual[-1].relationship_kind, "market_trend")
        self.assertIn("산업 연관 규칙이 부족", actual[-1].reason)

    def test_insufficient_firms_or_categories_never_invented(self):
        leader = sector("01", "기타·미분류", 1)
        tiny = sector("02", "화학", 2)
        tiny.stocks.pop()
        self.assertEqual(related_sectors([leader, tiny], leader), [])


class NewsTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime.now(UTC)
        self.leader = sector("0008", "화학", 10)
        self.current = snapshot([self.leader])
        for target, value in (("_cache", {}), ("_inflight", {})):
            context = patch.dict(getattr(news, target), value, clear=True)
            context.start()
            self.addCleanup(context.stop)
        context = patch.object(news.heatmap, "get_heatmap", side_effect=lambda *_: self.current)
        context.start()
        self.addCleanup(context.stop)

    def article(self, index=0, **overrides):
        return {"title": f"화학 기업 수출 실적 개선 {index}", "description": "화학 산업 매출 증가", "link": f"https://news.example.com/article/{index}", "originallink": "", "pubDate": format_datetime(self.now - timedelta(minutes=index)), "source": "경제신문", **overrides}

    def test_plaintext_safe_urls_relevance_dedup_and_latest_four(self):
        rows = [self.article(index) for index in range(6)]
        rows += [self.article(0, link="https://news.example.com/article/0?utm_source=test"), self.article(9, title="화학 <script>bad()</script><b>기업</b> 매출 신기록", pubDate=format_datetime(self.now + timedelta(seconds=1))), self.article(10, title="축구 경기 승리", description="축구 경기 결과"), self.article(11, title="화학 실험 교실", description="학생 과학 수업"), self.article(12, link="javascript:alert(1)"), self.article(13, link="https://127.0.0.1/a"), self.article(14, pubDate="bad date"), self.article(15, pubDate=format_datetime(self.now - timedelta(days=31)))]
        actual = news._select_items(rows, self.leader, self.now)
        self.assertEqual(len(actual), 4)
        self.assertEqual(actual[0].title, "화학 기업 매출 신기록")
        self.assertEqual(actual[0].source, "경제신문")
        self.assertEqual(len({item.url for item in actual}), 4)
        self.assertTrue(all("<" not in item.title for item in actual))
        self.assertEqual(actual[-1].url, "https://news.example.com/article/2")

    def test_company_prefix_and_syndicated_headlines_are_not_extra_news(self):
        self.assertTrue(news._mentions_company("현대차, 자동차 수출 증가", "현대차"))
        self.assertTrue(news._mentions_company("현대차그룹 신사업 투자", "현대차"))
        self.assertFalse(news._mentions_company("현대차증권 자산관리 세미나", "현대차"))
        self.assertTrue(news._same_headline(
            news._normalized("SM Life Design, 16억원 자사주 취득 신탁계약 체결"),
            news._normalized("SM Life Design, 16억원 규모 자기주식취득 신탁계약 체결"),
        ))
        self.assertFalse(news._same_headline("화학기업계약16억원", "화학기업계약80억원"))

    def test_ten_minute_cache_bounded_searches_and_filter_keys_share_leader_cache(self):
        with patch.object(news.news_rss_client, "search_news", return_value={"items": [self.article(i) for i in range(4)]}) as search, patch.object(news.time, "monotonic", return_value=1000):
            first = news.get_news()
            second = news.get_news(period="week")
            self.assertEqual(search.call_count, 3)
            self.assertEqual(first, second)
        self.assertFalse(first.is_stale)
        self.assertEqual(len(first.items), 4)
        with patch.object(news.news_rss_client, "search_news", return_value={"items": []}) as search, patch.object(news.time, "monotonic", return_value=1601):
            news.get_news()
            self.assertEqual(search.call_count, 3)

    def test_provider_failure_uses_same_leader_stale_cache_and_backoff(self):
        with patch.object(news.news_rss_client, "search_news", return_value={"items": [self.article()]}), patch.object(news.time, "monotonic", return_value=0):
            first = news.get_news()
        with patch.object(news.news_rss_client, "search_news", side_effect=RuntimeError("offline")) as search, patch.object(news.time, "monotonic", return_value=601):
            stale = news.get_news()
            repeated = news.get_news()
        self.assertTrue(stale.is_stale)
        self.assertEqual(stale.items, first.items)
        self.assertEqual(stale.updated_at, first.updated_at)
        self.assertEqual(search.call_count, 3)
        self.assertEqual(stale, repeated)

    def test_changed_leader_failure_cannot_return_previous_sector_news(self):
        with patch.object(news.news_rss_client, "search_news", return_value={"items": [self.article()]}):
            news.get_news()
        self.current = snapshot([sector("0009", "제약", 20)])
        with patch.object(news.news_rss_client, "search_news", side_effect=RuntimeError("offline")):
            actual = news.get_news()
        self.assertEqual(actual.sector_code, "0009")
        self.assertEqual(actual.items, [])
        self.assertTrue(actual.is_stale)

    def test_missing_leader_does_not_search(self):
        self.current.top_sector = None
        with patch.object(news.news_rss_client, "search_news") as search:
            actual = news.get_news()
        self.assertIsNone(actual.sector_code)
        search.assert_not_called()

    def test_concurrent_requests_share_one_collection(self):
        entered = threading.Event()
        release = threading.Event()
        def collect(*_):
            entered.set()
            self.assertTrue(release.wait(timeout=5))
            return []
        with patch.object(news, "_collect", side_effect=collect) as provider, ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(news.get_news)
            self.assertTrue(entered.wait(timeout=5))
            second = pool.submit(news.get_news)
            release.set()
            self.assertEqual(first.result(timeout=5), second.result(timeout=5))
            provider.assert_called_once()

    def test_route_validates_filters_and_does_not_collect_stock_prices(self):
        app = FastAPI()
        app.include_router(router)
        with TestClient(app) as client, patch.object(news.news_rss_client, "search_news", return_value={"items": []}), patch.object(heatmap.kis_client, "get_stock_quotes") as quotes:
            self.assertEqual(client.get("/heatmap/news?market=kosdaq&period=month").status_code, 200)
            self.assertEqual(client.get("/heatmap/news?market=nasdaq").status_code, 422)
            self.assertEqual(client.get("/heatmap/news?period=year").status_code, 422)
            quotes.assert_not_called()


if __name__ == "__main__":
    unittest.main()
