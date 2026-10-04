"""닉네임 변경(14일 제한)·닉네임 검증·개미레터 수신 안내 문구. DB에 연결하지 않는다."""

from datetime import datetime, timedelta
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock

from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from backend.domain.auth.schemas.auth import NICKNAME_MAX_LENGTH, ChangeNicknameRequest
from backend.domain.auth.services import auth_service, newsletter_service


def _user(nickname="개미", changed_at=None):
    return SimpleNamespace(nickname=nickname, nickname_changed_at=changed_at)


class NicknameValidationTests(unittest.TestCase):
    def test_trims_spaces(self):
        self.assertEqual(ChangeNicknameRequest(nickname="  불개미 ").nickname, "불개미")

    def test_rejects_empty(self):
        with self.assertRaises(ValidationError):
            ChangeNicknameRequest(nickname="   ")

    def test_rejects_too_long(self):
        with self.assertRaises(ValidationError):
            ChangeNicknameRequest(nickname="가" * (NICKNAME_MAX_LENGTH + 1))

    def test_accepts_max_length(self):
        self.assertEqual(len(ChangeNicknameRequest(nickname="가" * NICKNAME_MAX_LENGTH).nickname), NICKNAME_MAX_LENGTH)


class NicknameChangeableAtTests(unittest.TestCase):
    def test_never_changed_can_change_now(self):
        self.assertIsNone(auth_service.nickname_changeable_at(_user()))

    def test_within_interval_returns_next_time(self):
        now = datetime(2026, 9, 27, 12, 0)
        changed = now - timedelta(days=3)
        self.assertEqual(
            auth_service.nickname_changeable_at(_user(changed_at=changed), now=now),
            changed + auth_service.NICKNAME_CHANGE_INTERVAL,
        )

    def test_after_interval_can_change_now(self):
        now = datetime(2026, 9, 27, 12, 0)
        changed = now - auth_service.NICKNAME_CHANGE_INTERVAL - timedelta(minutes=1)
        self.assertIsNone(auth_service.nickname_changeable_at(_user(changed_at=changed), now=now))


class ChangeNicknameTests(unittest.IsolatedAsyncioTestCase):
    async def test_changes_and_records_time(self):
        user, session = _user(), SimpleNamespace(commit=AsyncMock())
        await auth_service.change_nickname(session, user, "불개미")

        self.assertEqual(user.nickname, "불개미")
        self.assertIsNotNone(user.nickname_changed_at)
        session.commit.assert_awaited_once()

    async def test_same_nickname_is_rejected(self):
        session = SimpleNamespace(commit=AsyncMock())
        with self.assertRaises(auth_service.AuthError):
            await auth_service.change_nickname(session, _user(nickname="개미"), "개미")
        session.commit.assert_not_awaited()

    async def test_second_change_within_interval_is_rejected(self):
        user = _user(changed_at=auth_service._now_kst() - timedelta(days=1))
        session = SimpleNamespace(commit=AsyncMock())
        with self.assertRaises(auth_service.AuthError) as raised:
            await auth_service.change_nickname(session, user, "불개미")

        self.assertIn("14일", raised.exception.message)
        self.assertEqual(user.nickname, "개미")
        session.commit.assert_not_awaited()


class NewsletterOptOutTextTests(unittest.TestCase):
    def test_text_and_html_bodies_explain_how_to_opt_out(self):
        text = newsletter_service._build_text_body("개미", [], "https://example.com")
        html = newsletter_service._render_html_body("개미", [], "https://example.com")

        self.assertIn("https://example.com/mypage", text)
        self.assertIn("https://example.com/mypage", html)
        self.assertIn("개미레터 수신", html)


if __name__ == "__main__":
    unittest.main()
