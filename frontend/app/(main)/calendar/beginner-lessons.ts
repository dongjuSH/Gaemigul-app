/* 「이번 주, 주린이 탈출」 교육 콘텐츠 — 정적 데이터.
 * calendar_events 스키마/카테고리는 건드리지 않고, 이미 내려오는 title/category만으로
 * 그 주에 보여줄 교육 주제 하나를 고른다(UI/UX 디자인 단계 — 실제 LLM 연동 아님). */

import type { Category, NewsItem } from "./news-data"

export type AnalogyBlock =
  | {
      kind: "priceTable"
      before: { emoji: string; label: string; price: string }[]
      after: { emoji: string; label: string; price: string }[]
      punchline: string
    }
  | { kind: "bullets"; items: string[]; punchline: string }
  | {
      kind: "statCard"
      stats: { label: string; value: string }[]
      punchline: string
    }

export type QuizOption = {
  id: string
  label: string
  /** 오답일 때만 보여줄, 이 보기가 오답인 이유 (정답 보기에는 필요 없음) */
  reason?: string
}

export type BeginnerLesson = {
  id: string
  category: Category
  hookTitle: string // 팝업 제목
  hookQuestion: string // 티저 카드 후킹 문구
  overview: { term: string; definition: string } // SECTION 1
  analogy: AnalogyBlock // SECTION 2
  connection: { chain: string[]; caveat: string } // SECTION 3
  remember: string[] // SECTION 4
  calendarLinkChain: string[] // SECTION 5 (매칭된 실제 일정 뒤에 이어붙임)
  quiz: {
    question: string
    options: QuizOption[]
    answerId: string
    explanation: string
  }
}

