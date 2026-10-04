# auth.py
# 인증 도메인 요청/응답 DTO. GRADES/투자 경험 값은 models/auth.py 주석 참고

import re
from typing import Literal

from pydantic import BaseModel, EmailStr, field_validator, model_validator

INVESTMENT_EXPERIENCES = ("없음", "1년 미만", "1년 이상")
InvestmentExperience = Literal["없음", "1년 미만", "1년 이상"]

# 회원 탈퇴 사유 객관식 - "기타"를 고르면 custom_text가 같이 온다
WITHDRAWAL_REASON_OPTIONS = ("서비스를 잘 안 쓰게 돼서", "원하는 정보가 없어서", "다른 서비스를 써서", "기타")

_PASSWORD_MIN_LENGTH = 8

# 닉네임 최대 길이. 프런트 회원가입·마이페이지의 NICKNAME_MAX_LENGTH와 같은 값이어야 한다
NICKNAME_MAX_LENGTH = 8


# 닉네임 규칙: 앞뒤 공백 제거 후 1~NICKNAME_MAX_LENGTH자. 회원가입과 닉네임 변경이 같이 쓴다
def _validate_nickname(value: str) -> str:
    nickname = value.strip()
    if not nickname:
        raise ValueError("닉네임을 입력해주세요.")
    if len(nickname) > NICKNAME_MAX_LENGTH:
        raise ValueError(f"닉네임은 최대 {NICKNAME_MAX_LENGTH}자까지 가능합니다.")
    return nickname


# 비밀번호 규칙: 최소 8자 + 영문/숫자 포함 (팀 확인 사항 - 2번 답변)
def _validate_password_strength(value: str) -> str:
    if len(value) < _PASSWORD_MIN_LENGTH:
        raise ValueError(f"비밀번호는 최소 {_PASSWORD_MIN_LENGTH}자 이상이어야 합니다.")
    if not re.search(r"[A-Za-z]", value) or not re.search(r"\d", value):
        raise ValueError("비밀번호는 영문과 숫자를 모두 포함해야 합니다.")
    return value


class SignupRequest(BaseModel):
    # 등급 판정 퀴즈는 가입과 분리됐다 - 가입 직후 별도 온보딩 페이지에서 GET /auth/grade-quiz +
    # POST /auth/grade-survey로 진행한다. 그 전까지 신규 유저는 기본 등급(GRADES[0])으로 시작한다.
    email: EmailStr
    username: str
    nickname: str
    password: str
    password_confirm: str
    # 개인정보 처리방침 동의(필수) - false로 오면 가입 자체를 막는다
    privacy_agreed: bool
    # 개미레터(뉴스레터) 수신 동의(선택)
    newsletter_opt_in: bool = False

    @field_validator("password")
    @classmethod
    def _check_password_strength(cls, value: str) -> str:
        return _validate_password_strength(value)

    @field_validator("nickname")
    @classmethod
    def _check_nickname(cls, value: str) -> str:
        return _validate_nickname(value)

    @model_validator(mode="after")
    def _check_password_match(self) -> "SignupRequest":
        if self.password != self.password_confirm:
            raise ValueError("비밀번호와 비밀번호 확인이 일치하지 않습니다.")
        return self

    @model_validator(mode="after")
    def _check_privacy_agreed(self) -> "SignupRequest":
        if not self.privacy_agreed:
            raise ValueError("개인정보 처리방침에 동의해야 가입할 수 있습니다.")
        return self


class LoginRequest(BaseModel):
    username: str
    password: str


class VerifyPasswordRequest(BaseModel):
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str
    new_password_confirm: str

    @field_validator("new_password")
    @classmethod
    def _check_password_strength(cls, value: str) -> str:
        return _validate_password_strength(value)

    @model_validator(mode="after")
    def _check_password_match(self) -> "ChangePasswordRequest":
        if self.new_password != self.new_password_confirm:
            raise ValueError("새 비밀번호와 새 비밀번호 확인이 일치하지 않습니다.")
        return self


class FindIdRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    username: str
    email: EmailStr


class GradeSurveyRequest(BaseModel):
    investment_experience: InvestmentExperience
    term_quiz_answers: dict[str, int] = {}
    news_quiz_answers: dict[str, int] = {}


class QuizQuestionResponse(BaseModel):
    id: str
    question: str
    choices: list[str]


class GradeQuizResponse(BaseModel):
    term_questions: list[QuizQuestionResponse]
    news_questions: list[QuizQuestionResponse]


class PromotionSuggestionResponse(BaseModel):
    id: int
    suggested_grade: str
    attendance_days: int
    distinct_terms_viewed: int


class ActivityStatsResponse(BaseModel):
    attendance_days: int  # 최근 attendance_window_days일 중 출석한 날 수
    distinct_terms_viewed: int  # 지금까지 열람한 서로 다른 용어 수
    attendance_window_days: int
    # 다음 등급으로 승급 제안을 받기 위한 기준 (promotion_service.PROMOTION_RULES). 최고 등급이면 셋 다 None
    next_grade: str | None
    required_attendance_days: int | None
    required_distinct_terms: int | None


class PromotionRespondRequest(BaseModel):
    accept: bool


class WithdrawalFeedbackRequest(BaseModel):
    reason: str
    custom_text: str | None = None

    @model_validator(mode="after")
    def _check_reason(self) -> "WithdrawalFeedbackRequest":
        if self.reason not in WITHDRAWAL_REASON_OPTIONS:
            raise ValueError("올바르지 않은 탈퇴 사유입니다.")
        if self.reason == "기타" and not (self.custom_text and self.custom_text.strip()):
            raise ValueError("기타를 선택하셨다면 사유를 입력해주세요.")
        return self


class CurrentUserResponse(BaseModel):
    id: int
    email: str
    username: str
    nickname: str
    grade: str
    must_change_password: bool
    newsletter_opt_in: bool
    created_at: str  # YYYY-MM-DD - 마이페이지 가입일 표시용
    # 닉네임을 다시 바꿀 수 있는 시각(한국 시간, "YYYY-MM-DDTHH:MM"). 지금 바로 바꿀 수 있으면 None
    nickname_changeable_at: str | None


class NewsletterOptInRequest(BaseModel):
    opt_in: bool


class ChangeNicknameRequest(BaseModel):
    nickname: str

    @field_validator("nickname")
    @classmethod
    def _check_nickname(cls, value: str) -> str:
        return _validate_nickname(value)


class MessageResponse(BaseModel):
    message: str


class GradeResponse(BaseModel):
    grade: str
    total_correct: int
    total_questions: int


class GradeHistoryItemResponse(BaseModel):
    date: str  # YYYY-MM-DD
    grade: str
    source: str  # "퀴즈" | "활동 승급"
