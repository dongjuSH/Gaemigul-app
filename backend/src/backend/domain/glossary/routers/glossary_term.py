# glossary_term.py
# "개미 용어 사전" 페이지 API. timeline 도메인의 GET /timeline/glossary(하드코딩 dict, 레거시)와는
# 별개 엔드포인트다. 프런트의 용어사전 페이지·타임라인 호버 툴팁·홈 "오늘의 한 입"은 모두 이쪽을 쓴다.

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.database import get_db
from backend.domain.auth.dependencies import get_current_user
from backend.domain.auth.models.auth import AuthUser
from backend.domain.auth.services import promotion_service
from backend.domain.glossary.models.glossary_term import CATEGORIES
from backend.domain.glossary.schemas.glossary_term import (
    GlossaryFavoriteToggleResponse,
    GlossaryTermResponse,
    GlossaryViewResponse,
)
from backend.domain.glossary.services import glossary_favorite_service, glossary_term_service, glossary_view_service

router = APIRouter(prefix="/glossary", tags=["glossary"])


# GET /glossary/terms?category= - 용어 사전 목록. category를 빼면 전체. 검색·난이도 톤 전환은 프런트에서 처리한다
# category는 CATEGORIES 중 하나여야 한다(아니면 422) - 오타로 빈 목록이 조용히 내려가는 걸 막는다
@router.get("/terms", response_model=list[GlossaryTermResponse])
async def get_glossary_terms(
    category: str | None = Query(default=None, description=f"용어 카테고리: {', '.join(CATEGORIES)}"),
    session: AsyncSession = Depends(get_db),
) -> list[GlossaryTermResponse]:
    if category is not None and category not in CATEGORIES:
        raise HTTPException(status_code=422, detail=f"category는 {', '.join(CATEGORIES)} 중 하나여야 합니다.")
    return await glossary_term_service.list_terms(session, category)


# GET /glossary/favorites - 로그인한 유저가 즐겨찾은 용어 전체(마이페이지 "즐겨찾는 용어" 목록용)
@router.get("/favorites", response_model=list[GlossaryTermResponse])
async def get_glossary_favorites(
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GlossaryTermResponse]:
    return await glossary_favorite_service.list_favorite_terms(db, current_user.id)


# POST /glossary/terms/{term_id}/favorite - 별 버튼 클릭 시 토글(있으면 해제, 없으면 추가)
@router.post("/terms/{term_id}/favorite", response_model=GlossaryFavoriteToggleResponse)
async def toggle_glossary_favorite(
    term_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GlossaryFavoriteToggleResponse:
    favorited = await glossary_favorite_service.toggle_favorite(db, current_user.id, term_id)
    return GlossaryFavoriteToggleResponse(term_id=term_id, favorited=favorited)


# POST /glossary/terms/{term_id}/view - 용어 카드가 화면에 들어오는 순간 프런트가 호출.
# 로그인한 사용자만 기록된다(등급 시스템의 "용어 열람 개수" 활동 점수용)
@router.post("/terms/{term_id}/view", response_model=GlossaryViewResponse)
async def record_glossary_view(
    term_id: int,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GlossaryViewResponse:
    recorded = await glossary_view_service.record_view(db, current_user.id, term_id)
    if recorded:
        await promotion_service.check_and_create_suggestion(db, current_user)
    return GlossaryViewResponse(term_id=term_id, recorded=recorded)
