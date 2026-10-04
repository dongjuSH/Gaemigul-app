# auth.py
# 인증 도메인 API. 실제 처리는 services에 있고 여기서는 연결 + 쿠키 발급만 한다.

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import get_settings
from backend.core.database import get_db
from backend.domain.auth.dependencies import get_current_user
from backend.domain.auth.models.auth import AuthUser
from backend.domain.auth.schemas.auth import (
    ActivityStatsResponse,
    ChangeNicknameRequest,
    ChangePasswordRequest,
    CurrentUserResponse,
    FindIdRequest,
    GradeHistoryItemResponse,
    GradeQuizResponse,
    GradeResponse,
    GradeSurveyRequest,
    LoginRequest,
    MessageResponse,
    NewsletterOptInRequest,
    PromotionRespondRequest,
    PromotionSuggestionResponse,
    ResetPasswordRequest,
    SignupRequest,
    VerifyPasswordRequest,
    WithdrawalFeedbackRequest,
)
from backend.domain.auth.services import (
    auth_service,
    promotion_service,
    quiz_service,
    session_service,
    withdrawal_feedback_service,
)

router = APIRouter(prefix="/auth", tags=["auth"])

_SESSION_COOKIE_NAME = get_settings().session_cookie_name

# 아이디/비밀번호 찾기는 계정 존재 여부와 무관하게 항상 이 메시지만 응답한다(문서 3-4 보안 메모 참고)
_FIND_ID_MESSAGE = "입력하신 이메일로 아이디를 전송했습니다."
_RESET_PASSWORD_MESSAGE = "입력하신 이메일로 임시 비밀번호를 전송했습니다."


def _to_response(user: AuthUser) -> CurrentUserResponse:
    return CurrentUserResponse(
        id=user.id,
        email=user.email,
        username=user.username,
        nickname=user.nickname,
        grade=user.grade,
        must_change_password=user.must_change_password,
        newsletter_opt_in=user.newsletter_opt_in,
        created_at=user.created_at.date().isoformat(),
        nickname_changeable_at=(
            available_at.isoformat(timespec="minutes")
            if (available_at := auth_service.nickname_changeable_at(user))
            else None
        ),
    )


@router.post("/signup", response_model=CurrentUserResponse, status_code=status.HTTP_201_CREATED)
async def signup(data: SignupRequest, response: Response, db: AsyncSession = Depends(get_db)) -> CurrentUserResponse:
    try:
        user = await auth_service.signup(db, data)
    except auth_service.AuthError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=error.message) from error

    token = await session_service.create_session(db, user)
    await db.commit()
    session_service.set_session_cookie(response, token)
    return _to_response(user)


@router.post("/login", response_model=CurrentUserResponse)
async def login(data: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)) -> CurrentUserResponse:
    try:
        user = await auth_service.login(db, data)
    except auth_service.AuthError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=error.message) from error

    token = await session_service.create_session(db, user)
    await db.commit()
    session_service.set_session_cookie(response, token)
    return _to_response(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    session_token: str | None = Cookie(default=None, alias=_SESSION_COOKIE_NAME),
    db: AsyncSession = Depends(get_db),
) -> None:
    if session_token is not None:
        await session_service.delete_session(db, session_token)
        await db.commit()
    session_service.clear_session_cookie(response)


# POST /auth/withdrawal-feedback - 탈퇴 확인 직전, 사유를 완전 익명으로 저장한다(계정과 무관 -
# 이 요청 자체는 로그인 상태에서만 받지만 응답으로 남기는 데이터엔 누가 보냈는지 전혀 남지 않는다).
# 탈퇴 처리(DELETE /auth/me)보다 먼저 호출한다 - 프런트에서 이 호출이 실패해도 탈퇴는 계속 진행한다
@router.post("/withdrawal-feedback", status_code=status.HTTP_204_NO_CONTENT)
async def submit_withdrawal_feedback(
    data: WithdrawalFeedbackRequest,
    current_user: AuthUser = Depends(get_current_user),  # 로그인 확인용 - 저장되는 값엔 안 쓰임
    db: AsyncSession = Depends(get_db),
) -> None:
    await withdrawal_feedback_service.record_feedback(db, data.reason, data.custom_text)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
async def withdraw(
    response: Response,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await auth_service.withdraw(db, current_user)
    session_service.clear_session_cookie(response)


@router.get("/me", response_model=CurrentUserResponse)
async def me(current_user: AuthUser = Depends(get_current_user)) -> CurrentUserResponse:
    return _to_response(current_user)


@router.post("/find-id", response_model=MessageResponse)
async def find_id(data: FindIdRequest, db: AsyncSession = Depends(get_db)) -> MessageResponse:
    await auth_service.find_id(db, data.email)
    return MessageResponse(message=_FIND_ID_MESSAGE)


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)) -> MessageResponse:
    await auth_service.reset_password(db, data.username, data.email)
    return MessageResponse(message=_RESET_PASSWORD_MESSAGE)


