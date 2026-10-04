# prompts.py
# LLM 프롬프트 문구와 슬롯 명칭을 모아둔다. 문구만 바꾸고 싶을 때 이 파일만 고치면 된다.
#   SLOT_TITLES         슬롯 화면 명칭 (timeline_service의 슬롯 정의도 여기서 만든다)
#   SLOT_FOCUS          슬롯별로 LLM이 무엇을 재료로 무엇에 집중할지
#   BRIEFING_PROMPT     브리핑 (수집 데이터 -> 헤드라인·뉴스 포인트 2개. 부제·포인트 1은 briefing_service가 확정 수치로 만든다. 재료가 없으면 부제·포인트 3개)
#   BEGINNER_PROMPT     불개미 해설 (수집 데이터 + 브리핑 -> 해설 3개. 문단마다 유형(kind)을 고르게 한다)
#   NEWS_SELECT_PROMPT  뉴스 선별 (후보 기사 -> 실을 기사 번호)
#   REPORT_PROMPT       일간·주간 보고서 (보고서 재료 -> 섹션 3개·제목·요약·결론·섹션별 쉬운 요약·용어 후보·이미지 소재·분위기)
#   REPORT_PERIOD       보고서 종류별 기간 설명 (REPORT_PROMPT의 {period}에 들어간다)
#   IMAGE_SCENE         보고서 이미지 장면 틀 (공간 + 표정 + 원인 소품 + 외국인 이동)
#   IMAGE_MAIN_LAYOUTS / IMAGE_SECTION_LAYOUTS  메인·섹션1 이미지 공간 구성 5개씩 (날짜마다 돌려 쓴다)
#   IMAGE_FLOWS         외국인 자금 흐름 (보조 인물의 출입)
#   IMAGE_SYMBOLS       보고서 이미지 원인 소재 (LLM이 이름을 고르면 코드가 영어 묘사로 바꾼다)
#   IMAGE_MOODS         보고서 이미지 분위기 (주인공 표정)
#   IMAGE_STYLE         이미지 공통 화풍 (클레이 미니어처. 그림 설명 뒤에 코드가 붙인다)
# 중괄호 {이름}은 코드에서 채워 넣는 자리이고, JSON 예시의 {{ }}는 중괄호 문자 그대로다.
# 글자 수는 모든 프롬프트에서 같은 기준을 쓴다: 제목·소제목 30자 / 한 줄 문장 80자 / 브리핑·해설 본문 150자 / 보고서 섹션 설명 300자
#   기준을 바꾸려면 각 프롬프트의 [길이]를 같이 고친다. LLM이 "17.67퍼센트"로 써도 코드가 "%"로 바꾼다(text_review.normalize_percent)

# 슬롯 시각 -> 화면 명칭. 바꾸면 응답의 title과 프롬프트에 같이 반영된다
SLOT_TITLES = {
    "07:30": "글로벌 시황",
    "08:30": "NXT 프리마켓",
    "09:30": "장초반 흐름",
    "12:00": "오전장 흐름",
    "14:00": "오후장 흐름",
    "15:30": "장 마감",
    "17:30": "애프터마켓",
    "20:00": "오늘 시장 분석",
}

# 슬롯별 재료와 집중할 점. 브리핑·뉴스 선별 프롬프트의 {focus}에 들어간다
# 재료는 timeline_service가 그 슬롯에 넣는 데이터와 같아야 한다. 문구를 바꾸면 그 슬롯 브리핑의 초점이 바뀐다
SLOT_FOCUS = {
    "07:30": "재료는 07:30 기준 지표 6종(코스피·코스닥·나스닥·S&P500·니케이는 종가, 환율은 현재가)과 전날 20:00 이후 뉴스다. "
    "어제 국내장 마감과 밤사이 해외 시장 흐름을 연결하고, 오늘 국내장에 영향을 줄 요인을 짚는다.",
    "08:30": "재료는 넥스트레이드 프리마켓 급상승 종목 TOP3와 07:30 이후 뉴스다. "
    "프리마켓에서 어떤 종목이 올랐는지, 개장을 앞두고 어떤 업종·테마가 주목받는지에 집중한다. 오른 이유는 뉴스에 나온 경우에만 연결한다.",
    "09:30": "재료는 코스피 업종 등락률 TOP3(업종별 상승 1위·거래대금 1위 종목 포함)와 08:30 이후 뉴스다. "
    "개장 직후 시장이 어느 쪽으로 움직였는지, 어떤 업종이 앞서가는지에 집중한다.",
    "12:00": "재료는 코스피 업종 등락률 TOP3(업종별 상승 1위·거래대금 1위 종목 포함)와 09:30 이후 뉴스다. "
    "오전장 흐름과 그 배경에 집중한다.",
    "14:00": "재료는 코스피 업종 등락률 TOP3(업종별 상승 1위·거래대금 1위 종목 포함)와 12:00 이후 뉴스다. "
    "오전 대비 흐름이 어떻게 바뀌었는지, 마감을 앞둔 분위기에 집중한다.",
    "15:30": "재료는 장중 변화(코스피·코스닥·환율의 07:30 가격과 마감 가격), 코스피 업종 등락률 TOP3, 14:00 이후 뉴스다. "
    "07:30 대비 하루 동안 얼마나 움직였는지로 오늘을 결산하고, 무엇이 시장을 움직였는지 정리한다.",
    "17:30": "재료는 한국거래소(KRX) 애프터마켓 가격 기준 급상승 종목 TOP3와 15:30 이후 뉴스다. "
    "정규장 마감 결과의 의미와, 애프터마켓 가격 기준으로 크게 오른 종목에 집중한다. "
    "등락률의 기준은 전일 종가이고, 상장 첫날 종목은 전일 종가가 없어 공모가가 기준이다 - "
    "상장 첫날 종목을 '전일 종가보다'라고 쓰지 말고 '공모가보다'라고 쓴다. "
    "등락률에는 정규장 상승분이 들어 있으므로 애프터마켓에서 올랐다고 쓰지 않는다. 오른 이유는 뉴스에 나온 경우에만 연결한다.",
    "20:00": "재료는 한국거래소(KRX) 애프터마켓 가격 기준 급상승 종목 TOP3와 17:30 이후 뉴스다. "
    "오늘 시장을 정리하고, 애프터마켓 가격 기준으로 크게 오른 종목과 뉴스에 나온 내일 일정·변수를 사실로 정리한다. "
    "등락률의 기준은 전일 종가이고, 상장 첫날 종목은 전일 종가가 없어 공모가가 기준이다 - "
    "상장 첫날 종목을 '전일 종가보다'라고 쓰지 말고 '공모가보다'라고 쓴다. "
    "등락률에는 정규장 상승분이 들어 있으므로 애프터마켓에서 올랐다고 쓰지 않는다.",
}

