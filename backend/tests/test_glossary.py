"""용어 사전 카테고리 - 라우터 검증·응답 필드·시딩 데이터 검사. DB에 연결하지 않는다."""

from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from backend.core.database import get_db
from backend.domain.glossary.models.glossary_term import CATEGORIES
from backend.domain.glossary.routers.glossary_term import router
from backend.domain.glossary.services import glossary_term_service
import seed_glossary_terms


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(router)

    async def fake_db():
        yield None

    app.dependency_overrides[get_db] = fake_db
    return TestClient(app)


class GlossaryCategoryRouterTests(unittest.TestCase):
    def test_unknown_category_is_rejected(self):
        with patch.object(glossary_term_service, "list_terms", new=AsyncMock(return_value=[])) as list_terms:
            response = _client().get("/glossary/terms", params={"category": "없는 카테고리"})

        self.assertEqual(response.status_code, 422)
        list_terms.assert_not_awaited()

    def test_category_is_passed_to_service(self):
        with patch.object(glossary_term_service, "list_terms", new=AsyncMock(return_value=[])) as list_terms:
            response = _client().get("/glossary/terms", params={"category": CATEGORIES[0]})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(list_terms.await_args.args[1], CATEGORIES[0])

    def test_no_category_lists_everything(self):
        with patch.object(glossary_term_service, "list_terms", new=AsyncMock(return_value=[])) as list_terms:
            response = _client().get("/glossary/terms")

        self.assertEqual(response.status_code, 200)
        self.assertIsNone(list_terms.await_args.args[1])


class GlossaryResponseTests(unittest.TestCase):
    def test_response_includes_category(self):
        row = SimpleNamespace(
            id=1, term="PER", difficulty="청년 개미", category="공시·재무",
            easy_description="e", mid_description="m", hard_description="h", related_terms="EPS, PBR",
        )
        response = glossary_term_service.to_response(row)

        self.assertEqual(response.category, "공시·재무")
        self.assertEqual(response.related_terms, ["EPS", "PBR"])

    def test_category_can_be_missing_before_backfill(self):
        row = SimpleNamespace(
            id=1, term="PER", difficulty="청년 개미", category=None,
            easy_description="e", mid_description="m", hard_description="h", related_terms=None,
        )
        self.assertIsNone(glossary_term_service.to_response(row).category)


class GlossarySeedTests(unittest.TestCase):
    def test_seed_terms_are_valid(self):
        self.assertEqual(seed_glossary_terms.validate_seed_terms(seed_glossary_terms.SEED_TERMS), [])

    def test_every_category_has_terms(self):
        used = {row["category"] for row in seed_glossary_terms.SEED_TERMS}
        self.assertEqual(used, set(CATEGORIES))

    def test_validation_catches_mistakes(self):
        rows = [
            {"term": "A", "difficulty": "애기 개미", "category": "없음", "related_terms": "B"},
            {"term": "A", "difficulty": "중수 개미", "category": CATEGORIES[0]},
        ]
        errors = seed_glossary_terms.validate_seed_terms(rows)

        self.assertTrue(any("중복" in error for error in errors))
        self.assertTrue(any("category" in error for error in errors))
        self.assertTrue(any("difficulty" in error for error in errors))
        self.assertTrue(any("연관 태그" in error for error in errors))

    def test_validation_catches_one_way_related_terms(self):
        rows = [
            {"term": "A", "difficulty": "애기 개미", "category": CATEGORIES[0], "related_terms": "B"},
            {"term": "B", "difficulty": "애기 개미", "category": CATEGORIES[0], "related_terms": ""},
        ]
        errors = seed_glossary_terms.validate_seed_terms(rows)

        self.assertTrue(any("한쪽만 연결됨" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