@router.post("/verify-password", response_model=MessageResponse)
async def verify_password(
    data: VerifyPasswordRequest,
    current_user: AuthUser = Depends(get_current_user),
) -> MessageResponse:
    try:
        await auth_service.verify_current_password(current_user, data.password)
    except auth_service.AuthError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error.message) from error
    return MessageResponse(message="확인되었습니다.")


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    data: ChangePasswordRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> MessageResponse:
    try:
        await auth_service.change_password(db, current_user, data)
    except auth_service.AuthError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error.message) from error
    return MessageResponse(message="비밀번호가 변경되었습니다.")


@router.patch("/newsletter-opt-in", response_model=CurrentUserResponse)
async def set_newsletter_opt_in(
    data: NewsletterOptInRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CurrentUserResponse:
    await auth_service.set_newsletter_opt_in(db, current_user, data.opt_in)
    return _to_response(current_user)


# PATCH /auth/nickname - 마이페이지 닉네임 변경. 14일에 한 번만 가능하고, 막히면 400과 다시 바꿀 수 있는 시각을 알려준다
@router.patch("/nickname", response_model=CurrentUserResponse)
async def change_nickname(
    data: ChangeNicknameRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CurrentUserResponse:
    try:
        await auth_service.change_nickname(db, current_user, data.nickname)
    except auth_service.AuthError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error.message) from error
    return _to_response(current_user)


@router.post("/grade-survey", response_model=GradeResponse)
async def grade_survey(
    data: GradeSurveyRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GradeResponse:
    grade, total_correct, total_questions = await auth_service.submit_grade_survey(db, current_user, data)
    return GradeResponse(grade=grade, total_correct=total_correct, total_questions=total_questions)


# GET /auth/grade-history - 마이페이지 "등급 변경 이력". 퀴즈 제출 + 활동 기반 승급 수락을 합쳐 최신순
@router.get("/grade-history", response_model=list[GradeHistoryItemResponse])
async def get_grade_history(
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[GradeHistoryItemResponse]:
    items = await auth_service.get_grade_history(db, current_user.id)
    return [GradeHistoryItemResponse(date=date_, grade=grade, source=source) for date_, grade, source in items]


# GET /auth/grade-quiz - 회원가입·등급 재검사 공용 퀴즈 문항(정답은 내려주지 않는다)
@router.get("/grade-quiz", response_model=GradeQuizResponse)
def grade_quiz() -> GradeQuizResponse:
    return GradeQuizResponse(
        term_questions=quiz_service.public_questions(quiz_service.TERM_QUIZ_QUESTIONS),
        news_questions=quiz_service.public_questions(quiz_service.NEWS_QUIZ_QUESTIONS),
    )


# GET /auth/activity-stats - 마이페이지에서 "등급 재검사" 버튼을 강조할지 판단하는 용도.
# 승급 제안 존재 여부와 무관하게 항상 현재 활동 수치를 내려준다
@router.get("/activity-stats", response_model=ActivityStatsResponse)
async def get_activity_stats(
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ActivityStatsResponse:
    attendance_days = await promotion_service.count_recent_attendance_days(db, current_user.id)
    distinct_terms = await promotion_service.count_distinct_terms_viewed(db, current_user.id)
    # 마이페이지가 "다음 등급까지 얼마나 남았는지" 보여줄 수 있게 승급 기준도 같이 내려준다
    rule = promotion_service.PROMOTION_RULES.get(current_user.grade)
    return ActivityStatsResponse(
        attendance_days=attendance_days,
        distinct_terms_viewed=distinct_terms,
        attendance_window_days=promotion_service.ATTENDANCE_WINDOW_DAYS,
        next_grade=rule["next_grade"] if rule else None,
        required_attendance_days=rule["min_attendance_days"] if rule else None,
        required_distinct_terms=rule["min_distinct_terms"] if rule else None,
    )


# GET /auth/promotion-suggestion - 활동 데이터 기반으로 대기 중인 승급 제안이 있으면 반환(없으면 null)
@router.get("/promotion-suggestion", response_model=PromotionSuggestionResponse | None)
async def get_promotion_suggestion(
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PromotionSuggestionResponse | None:
    suggestion = await promotion_service.get_pending_suggestion(db, current_user.id)
    if suggestion is None:
        return None
    attendance_days = await promotion_service.count_recent_attendance_days(db, current_user.id)
    distinct_terms = await promotion_service.count_distinct_terms_viewed(db, current_user.id)
    return PromotionSuggestionResponse(
        id=suggestion.id,
        suggested_grade=suggestion.suggested_grade,
        attendance_days=attendance_days,
        distinct_terms_viewed=distinct_terms,
    )


# POST /auth/promotion-suggestion/{id}/respond {accept: bool} - 승급 수락/보류
@router.post("/promotion-suggestion/{suggestion_id}/respond", response_model=CurrentUserResponse)
async def respond_to_promotion_suggestion(
    suggestion_id: int,
    data: PromotionRespondRequest,
    current_user: AuthUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> CurrentUserResponse:
    try:
        await promotion_service.respond_to_suggestion(db, current_user, suggestion_id, data.accept)
    except promotion_service.PromotionError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error.message) from error
    return _to_response(current_user)