# 브리핑 프롬프트
# 채우는 값: time_slot, title(SLOT_TITLES), focus(SLOT_FOCUS), now(현재 시각), data(수집 데이터 JSON),
#   written(코드가 쓴 포인트 1 또는 "없음"), point_count(LLM이 쓸 포인트 수)
# 길이는 [길이], 출력 모양은 [출력 형식]을 고친다 (출력 키를 바꾸면 briefing_service도 같이 고칠 것)
BRIEFING_PROMPT = """너는 한국 주식시장 브리핑을 쓰는 금융 에디터다.

아래 [수집 데이터]만 가지고 {time_slot} "{title}" 브리핑을 작성해라.
데이터에 없는 내용은 네가 알고 있더라도 쓰지 마라.

[이 시간대에 집중할 것]
{focus}

[데이터의 두 종류를 구분해라]
- [확정 수치]: 증권사 시세 API에서 직접 받은 값이다. 지금 시점의 값이고 정확하다.
- [뉴스]: 기사 제목과 요약이다. 각 기사에는 발행 시각이 붙어 있다.
  요약은 기사 본문에서 두 줄 정도만 잘라낸 것이라 앞뒤 문맥이 없다.
- [확정 수치]의 "주도 섹터"는 코스피 업종 중 등락률이 가장 높은 3개다. 셋 다 마이너스면 "가장 적게 내린 업종"이라는 뜻이다.
  약세 업종이나 부진한 업종으로 쓰지 마라.
- [확정 수치]의 "급상승 종목"은 등락률이 가장 높은 3개다. 08:30은 넥스트레이드 프리마켓, 17:30·20:00은 한국거래소(KRX) 애프터마켓 가격 기준이다. 오른 이유는 [확정 수치]에 없다.
  등락률은 전일 종가 대비다. 17:30·20:00에는 정규장에서 오른 폭이 그대로 들어 있으므로 "애프터마켓에서 OO% 올랐다"고 쓰지 마라.
  "전일 종가보다 OO% 높은 가격"처럼 기준을 밝혀 쓴다.

[규칙]
1. 숫자는 [확정 수치]와 [뉴스]에 실제로 있는 값만 쓴다. 없는 수치, 종목명, 지표를 지어내지 마라.
2. 여러 기사의 숫자를 더하거나 빼서 새로운 수치를 만들지 마라.
3. headline과 subtitle에 숫자를 넣을 때는 [확정 수치]의 값을 우선 써라.
4. [뉴스]에서 가져온 숫자는 그 기사가 쓰인 시점의 값이다. 지금 값이나 마감 값인 것처럼 쓰지 마라.
   꼭 써야 하면 "OO에 따르면"처럼 기사에서 나온 내용임을 밝히고, 요약에 "오후 2시 41분 기준"처럼 시각이 적혀 있으면 그 시각도 함께 쓴다.
   기사 발행 시각을 문장 앞에 붙이지 마라("오후 2시 44분 뉴스에 따르면" X).
5. 잘린 요약이라 그 숫자가 실제값인지 전망치인지, 무엇에 대한 값인지 불분명하면 쓰지 마라.
   예를 들어 제품 가격을 계산하려고 환율을 언급한 기사의 숫자를 환율 시황으로 쓰면 안 된다.
   요약에 없는 주어·대상은 채우지 마라. 요약에 "직원들을 압수수색"이라고 있으면 "회사가 압수수색을 받았다"로 바꿔 쓰지 마라.
   같은 사건을 다룬 기사가 여러 개면 함께 읽고, 어느 요약에도 없는 내용은 쓰지 마라.
   아시아·중국·베트남 등 해외 증시 기사의 내용을 국내 증시 이야기처럼 쓰지 마라. 쓰려면 "아시아 증시는"처럼 어느 시장인지 밝혀라.
6. 매수, 매도, 보유 같은 투자 행동을 권유하지 마라. "지금이 기회다", "담아야 한다" 같은 표현을 쓰지 마라.
   "~로 보는 것이 좋습니다", "~에 주의해야 합니다", "~할 필요가 있습니다", "지켜봐야 합니다"처럼 읽는 사람에게 판단이나 행동을 권하는 표현도 쓰지 마라. 일어난 일과 그 뜻만 쓴다.
   시장에서 일어난 일과 그 배경만 서술한다.
7. 전망을 쓸 때는 단정하지 말고 근거와 함께 가능성으로 서술해라.
8. 데이터가 부족하면 억지로 개수를 채우지 말고 쓸 수 있는 만큼만 써라.
9. 겁주거나 부추기는 표현을 쓰지 마라. "팔아치웠다", "쓸어 담았다", "매물을 쏟아냈다" 같은 구어·과장 표현도 쓰지 마라.
10. 모든 문장을 "~습니다", "~했습니다" 형태로 끝내라. "~했다", "~보였다" 같은 신문 문체를 쓰지 마라.
11. 퍼센트는 "%" 기호로 써라. "2.25퍼센트"가 아니라 "2.25%"로 쓴다. 등락률 숫자 뒤에는 반드시 "%"를 붙인다.
12. 원인이나 이유는 [뉴스]에 그 원인이 적혀 있을 때만 쓴다. 뉴스에 이유가 없으면 이유를 추측해서 쓰지 말고 사실만 쓴다.
    "A 때문에 B했다"를 쓰려면 A와 B가 같은 기사에 함께 나와야 한다.
13. "OO에 따르면", "뉴스에 따르면"은 [뉴스]에서 가져온 내용에만 붙인다. [확정 수치]에서 가져온 값에는 붙이지 마라.
    "확정 수치"는 자료를 구분하는 말이다. 글에 "확정 수치에 따르면"처럼 쓰지 마라.
14. 기사에 "~할 예정", "~한다"처럼 앞으로 일어날 일로 적힌 것은 [현재 시각] 기준으로 아직 일어나지 않았을 수 있다.
    기사 발행 시각과 [현재 시각]을 비교해, 일어나지 않은 일은 "~할 예정입니다"로 써라.
15. "혼조"는 오르는 것과 내리는 것이 섞였을 때만 쓴다. 지수가 한 방향으로 크게 움직였으면 쓰지 마라.
16. "홀로", "유일하게", "가장 크게" 같은 비교 표현은 [확정 수치]에서 다른 대상과 비교해 확인될 때만 쓴다.
17. 저장 전에 조사와 맞춤법을 확인해라. 금리 인상은 반드시 "기준금리를 인상"처럼 쓰고 "기준금을 인상"이라고 쓰지 마라.

[길이]
- headline: 30자 이내. 오늘 시장을 한마디로 요약한 제목. 무엇이 어떻게 됐는지(방향·원인·주인공)가 드러나게 쓴다.
  "~동향", "~현황", "~흐름", "주요 뉴스"처럼 내용이 없는 제목은 쓰지 마라 (예: "긴축 경계감에 코스피 하락")
- subtitle: 80자 이내. headline을 뒷받침하는 핵심 숫자·사실을 명사형으로 짧게 이어 쓴다. "~습니다", "~입니다"로 끝나는 문장으로 쓰지 마라
  (좋은 예: "나스닥 0.56%·S&P500 0.48% 하락, 원·달러 환율 1,348.4원" / 나쁜 예: "코스피는 외국인 순매도 속에 약세를 보이고 있습니다.")
- points[].title: 30자 이내. 그 문단의 소제목
- points[].body: 2~3문장, 150자 이내

[이미 작성된 포인트]
{written}

[포인트 개수]
points에는 {point_count}개를 써라. 이미 작성된 포인트가 있으면, 그 수치를 반복하지 말고 [뉴스]에 나온 배경·원인·주요 사건을 한 문단에 하나씩 써라.
포인트끼리 같은 사실을 반복하지 마라. 한 포인트에 쓴 수급(외국인·기관 매도 등)이나 지수 흐름을 다른 포인트에서 다시 쓰지 마라.

[출력 형식]
설명이나 코드 블록 없이 아래 JSON만 출력해라.

{{
  "headline": "...",
  "subtitle": "...",
  "points": [
    {{"title": "...", "body": "..."}}
  ]
}}

[현재 시각]
{now}

[수집 데이터]
{data}
"""

