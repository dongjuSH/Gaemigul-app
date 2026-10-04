# create_tables.py
# 모델 정의를 보고 Supabase에 테이블을 만든다. 실행: uv run python create_tables.py
# 없는 테이블만 만들고 이미 있는 테이블(칼럼 변경 포함)은 건드리지 않는다.
# 새 모델 파일을 추가하면 아래 import에 넣어야 인식된다

import asyncio
import sys

sys.path.insert(0, "src")

from backend.core.database import Base, get_engine
from backend.domain.attendance.models import attendance  # noqa: F401 - 모델 등록용
from backend.domain.auth.models import auth, newsletter, withdrawal_feedback  # noqa: F401 - 모델 등록용
from backend.domain.glossary.models import glossary_favorite, glossary_term, glossary_view_log  # noqa: F401 - 모델 등록용
from backend.domain.market.models import exchange_rate  # noqa: F401 - 모델 등록용
from backend.domain.timeline.models import report, timeline  # noqa: F401 - 모델 등록용


async def main():
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("테이블 생성 완료")


asyncio.run(main())
