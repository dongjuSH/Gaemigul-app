# add_glossary_category_column.py
# "개미 용어 사전" 카테고리 필터에 필요한 glossary_term.category 컬럼을 추가한다.
# glossary_term은 이미 Supabase에 있는 테이블이라 create_tables.py(없는 테이블만 생성)로는
# 컬럼이 추가되지 않으므로, add_newsletter_columns.py와 같은 방식으로 raw SQL을 직접 실행한다.
# 값은 비워 두고 만든다 - 이어서 seed_glossary_terms.py를 실행하면 upsert로 전 용어에 채워진다.
#
# 실행: backend/ 디렉토리에서
#   uv run python scripts/add_glossary_category_column.py
#   uv run python scripts/seed_glossary_terms.py

import asyncio
import sys

sys.path.insert(0, "src")

from sqlalchemy import text

from backend.core.database import get_session_factory


async def main() -> None:
    async with get_session_factory()() as session:
        await session.execute(text("ALTER TABLE glossary_term ADD COLUMN IF NOT EXISTS category varchar(20)"))
        await session.commit()

        missing = await session.scalar(text("SELECT count(*) FROM glossary_term WHERE category IS NULL"))
        print("=== glossary_term.category 컬럼 준비 완료 ===")
        print(f"  카테고리가 비어 있는 용어: {missing}건 (seed_glossary_terms.py를 실행하면 채워진다)")


if __name__ == "__main__":
    asyncio.run(main())