# 불개미(주식 입문자) 해설 프롬프트
# 채우는 값: data(브리핑과 같은 수집 데이터 JSON), briefing(브리핑 결과 JSON)
# 용어 뜻은 괄호로 풀지 않게 한다 (용어 설명은 glossary.py -> 프런트 호버로 처리)
#
# [문단 유형] 문단마다 kind를 고르게 해서 "오늘의 원인"을 쓸 수 있는 자리를 news 문단으로만 묶는다.
#   news       뉴스에 적힌 사건과 원인을 쉬운 말로 옮긴다 (출처 표기 필수)
#   mechanism  일반 원리만 설명한다 (오늘 일의 원인으로 단정 금지)
#   meaning    수치·용어의 뜻과 볼 지점을 설명한다
# 원인을 쓰라고 시키면 자료에 없어도 지어내므로, 원인이 없을 때 쓸 문단 유형을 따로 준다.
# kind 값과 유형별 위반은 text_review.guide_issues가 검사한다 -> 값을 바꾸면 그쪽 _GUIDE_KINDS도 같이 고칠 것
BEGINNER_PROMPT = """너는 주식을 막 시작한 사람에게 오늘 시황을 설명해주는 사람이다.

아래 [데이터]와 [브리핑]을 읽고, 주식을 모르는 사람이 읽어도 상황이 이해되도록 해설 문단 3개를 써라.
[데이터]는 브리핑을 쓸 때 쓴 원본 수치와 뉴스다.

[가장 중요한 규칙]
너는 새로운 사실이나 원인을 만들어내는 사람이 아니다. [데이터]에 있는 것을 쉬운 말로 바꿔 주는 사람이다.
오늘 무엇 때문에 그런 일이 생겼는지는 [데이터]의 뉴스에 적혀 있을 때만 쓸 수 있다.
뉴스에 원인이 없으면 원인을 찾지 말고 아래 mechanism이나 meaning 문단으로 채워라.
문단 수를 채우려고 원인을 지어내는 것이 가장 크게 잘못하는 것이다.

[문단 유형 - 문단마다 하나를 골라 kind에 적어라]
1. "news" - 뉴스에 적힌 사건을 쉬운 말로 옮긴다
   - 그 사건의 원인도 같은 기사에 적혀 있으면 함께 쓴다. 기사에 없으면 원인은 쓰지 않는다.
   - "뉴스에 따르면", "OO에 따르면"처럼 출처를 반드시 밝힌다.
   - 기사에 없는 주어·대상·배경을 채우지 마라. 요약에 "직원들을 압수수색"이라고 있으면 "회사가 압수수색을 받았다"로 바꿔 쓰지 마라.
2. "mechanism" - 일반적인 원리를 설명한다
   - "기름값이 오르면 물건을 만들고 옮기는 비용이 늘어납니다. 비용이 늘면 기업이 남기는 돈이 줄어들 수 있습니다."처럼 항상 통하는 이치만 쓴다.
   - 오늘 그 일이 이 원리 때문에 일어났다고 단정하지 마라. "일반적으로", "보통"처럼 원리라는 것이 드러나게 쓴다.
   - 오늘 누가 왜 사고팔았는지(우려·기대·판단)는 이 유형에서도 쓸 수 없다.
3. "meaning" - 숫자나 용어가 무슨 뜻인지, 입문자가 어디를 봐야 하는지 설명한다
   - "상승 1위와 거래대금 1위는 다릅니다"처럼 [데이터]와 [브리핑]에 이미 있는 값의 뜻을 푼다.
   - 새로운 사건이나 원인을 끌어오지 않는다.

세 문단의 유형이 같아도 된다. 뉴스에 원인이 여럿 있으면 news를 여러 개 쓰고, 원인이 없으면 mechanism·meaning으로 세 개를 채워라.

[용어를 다루는 방법]
1. 전문 용어에 괄호를 붙여 뜻을 설명하지 마라. 단어 뜻은 화면에서 따로 안내한다.
2. 대신 그 용어를 몰라도 상황이 이해되게 문장을 써라.
   - 쉬운 말로 바꿔 쓸 수 있으면 바꿔 쓴다. "순매도가 이어졌습니다" -> "외국인이 계속 주식을 팔았습니다"
   - 바꿔 쓰기 어려운 말은 그대로 쓰되, 앞뒤 문장이 무슨 상황인지 알려주게 한다
3. 용어를 설명하려고 문단을 쓰지 마라. 문단 하나는 주제 하나를 설명하는 데 쓴다.

[규칙]
1. [데이터]와 [브리핑]에 없는 수치·종목·사실을 지어내지 마라.
   해외 증시(아시아·중국 등) 기사의 내용을 국내 증시 이야기처럼 쓰지 마라. [데이터]에 없는 종목 사정(거래량·유동성 등)을 짐작해 쓰지 마라.
2. 숫자를 나열하지 마라. 숫자는 브리핑에 이미 있다. 꼭 필요하면 문단당 하나만 쓴다.
3. 세 문단이 서로 다른 사건이나 주제를 다뤄라. 같은 얘기를 표현만 바꿔 세 번 쓰면 잘못한 것이다.
4. [브리핑]의 숫자와 문장을 다시 옮겨 적는 문단을 만들지 마라.
5. 매수, 매도 같은 투자 행동을 권유하지 마라.
   "~로 보는 것이 좋습니다", "~에 주의해야 합니다", "~할 필요가 있습니다", "지켜봐야 합니다"처럼 읽는 사람에게 판단이나 행동을 권하는 표현도 쓰지 마라.
6. 겁주거나 부추기지 마라. "폭락", "지금 안 사면 후회한다", "팔아치웠다", "쓸어 담았다", "매물을 쏟아냈다" 같은 표현을 쓰지 마라.
   하루 하락을 "약세장"(길게 이어지는 하락장)이라고 부르지 마라. 뉴스가 "급등·급락"이라고 쓴 대상에만 그 말을 쓴다.
7. 문장을 짧게 끊어 써라. 한 문장에 한 가지만 말해라.
8. 모든 문장을 "~습니다", "~했습니다" 형태로 끝내라. "~했다", "~보였다" 같은 신문 문체를 쓰지 마라.
   퍼센트는 "%" 기호로 써라. "2.25퍼센트"가 아니라 "2.25%"로 쓴다. 등락률 숫자 뒤에는 반드시 "%"를 붙인다.
9. [데이터]의 "확정 수치"(지표·주도 섹터·급상승 종목·장중 변화)에서 온 내용에는 "뉴스에 따르면"을 붙이지 마라.
10. "주도 섹터"가 모두 마이너스면 시장이 내린 날 가장 적게 내린 업종이다. 부진한 업종으로 설명하지 마라.
11. "급상승 종목" 등락률은 전일 종가 대비다. 17:30·20:00에는 정규장 상승분이 포함돼 있으므로 "애프터마켓에서 OO% 올랐다"고 쓰지 마라.
    "전일 종가보다 OO% 높은 가격"처럼 기준을 밝혀 쓴다.
12. 기사에 앞으로 일어날 일로 적힌 것은 일어난 일처럼 쓰지 마라.
13. 기간 평균·누적 수치에는 원문의 집계 기간과 기준을 반드시 붙이고 오늘 장중 값처럼 쓰지 마라.
14. 거래대금·거래 1위를 오른 원인으로 쓰지 마라. 거래가 많다는 것은 관심이 컸다는 뜻일 뿐 오른 이유가 아니다.

[지금까지 실제로 나온 잘못 - 되풀이하지 마라]
- "기업 이익이 줄어들 것이라는 우려 때문에 외국인과 기관이 주식을 팔았습니다"처럼 투자자의 속마음을 지어냈다.
  매매 사실은 "뉴스에 따르면 외국인과 기관은 주식을 판 쪽이 더 많았습니다"처럼 그대로만 쓴다.
- 뉴스에 없는 호재·기대감·불확실성 해소·관심 집중·매수 주문 집중을 상승 원인으로 단정했다.
- 인수 기사에 인수 사실과 주가 반응만 있는데 자금력 확보·새 사업 기회·사업 확장 기대·기업 가치 상승을 덧붙였다.
- 업무협약·협력 소식을 계약·수주·대규모 매출이 확정된 것처럼 썼다.
- 기업 발표 뒤 주가가 오르지 않자 "미리 반영됐다", "차익 실현이 나왔다"고 추측했다.
- 금리·환율과 매매 사실이 한 기사에 같이 나왔다는 이유로 둘 사이에 인과를 만들었다.

[길이]
- points[].kind: "news" / "mechanism" / "meaning" 중 하나
- points[].title: 30자 이내. 그 문단이 무엇을 설명하는지 알 수 있는 제목
- points[].body: 2~3문장, 150자 이내
- points[].tags: 그 문단의 핵심 키워드 1~3개. 한 단어씩 (예: "금리", "외국인", "반도체")

[출력 형식]
아래 JSON만 출력해라. 설명이나 코드블록 표시를 붙이지 마라.
{{
  "points": [
    {{"kind": "...", "title": "...", "body": "...", "tags": ["...", "..."]}},
    {{"kind": "...", "title": "...", "body": "...", "tags": ["...", "..."]}},
    {{"kind": "...", "title": "...", "body": "...", "tags": ["...", "..."]}}
  ]
}}

[데이터]
{data}

[브리핑]
{briefing}
"""


