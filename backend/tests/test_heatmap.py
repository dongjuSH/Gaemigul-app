"""기간 계산·장 마감·불완전 데이터와 캐시의 회귀 검사. 외부 API는 호출하지 않는다."""

from datetime import date, datetime, timedelta
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo

from fastapi import FastAPI
from fastapi.testclient import TestClient

from backend.domain.heatmap.routers.heatmap import router
from backend.domain.heatmap.services import heatmap as service


KST = ZoneInfo("Asia/Seoul")


class HeatmapTests(unittest.TestCase):
    def setUp(self):
        self.now = datetime(2026, 9, 16, 10, 10, 30, tzinfo=KST)
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        for name in ("_snapshots", "_masters", "_master_dates", "_sector_names", "_histories", "_history_checked", "_history_fetched_at", "_history_retry_at", "_calendar", "_quotes", "_completed_slots", "_errors"):
            context = patch.dict(getattr(service, name), {}, clear=True)
            context.start()
            self.addCleanup(context.stop)
        settings = SimpleNamespace(heatmap_enabled=True, heatmap_session_overrides={})
        for name, value in {"get_settings": lambda: settings, "_CACHE_DIR": Path(self.directory.name), "_CACHE_PATH": Path(self.directory.name) / "snapshot.json", "_initialized": True, "_refreshing": False, "_calendar_checked": self.now.date().isoformat(), "_calendar_error": None}.items():
            context = patch.object(service, name, value)
            context.start()
            self.addCleanup(context.stop)
        self.settings = settings
        for offset in range(-70, 15):
            day = self.now.date() + timedelta(days=offset)
            service._calendar[day.isoformat()] = day.weekday() < 5
        self.a = {"code": "000001", "name": "종목 A", "sector_code": "0013", "listed_shares": 1000, "market_cap": 100000, "reference_price": 100, "suspended": False}
        self.b = {"code": "000002", "name": "종목 B", "sector_code": "0024", "listed_shares": 1000, "market_cap": 200000, "reference_price": 200, "suspended": False}
        service._masters["kospi"] = [self.a, self.b]
        service._masters["kosdaq"] = []
        service._sector_names.update({"0013": "전기·전자", "0024": "증권"})
        for stock, factor in ((self.a, 1), (self.b, 2)):
            service._histories[stock["code"]] = {day: {"close": price * factor, "volume": volume} for day, price, volume in (("2026-08-31", 80, 20), ("2026-09-11", 90, 11), ("2026-09-14", 95, 10), ("2026-09-15", 100, 20), ("2026-09-16", 110, 999))}
            service._history_checked[stock["code"]] = service._history_key(self.now)
            service._history_fetched_at[stock["code"]] = self.now.isoformat()
        self.samples = {"date": "2026-09-16", "updated_at": self.now.isoformat(), "source": "live", "rows": {"000001": {"price": 110, "previous_close": 100, "volume": 30}, "000002": {"price": 200, "previous_close": 200, "volume": 70}}}

    def stock(self, response, code="000001"):
        return next(stock for sector in response.sectors for stock in sector.stocks if stock.code == code)

    def test_calendar_periods_use_last_close_before_boundary_and_no_double_count(self):
        day = service._build_snapshot("kospi", "day", self.samples, self.now)
        week = service._build_snapshot("kospi", "week", self.samples, self.now)
        month = service._build_snapshot("kospi", "month", self.samples, self.now)
        self.assertAlmostEqual(self.stock(day).change_rate, 10)
        self.assertAlmostEqual(self.stock(week).change_rate, (110 / 90 - 1) * 100)
        self.assertAlmostEqual(self.stock(month).change_rate, 37.5)
        self.assertEqual(self.stock(day).volume, 30)
        self.assertEqual(self.stock(week).volume, 60)
        self.assertEqual(self.stock(month).volume, 71)
        self.assertEqual(day.top_sector.code, "0013")
        self.assertEqual(day.top_sector.volume_share, 30)

    def test_month_and_week_boundary_on_a_holiday_uses_prior_available_trading_close(self):
        service._histories["000001"].pop("2026-08-31")
        service._histories["000001"]["2026-08-28"] = {"close": 88, "volume": 40}
        response = service._build_snapshot("kospi", "month", self.samples, self.now)
        self.assertAlmostEqual(self.stock(response).change_rate, 25)
        self.assertEqual(self.stock(response).volume, 71)

    def test_new_listing_has_null_return_without_losing_its_volume(self):
        service._histories["000001"] = {"2026-09-15": {"close": 100, "volume": 20}}
        response = service._build_snapshot("kospi", "week", self.samples, self.now)
        self.assertIsNone(self.stock(response).change_rate)
        self.assertEqual(self.stock(response).volume, 50)
        self.assertIsNone(response.top_sector)

    def test_missing_quote_cannot_fabricate_a_top_sector(self):
        self.samples["rows"].pop("000002")
        response = service._build_snapshot("kospi", "day", self.samples, self.now)
        self.assertEqual(response.coverage.missing_stocks, 1)
        self.assertTrue(response.is_stale)
        self.assertIsNone(response.top_sector)

    def test_incomplete_refresh_retains_last_complete_snapshot_and_timestamp(self):
        service._publish("kospi", ("day",), self.samples, self.now)
        self.samples = {**self.samples, "updated_at": (self.now + timedelta(minutes=10)).isoformat(), "rows": {"000001": self.samples["rows"]["000001"]}}
        service._publish("kospi", ("day",), self.samples, self.now)
        response = service.get_heatmap("kospi", "day", self.now)
        self.assertEqual(response.updated_at, self.now.isoformat())
        self.assertTrue(response.is_stale)
        self.assertEqual(response.top_sector.code, "0013")

    def test_market_holiday_special_hours_and_final_capture_delay(self):
        holiday = self.now.replace(day=17)
        service._calendar[holiday.date().isoformat()] = False
        self.assertEqual(service._market_status(holiday), "holiday")
        self.settings.heatmap_session_overrides = {"2026-09-16": {"open": "10:00", "close": "16:30"}}
        self.assertEqual(service._market_status(self.now.replace(hour=9)), "pre_open")
        self.assertTrue(service._collection_target(self.now)[2])
        closing = self.now.replace(hour=16, minute=30, second=0)
        self.assertIsNone(service._collection_target(closing)[1])
        target, slot, live = service._collection_target(closing + timedelta(seconds=30))
        self.assertEqual(target, self.now.date())
        self.assertTrue(slot.endswith(":close"))
        self.assertTrue(live)
        self.assertEqual(service._next_update(closing), (closing + timedelta(seconds=30)).isoformat())

    def test_weekend_target_is_last_known_trading_day_not_calendar_yesterday(self):
        saturday = datetime(2026, 9, 19, 10, tzinfo=KST)
        self.assertEqual(service._collection_target(saturday)[0], date(2026, 9, 18))
        self.assertFalse(service._collection_target(saturday)[2])

    def test_calendar_uses_recent_window_and_failure_is_not_retried_each_minute(self):
        service._calendar_checked = None
        service._calendar.clear()
        with patch.object(service.kis_client, "get_market_calendar", side_effect=RuntimeError("offline")) as request:
            service._refresh_calendar(self.now)
            service._refresh_calendar(self.now + timedelta(minutes=1))
        request.assert_called_once_with("20260909")
        self.assertEqual(service._market_status(self.now), "unknown")

    def test_afterclose_history_generation_changes_if_final_quote_was_missed(self):
        before = service._history_key(self.now)
        after = self.now.replace(hour=17)
        self.assertNotEqual(before, service._history_key(after))
        body = {"output1": {"lstn_stcn": "1234567"}, "output2": [{"stck_bsop_date": "20260916", "stck_clpr": "110", "acml_vol": "30"}]}
        with patch.object(service.kis_client, "get_stock_history", return_value=body) as request:
            service._warm_histories(after, float("inf"))
        self.assertEqual(request.call_count, 2)
        self.assertEqual(self.a["listed_shares"], 1234567)
        self.assertEqual(service._history_checked["000001"], service._history_key(after))

    def test_failed_history_does_not_starve_following_stocks(self):
        service._history_checked.clear()
        body = {"output2": [{"stck_bsop_date": "20260915", "stck_clpr": "100", "acml_vol": "20"}]}
        with patch.object(service, "_MAX_HISTORY_BATCH", 1), patch.object(service.kis_client, "get_stock_history", side_effect=[RuntimeError("temporary"), body]) as request:
            service._warm_histories(self.now, float("inf"))
            service._warm_histories(self.now, float("inf"))
        self.assertEqual([call.args[0] for call in request.call_args_list], ["000001", "000002"])

    def test_historical_display_does_not_invent_new_collection_timestamp(self):
        after = self.now.replace(hour=17)
        for code in ("000001", "000002"):
            service._history_checked[code] = service._history_key(after)
        first = service._historical_quotes("kospi", self.now.date(), after)
        second = service._historical_quotes("kospi", self.now.date(), after + timedelta(minutes=1))
        self.assertEqual(first["updated_at"], second["updated_at"])

    def test_completed_close_stays_frozen_after_hours_and_survives_restart(self):
        after = self.now.replace(hour=15, minute=30, second=30)
        slot = "2026-09-16:close"
        service._masters["kosdaq"] = [self.a, self.b]
        self.samples["updated_at"] = after.isoformat()
        self.samples["slot"] = slot
        for market in ("kospi", "kosdaq"):
            service._quotes[market] = self.samples.copy()
            service._completed_slots[market] = slot
        self.assertEqual(service._history_key(after), service._history_key(self.now))
        for market in ("kospi", "kosdaq"):
            service._publish(market, ("day", "week", "month"), self.samples, after)
        service._persist()
        service._quotes.clear()
        service._completed_slots.clear()
        service._snapshots.clear()
        service._initialized = False
        service.initialize()
        with patch.object(service.kis_client, "get_stock_quotes") as quotes, patch.object(service.kis_client, "get_stock_history") as history:
            service.refresh_all(after.replace(hour=17))
        quotes.assert_not_called()
        history.assert_not_called()
        response = service.get_heatmap("kospi", "day", after.replace(hour=17))
        self.assertEqual(response.updated_at, after.isoformat())
        self.assertFalse(response.is_stale)
        self.assertEqual(self.stock(response).volume, 30)

    def test_router_validates_filters_and_get_does_not_collect(self):
        app = FastAPI()
        app.include_router(router)
        with TestClient(app) as client, patch.object(service.kis_client, "get_stock_quotes") as quotes, patch.object(service.kis_client, "get_market_calendar") as calendar:
            response = client.get("/heatmap?market=kosdaq&period=month")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["period"], "month")
            self.assertEqual(client.get("/heatmap?market=nyse").status_code, 422)
            self.assertEqual(client.get("/heatmap?period=year").status_code, 422)
            quotes.assert_not_called()
            calendar.assert_not_called()

    def test_minute_scheduler_only_collects_quotes_once_per_ten_minute_slot(self):
        service._masters["kosdaq"] = [self.a, self.b]
        with patch.object(service, "_load_universe"), patch.object(service, "_warm_histories", return_value=False), patch.object(service, "_collect_quotes", side_effect=lambda *_: {**self.samples}) as collect:
            service.refresh_all(self.now)
            self.assertEqual(collect.call_count, 2)
            service.refresh_all(self.now + timedelta(minutes=1))
            self.assertEqual(collect.call_count, 2)
            service.refresh_all(self.now + timedelta(minutes=10))
            self.assertEqual(collect.call_count, 4)

    def test_zero_price_record_is_excluded_only_after_kis_confirms_delisting(self):
        ghost = {**self.a, "code": "123456", "market_cap": 0, "reference_price": 0}
        unresolved = {**ghost, "code": "654321"}
        with patch.object(service.kis_client, "get_stock_master", return_value=[self.a, ghost, unresolved]), patch.object(service.kis_client, "get_stock_info", side_effect=[{"output": {"kosdaq_mket_lstg_abol_dt": "20260914"}}, {"output": {"kosdaq_mket_lstg_abol_dt": ""}}]), patch.object(service.kis_client, "get_sector_master", return_value={}):
            service._load_universe("kosdaq", self.now)
        self.assertEqual([stock["code"] for stock in service._masters["kosdaq"]], ["000001", "654321"])


if __name__ == "__main__":
    unittest.main()