export const BEGINNER_LESSONS: Record<string, BeginnerLesson> = {
  cpi: {
    id: "cpi",
    category: "macro",
    hookTitle: "CPI, 너 정체가 뭐야?",
    hookQuestion: "이번 주엔 CPI 때문에 시장이 왜 이렇게 예민할까요?",
    overview: {
      term: "CPI = 소비자물가지수",
      definition:
        "우리가 평소에 사는 물건과 서비스의 가격이 얼마나 변했는지를 보여주는 숫자예요.",
    },
    analogy: {
      kind: "priceTable",
      before: [
        { emoji: "🍎", label: "사과", price: "5,000원" },
        { emoji: "🥛", label: "우유", price: "3,000원" },
        { emoji: "🍞", label: "빵", price: "4,000원" },
        { emoji: "☕", label: "커피", price: "4,000원" },
      ],
      after: [
        { emoji: "🍎", label: "사과", price: "5,500원" },
        { emoji: "🥛", label: "우유", price: "3,300원" },
        { emoji: "🍞", label: "빵", price: "4,500원" },
        { emoji: "☕", label: "커피", price: "4,200원" },
      ],
      punchline:
        "어? 전체적으로 비싸졌네? — CPI는 이런 변화를 숫자 하나로 보여줘요.",
    },
    connection: {
      chain: [
        "물가 ↑",
        "금리 전망에 영향",
        "국채금리·금융시장에 영향",
        "주식시장에 영향",
      ],
      caveat:
        "CPI 하나로 주가가 오른다/내린다고 단정할 수는 없어요. 다른 지표와 함께 살펴보는 참고 자료예요.",
    },
    remember: [
      "CPI 숫자 하나만 보는 게 아니에요.",
      "실제 발표값, 시장 예상치, 이전 수치를 함께 봐요.",
      "향후 금리 전망까지 같이 살펴볼 수 있어요.",
    ],
    calendarLinkChain: ["미국 금리 전망", "미국 증시", "다음 날 한국 증시"],
    quiz: {
      question:
        "CPI가 시장 예상보다 높게 발표됐습니다. 시장에서는 무엇을 함께 살펴볼 수 있을까요?",
      options: [
        { id: "a", label: "① 향후 금리 전망" },
        {
          id: "b",
          label: "② 오늘 점심 메뉴",
          reason: "점심 메뉴는 경제 지표와는 관계가 없는 예시예요.",
        },
        {
          id: "c",
          label: "③ 거래소 건물 위치",
          reason: "건물 위치는 물가나 금리와는 관련이 없어요.",
        },
        {
          id: "d",
          label: "④ 주식의 액면가",
          reason: "액면가는 주식에 표시된 금액일 뿐, CPI와는 직접 관련이 없어요.",
        },
      ],
      answerId: "a",
      explanation:
        "CPI가 예상보다 높게 나오면 시장에서는 향후 물가와 통화정책, 금리 전망이 어떻게 달라질지 함께 살펴볼 수 있습니다.",
    },
  },

  ppi: {
    id: "ppi",
    category: "macro",
    hookTitle: "공장 물가가 오르면 내 주식은?",
    hookQuestion: "이번 주 PPI, 회사들 물건값이 올랐다는데 무슨 의미일까요?",
    overview: {
      term: "PPI = 생산자물가지수",
      definition:
        "기업이 물건을 만들어 팔 때 받는 가격이 얼마나 변했는지 보여주는 숫자예요.",
    },
    analogy: {
      kind: "bullets",
      items: [
        "빵집이 밀가루를 더 비싸게 사면",
        "빵 만드는 원가가 올라가고",
        "결국 빵 가격에도 영향을 줄 수 있어요",
      ],
      punchline: "PPI는 '소비자물가(CPI)보다 한 단계 앞선' 신호로 여겨져요.",
    },
    connection: {
      chain: [
        "생산 단계 물가 ↑",
        "기업 원가 부담",
        "소비자물가(CPI)에 영향 가능",
        "금리·주식시장에 영향",
      ],
      caveat:
        "생산자물가가 올랐다고 소비자물가가 반드시 따라 오르는 건 아니에요.",
    },
    remember: [
      "PPI는 공장·기업 단계의 물가예요.",
      "CPI보다 먼저 움직이는 경우가 많아 '선행지표'로 참고돼요.",
      "이 역시 실제값·예상치·이전치를 함께 봐요.",
    ],
    calendarLinkChain: ["기업 원가 부담", "소비자물가(CPI) 흐름", "시장 반응"],
    quiz: {
      question: "PPI는 어느 단계의 물가를 보여주는 지표일까요?",
      options: [
        { id: "a", label: "① 기업이 생산하며 받는 가격" },
        {
          id: "b",
          label: "② 소비자가 마트에서 내는 가격",
          reason:
            "그건 소비자물가(CPI)가 보여주는 값이에요. PPI는 그보다 앞선 생산 단계의 가격이에요.",
        },
        {
          id: "c",
          label: "③ 주식의 액면가",
          reason: "액면가는 주식에 표시된 금액으로, 물가 지표와는 관련이 없어요.",
        },
        {
          id: "d",
          label: "④ 환율",
          reason: "환율은 통화 간 교환 비율이라, 생산자물가와는 다른 지표예요.",
        },
      ],
      answerId: "a",
      explanation:
        "PPI(생산자물가지수)는 기업이 상품·서비스를 생산하면서 받는 가격의 변화를 보여주는 지표예요.",
    },
  },

  fomc: {
    id: "fomc",
    category: "macro",
    hookTitle: "미국 금리는 누가 결정할까?",
    hookQuestion: "이번 주 FOMC, 대체 누가 모여서 뭘 정하는 걸까요?",
    overview: {
      term: "FOMC = 미국 연방공개시장위원회",
      definition:
        "미국의 기준금리를 정기적으로 결정하는 회의예요. 1년에 8번 열려요.",
    },
    analogy: {
      kind: "statCard",
      stats: [
        { label: "연간 회의 횟수", value: "8회" },
        { label: "주요 발표", value: "기준금리 목표범위" },
        { label: "함께 공개되는 자료", value: "경제전망(SEP), 의사록" },
      ],
      punchline: "회의 결과 하나로 전 세계 증시가 출렁이기도 해요.",
    },
    connection: {
      chain: [
        "미국 기준금리 결정",
        "미국 국채금리·환율에 영향",
        "전 세계 증시에 영향",
        "한국 증시에도 영향",
      ],
      caveat:
        "금리를 내리면 무조건 증시가 오른다고 볼 수는 없어요. 발언 내용(매파적/비둘기적)에 따라 반응이 달라질 수 있어요.",
    },
    remember: [
      "FOMC는 '회의 일정'이고, 연방기금금리(FEDFUNDS)는 '실제 금리 수치'예요 — 서로 다른 데이터예요.",
      "동결이라도 발언 톤에 따라 시장 반응이 달라질 수 있어요.",
      "점도표(dot plot)는 위원들의 향후 금리 전망을 보여줘요.",
    ],
    calendarLinkChain: [
      "미국 기준금리 결정",
      "미국 국채금리",
      "미국 증시",
      "다음 날 한국 증시",
    ],
    quiz: {
      question: "FOMC와 연방기금금리(FEDFUNDS)의 관계로 올바른 것은?",
      options: [
        { id: "a", label: "① FOMC는 회의 일정, FEDFUNDS는 실제 금리 수치다" },
        {
          id: "b",
          label: "② 둘은 완전히 같은 데이터다",
          reason:
            "FOMC는 회의 일정이고 FEDFUNDS는 그 결과로 정해지는 수치라서, 같은 데이터가 아니에요.",
        },
        {
          id: "c",
          label: "③ FEDFUNDS가 회의를 연다",
          reason: "FEDFUNDS는 회의 결과로 나온 수치일 뿐, 회의를 열 수는 없어요.",
        },
        {
          id: "d",
          label: "④ FOMC는 한국 기관이다",
          reason: "FOMC는 미국의 연방공개시장위원회예요.",
        },
      ],
      answerId: "a",
      explanation:
        "FOMC는 연방공개시장위원회의 회의 일정이고, FEDFUNDS는 그 결과로 정해지는 실제 금리 데이터예요.",
    },
  },

  bokRate: {
    id: "bokRate",
    category: "rate",
    hookTitle: "한국은행 아저씨들은 왜 모일까?",
    hookQuestion:
      "이번 주 한국은행 기준금리 결정, 내 통장이랑 무슨 상관일까요?",
    overview: {
      term: "기준금리 = 한국은행이 정하는 대표 금리",
      definition:
        "은행들이 돈을 빌리고 빌려줄 때 기준이 되는 금리로, 내 예금·대출 금리에도 영향을 줘요.",
    },
    analogy: {
      kind: "bullets",
      items: [
        "기준금리가 오르면 예금 이자가 오를 수 있어요",
        "동시에 대출 이자 부담도 커질 수 있어요",
        "기업의 자금 조달 비용에도 영향을 줘요",
      ],
      punchline: "내 통장과 가장 가까운 경제지표예요.",
    },
    connection: {
      chain: [
        "한국 기준금리 결정",
        "국내 대출·예금 금리에 영향",
        "원화 환율에 영향",
        "국내 증시에 영향",
      ],
      caveat: "금리 방향과 주가 방향이 항상 같이 움직이는 건 아니에요.",
    },
    remember: [
      "기준금리는 금융통화위원회가 결정해요.",
      "동결이라도 발언 톤(매파적/비둘기적)에 따라 시장이 반응할 수 있어요.",
      "금리는 환율·대출·예금까지 폭넓게 영향을 줘요.",
    ],
    calendarLinkChain: ["국내 대출·예금 금리", "원화 환율", "국내 증시"],
    quiz: {
      question: "한국은행 기준금리를 결정하는 곳은 어디일까요?",
      options: [
        { id: "a", label: "① 금융통화위원회" },
        {
          id: "b",
          label: "② 국세청",
          reason: "국세청은 세금을 관리하는 기관이에요.",
        },
        {
          id: "c",
          label: "③ 증권거래소",
          reason: "증권거래소는 주식 매매가 이뤄지는 곳으로, 금리를 결정하지 않아요.",
        },
        {
          id: "d",
          label: "④ 은행연합회",
          reason: "은행연합회는 시중은행들의 협의체로, 기준금리 결정 권한은 없어요.",
        },
      ],
      answerId: "a",
      explanation:
        "한국은행 기준금리는 한국은행 금융통화위원회가 정기 회의를 통해 결정해요.",
    },
  },

  samsungEarnings: {
    id: "samsungEarnings",
    category: "earnings",
    hookTitle: "기업의 성적표, 이렇게 읽어요",
    hookQuestion: "삼성전자 실적 발표, 숫자가 많은데 뭐부터 봐야 할까요?",
    overview: {
      term: "실적 발표 = 기업의 성적표",
      definition:
        "한 분기 동안 회사가 얼마나 벌고 얼마나 남겼는지 알려주는 자료예요.",
    },
    analogy: {
      kind: "statCard",
      stats: [
        { label: "매출액", value: "회사가 판 총 금액" },
        { label: "영업이익", value: "본업으로 남긴 돈" },
        { label: "순이익", value: "세금 등 다 떼고 남은 돈" },
      ],
      punchline: "세 숫자 중 하나라도 예상과 다르면 주가가 반응할 수 있어요.",
    },
    connection: {
      chain: [
        "실적 발표",
        "시장 예상치와 비교",
        "주가 반응",
        "관련 업종 전체에 영향",
      ],
      caveat:
        "실적이 좋다고 반드시 주가가 오르는 건 아니에요. 이미 예상됐던 내용이면 반응이 적을 수 있어요.",
    },
    remember: [
      "매출·영업이익·순이익, 세 숫자의 의미가 달라요.",
      "시장의 '예상치'와 비교해서 좋고 나쁨을 판단하는 경우가 많아요.",
      "한 기업의 실적이 같은 업종 전체 분위기에 영향을 주기도 해요.",
    ],
    calendarLinkChain: [
      "삼성전자 실적",
      "반도체 업종 전반",
      "코스피 시장 분위기",
    ],
    quiz: {
      question: "'영업이익'이 의미하는 것은 무엇일까요?",
      options: [
        { id: "a", label: "① 본업으로 벌어들인 이익" },
        {
          id: "b",
          label: "② 세금 환급액",
          reason: "세금 환급액은 영업이익과는 다른 개념이에요.",
        },
        {
          id: "c",
          label: "③ 주식의 액면가",
          reason: "액면가는 주식에 표시된 금액으로, 이익과는 관련이 없어요.",
        },
        {
          id: "d",
          label: "④ 배당금 총액",
          reason: "배당금은 이익 중 주주에게 나눠주는 금액이라, 영업이익 자체와는 달라요.",
        },
      ],
      answerId: "a",
      explanation:
        "영업이익은 매출액에서 매출원가와 판매관리비 등 본업에 든 비용을 뺀, 본업으로 벌어들인 이익이에요.",
    },
  },

  hynixEarnings: {
    id: "hynixEarnings",
    category: "earnings",
    hookTitle: "반도체 회사 실적, 뭘 봐야 할까?",
    hookQuestion: "SK하이닉스 실적, 반도체 업황이랑 무슨 관계가 있을까요?",
    overview: {
      term: "반도체 업황 = 메모리 반도체 수요·가격의 흐름",
      definition:
        "SK하이닉스 같은 반도체 기업의 실적은 전 세계 메모리 반도체 수요와 가격에 큰 영향을 받아요.",
    },
    analogy: {
      kind: "bullets",
      items: [
        "메모리 가격이 오르면 반도체 회사 이익이 커질 수 있어요",
        "AI·서버 수요가 늘면 메모리 수요도 함께 늘 수 있어요",
        "반대로 수요가 줄면 가격과 이익도 함께 줄 수 있어요",
      ],
      punchline: "반도체는 '경기'와 '기술 수요' 두 가지를 함께 살펴봐야 해요.",
    },
    connection: {
      chain: [
        "반도체 수요·가격 흐름",
        "SK하이닉스 실적",
        "반도체 업종 전반",
        "코스피 지수에 영향",
      ],
      caveat: "반도체 업황 하나로 전체 증시 방향을 단정할 수는 없어요.",
    },
    remember: [
      "반도체는 경기와 기술 트렌드(AI 등) 영향을 함께 받아요.",
      "메모리 가격 흐름이 실적의 핵심 변수예요.",
      "코스피에서 반도체 비중이 커서 지수 전체에 영향을 줄 수 있어요.",
    ],
    calendarLinkChain: ["메모리 반도체 가격", "SK하이닉스 실적", "코스피 지수"],
    quiz: {
      question: "반도체 기업 실적에 큰 영향을 주는 요인은 무엇일까요?",
      options: [
        { id: "a", label: "① 메모리 반도체 가격과 수요" },
        {
          id: "b",
          label: "② 오늘의 날씨",
          reason: "날씨는 반도체 실적과 직접적인 관련이 없어요.",
        },
        {
          id: "c",
          label: "③ 임직원 수",
          reason: "임직원 수는 실적을 결정짓는 핵심 요인이 아니에요.",
        },
        {
          id: "d",
          label: "④ 회사 창립일",
          reason: "창립일은 실적과는 관련이 없는 정보예요.",
        },
      ],
      answerId: "a",
      explanation:
        "메모리 반도체의 가격과 수요 흐름이 반도체 기업 실적에 직접적인 영향을 줘요.",
    },
  },

  optionExpiry: {
    id: "optionExpiry",
    category: "optionExpiry",
    hookTitle: "선물이랑 옵션, 그게 뭔데?",
    hookQuestion:
      "이번 주는 옵션 만기일이래요. 대체 뭐가 만기가 된다는 걸까요?",
    overview: {
      term: "선물·옵션 만기일 = 약속된 계약이 끝나는 날",
      definition:
        "정해진 미래 시점에 사고팔기로 '약속'한 계약(선물·옵션)의 효력이 끝나는 날이에요.",
    },
    analogy: {
      kind: "bullets",
      items: [
        "선물은 '미래의 가격으로 사고팔기로 미리 정한 약속'이에요",
        "옵션은 '그 가격에 사고팔 수 있는 권리'예요",
        "만기일에는 이 약속과 권리를 정리(청산)해야 해요",
      ],
      punchline: "약속이 끝나는 날이라 평소보다 거래가 몰릴 수 있어요.",
    },
    connection: {
      chain: [
        "만기 도래",
        "포지션 정리(청산) 수요 증가",
        "장중 변동성 확대 가능",
        "특히 장 막판 주의",
      ],
      caveat: "만기일이라고 항상 큰 변동이 생기는 건 아니에요.",
    },
    remember: [
      "선물·옵션은 '약속'과 '권리'를 거래하는 상품이에요.",
      "만기일에는 정리 물량이 몰려 변동성이 커질 수 있어요.",
      "특히 장 마감 무렵을 주의 깊게 보는 투자자가 많아요.",
    ],
    calendarLinkChain: ["포지션 정리 물량", "장중 변동성", "코스피 지수"],
    quiz: {
      question: "선물·옵션 만기일에 대한 설명으로 올바른 것은?",
      options: [
        {
          id: "a",
          label: "① 정해진 계약이 정리되는 날이라 변동성이 커질 수 있다",
        },
        {
          id: "b",
          label: "② 모든 주식이 상장폐지되는 날이다",
          reason: "만기일과 상장폐지는 전혀 다른 개념이에요.",
        },
        {
          id: "c",
          label: "③ 세금을 내는 날이다",
          reason: "세금 납부일과는 관련이 없어요.",
        },
        {
          id: "d",
          label: "④ 배당금을 받는 날이다",
          reason: "배당은 배당기준일에 따라 정해지는 별도의 절차예요.",
        },
      ],
      answerId: "a",
      explanation:
        "만기일에는 선물·옵션 포지션을 정리하려는 물량이 몰리면서 변동성이 커질 수 있어요.",
    },
  },

  concurrentExpiry: {
    id: "concurrentExpiry",
    category: "optionExpiry",
    hookTitle: "오늘 증시가 유난히 바쁜 이유",
    hookQuestion: "선물·옵션 동시만기일이라는데, 평소랑 뭐가 다를까요?",
    overview: {
      term: "동시만기일 = 선물과 옵션 만기가 겹치는 날",
      definition:
        "KOSPI200 선물과 옵션의 만기가 같은 날 함께 돌아오는 날이에요. 분기(3·6·9·12월)에 한 번씩 있어요.",
    },
    analogy: {
      kind: "bullets",
      items: [
        "선물 약속과 옵션 권리가 같은 날 동시에 끝나요",
        "정리해야 할 물량이 한 번에 몰려요",
        "그래서 '네 마녀의 날'이라고도 불려요",
      ],
      punchline: "1년에 4번뿐인, 시장이 유독 바빠지는 날이에요.",
    },
    connection: {
      chain: [
        "선물·옵션 동시 만기",
        "차익거래 청산 물량 집중",
        "장 막판 변동성 확대",
        "거래량 급증",
      ],
      caveat:
        "변동성이 커질 '수 있다'는 것이지, 방향(상승/하락)을 미리 알 수 있는 건 아니에요.",
    },
    remember: [
      "동시만기는 1년에 4번(3·6·9·12월)만 있어요.",
      "보통 만기일보다 물량이 더 몰려 변동성이 커질 수 있어요.",
      "특히 장 마감 동시호가 시간대를 주의 깊게 보기도 해요.",
    ],
    calendarLinkChain: [
      "차익거래 청산 물량",
      "장 막판 변동성",
      "코스피 거래량",
    ],
    quiz: {
      question: "선물·옵션 동시만기일은 1년에 몇 번 있을까요?",
      options: [
        { id: "a", label: "① 4번" },
        {
          id: "b",
          label: "② 12번",
          reason: "매달이 아니라 분기월(3·6·9·12월)에만 있어요.",
        },
        {
          id: "c",
          label: "③ 1번",
          reason: "분기마다 한 번씩, 1년에 총 4번 있어요.",
        },
        {
          id: "d",
          label: "④ 52번",
          reason: "매주 있는 건 아니에요.",
        },
      ],
      answerId: "a",
      explanation:
        "동시만기일은 정규 선물이 있는 분기월(3·6·9·12월)에만 발생해서 1년에 4번이에요.",
    },
  },

  dividend: {
    id: "dividend",
    category: "dividend",
    hookTitle: "배당금, 누가 언제 받는 거야?",
    hookQuestion: "배당기준일이라는데, 아무나 받을 수 있는 걸까요?",
    overview: {
      term: "배당기준일 = 배당받을 주주를 정하는 날",
      definition:
        "이 날 그 회사 주식을 갖고 있어야 나중에 배당금을 받을 수 있어요.",
    },
    analogy: {
      kind: "bullets",
      items: [
        "배당기준일 전까지 주식을 사서 보유하고 있어야 해요",
        "기준일이 지난 뒤 팔아도 배당은 이미 받을 자격이 생겨요",
        "실제 배당금 지급은 기준일보다 나중이에요",
      ],
      punchline:
        "'기준일 = 자격을 확인하는 날', '지급일 = 실제로 돈이 들어오는 날'이에요.",
    },
    connection: {
      chain: [
        "배당기준일",
        "주주 명부 확정",
        "배당금 지급 결정",
        "지급 예정일에 실제 지급",
      ],
      caveat:
        "배당금액이 항상 미리 확정돼 있는 건 아니에요. 아직 확정 전인 경우도 있어요.",
    },
    remember: [
      "기준일에 주식을 갖고 있어야 배당 자격이 생겨요.",
      "지급일은 기준일과 다른 날짜예요.",
      "배당금액은 아직 확정되지 않은 경우도 있어요.",
    ],
    calendarLinkChain: ["주주 명부 확정", "배당금 지급 예정일"],
    quiz: {
      question: "배당금을 받으려면 언제 주식을 보유하고 있어야 할까요?",
      options: [
        { id: "a", label: "① 배당기준일" },
        {
          id: "b",
          label: "② 배당금 지급일 다음 날",
          reason: "그때는 이미 배당 자격 여부가 정해진 뒤예요.",
        },
        {
          id: "c",
          label: "③ 회사 창립기념일",
          reason: "창립기념일은 배당 자격과는 관련이 없어요.",
        },
        {
          id: "d",
          label: "④ 아무 때나 상관없다",
          reason: "정해진 기준일에 주식을 보유하고 있어야 자격이 생겨요.",
        },
      ],
      answerId: "a",
      explanation:
        "배당기준일에 주식을 보유하고 있어야 그 회사의 주주로 인정되어 배당을 받을 자격이 생겨요.",
    },
  },

  ipo: {
    id: "ipo",
    category: "macro",
    hookTitle: "IPO 청약, 나도 할 수 있을까?",
    hookQuestion: "공모주 청약이 시작됐다는데, 이게 뭘 하는 걸까요?",
    overview: {
      term: "공모주 청약(IPO) = 새로 상장하는 회사의 주식을 미리 신청해서 사는 것",
      definition:
        "회사가 처음으로 증권시장에 상장하기 전, 정해진 가격에 주식을 사겠다고 미리 신청하는 절차예요.",
    },
    analogy: {
      kind: "bullets",
      items: [
        "청약 = 정해진 가격에 '이 주식 살게요' 하고 신청하는 것",
        "신청자가 몰리면 추첨이나 비례 배정으로 나눠줘요",
        "상장일에 실제 주식이 계좌에 들어와요",
      ],
      punchline: "인기 있는 공모주는 신청자가 몰려 '경쟁률'이 높아지기도 해요.",
    },
    connection: {
      chain: [
        "공모가 확정",
        "청약(신청) 기간",
        "배정(추첨/비례)",
        "상장(예정)일 거래 시작",
      ],
      caveat: "공모가보다 상장 후 주가가 항상 오른다고 볼 수는 없어요.",
    },
    remember: [
      "공모가는 청약 전에 미리 정해져요.",
      "신청자가 많으면 원하는 만큼 다 배정받지 못할 수 있어요.",
      "상장 첫날 주가는 공모가와 다르게 움직일 수 있어요.",
    ],
    calendarLinkChain: ["청약 마감", "상장(예정)일 거래"],
    quiz: {
      question: "공모주 청약에 대한 설명으로 올바른 것은?",
      options: [
        { id: "a", label: "① 정해진 공모가에 미리 주식을 신청하는 절차이다" },
        {
          id: "b",
          label: "② 이미 상장된 주식을 파는 것이다",
          reason: "그건 일반적인 주식 매도이지, 청약과는 달라요.",
        },
        {
          id: "c",
          label: "③ 배당금을 신청하는 것이다",
          reason: "배당 신청이 아니라 신규 상장 주식을 청약하는 절차예요.",
        },
        {
          id: "d",
          label: "④ 세금 환급을 신청하는 것이다",
          reason: "세금 환급과는 관련이 없어요.",
        },
      ],
      answerId: "a",
      explanation:
        "공모주 청약은 상장 전 정해진 공모가에 주식을 사겠다고 미리 신청하는 절차예요.",
    },
  },

  earningsGeneric: {
    id: "earningsGeneric",
    category: "earnings",
    hookTitle: "이 회사, 성적표가 나왔어요",
    hookQuestion: "이번 주 실적 발표, 어떤 회사인지는 달라도 보는 법은 같아요",
    overview: {
      term: "실적 발표 = 기업의 분기 성적표",
      definition: "회사가 한 분기 동안 얼마나 벌고 남겼는지 공개하는 자료예요.",
    },
    analogy: {
      kind: "bullets",
      items: [
        "매출액: 회사가 판 총 금액",
        "영업이익: 본업으로 남긴 돈",
        "순이익: 세금 등 다 떼고 최종적으로 남은 돈",
      ],
      punchline: "세 숫자를 시장의 예상치와 비교해보는 게 핵심이에요.",
    },
    connection: {
      chain: ["실적 발표", "시장 예상치와 비교", "주가 반응 가능"],
      caveat:
        "실적이 좋아도 이미 예상됐던 내용이면 주가 반응이 크지 않을 수 있어요.",
    },
    remember: [
      "매출·영업이익·순이익의 의미가 각각 달라요.",
      "시장 예상치와 비교하는 경우가 많아요.",
      "같은 업종의 다른 기업에도 참고가 될 수 있어요.",
    ],
    calendarLinkChain: ["실적 발표", "관련 업종 분위기"],
    quiz: {
      question: "기업 실적에서 '순이익'이 의미하는 것은?",
      options: [
        { id: "a", label: "① 세금 등을 모두 뗀 뒤 최종적으로 남은 이익" },
        {
          id: "b",
          label: "② 회사가 판매한 총 금액",
          reason: "그건 매출액에 대한 설명이에요.",
        },
        {
          id: "c",
          label: "③ 주식의 액면가",
          reason: "액면가는 이익과는 관련이 없어요.",
        },
        {
          id: "d",
          label: "④ 직원 수",
          reason: "직원 수는 순이익 계산과 직접적인 관련이 없어요.",
        },
      ],
      answerId: "a",
      explanation:
        "순이익은 매출액에서 모든 비용과 세금까지 뗀 뒤 최종적으로 회사에 남는 이익이에요.",
    },
  },

  macroGeneric: {
    id: "macroGeneric",
    category: "macro",
    hookTitle: "이번 주 경제 이벤트, 왜 캘린더에 있을까?",
    hookQuestion: "낯선 경제 이벤트가 떴는데, 일단 이것부터 알아볼까요?",
    overview: {
      term: "경제 캘린더 = 시장이 주목하는 일정 모음",
      definition:
        "정부·기관·기업이 발표하는 통계나 결정 중, 시장 참여자들이 함께 지켜보는 일정들을 모아둔 표예요.",
    },
    analogy: {
      kind: "bullets",
      items: [
        "발표되는 숫자나 결정 하나하나가 시장의 '힌트'가 될 수 있어요",
        "같은 발표라도 예상치와 비교해서 해석이 달라져요",
        "여러 지표를 함께 보면 큰 흐름을 이해하는 데 도움이 돼요",
      ],
      punchline: "하나씩 알아가다 보면 캘린더가 점점 친숙해질 거예요.",
    },
    connection: {
      chain: [
        "지표/이벤트 발표",
        "시장의 해석",
        "관련 자산(금리·환율·주가)에 영향 가능",
      ],
      caveat: "이벤트 하나로 시장 방향을 단정할 수는 없어요.",
    },
    remember: [
      "경제 캘린더의 일정들은 시장이 '함께 지켜보는' 정보예요.",
      "실제값과 예상치를 비교하는 습관을 들이면 좋아요.",
      "모르는 용어가 나오면 하나씩 찾아보는 것부터 시작해도 충분해요.",
    ],
    calendarLinkChain: ["발표 내용 확인", "시장 반응 살펴보기"],
    quiz: {
      question: "경제 캘린더에 나오는 이벤트를 볼 때 함께 살펴보면 좋은 것은?",
      options: [
        { id: "a", label: "① 실제값과 시장 예상치의 차이" },
        {
          id: "b",
          label: "② 발표자의 넥타이 색깔",
          reason: "그건 시장 해석과 관련이 없는 예시예요.",
        },
        {
          id: "c",
          label: "③ 발표 장소의 날씨",
          reason: "날씨는 지표 해석에 영향을 주지 않아요.",
        },
        {
          id: "d",
          label: "④ 이벤트 이름의 글자 수",
          reason: "글자 수는 의미와 관련이 없어요.",
        },
      ],
      answerId: "a",
      explanation:
        "발표된 실제값이 시장의 예상치와 얼마나 다른지가 시장 반응을 이해하는 핵심 단서가 돼요.",
    },
  },
}

