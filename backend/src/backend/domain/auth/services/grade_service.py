# grade_service.py
# 투자 경험 + 퀴즈 점수 -> 등급 분류, 설문 이력 저장.
#
# 예전엔 Q2(아는 용어)가 자기신고 체크리스트였는데, 이제는 정답이 있는 퀴즈(quiz_service)로
# 검증한 점수를 쓴다. "체크한 용어 개수"였던 축만 "퀴즈 정답 비율"로 교체했었다.
#
# 예전엔 max(경험 레벨, 퀴즈 레벨)이었는데, 이러면 퀴즈를 전부 틀려도 Q1(투자 경험 자기신고)에서
# "1년 이상"만 고르면 그대로 최고 등급이 나와버렸다 - 자기신고 왜곡을 막으려고 퀴즈를 도입한
# 취지 자체가 무력화되는 구조였다. 그래서 퀴즈 결과를 기준으로 삼고, 자기신고는 "퀴즈보다 스스로
# 더 잘 안다고 할 때" 최대 1단계만 얹어주는 보정치로만 쓰도록 바꿨다 - 자기신고가 퀴즈 결과를
# 깎아내리는 방향으로는 절대 작동하지 않는다.

from sqlalchemy.ext.asyncio import AsyncSession

from backend.domain.auth.models.auth import AuthGradeSurvey, AuthUser

GRADES = ("애기 개미", "청년 개미", "고참 개미")

_EXPERIENCE_LEVEL = {"없음": 0, "1년 미만": 1, "1년 이상": 2}


# 정답 비율 <=1/3 -> 0단계, <=2/3 -> 1단계, 그 이상 -> 2단계. 문항 수가 나중에 바뀌어도
# 그대로 쓸 수 있게 절대 개수가 아니라 비율로 나눴다
def _quiz_level(correct: int, total: int) -> int:
    if total <= 0:
        return 0
    ratio = correct / total
    if ratio <= 1 / 3:
        return 0
    if ratio <= 2 / 3:
        return 1
    return 2


def classify_grade(
    investment_experience: str,
    term_quiz_correct: int,
    term_quiz_total: int,
    news_quiz_correct: int,
    news_quiz_total: int,
) -> str:
    quiz_level = max(
        _quiz_level(term_quiz_correct, term_quiz_total),
        _quiz_level(news_quiz_correct, news_quiz_total),
    )
    experience_level = _EXPERIENCE_LEVEL[investment_experience]
    bonus = 1 if experience_level > quiz_level else 0
    level = min(quiz_level + bonus, 2)
    return GRADES[level]


# 퀴즈 제출 1건을 기록하고(auth_grade_survey에 새 행) user.grade를 그 결과로 갱신한다.
# 회원가입 최초 제출과 마이페이지 "등급 재검사" 재제출 모두 이 함수를 쓴다
async def record_survey(
    session: AsyncSession,
    user: AuthUser,
    investment_experience: str,
    term_quiz_correct: int,
    term_quiz_total: int,
    news_quiz_correct: int,
    news_quiz_total: int,
) -> str:
    grade = classify_grade(investment_experience, term_quiz_correct, term_quiz_total, news_quiz_correct, news_quiz_total)

    session.add(
        AuthGradeSurvey(
            user_id=user.id,
            investment_experience=investment_experience,
            term_quiz_correct=term_quiz_correct,
            term_quiz_total=term_quiz_total,
            news_quiz_correct=news_quiz_correct,
            news_quiz_total=news_quiz_total,
            resulting_grade=grade,
        )
    )
    user.grade = grade

    return grade