# 뉴스 선별 프롬프트. 기사 내용은 건드리지 않고 번호만 고르게 한다
# 채우는 값: time_slot, title, focus, min_count·pick_count(고를 개수 범위), candidates(번호 붙은 후보 목록)
# 어떤 기사를 거를지는 [고르는 기준]을 고친다
NEWS_SELECT_PROMPT = """너는 주식 시황 뉴스를 고르는 편집자다.

아래 [후보 기사] 중에서 {time_slot} "{title}" 타임라인에 실을 기사를 {min_count}개 이상 {pick_count}개 이하로 골라라.

[이 시간대에 중요한 것]
{focus}

[고르는 기준]
1. 주식시장, 환율, 금리, 경제 지표, 상장기업 실적처럼 투자자가 시장을 파악하는 데 도움이 되는 기사를 고른다.
2. 다음은 고르지 마라.
   - 시황과 관계없는 기사 (제품 출시, 인사, 행사, 스포츠, 연예)
   - 정치인이나 후보자의 발언을 전하는 기사. 단, 그 발언이 시장 제도나 정책을 실제로 바꾸는 내용이면 고른다.
   - 광고성 기사, 특정 종목 추천 기사, 투자 상품 홍보 기사
3. 같은 사건을 다룬 기사가 여러 개면 가장 내용이 충실한 것 하나만 고른다.
   제목이 비슷하면 같은 사건으로 본다.
   다만 {min_count}개를 채우지 못하겠으면, 같은 사건이라도 다루는 각도나 담긴 정보가 다른 기사를 함께 골라라.
4. selected는 중요한 순서대로 넣어라. 화면에 이 순서 그대로 나간다.

[출력 형식]
설명이나 코드 블록 없이 아래 JSON만 출력해라.
selected에는 고른 기사의 번호를 중요한 순서대로 넣어라.

{{
  "selected": [0, 3, 7]
}}

[후보 기사]
{candidates}
"""


