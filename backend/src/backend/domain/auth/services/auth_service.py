# auth_service.py
# 회원가입/로그인/아이디 찾기/비밀번호 찾기/비밀번호 변경 로직.
# 세션 발급·쿠키는 session_service, 등급 분류는 grade_service, 해싱은 password_service에 맡긴다.

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.domain.auth.models.auth import AuthGradeSurvey, AuthUser, GradePromotionSuggestion
from backend.domain.auth.schemas.auth import ChangePasswordRequest, GradeSurveyRequest, LoginRequest, SignupRequest
from backend.domain.auth.services import email_service, email_templates, grade_service, password_service, quiz_service


_KST = ZoneInfo("Asia/Seoul")


class AuthError(Exception):
    """회원가입/로그인/비밀번호 변경 실패 - 라우터가 적절한 HTTP 상태로 변환한다"""

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


async def _get_by_username(session: AsyncSession, username: str) -> AuthUser | None:
    return await session.scalar(select(AuthUser).where(AuthUser.username == username))


async def _get_by_email(session: AsyncSession, email: str) -> AuthUser | None:
    return await session.scalar(select(AuthUser).where(AuthUser.email == email))


# 용어/뉴스 퀴즈를 채점한다. 회원가입과 등급 재검사 둘 다 이 함수를 거친다
def _score_quizzes(term_answers: dict[str, int], news_answers: dict[str, int]) -> tuple[int, int, int, int]:
    term_correct, term_total = quiz_service.score(quiz_service.TERM_QUIZ_QUESTIONS, term_answers)
    news_correct, news_total = quiz_service.score(quiz_service.NEWS_QUIZ_QUESTIONS, news_answers)
    return term_correct, term_total, news_correct, news_total


async def signup(session: AsyncSession, data: SignupRequest) -> AuthUser:
    if await _get_by_email(session, data.email) is not None:
        raise AuthError("이미 가입된 이메일입니다.")
    if await _get_by_username(session, data.username) is not None:
        raise AuthError("이미 사용 중인 아이디입니다.")

    # 등급 판정 퀴즈는 가입 직후 별도 온보딩 페이지에서 진행한다(POST /auth/grade-survey) -
    # 그 전까지는 기본 등급(가장 낮은 단계)으로 시작한다
    user = AuthUser(
        email=data.email,
        username=data.username,
        nickname=data.nickname,
        password_hash=password_service.hash_password(data.password),
        grade=grade_service.GRADES[0],
        privacy_agreed=data.privacy_agreed,
        newsletter_opt_in=data.newsletter_opt_in,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)

    return user


async def login(session: AsyncSession, data: LoginRequest) -> AuthUser:
    user = await _get_by_username(session, data.username)
    # 아이디가 없는 경우와 비밀번호가 틀린 경우를 같은 메시지로 응답한다(계정 존재 여부 노출 방지)
    if user is None or not password_service.verify_password(data.password, user.password_hash):
        raise AuthError("아이디 또는 비밀번호가 올바르지 않습니다.")
    return user


# 3-4 아이디 찾기 - 이메일 존재 여부와 무관하게 항상 같은 응답을 준다(호출부에서 그대로 성공 메시지 반환)
async def find_id(session: AsyncSession, email: str) -> None:
    user = await _get_by_email(session, email)
    if user is not None:
        html_body = email_templates.render_account_email_html(
            heading="아이디를 찾으셨나요?",
            intro="가입하신 아이디는 아래와 같아요.",
            highlight=email_templates.render_highlight_card("아이디", user.username),
        )
        email_service.send_email(
            user.email,
            "[개미굴] 아이디 안내",
            f"가입하신 아이디는 {user.username} 입니다.",
            html_body,
        )


# 3-5 비밀번호 찾기 - username+email이 일치하는 계정에만 임시 비밀번호를 발급한다.
# 일치하지 않아도 겉보기 응답은 find_id와 마찬가지로 항상 동일하다(호출부 처리)
async def reset_password(session: AsyncSession, username: str, email: str) -> None:
    user = await _get_by_username(session, username)
    if user is None or user.email != email:
        return

    temp_password = password_service.generate_temp_password()
    user.password_hash = password_service.hash_password(temp_password)
    user.must_change_password = True
    await session.commit()

    html_body = email_templates.render_account_email_html(
        heading="임시 비밀번호가 발급됐어요",
        intro="아래 임시 비밀번호로 로그인한 뒤 꼭 새 비밀번호로 바꿔주세요.",
        highlight=email_templates.render_highlight_card("임시 비밀번호", temp_password),
    )
    email_service.send_email(
        user.email,
        "[개미굴] 임시 비밀번호 안내",
        f"임시 비밀번호는 {temp_password} 입니다. 로그인 후 바로 변경해주세요.",
        html_body,
    )


