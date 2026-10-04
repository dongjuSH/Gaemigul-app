# auth.py
# 인증 도메인 테이블 3개 (SQLAlchemy ORM 모델).
#
# [테이블 관계]
#   auth_user ─┬─ auth_grade_survey   투자 경험 설문 제출 이력 (재검사마다 새 행)
#              └─ auth_session        로그인 세션 (쿠키 값 = 이 테이블의 id)
#
# [난이도/등급 값]
#   "애기 개미" / "청년 개미" / "고참 개미" - glossary_term.difficulty와 같은 3단계 표기를 그대로 쓴다
#
# auth_user.grade는 auth_grade_survey의 가장 최근 제출 결과를 캐싱해둔 값이다(헤더 배지 등에서
# join 없이 바로 읽으려고). 설문 이력 자체는 auth_grade_survey에 계속 쌓인다(등급 재검사 때마다 새 행).

from datetime import datetime
from zoneinfo import ZoneInfo

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from backend.core.database import Base

_KST = ZoneInfo("Asia/Seoul")


def _now_kst() -> datetime:
    return datetime.now(_KST).replace(tzinfo=None)


class AuthUser(Base):
    __tablename__ = "auth_user"

    __table_args__ = (
        UniqueConstraint("email", name="uq_auth_user_email"),
        UniqueConstraint("username", name="uq_auth_user_username"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    email: Mapped[str] = mapped_column(String(255))
    username: Mapped[str] = mapped_column(String(50))
    nickname: Mapped[str] = mapped_column(String(50))

    # 마지막으로 닉네임을 바꾼 시각(한국 시간). 14일에 한 번만 바꿀 수 있다(auth_service.change_nickname).
    # 가입 후 한 번도 안 바꿨으면 None - 첫 변경은 바로 할 수 있다.
    # 기존 테이블에 나중에 추가한 칼럼이라 scripts/add_nickname_changed_at_column.py로 추가한다
    nickname_changed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), default=None)

    # bcrypt 해시. 임시 비밀번호 발급 시에도 이 칼럼을 그대로 덮어쓴다(별도 temp 칼럼 없음)
    password_hash: Mapped[str] = mapped_column(String(255))

    # "애기 개미" / "청년 개미" / "고참 개미" - auth_grade_survey 최신 제출 결과 캐시
    grade: Mapped[str] = mapped_column(String(20))

    # 임시 비밀번호로 로그인한 뒤 새 비밀번호로 바꾸기 전까지 true. 프런트가 이 값을 보고
    # 비밀번호 변경 페이지로 강제 리다이렉트한다(3-5)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)

    # 회원가입 시 개인정보 처리방침 동의(필수) - 가입 폼에서 체크하지 않으면 SignupRequest 검증에서 막힌다
    privacy_agreed: Mapped[bool] = mapped_column(Boolean, default=False)

    # 개미레터(뉴스레터) 수신 동의(선택). 마이페이지에서 언제든 껐다 켤 수 있다
    newsletter_opt_in: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)


# 등급 판정 퀴즈 제출 이력 - 회원가입 1회 + 마이페이지 "등급 재검사"마다 새 행이 쌓인다.
# 예전엔 Q2("아는 용어 체크")가 자기신고 체크리스트였는데, 자기신고는 왜곡 가능성이 있어
# 정답이 있는 퀴즈(용어 퀴즈 + 뉴스 이해도 퀴즈)로 바꿨다 - services/quiz_service.py 참고.
# 이 테이블은 로컬 테스트 단계에서 기존 데이터 없이 새로 만들었다(2026-09-20, 팀 확인 완료).
class AuthGradeSurvey(Base):
    __tablename__ = "auth_grade_survey"

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(ForeignKey("auth_user.id", ondelete="CASCADE"))

    # "없음" / "1년 미만" / "1년 이상" - 이 항목만 자기신고 유지(경험 연수는 퀴즈로 검증 불가)
    investment_experience: Mapped[str] = mapped_column(String(20))

    # 용어 퀴즈 정답 수 / 전체 문항 수
    term_quiz_correct: Mapped[int] = mapped_column(Integer)
    term_quiz_total: Mapped[int] = mapped_column(Integer)

    # 뉴스 이해도 퀴즈 정답 수 / 전체 문항 수
    news_quiz_correct: Mapped[int] = mapped_column(Integer)
    news_quiz_total: Mapped[int] = mapped_column(Integer)

    # 이 제출로 산출된 등급
    resulting_grade: Mapped[str] = mapped_column(String(20))

    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)


# 활동 기반 승급 제안 - 출석/용어 열람 데이터가 기준을 넘으면 서버가 먼저 만들어둔다
# (services/promotion_service.py). 한 유저가 같은 suggested_grade로는 한 번만 받는다(재권유 없음).
class GradePromotionSuggestion(Base):
    __tablename__ = "grade_promotion_suggestion"

    id: Mapped[int] = mapped_column(primary_key=True)

    user_id: Mapped[int] = mapped_column(ForeignKey("auth_user.id", ondelete="CASCADE"))

    suggested_grade: Mapped[str] = mapped_column(String(20))

    # "pending" | "accepted" | "dismissed"
    status: Mapped[str] = mapped_column(String(20), default="pending")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=False), default=None)


# 로그인 세션 - id 자체가 쿠키에 담기는 랜덤 토큰(발급은 services/session_service.py)
class AuthSession(Base):
    __tablename__ = "auth_session"

    id: Mapped[str] = mapped_column(Text, primary_key=True)

    user_id: Mapped[int] = mapped_column(ForeignKey("auth_user.id", ondelete="CASCADE"))

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=False), default=_now_kst)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=False))