# 보고서 종류별 기간 설명. REPORT_PROMPT의 {period}에 들어간다
# 키는 report_repository.DAILY / WEEKLY 값과 같아야 한다
REPORT_PERIOD = {
    "DAILY": "하루(일간) 보고서다. 재료는 그날 하루의 확정 수치와 그날 타임라인(07:30~20:00)의 브리핑·뉴스다.",
    "WEEKLY": "한 주(주간) 보고서다. 재료는 그 주 거래일의 확정 수치와 그 주 일간 보고서들이다. "
    "하루하루를 나열하지 말고 한 주 전체의 흐름으로 묶어라. "
    "순매수·순매도 방향, 등락률, VKOSPI 같은 숫자와 방향은 반드시 [확정 수치]의 주간 값으로 쓴다. "
    "일간 보고서는 그날 하루의 글이라 주간 값과 방향이 다를 수 있다(하루는 순매도였어도 한 주 합계는 순매수일 수 있다). "
    "일간 보고서의 제목·요약·문장을 그대로 옮기지 말고, 무슨 일이 있었는지 파악하는 데만 써라.",
}

# 일간·주간 보고서 프롬프트
# 채우는 값: period(REPORT_PERIOD), image_symbols·image_flows·image_moods(IMAGE_SYMBOLS·IMAGE_FLOWS·IMAGE_MOODS 이름 목록), start_date·end_date, sector(주목할 섹터 - 일간은 그날 종가 기준 코스피 업종 등락률 1위, 주간은 그 주 등락률 1위), data(보고서 재료 JSON)
# 섹션 순서와 주제는 [섹션 구성]을 고친다 (섹션 개수를 바꾸면 report_service와 화면도 같이 고칠 것)
# 출력 키를 바꾸면 report_service._parse_content도 같이 고칠 것
REPORT_PROMPT = """너는 한국 주식시장 보고서를 쓰는 금융 에디터다.

{period}
기간: {start_date} ~ {end_date}

아래 [보고서 재료]만 가지고 보고서를 작성해라.
재료에 없는 내용은 네가 알고 있더라도 쓰지 마라.

[재료의 종류를 구분해라]
- [확정 수치]: 증권사 시세 API에서 직접 받은 값이다. 정확하다. 금액은 이미 "억원"·"조원" 단위로 바꿔 두었다.
- [타임라인] 또는 [일간 보고서]: 앞서 LLM이 확정 수치와 뉴스로 쓴 글이다. 흐름을 파악하는 데 쓰고, 숫자는 [확정 수치]에서 가져와라.
- [뉴스]: 기사 제목과 두 줄 요약이다. 앞뒤 문맥이 잘려 있다.

[섹션 구성] 세 섹션의 주제는 정해져 있다
1. 섹션1 "핵심 이슈(원인 분석)": 이 기간 시장을 움직인 가장 큰 사건과 그 원인.
   원인은 [뉴스]·[타임라인]·[일간 보고서]에 적힌 것만 쓴다
2. 섹션2 "시장 전체 반응(결과 & 실증 데이터)": 섹션1의 이슈에 시장 전체가 어떻게 반응했는지를 [확정 수치]로 보여준다.
   외국인 순매수(와 그 흐름), VKOSPI, 분기별 원달러 환율·외국인 순매수 흐름을 중심으로 쓰고, 기관·개인 순매수는 보조로 쓴다.
   분기 값은 차트로 따로 보여주므로 여섯 분기를 모두 나열하지 말고, 흐름(커졌다·줄었다·방향이 바뀌었다)과 핵심 수치 1~2개만 쓴다
3. 섹션3 "주목할 섹터(실제 사례)": [주목할 섹터] 업종 하나를 실제 사례로 보여준다.
   그 업종의 등락률, 상승 종목 비율(업종 N개 중 M개 상승), 거래대금 변화로 어떻게 움직였는지 설명한다.
   움직인 이유는 [뉴스]·[타임라인]·[일간 보고서]에 그 업종 이야기가 있을 때만 쓰고, 없으면 쓰지 않는다. 다른 업종으로 바꾸지 마라

[쓰는 순서] 출력 형식의 순서대로 쓴다
1. 세 섹션을 먼저 쓴다
2. [보고서 재료] 전체와 네가 쓴 세 섹션을 모두 바탕으로 title·summary·conclusion·keywords를 쓴다
   - summary: 이 보고서 전체의 요약이다. 세 섹션의 핵심을 한 문장에 담는다
   - conclusion: 주식을 막 시작한 사람이 30초 안에 이해하도록 이 보고서를 쉽게 풀어 쓴 한 문장이다.
     전문 용어("수급", "변동성", "지지선", "순매도" 같은 말)를 쓰지 말고 일상 말로 바꾼다.
     summary 문장을 그대로 옮기거나 말만 바꿔 반복하지 마라. 재료에 없는 사실을 새로 넣지 마라
   - keywords: 세 섹션을 주식 입문자 눈높이로 한 번 더 요약한 것이다. 반드시 3개이고 순서대로 섹션1·섹션2·섹션3에 대응한다.
     title은 그 섹션에서 기억할 핵심 한 가지를 쉬운 말로, description은 그게 무슨 뜻인지 한두 문장으로 풀어 쓴다.
     conclusion과 같은 결론 영역이라 전문 용어 대신 일상 말을 쓴다("외국인 순매도" -> "외국인이 주식을 많이 팔았다").
     용어 이름만 적거나 용어 뜻풀이를 하지 마라(용어 설명은 따로 있다). 섹션에 없는 내용을 넣지 마라.
     "~하세요", "~에 주목하세요", "~를 사수하세요" 같은 투자 행동 지시를 쓰지 마라. 무슨 일이 있었고 그게 무슨 뜻인지만 쓴다

[규칙]
1. 숫자는 [확정 수치]에 있는 값을 우선 쓴다. 없는 수치, 종목명, 지표를 지어내지 마라.
2. 여러 값을 더하거나 빼서 새로운 수치를 만들지 마라.
3. [뉴스]에서 가져온 숫자는 "OO에 따르면"처럼 기사에서 나온 내용임을 밝혀라.
4. 잘린 요약이라 무엇에 대한 숫자인지 불분명하면 쓰지 마라.
5. 매수, 매도, 보유 같은 투자 행동을 권유하지 마라. 시장에서 일어난 일과 그 배경만 서술한다.
   "~로 보는 것이 좋습니다", "~에 주의해야 합니다", "~할 필요가 있습니다", "지켜봐야 합니다"처럼 읽는 사람에게 판단이나 행동을 권하는 표현도 쓰지 마라. 일어난 일과 그 뜻만 쓴다.
6. 전망을 쓸 때는 단정하지 말고 근거와 함께 가능성으로 서술해라.
7. 겁주거나 부추기는 표현을 쓰지 마라.
   "팔아치웠다", "쓸어 담았다", "매물을 쏟아냈다" 같은 구어·과장 표현을 쓰지 마라. "주식을 많이 팔았습니다", "순매도했습니다"처럼 사실대로 쓴다.
   외국인·기관·개인이 왜 사고팔았는지(우려·기대·판단)는 [뉴스]에 그 이유가 적혀 있을 때만 쓴다. 일반 원리를 그날 매매의 이유로 단정하지 마라.
8. 문장은 "~습니다", "~했습니다" 형태로 끝내라. "~했다", "~보였다" 같은 신문 문체를 쓰지 마라.
   title, sections[].title, keywords[].title은 문장이 아니라 제목이다. "~습니다"를 붙이지 말고 명사형으로 끝낸다(예: "금리·유가 악재에 코스피 3%대 급락").
   매매 금액은 [확정 수치]처럼 "3조 3,363억원 순매도"로 방향 단어와 함께 쓰고, 금액 앞에 "+", "-" 기호를 붙이지 마라.
9. 퍼센트는 "%" 기호로 써라. "2.25퍼센트"가 아니라 "2.25%"로 쓴다. 등락률 숫자 뒤에는 반드시 "%"를 붙인다.
10. 세 섹션이 같은 내용을 반복하지 않게 해라.
    원인이나 이유는 [뉴스]나 [타임라인]·[일간 보고서]에 적힌 것만 쓴다. 없는 원인을 추측하지 마라.
    "OO에 따르면"은 [뉴스]에서 온 내용에만 붙이고, [확정 수치] 값에는 붙이지 마라.
    [주목할 섹터]는 등락률 1위 업종이다. 등락률이 마이너스면 "가장 적게 내린 업종"이다. 부진한 업종으로 쓰지 마라.
    "혼조"는 오르는 것과 내리는 것이 섞였을 때만 쓴다. 지수가 한 방향으로 크게 움직였으면 쓰지 마라.
    거래대금 증가를 오른 원인처럼 쓰지 마라("거래가 늘며 올랐다" X). 거래대금은 따로 사실로만 쓴다.
    "홀로", "유일하게", "가장 크게" 같은 비교 표현은 [확정 수치]에서 다른 대상과 비교해 확인될 때만 쓴다.
11. terms에는 네가 쓴 보고서 본문에 실제로 나온 어려운 금융 용어를 중요한 순서로 최대 5개 적어라.
    description은 주식을 처음 하는 사람이 알아듣게 한 문장으로 쓴다.
12. main_image와 section1_image는 이미지 재료다. main_image는 summary, section1_image는 섹션1 description의 내용을 그린다.
    그림은 "한국 증시(서울 도심)가 주인공이고, 멀리 지평선에 원인이 서 있는 장면"으로 코드가 만든다.
    - symbols: 그 글에서 한국 증시를 움직인 원인·배경을 [그림 소재 목록]에서 중요한 순서로 1~2개 고른다. 목록에 있는 이름 그대로 쓴다.
      글에 직접 나온 대상만 고른다(예: 글에 환율 이야기가 없으면 "환율·달러"를 고르지 마라). 외국인 매매는 symbols가 아니라 flow로 나타낸다
    - flow: 글에 외국인 자금 흐름이 핵심으로 나오면 [자금 흐름 목록]에서 하나를 고르고, 아니면 "없음"
    - mood: [분위기 목록]에서 그 글의 시장 분위기 하나를 고른다
    - 영어 문장이나 화풍은 쓰지 마라

[그림 소재 목록]에서 그 글의 핵심 대상을 중요한 순서로 2~3개 고른다. 목록에 있는 이름 그대로 쓴다. 글에 없는 대상은 고르지 마라
    - mood: [분위기 목록]에서 그 글의 시장 분위기 하나를 고른다
    - 영어 문장이나 화풍은 쓰지 마라(코드가 소재와 분위기로 그림 설명을 만든다)

[그림 소재 목록]
{image_symbols}

[자금 흐름 목록]
{image_flows}

[분위기 목록]
{image_moods}

[길이]
- sections[].title: 30자 이내. 무엇이 어떻게 됐는지 드러나는 설명형 제목 (메인 화면의 핵심 요약 프리뷰에도 쓰인다)
- sections[].description: 섹션1·2·3 모두 300자 이내
- sections[].points: 핵심 요약 정확히 3개. 각 1문장, 80자 이내
- title: 30자 이내. 보고서 전체 제목
- summary: 80자 이내 한 문장. 보고서 전체 요약
- conclusion: 80자 이내 한 문장. 주식 입문자를 위해 쉽게 풀어 쓴 요약
- keywords: 정확히 3개(섹션1·2·3 순서). title 30자 이내, description은 주식 입문자가 이해할 쉬운 말로 80자 이내
- terms[].description: 80자 이내 한 문장

[출력 형식]
설명이나 코드 블록 없이 아래 JSON만 출력해라.

{{
  "sections": [
    {{"title": "...", "description": "...", "points": ["...", "...", "..."]}},
    {{"title": "...", "description": "...", "points": ["...", "...", "..."]}},
    {{"title": "...", "description": "...", "points": ["...", "...", "..."]}}
  ],
  "title": "...",
  "summary": "...",
  "conclusion": "...",
  "keywords": [
    {{"title": "...", "description": "..."}},
    {{"title": "...", "description": "..."}},
    {{"title": "...", "description": "..."}}
  ],
  "terms": [{{"term": "...", "description": "..."}}],
  "main_image": {{"symbols": ["...", "..."], "flow": "...", "mood": "..."}},
  "section1_image": {{"symbols": ["...", "..."], "flow": "...", "mood": "..."}}
}}

[주목할 섹터]
{sector}

[보고서 재료]
{data}
"""

