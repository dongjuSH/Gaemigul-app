# quiz_service.py
# 회원가입/등급 재검사에 쓰는 "정답 있는 간단 퀴즈" - 예전엔 Q2(아는 용어 체크)가 자기신고
# 체크리스트였는데 왜곡 가능성이 있어 퀴즈로 바꿨다. 문항은 glossary_term 테이블에서 그때그때
# 뽑지 않고 여기 고정 상수로 큐레이션했다 - 사전 데이터가 바뀌어도 퀴즈가 흔들리지 않게 하려는
# 의도다(문항 안정성). 정답 인덱스는 절대 API 응답에 포함하지 않는다 - 클라이언트는 선택지 인덱스만
# 제출하고 채점은 항상 여기(서버)에서 한다.

from dataclasses import dataclass


@dataclass(frozen=True)
class QuizQuestion:
    id: str
    question: str
    choices: tuple[str, str, str, str]
    correct_index: int  # 0~3


# 용어 퀴즈 - "다음 설명에 해당하는 용어는?" 형태. 오답 보기는 다른 용어의 이름을 가져다 썼다
TERM_QUIZ_QUESTIONS: tuple[QuizQuestion, ...] = (
    QuizQuestion(
        id="term-1",
        question="'산 금액이 판 금액보다 많은 것'을 뜻하는 용어는?",
        choices=("순매수", "순매도", "손절매", "공매도"),
        correct_index=0,
    ),
    QuizQuestion(
        id="term-2",
        question="'주식을 보유하지 않은 상태에서 빌려 매도한 뒤, 가격이 내리면 되사서 갚는' 투자 방식은?",
        choices=("유상증자", "무상증자", "공매도", "배당금"),
        correct_index=2,
    ),
    QuizQuestion(
        id="term-3",
        question="'주가를 주당순이익(EPS)으로 나눈 값'으로, 이익 대비 주가 수준을 보는 지표는?",
        choices=("PER", "PBR", "ROE", "액면가"),
        correct_index=0,
    ),
    QuizQuestion(
        id="term-4",
        question="발행주식수에 현재 주가를 곱해 회사의 시장 가치를 나타내는 값은?",
        choices=("액면가", "시가총액", "배당수익률", "유상증자"),
        correct_index=1,
    ),
    QuizQuestion(
        id="term-5",
        question="회사가 신주를 발행해 투자자에게 돈을 받고 자본을 늘리는 것은?",
        choices=("무상증자", "유상증자", "액면분할", "자사주 소각"),
        correct_index=1,
    ),
    QuizQuestion(
        id="term-6",
        question="공매도 세력이 급등에 놀라 서둘러 환매수하면서 주가가 추가로 급등하는 현상은?",
        choices=("숏스퀴즈", "서킷브레이커", "그린슈", "리픽싱"),
        correct_index=0,
    ),
)

# 뉴스 이해도 퀴즈 - 짧은 가상 뉴스 스니펫을 읽고 이해도를 묻는다
NEWS_QUIZ_QUESTIONS: tuple[QuizQuestion, ...] = (
    QuizQuestion(
        id="news-1",
        question=(
            "[가상 뉴스] 반도체 대장주 A사가 시장 예상치를 웃도는 분기 실적을 발표하자 "
            "주가가 전일 대비 8% 상승 마감했다. 이 기사가 뜻하는 바로 가장 적절한 것은?"
        ),
        choices=(
            "A사의 실적이 시장 예상보다 좋아서 주가가 올랐다",
            "A사의 실적이 시장 예상보다 나빠서 주가가 올랐다",
            "A사가 배당을 중단해서 주가가 올랐다",
            "A사가 상장폐지돼서 주가가 올랐다",
        ),
        correct_index=0,
    ),
    QuizQuestion(
        id="news-2",
        question=(
            "[가상 뉴스] 미국 연준이 기준금리를 동결하자, 국내 코스피는 외국인 순매수에 힘입어 "
            "상승했지만 코스닥은 개인 매도세로 하락 마감하며 시장이 엇갈렸다. 이 기사에서 알 수 있는 것은?"
        ),
        choices=(
            "코스피와 코스닥 모두 상승했다",
            "코스피는 상승, 코스닥은 하락하며 지수가 엇갈렸다",
            "미국 연준이 금리를 인상했다",
            "개인 투자자가 코스피를 순매수했다",
        ),
        correct_index=1,
    ),
    QuizQuestion(
        id="news-3",
        question=(
            "[가상 뉴스] B사가 대규모 유상증자를 발표하자 기존 주주들의 지분 희석 우려로 "
            "주가가 급락했다. 이 기사가 시사하는 바로 가장 적절한 것은?"
        ),
        choices=(
            "유상증자는 항상 주가에 긍정적이다",
            "유상증자로 새 주식이 늘어나 기존 주주 지분율이 낮아질 수 있다는 우려가 주가에 반영됐다",
            "B사가 배당금을 늘렸다",
            "B사가 자사주를 매입했다",
        ),
        correct_index=1,
    ),
)


def public_questions(questions: tuple[QuizQuestion, ...]) -> list[dict]:
    return [{"id": q.id, "question": q.question, "choices": list(q.choices)} for q in questions]


# answers: {question_id: selected_index}. 없는 문항이나 범위 밖 인덱스는 오답 처리한다
def score(questions: tuple[QuizQuestion, ...], answers: dict[str, int]) -> tuple[int, int]:
    correct = sum(1 for q in questions if answers.get(q.id) == q.correct_index)
    return correct, len(questions)
