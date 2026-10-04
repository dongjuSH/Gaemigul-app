# glossary_term.py
# "개미 용어 사전" 페이지 응답 DTO. GET /glossary/terms가 쓴다.
# 필드는 models/glossary_term.py 칼럼과 맞춘다. difficulty는 이번 페이지 UI가 쓰지 않지만
# (필터는 easy/mid/hard 톤 전환용) 나중에 카드 배지 기능을 붙일 때 쓸 수 있도록 그대로 내려준다.

from pydantic import BaseModel


class GlossaryTermResponse(BaseModel):
    id: int
    term: str
    difficulty: str  # "애기 개미" / "청년 개미" / "고참 개미"
    category: str | None  # models.glossary_term.CATEGORIES 중 하나. 컬럼 추가 전 데이터면 null
    easy_description: str
    mid_description: str
    hard_description: str
    related_terms: list[str]  # 연관 용어 태그


class GlossaryViewResponse(BaseModel):
    term_id: int
    recorded: bool  # 이미 열람했던 용어면 false (에러 아님)


class GlossaryFavoriteToggleResponse(BaseModel):
    term_id: int
    favorited: bool  # 토글 후 상태 - true면 즐겨찾기 추가됨, false면 해제됨