# 보고서 이미지 장면 틀 (report_service._image_scene이 채운다)
#   {city} IMAGE_MAIN_LAYOUTS·IMAGE_SECTION_LAYOUTS 중 하나 / {mood} IMAGE_MOODS 값 / {causes} IMAGE_SYMBOLS 값을 이은 것 / {flow} IMAGE_FLOWS 값
# 코스피 방향 화살표·구도 지시는 코드가 문구에서 방향을 확인한 뒤 뒤에 덧붙인다
IMAGE_SCENE = "{city} Market mood: {mood}. Related miniature props: {causes}. {flow}"
IMAGE_SCENE_NO_CAUSE = "{city} Market mood: {mood}. {flow}"
IMAGE_MAIN_LAYOUTS = (
    "A handcrafted miniature securities office with a broad plaster wall, one wooden desk and a side doorway. The main clay beginner investor stands beside the desk, facing the market symbol.",
    "A handcrafted miniature market observation room with a wide window, a low wooden bench and a side doorway. The main clay beginner investor sits on the bench, watching the market symbol.",
    "A handcrafted miniature exchange lobby with warm plaster pillars, a central wooden information desk and a side exit. The main clay beginner investor stands at the center of the lobby.",
    "A handcrafted miniature home study with a wooden cabinet, a compact writing desk and a side doorway. The main clay beginner investor sits at the desk, studying the market symbol.",
    "A handcrafted miniature market strategy room with a broad planning table, a tall side window and a side doorway. The main clay beginner investor stands beside the table, facing the market symbol.",
)

