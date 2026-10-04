# add_nickname_changed_at_column.py
# 마이페이지 닉네임 변경(14일에 한 번)에 필요한 auth_user.nickname_changed_at 컬럼을 추가한다.
# auth_user는 이미 Supabase에 있는 테이블이라 create_tables.py(없는 테이블만 생성)로는 컬럼이
# 추가되지 않으므로, add_newsletter_columns.py와 같은 방식으로 raw SQL을 직접 실행한다.
# 기존 회원은 값이 비어 있어(NULL) 첫 닉네임 변경을 바로 할 수 있다.
#
# 실행: backend/ 디렉토리에서 `uv run python scripts/add_nickname_changed_at_column.py`
# 새 백엔드 코드를 배포하기 "전에" 실행해야 한다 - 코드가 이 컬럼을 조회하므로 없으면 로그인·/auth/me가 실패한다

import asyncio
import sys

sys.path.insert(0, "src")

from sqlalchemy import text

from backend.core.database import get_session_factory


async def main() -> None:
    async with get_session_factory()() as session:
        await session.execute(text("ALTER TABLE auth_user ADD COLUMN IF NOT EXISTS nickname_changed_at timestamp"))
        await session.commit()
        print("=== auth_user.nickname_changed_at 컬럼 준비 완료 ===")


if __name__ == "__main__":
    asyncio.run(main())
