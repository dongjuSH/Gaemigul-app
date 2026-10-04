"""KIS wire-format and failure regressions; every HTTP request is mocked.

Run from backend: python -m unittest discover -s tests -p test_kis_client.py
Master fixture offsets come from KIS's published stock-master C schemas,
not from the parser under test. They describe the tail without its newline.
"""

from concurrent.futures import ThreadPoolExecutor
import io
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import MagicMock, patch
import zipfile

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from backend.core import kis_client as kis


def stock_record(
    market,
    code="005930",
    name="삼성전자",
    group="ST",
    preferred="0",
    spac="N",
    sector_codes=("0027", "0013", "0000"),
    suspended="N",
    newline="\n",
):
    """Minimal real-format record with conspicuous values at critical offsets."""
    if market == "kospi":
        size, spac_at, preferred_at = 227, 29, 158
        reference_at, suspended_at, shares_at, cap_at = 41, 60, 113, 212
    else:
        size, spac_at, preferred_at = 221, 24, 153
        reference_at, suspended_at, shares_at, cap_at = 36, 55, 108, 206
    tail = list(" " * size)

    def field(start, value):
        tail[start:start + len(value)] = value

    field(0, group)
    field(2, "1")
    field(3, "".join(sector_codes))
    field(spac_at, spac)
    field(preferred_at, preferred)
    field(reference_at, "000072300")
    field(reference_at + 9, "00001")  # regular trading lot
    field(reference_at + 14, "00001")  # after-hours trading lot
    field(suspended_at, suspended)
    field(shares_at, "000000000012345")  # 12,345 thousand shares
    field(cap_at, "000008925")  # KRW 8,925 hundred million
    return code.ljust(9) + "KR7005930003" + name.ljust(40) + "".join(tail) + newline


def response(body, status=200):
    return httpx.Response(
        status, json=body, request=httpx.Request("GET", "https://kis.invalid/test")
    )


class KISClientTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        self.settings = SimpleNamespace(
            kis_base_url="https://kis.invalid",
            kis_app_key="test-key",
            kis_app_secret="test-secret",
            heatmap_requests_per_second=5.0,
        )
        self.http = MagicMock(spec=httpx.Client)
        replacements = {
            "_HTTP": self.http,
            "get_settings": lambda: self.settings,
            "_TOKEN_CACHE_PATH": root / "token.json",
            "_MASTER_CACHE_PATH": root / "masters",
            "_wait_for_request_slot": lambda: None,
            # 실제 공유 토큰 DB(kis_token 테이블)를 절대 읽거나 쓰지 않도록 가짜 저장소로 바꾼다
            # (바꾸지 않으면 테스트용 가짜 토큰이 운영 DB에 저장돼 모든 서버의 KIS 호출이 실패한다)
            "kis_token_store": SimpleNamespace(read=lambda now: None, write=lambda token, expires_at: False, invalidate=lambda token: False),
            "_MEMORY_TOKEN": None,
            "_LAST_ISSUED_AT": 0.0,
        }
        for attribute, replacement in replacements.items():
            context = patch.object(kis, attribute, replacement)
            context.start()
            self.addCleanup(context.stop)

    def test_master_parses_prices_quantities_and_korean_names_in_both_markets(self):
        for market in ("kospi", "kosdaq"):
            with self.subTest(market=market):
                record = stock_record(market, name="한글 이름 · 주식", suspended="Y")
                item, = kis._parse_stock_master(record, market)
                self.assertEqual(item["code"], "005930")
                self.assertEqual(item["name"], "한글 이름 · 주식")
                self.assertEqual(item["reference_price"], 72_300)
                self.assertTrue(item["suspended"])
                self.assertEqual(item["listed_shares"], 12_345_000)
                self.assertEqual(item["market_cap"], 892_500_000_000)
                self.assertEqual(item["sector_code"], "0013")
                self.assertEqual(item["sector_codes"], ["0027", "0013"])

    def test_master_includes_foreign_common_stock_and_excludes_other_instruments(self):
        for market in ("kospi", "kosdaq"):
            with self.subTest(market=market):
                rows = [
                    stock_record(market, "005930", newline="\r\n"),
                    stock_record(market, "950110", name="외국 보통주", group="FS", newline="\r\n"),
                    stock_record(market, "005935", preferred="1"),
                    stock_record(market, "123456", spac="Y"),
                    stock_record(market, "069500", group="EF"),
                    stock_record(market, "580001", group="EN"),
                    stock_record(market, "900001", group="DR"),
                ]
                items = kis._parse_stock_master("".join(rows), market)
                self.assertEqual([item["code"] for item in items], ["005930", "950110"])
                self.assertFalse(items[0]["suspended"])

    def test_sector_uses_deepest_valid_code_and_preserves_unclassified_stocks(self):
        cases = [
            (("1009", "1028", "1088"), "1088", ["1009", "1028", "1088"]),
            (("1006", "0000", "0000"), "1006", ["1006"]),
            (("0000", "0000", "0000"), "unclassified", []),
            (("1006", "    ", "    "), "1006", ["1006"]),
            (("    ", "    ", "    "), "unclassified", []),
        ]
        for codes, expected_code, expected_codes in cases:
            with self.subTest(codes=codes):
                item, = kis._parse_stock_master(stock_record("kosdaq", sector_codes=codes), "kosdaq")
                self.assertEqual(item["sector_code"], expected_code)
                self.assertEqual(item["sector_codes"], expected_codes)

    def test_invalid_or_empty_master_cannot_silently_replace_working_data(self):
        for contents in ("", "truncated\n", stock_record("kospi", group="EF")):
            with self.subTest(contents=contents[:20]):
                with self.assertRaises(ValueError):
                    kis._parse_stock_master(contents, "kospi")

    def test_index_names_begin_after_all_five_code_characters(self):
        contents = "00001종합                        \r\n01028전기·전자                 \r\n"
        with patch.object(kis, "_download_master", return_value=contents) as download:
            self.assertEqual(kis.get_sector_master(), {"0001": "종합", "1028": "전기·전자"})
            self.assertEqual(kis.get_sector_master()["1028"], "전기·전자")
            download.assert_called_once_with("idxcode")

    def test_public_zip_download_decodes_cp949_and_selects_expected_member(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("unrelated.txt", "ignore me")
            archive.writestr("idxcode.mst", "00001종합\r\n".encode("cp949"))
        self.http.get.return_value = httpx.Response(
            200, content=buffer.getvalue(), request=httpx.Request("GET", "https://kis.invalid")
        )
        self.assertEqual(kis._download_master("idxcode"), "00001종합\r\n")
        self.http.get.assert_called_once_with(
            "https://new.real.download.dws.co.kr/common/master/idxcode.mst.zip"
        )
        self.http.post.assert_not_called()

    def test_quote_requests_accept_thirty_stocks_and_use_only_krx(self):
        codes = [f"{index:06}" for index in range(30)]
        with patch.object(kis, "_get", return_value={"output": []}) as get:
            kis.get_stock_quotes(codes)
            endpoint, tr_id, params = get.call_args.args
            self.assertEqual(endpoint, "/uapi/domestic-stock/v1/quotations/intstock-multprice")
            self.assertEqual(tr_id, "FHKST11300006")
            self.assertEqual(len(params), 60)
            for number, code in enumerate(codes, 1):
                self.assertEqual(params[f"FID_INPUT_ISCD_{number}"], code)
                self.assertEqual(params[f"FID_COND_MRKT_DIV_CODE_{number}"], "J")
            for invalid in ([], codes + ["123456"], ["00593"], ["005/30"], ["００５９３０"]):
                with self.subTest(invalid=invalid):
                    with self.assertRaises(ValueError):
                        kis.get_stock_quotes(invalid)
            self.assertEqual(get.call_count, 1)

    def test_history_uses_adjusted_daily_krx_prices_and_checks_date_window(self):
        with patch.object(kis, "_get", return_value={}) as get:
            kis.get_stock_history("005930", "20260801", "20260914")
            self.assertEqual(get.call_args.args, (
                "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
                "FHKST03010100",
                {
                    "FID_COND_MRKT_DIV_CODE": "J", "FID_INPUT_ISCD": "005930",
                    "FID_INPUT_DATE_1": "20260801", "FID_INPUT_DATE_2": "20260914",
                    "FID_PERIOD_DIV_CODE": "D", "FID_ORG_ADJ_PRC": "0",
                },
            ))
            for start, end in (("20260914", "20260801"), ("20260101", "20260914"), ("20260230", "20260301")):
                with self.subTest(start=start, end=end):
                    with self.assertRaises(ValueError):
                        kis.get_stock_history("005930", start, end)
            self.assertEqual(get.call_count, 1)

    def test_sector_market_params_do_not_misuse_kosdaq_general_segment(self):
        with patch.object(kis, "_get", return_value={}) as get:
            for market, index_code, market_code in (("kospi", "0001", "K"), ("kosdaq", "1001", "Q")):
                kis.get_sector_prices(market)
                endpoint, tr_id, params = get.call_args.args
                self.assertEqual(endpoint, "/uapi/domestic-stock/v1/quotations/inquire-index-category-price")
                self.assertEqual(tr_id, "FHPUP02140000")
                self.assertEqual(params["FID_COND_MRKT_DIV_CODE"], "U")
                self.assertEqual(params["FID_INPUT_ISCD"], index_code)
                self.assertEqual(params["FID_MRKT_CLS_CODE"], market_code)
                self.assertEqual(params["FID_COND_SCR_DIV_CODE"], "20214")
                self.assertEqual(params["FID_BLNG_CLS_CODE"], "0")

    def test_business_failure_is_not_mistaken_for_a_successful_http_response(self):
        kis._write_cached_token("cached-test-token", 3600)
        self.http.get.return_value = response({"rt_cd": "1", "msg_cd": "AUTH_DENIED"})
        with self.assertRaisesRegex(kis.KISAPIError, "AUTH_DENIED"):
            kis._get("/test", "TEST_TR", {})
        self.http.get.assert_called_once()
        self.http.post.assert_not_called()

    def test_transient_http_business_and_network_errors_retry_without_issuing_tokens(self):
        kis._write_cached_token("cached-test-token", 3600)
        failures = [
            response({}, 503),
            response({"rt_cd": "1", "msg_cd": "EGW00201"}),
            httpx.ConnectError("temporary connection failure"),
        ]
        for failure in failures:
            with self.subTest(failure=type(failure).__name__):
                self.http.reset_mock()
                self.http.get.side_effect = [failure, response({"rt_cd": "0", "output": []})]
                with patch.object(kis.time, "sleep"):
                    self.assertEqual(kis._get("/test", "TEST_TR", {"sample": "1"})["output"], [])
                self.assertEqual(self.http.get.call_count, 2)
                for call in self.http.get.call_args_list:
                    self.assertEqual(call.kwargs["headers"]["authorization"], "Bearer cached-test-token")
                self.http.post.assert_not_called()

    def test_expired_token_response_reissues_once_and_retries(self):
        kis._write_cached_token("rejected-token", 3600)
        kis._LAST_ISSUED_AT = 0.0
        self.http.get.side_effect = [
            response({"rt_cd": "1", "msg_cd": "EGW00123", "msg1": "기간이 만료된 token 입니다."}, 500),
            response({"rt_cd": "0", "output": []}),
        ]
        self.http.post.return_value = response({"access_token": "fresh-token", "expires_in": 86400})
        self.assertEqual(kis._get("/test", "TEST_TR", {})["output"], [])
        self.http.post.assert_called_once()
        self.assertEqual(self.http.get.call_args_list[1].kwargs["headers"]["authorization"], "Bearer fresh-token")
        self.assertEqual(kis._read_cached_token(), "fresh-token")

    def test_expired_token_right_after_issuing_does_not_issue_again(self):
        kis._write_cached_token("rejected-token", 3600)
        kis._LAST_ISSUED_AT = time.time()
        self.http.get.return_value = response({"rt_cd": "1", "msg_cd": "EGW00123"}, 500)
        with patch.object(kis.time, "sleep"):
            with self.assertRaises(httpx.HTTPStatusError):
                kis._get("/test", "TEST_TR", {})
        self.http.post.assert_not_called()

    def test_persistent_throttling_stops_after_bounded_retries(self):
        kis._write_cached_token("cached-test-token", 3600)
        self.http.get.return_value = response({"rt_cd": "1", "msg_cd": "EGW00201"})
        with patch.object(kis.time, "sleep"):
            with self.assertRaises(kis.KISAPIError):
                kis._get("/test", "TEST_TR", {})
        self.assertEqual(self.http.get.call_count, 3)
        self.http.post.assert_not_called()

    def test_corrupt_or_expired_token_cache_is_recoverable(self):
        payloads = ["{interrupted", "{}", "null", json.dumps({"access_token": "old", "expires_at": 1})]
        for payload in payloads:
            with self.subTest(payload=payload):
                kis._TOKEN_CACHE_PATH.write_text(payload, encoding="utf-8")
                self.assertIsNone(kis._read_cached_token())
        kis._write_cached_token("working-token", 3600)
        self.assertEqual(kis._read_cached_token(), "working-token")
        self.assertFalse(kis._TOKEN_CACHE_PATH.with_suffix(".tmp").exists())

    def test_concurrent_initial_requests_issue_one_shared_token(self):
        start = threading.Barrier(6)
        self.http.post.return_value = response({"access_token": "single-token", "expires_in": 3600})

        def request_token():
            start.wait(timeout=5)
            return kis.get_access_token()

        with ThreadPoolExecutor(max_workers=6) as pool:
            tokens = list(pool.map(lambda _: request_token(), range(6)))
        self.assertEqual(tokens, ["single-token"] * 6)
        self.http.post.assert_called_once()
        saved = json.loads(kis._TOKEN_CACHE_PATH.read_text(encoding="utf-8"))
        self.assertGreater(saved["expires_at"], time.time())

    def test_timeline_market_and_calendar_share_throttled_requests_and_failure_checks(self):
        kis._write_cached_token("cached-test-token", 3600)
        calls = (
            lambda: kis.get_domestic_index_price("U", "0001"),
            lambda: kis.get_index_minute_price("0001"),
            lambda: kis.get_overseas_index_or_fx_price("X", "FX@KRW"),
            lambda: kis.get_dividend_schedule("20260901", "20260930"),
            lambda: kis.get_price("F", "test-contract"),
        )
        with patch.object(kis, "_wait_for_request_slot") as slot:
            for call in calls:
                self.http.get.side_effect = [
                    response({"rt_cd": "1", "msg_cd": "EGW00201"}),
                    response({"rt_cd": "0", "output": {}, "output1": []}),
                ]
                with patch.object(kis.time, "sleep"):
                    call()
            self.assertEqual(slot.call_count, len(calls) * 2)
        self.http.post.assert_not_called()

    def test_report_master_download_keeps_bytes_contract_without_authentication(self):
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("kospi_code.mst", b"master record")
        self.http.get.return_value = httpx.Response(
            200, content=buffer.getvalue(), request=httpx.Request("GET", "https://kis.invalid")
        )
        with patch.object(kis, "_wait_for_request_slot") as slot:
            self.assertEqual(kis.get_kospi_master(), b"master record")
        slot.assert_not_called()
        self.http.post.assert_not_called()

    def test_missing_keys_fail_before_any_http_or_token_request(self):
        self.settings.kis_app_key = None
        for query in (lambda: kis.get_domestic_index_price("U", "0001"), lambda: kis.get_stock_quotes(["005930"])):
            with self.assertRaises(RuntimeError):
                query()
        self.http.get.assert_not_called()
        self.http.post.assert_not_called()


if __name__ == "__main__":
    unittest.main()