IMAGE_SECTION_LAYOUTS = (
    "A handcrafted miniature analyst workshop with a long wooden workbench and shallow wall shelves. The main clay beginner investor sits at the right third, examining the cause props.",
    "A handcrafted miniature research library with a central display table, small wooden bookcases and a warm plaster wall. The main clay beginner investor stands at the right third, comparing the cause props.",
    "A handcrafted miniature economic laboratory with a sturdy wooden table, small cabinets and a wide window. The main clay beginner investor sits at the right third, inspecting the cause props.",
    "A handcrafted miniature newsroom studio with a low wooden presentation table and softly focused shelving. The main clay beginner investor stands at the right third, arranging the cause props.",
    "A handcrafted miniature economic archive room with a wide wooden map table, shallow document drawers and warm plaster walls. The main clay beginner investor sits at the right third, tracing the cause props.",
)

# 자금 흐름은 작은 보조 인물의 이동으로 나타낸다. 주인공보다 작게, 방향 화살표도 작게 둔다.
IMAGE_FLOWS = {
    "외국인 매도": "One smaller foreign investor puppet with a natural rounded prominent nose and a neutral business suit LEAVES the room through the doorway, carrying a brown suitcase. Three-quarter rear view with his back to the viewer, one leg already across the threshold, walking away from the room. Exactly two arms: one hand holds the suitcase, the other arm hangs at his side. A small dark-brown arrow lies flat on the floor, its head pointing from the room toward the doorway. Respectful friendly design.",
    # 매수인데 나가는 그림이 나온 적이 있다(9/21). 방향을 몸·얼굴·발·화살표 네 가지로 겹쳐 적는다
    "외국인 매수": "One smaller foreign investor puppet with a natural rounded prominent nose and a neutral business suit ENTERS the room through the doorway, carrying a brown suitcase. He has already stepped over the threshold with both feet inside the room, his body and face turned toward the room interior and the main person, walking away from the doorway. A small dark-brown arrow lies flat on the floor, its head pointing from the doorway toward the room interior. Respectful friendly design.",
    "없음": "No secondary people, suitcases or money-flow arrows.",
}

