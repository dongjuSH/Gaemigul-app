# add_newsletter_columns.py
# 개미레터(뉴스레터) 기능 추가에 필요한 auth_user 컬럼 2개(privacy_agreed, newsletter_opt_in)를
# 추가하고, newsletter_log 테이블을 새로 만든다. auth_user는 이미 Supabase에 있는 테이블이라
# create_tables.py(없는 테이블만 생성)로는 컬럼이 추가되지 않으므로, add_actual_label_column.py와
# 같은 방식으로 raw SQL을 직접 실행한다.
#
# 실행: backend/ 디렉토리에서 `uv run python scripts/add_newsletter_columns.py`

import asyncio
import sys

sys.path.insert(0, "src")

from sqlalchemy import text

from backend.core.database import get_session_factory


async def main() -> None:
    async with get_session_factory()() as session:
        await session.execute(
            text("ALTER TABLE auth_user ADD COLUMN IF NOT EXISTS privacy_agreed boolean NOT NULL DEFAULT false")
        )
        await session.execute(
            text("ALTER TABLE auth_user ADD COLUMN IF NOT EXISTS newsletter_opt_in boolean NOT NULL DEFAULT false")
        )
        await session.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS newsletter_log (
                    id SERIAL PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES auth_user(id) ON DELETE CASCADE,
                    week_start VARCHAR(10) NOT NULL,
                    sent_at TIMESTAMP NOT NULL DEFAULT now(),
                    CONSTRAINT uq_newsletter_log_user_week UNIQUE (user_id, week_start)
                )
                """
            )
        )
        await session.commit()
        print("=== newsletter 관련 컬럼/테이블 준비 완료 ===")
        print("  auth_user.privacy_agreed, auth_user.newsletter_opt_in 추가")
        print("  newsletter_log 테이블 생성")


if __name__ == "__main__":
    asyncio.run(main())