# 3-7 비밀번호 변경 페이지의 1단계(현재 비밀번호 확인) - 새 비밀번호 입력칸을 보여주기 전에
# 서버에서 먼저 확인한다. DB에 아무것도 쓰지 않는다
async def verify_current_password(user: AuthUser, password: str) -> None:
    if not password_service.verify_password(password, user.password_hash):
        raise AuthError("현재 비밀번호가 올바르지 않습니다.")


# 회원 탈퇴 - 하드 삭제. auth_session/auth_grade_survey/grade_promotion_suggestion/
# attendance_log/glossary_view_log 모두 user_id FK가 ondelete=CASCADE라 이 한 줄로 다 같이 지워진다.
# 소프트 삭제(플래그만 세우기)로 하지 않은 이유: username/email unique 제약과 얽혀 재가입 시
# 복잡해지고, 지금 단계에서 "탈퇴 계정 복구" 요구사항이 없어 굳이 남겨둘 이유가 없다고 판단했다
async def withdraw(session: AsyncSession, user: AuthUser) -> None:
    await session.delete(user)
    await session.commit()


# 마이페이지 뉴스레터 수신 동의 토글
async def set_newsletter_opt_in(session: AsyncSession, user: AuthUser, opt_in: bool) -> None:
    user.newsletter_opt_in = opt_in
    await session.commit()


# 닉네임은 마지막 변경 뒤 이 기간이 지나야 다시 바꿀 수 있다. 바꾸면 이용약관 제5조 문구도 같이 고친다
NICKNAME_CHANGE_INTERVAL = timedelta(days=14)


def _now_kst() -> datetime:
    return datetime.now(_KST).replace(tzinfo=None)


# 닉네임을 다시 바꿀 수 있는 시각. 한 번도 안 바꿨거나 기간이 지났으면 None(지금 바로 가능)
def nickname_changeable_at(user: AuthUser, now: datetime | None = None) -> datetime | None:
    if user.nickname_changed_at is None:
        return None
    available_at = user.nickname_changed_at + NICKNAME_CHANGE_INTERVAL
    return available_at if available_at > (now or _now_kst()) else None


# 마이페이지 닉네임 변경. nickname은 스키마에서 공백 제거·길이 검사를 마친 값이다
async def change_nickname(session: AsyncSession, user: AuthUser, nickname: str) -> None:
    if nickname == user.nickname:
        raise AuthError("지금 쓰고 있는 닉네임과 같아요.")

    available_at = nickname_changeable_at(user)
    if available_at is not None:
        raise AuthError(
            f"닉네임은 {NICKNAME_CHANGE_INTERVAL.days}일에 한 번 바꿀 수 있어요. "
            f"{available_at:%Y-%m-%d %H:%M}부터 다시 바꿀 수 있어요."
        )

    user.nickname = nickname
    user.nickname_changed_at = _now_kst()
    await session.commit()


async def change_password(session: AsyncSession, user: AuthUser, data: ChangePasswordRequest) -> None:
    if not password_service.verify_password(data.current_password, user.password_hash):
        raise AuthError("현재 비밀번호가 올바르지 않습니다.")

    user.password_hash = password_service.hash_password(data.new_password)
    user.must_change_password = False
    await session.commit()


# 마이페이지 "등급 변경 이력" - 퀴즈 제출(auth_grade_survey)과 활동 기반 승급 수락
# (grade_promotion_suggestion, status=accepted) 두 출처를 합쳐 최신순으로 보여준다
async def get_grade_history(session: AsyncSession, user_id: int) -> list[tuple[str, str, str]]:
    surveys = await session.scalars(
        select(AuthGradeSurvey).where(AuthGradeSurvey.user_id == user_id).order_by(AuthGradeSurvey.submitted_at.desc())
    )
    promotions = await session.scalars(
        select(GradePromotionSuggestion)
        .where(GradePromotionSuggestion.user_id == user_id)
        .where(GradePromotionSuggestion.status == "accepted")
        .order_by(GradePromotionSuggestion.responded_at.desc())
    )

    items = [(s.submitted_at, s.resulting_grade, "퀴즈") for s in surveys]
    items += [(p.responded_at, p.suggested_grade, "활동 승급") for p in promotions if p.responded_at is not None]
    items.sort(key=lambda item: item[0], reverse=True)

    return [(when.date().isoformat(), grade, source) for when, grade, source in items]


async def submit_grade_survey(session: AsyncSession, user: AuthUser, data: GradeSurveyRequest) -> tuple[str, int, int]:
    term_correct, term_total, news_correct, news_total = _score_quizzes(data.term_quiz_answers, data.news_quiz_answers)
    grade = await grade_service.record_survey(
        session, user, data.investment_experience, term_correct, term_total, news_correct, news_total
    )
    await session.commit()
    return grade, term_correct + news_correct, term_total + news_total