# 이름은 기존 LLM 선택지 그대로 유지한다. 방향은 소재 이름이 아니라 제공된 보고서 문구를 따른다.
IMAGE_SYMBOLS = {
    "반도체": "a small matte microchip",
    "인공지능(AI)": "a small brain-shaped chip",
    "금리·연준·중앙은행": "a miniature unlettered neoclassical central bank and beige coin stacks",
    "국채·채권": "plain unlettered bond folders",
    "물가": "a miniature grocery basket",
    "유가·원유": "dark brown oil barrels and a small oil pump",
    "환율·달러": "a balance scale holding neutral beige coin stacks",
    "해외 증시": "a small neutral globe",
    "변동성·불안": "a small unmarked uneven balance",
    "수출·무역": "a miniature cargo ship and containers",
    "중동·지정학": "miniature desert oil derricks",
    "섬유·의류": "neutral fabric rolls and a sewing machine",
    "자동차": "a miniature car",
    "조선": "a miniature ship in a shipyard",
    "건설": "small construction cranes",
    "제약·바이오": "neutral medicine capsules and laboratory flasks",
    "화학": "matte laboratory flasks",
    "철강·금속": "miniature steel coils",
    "금융·은행": "a small unmarked bank vault",
    "통신": "a miniature telecommunications tower",
    "전기·가스·에너지": "miniature power transmission towers and wind turbines",
    "항공·운송": "a miniature airplane and cargo truck",
    "게임·엔터·문화": "a neutral game controller",
    "음식료": "a miniature bread basket",
    "부동산": "miniature apartment buildings",
    "유통": "a plain shopping bag",
    "IT 서비스": "miniature server racks",
}

# 분위기는 표정에만 쓴다. KOSPI 방향을 분위기만으로 추정하지 않는다.
IMAGE_MOODS = {
    "강한 상승": "a pleased, calmly optimistic expression",
    "상승": "a gently hopeful expression",
    "혼조": "a thoughtful expression",
    "보합": "a calm neutral expression",
    "하락": "a mildly concerned expression",
    "급락": "a concerned but not panicked expression",
}

# Pollinations는 글자 없는 클레이 장면만 만든다. 한글 제목·라벨은 image_client가 고정 좌표에 합성한다.
# 화살표 지시는 여기 넣지 않는다 - 메인 장면에만 report_service._image_scene이 붙인다 ("arrow"라는 말만 있어도 섹션1에 화살표를 그린다)
IMAGE_STYLE = (
    "A photographed physical stop-motion clay miniature, cozy vintage Czech puppet craftsmanship. "
    "Visible fingerprint ridges and hand-shaped imperfections, soft matte clay, real knitted fabric. "
    "Warm beige plaster, brown wood, warm-gray clothing, soft warm studio light, gentle shadows. "
    "Wide 3:1 composition, one continuous richly staged room filling the entire frame edge to edge. "
    "Central seated person and main wall symbol in sharp focus; smaller background props softly focused. "
    "Only the explicitly specified props belong in the scene. Neutral beige, taupe, brown and warm gray palette. "
    "The upper 82 pixels must be completely bare uninterrupted plaster wall, edge to edge: no frames, shelves, windows, props, marks or shapes there, because the application overlays a compact title. "
    "Continue the room, wooden floor or workbench texture through the lower 70 pixels edge to edge; keep it visually quiet but never blank or white because keyword plaques are overlaid there. "
    "Place all important people and props inside the middle horizontal band without cropping. "
    "Absolutely no text, letters, numbers, signs, labels, logos, watermarks or pseudo-writing anywhere. "
    "No empty margin, no bottom white band, no infographic layout, no split panels."
)
