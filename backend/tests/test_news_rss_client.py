"""실제 인터넷 호출 없이 Google RSS 형식과 입력 경계를 검증한다."""

import unittest
from unittest.mock import patch

import httpx

from backend.core import news_rss_client


def response(contents: str, status: int = 200):
    return httpx.Response(status, content=contents.encode(), request=httpx.Request("GET", news_rss_client._ENDPOINT))


class NewsRSSClientTests(unittest.TestCase):
    def test_public_feed_preserves_source_date_link_without_fabricated_summary(self):
        feed = '<rss><channel><item><title>반도체 수출 &amp; 실적 증가 - 경제신문</title><link>https://news.google.com/rss/articles/example</link><source url="https://example.com">경제신문</source><pubDate>Thu, 17 Sep 2026 09:00:00 +0900</pubDate><description>&lt;a&gt;반복 제목&lt;/a&gt;</description></item></channel></rss>'
        with patch.object(news_rss_client.httpx, "get", return_value=response(feed)) as request:
            items = news_rss_client.search_news("반도체 주식")["items"]
        self.assertEqual(items[0]["title"], "반도체 수출 & 실적 증가")
        self.assertEqual(items[0]["source"], "경제신문")
        self.assertEqual(items[0]["description"], "")
        self.assertEqual(items[0]["pubDate"], "Thu, 17 Sep 2026 09:00:00 +0900")
        self.assertEqual(request.call_args.kwargs["params"]["q"], "반도체 주식")
        self.assertNotIn("headers", request.call_args.kwargs)

    def test_empty_feed_is_valid_but_html_entity_declarations_and_large_xml_are_rejected(self):
        with patch.object(news_rss_client.httpx, "get", return_value=response('<rss><channel /></rss>')):
            self.assertEqual(news_rss_client.search_news("금융")["items"], [])
        for contents in ('<html>Unavailable</html>', '<!DOCTYPE rss><rss><channel /></rss>', '<!ENTITY x "a"><rss />', 'x' * (news_rss_client._MAX_FEED_BYTES + 1)):
            with self.subTest(contents=contents[:30]), patch.object(news_rss_client.httpx, "get", return_value=response(contents)):
                with self.assertRaises(ValueError):
                    news_rss_client.search_news("금융")

    def test_request_errors_and_invalid_arguments_do_not_create_articles(self):
        with patch.object(news_rss_client.httpx, "get", return_value=response("Unavailable", 503)):
            with self.assertRaises(httpx.HTTPStatusError):
                news_rss_client.search_news("금융")
        with patch.object(news_rss_client.httpx, "get") as request:
            for args in (("", 20, "date"), ("금융", 0, "date"), ("금융", 101, "date"), ("금융", 20, "sim")):
                with self.assertRaises(ValueError):
                    news_rss_client.search_news(*args)
            request.assert_not_called()