/** 이번 주 뉴스 → 교육 주제 매칭 우선순위. 위쪽일수록 먼저 매칭된다 */
const PRIORITY: { lessonId: string; test: (n: NewsItem) => boolean }[] = [
  { lessonId: "fomc", test: (n) => n.title.includes("FOMC") },
  { lessonId: "bokRate", test: (n) => n.category === "rate" },
  { lessonId: "cpi", test: (n) => n.title.includes("소비자물가") },
  { lessonId: "concurrentExpiry", test: (n) => n.title.includes("동시만기") },
  { lessonId: "optionExpiry", test: (n) => n.category === "optionExpiry" },
  { lessonId: "ppi", test: (n) => n.title.includes("생산자물가") },
  {
    lessonId: "samsungEarnings",
    test: (n) => n.category === "earnings" && n.title.includes("삼성전자"),
  },
  {
    lessonId: "hynixEarnings",
    test: (n) => n.category === "earnings" && n.title.includes("SK하이닉스"),
  },
  { lessonId: "earningsGeneric", test: (n) => n.category === "earnings" },
  { lessonId: "dividend", test: (n) => n.category === "dividend" },
  { lessonId: "ipo", test: (n) => n.title.includes("공모주") },
  { lessonId: "macroGeneric", test: (n) => n.category === "macro" },
]

/** 이번 주 실제 일정 중 우선순위가 가장 높은 주제 하나를 골라 매칭된 이벤트와 함께 반환 */
export function pickWeeklyLesson(
  weekNews: NewsItem[]
): { lesson: BeginnerLesson; matchedEvent: NewsItem } | null {
  for (const { lessonId, test } of PRIORITY) {
    const matched = weekNews.filter(test)[0]
    if (matched)
      return { lesson: BEGINNER_LESSONS[lessonId], matchedEvent: matched }
  }
  return null
}

const TAG_ORDER: Category[] = [
  "rate",
  "macro",
  "earnings",
  "optionExpiry",
  "dividend",
]

/** 이번 주 등장한 카테고리를 중요도 순으로 최대 3개까지 — 티저 카드의 "핵심 키워드" 태그용 */
export function weeklyKeywordTags(weekNews: NewsItem[]): Category[] {
  const present = new Set(weekNews.map((n) => n.category))
  return TAG_ORDER.filter((c) => present.has(c)).slice(0, 3)
}
