"""Merged app wiring regressions; no external HTTP, DB, or LLM calls are made."""

from contextlib import ExitStack
from datetime import datetime
import inspect
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import main


class RecordingScheduler:
    """Use real job/trigger validation but never dispatch the collectors."""

    def __init__(self, **kwargs):
        self.scheduler = AsyncIOScheduler(**kwargs)
        self.running = False
        self.stopped = False

    def add_job(self, *args, **kwargs):
        return self.scheduler.add_job(*args, **kwargs)

    def get_jobs(self):
        return self.scheduler.get_jobs()

    def start(self):
        self.running = True

    def shutdown(self, **kwargs):
        self.running = False
        self.stopped = True


class AppIntegrationTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.settings = SimpleNamespace(
            kis_app_key="test-key", kis_app_secret="test-secret",
            database_url="postgresql+asyncpg://unused.invalid/test", heatmap_enabled=True,
        )
        self.stack.enter_context(patch.object(main, "get_settings", return_value=self.settings))
        self.stack.enter_context(patch.object(main, "setup_logging"))
        self.stack.enter_context(patch.object(main, "AsyncIOScheduler", RecordingScheduler))
        self.initialize = self.stack.enter_context(patch.object(main.heatmap, "initialize"))
        # Keep function signatures/coroutine markers intact for APScheduler validation.
        self.collectors = [
            self.stack.enter_context(patch.object(service, name, autospec=True))
            for service, name in (
                (main.market_indicator_service, "refresh_all"),
                (main.vix_service, "refresh"),
                (main.investor_flow_service, "refresh"),
                (main.sentiment_service, "refresh"),
                (main.exchange_rate_service, "refresh"),
                (main.trading_value_service, "refresh"),
                (main.heatmap, "refresh_all"),
                (main.timeline_service, "run_scheduled_collect"),
                (main.report_service, "run_scheduled_reports"),
                (main.calendar_service, "ingest_fomc_year"),
                (main.calendar_service, "ingest_year_from_fred"),
                (main.calendar_service, "ingest_preliminary_earnings_from_dart"),
                (main.calendar_service, "ingest_us_option_expiry_year"),
                (main.newsletter_service, "run_scheduled_newsletter"),
            )
        ]

    async def test_all_domains_and_jobs_survive_integration_without_blocking_startup(self):
        async with main.lifespan(main.app):
            scheduler = main._scheduler
            jobs = {job.id: job for job in scheduler.get_jobs()}
            expected = {
                "indicator_bar", "market_vix", "market_session", "market_exchange_rate",
                "market_trading_value", "heatmap", "timeline_reports", "newsletter",
                "calendar_fomc", "calendar_fred", "calendar_dart", "calendar_us_option_expiry",
                *(f"slot_{key}" for key in main.timeline_service.SLOT_COLLECT_TIMES),
            }
            self.assertEqual(set(jobs), expected)
            self.assertEqual(len(jobs), 20)
            self.assertTrue(scheduler.running)
            self.initialize.assert_called_once_with()
            for collector in self.collectors:
                collector.assert_not_called()
            for job in jobs.values():
                # OrTrigger(시장심리 09:05~15:00 + 15:35)는 하위 CronTrigger들의 시간대를 확인한다
                for trigger in getattr(job.trigger, "triggers", [job.trigger]):
                    self.assertEqual(str(trigger.timezone), "Asia/Seoul")
            # 보고서·슬롯·개미레터는 "서버 시작 직후 1회"가 없다 (재시작할 때마다 보고서를
            # 다시 만들거나 메일이 나가면 안 되므로). 나머지는 next_run_time으로 1회 실행한다
            for name in expected - {"timeline_reports", "newsletter", *(f"slot_{key}" for key in main.timeline_service.SLOT_COLLECT_TIMES)}:
                self.assertIsNotNone(jobs[name].next_run_time)
            self.assertTrue(inspect.iscoroutinefunction(jobs["slot_1530"].func))
            self.assertTrue(inspect.iscoroutinefunction(jobs["timeline_reports"].func))
            base = datetime(2026, 9, 17, 0, 0, tzinfo=ZoneInfo("Asia/Seoul"))
            for name, expected_time in (("slot_1530", (15, 34, 0)), ("timeline_reports", (20, 10, 0)), ("heatmap", (0, 0, 30))):
                when = jobs[name].trigger.get_next_fire_time(None, base)
                self.assertEqual((when.hour, when.minute, when.second), expected_time)
        self.assertTrue(scheduler.stopped)

    async def test_missing_optional_keys_keeps_server_and_saved_cache_available(self):
        self.settings.kis_app_key = None
        self.settings.kis_app_secret = None
        self.settings.database_url = None
        async with main.lifespan(main.app):
            self.assertEqual(main._scheduler.get_jobs(), [])
            self.assertFalse(main._scheduler.running)
            self.initialize.assert_called_once_with()
            for collector in self.collectors:
                collector.assert_not_called()

    async def test_database_and_heatmap_flags_only_disable_dependent_jobs(self):
        self.settings.database_url = None
        self.settings.heatmap_enabled = False
        async with main.lifespan(main.app):
            self.assertEqual(
                {job.id for job in main._scheduler.get_jobs()},
                {"indicator_bar", "market_vix", "market_session", "market_trading_value"},
            )

    def test_all_domain_routes_are_exposed_and_root_serves(self):
        with TestClient(main.app) as client:
            self.assertEqual(client.get("/").json(), {"message": "hello world"})
            paths = client.get("/openapi.json").json()["paths"]
        self.assertIn("/heatmap", paths)
        self.assertIn("/calendar/events", paths)
        self.assertIn("/timeline/indicators", paths)
        self.assertTrue(any(path.startswith("/market/") for path in paths))


if __name__ == "__main__":
    unittest.main()
