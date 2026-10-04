import {
  ContactEmail,
  LegalCards,
  LegalList,
  LegalNotice,
  LegalSection,
  LegalTable,
  LegalText,
  StaticPage,
} from "@/components/common"

// 개인정보처리방침. 항목은 백엔드 테이블 기준이다 - 수집 항목·보관 방식을 바꾸면 이 페이지도 같이 고친다.
//   회원·세션·등급  backend/src/backend/domain/auth/models/auth.py (auth_user, auth_session, auth_grade_survey, grade_promotion_suggestion)
//   이용 기록        attendance_log, glossary_view_log, glossary_favorite, newsletter_log (모두 user_id ON DELETE CASCADE)
//   탈퇴 사유        withdrawal_feedback (user_id를 저장하지 않는 익명 통계)
//   세션 쿠키        auth/services/session_service.py (httpOnly, SESSION_TTL_DAYS=14)
//   서버 로그        core/logging_config.py (14일 보관), 메일 발송 로그에 수신 주소가 남는다

const COLLECT_ROWS = [
  [
    "회원가입 (필수)",
    "이메일, 아이디, 닉네임, 비밀번호",
    "비밀번호는 복원할 수 없는 방식으로 암호화해 저장합니다.",
  ],
  [
    "회원가입 (필수)",
    "개인정보처리방침 동의 여부",
    "동의해야 가입할 수 있습니다.",
  ],
  [
    "회원가입·마이페이지 (선택)",
    "개미레터 수신 동의 여부",
    "동의하지 않아도 서비스를 모두 이용할 수 있습니다. 자세한 내용은 개미레터 수신 동의 안내에 있습니다.",
  ],
  [
    "마이페이지",
    "닉네임을 마지막으로 바꾼 시각",
    "닉네임을 14일에 한 번만 바꿀 수 있도록 확인하는 데 씁니다.",
  ],
  [
    "등급 진단",
    "투자 경험, 용어·뉴스 문제 정답 수, 판정 등급, 등급 변경 제안과 응답 기록",
    "문제의 답안 내용은 저장하지 않고 정답 수만 저장합니다.",
  ],
  [
    "서비스 이용 중 자동 생성",
    "굴 파기(출석) 기록, 용어 열람·즐겨찾기 기록, 개미레터 발송 기록",
    "등급 제도와 마이페이지 기능에 씁니다.",
  ],
  [
    "로그인",
    "로그인 세션 정보 (세션 식별자, 만료 시각)",
    "접속 기기·브라우저 정보는 따로 저장하지 않습니다.",
  ],
  [
    "서비스 접속·메일 발송",
    "서버 운영 기록 (접속 IP 주소·요청 시각, 메일 수신 주소·발송 시각)",
    "장애 대응과 보안을 위해 서버 로그에 남습니다.",
  ],
  [
    "회원 탈퇴 (선택)",
    "탈퇴 사유",
    "계정과 연결하지 않은 익명 통계로만 저장해 누구의 답인지 알 수 없습니다.",
  ],
]

const PURPOSE_ITEMS = [
  "회원 식별과 로그인, 아이디 찾기·임시 비밀번호 발급 같은 계정 관리",
  "등급 진단과 등급에 맞춘 설명 톤, 즐겨찾는 용어, 굴 파기 기록 같은 맞춤 기능 제공",
  "개미레터 수신에 동의한 회원에게 주간 일정 요약 메일 발송",
  "서비스 장애 대응, 부정 이용 방지, 서비스 개선을 위한 통계",
]

const RETENTION_ROWS = [
  [
    "회원 정보와 이용 기록",
    "회원 탈퇴 시까지",
    "탈퇴하면 계정과 연결된 등급·출석·용어 열람·즐겨찾기·개미레터 발송 기록까지 한 번에 지웁니다.",
  ],
  [
    "로그인 세션",
    "로그인 후 14일",
    "로그아웃하거나 14일이 지나면 다시 로그인해야 합니다.",
  ],
  ["서버 로그", "14일", "14일이 지난 로그 파일은 자동으로 지워집니다."],
  [
    "탈퇴 사유",
    "익명 통계로 보관",
    "개인을 알아볼 수 없는 정보라 계정 삭제와 별도로 남습니다.",
  ],
]

const PROCESSOR_ROWS = [
  [
    "Supabase",
    "회원 정보와 이용 기록 데이터베이스 보관",
    "수집 항목 전체 (서버 로그 제외)",
  ],
  [
    "Google (Gmail)",
    "아이디 찾기·임시 비밀번호·개미레터 메일 발송",
    "이메일 주소, 닉네임, 아이디(아이디 찾기 메일), 임시 비밀번호",
  ],
  ["Vercel", "웹사이트 화면 제공(호스팅)", "접속 IP 주소 등 접속 기록"],
  ["Oracle Cloud", "서비스 서버 운영", "서버 로그"],
]

export default function PrivacyPolicyPage() {
  return (
    <StaticPage
      title="개인정보처리방침"
      updatedAt="2026-09-27"
      intro="개미굴(이하 “서비스”)은 개인정보 보호법 등 관련 법령을 지키며, 서비스에 꼭 필요한 정보만 수집합니다. 이 방침은 어떤 정보를 왜 수집하고 어떻게 보관·삭제하는지 설명합니다."
    >
      <LegalCards
        columns={2}
        items={[
          {
            title: "필요한 정보만 받습니다",
            body: "실명·전화번호·계좌 정보는 받지 않습니다. 가입에는 이메일·아이디·닉네임·비밀번호만 필요합니다.",
          },
          {
            title: "탈퇴하면 바로 지웁니다",
            body: "회원 탈퇴 시 계정과 연결된 기록을 한 번에 삭제합니다.",
          },
          {
            title: "비밀번호는 암호화합니다",
            body: "비밀번호는 원래 값으로 되돌릴 수 없는 방식으로만 저장합니다.",
          },
          {
            title: "AI에 보내지 않습니다",
            body: "시황·브리핑을 만드는 AI에는 회원 정보를 보내지 않습니다.",
          },
        ]}
      />

      <LegalSection label="1" title="수집하는 개인정보">
        <LegalTable
          columns={["수집 시점", "항목", "비고"]}
          widths={["22%", "40%", "38%"]}
          rows={COLLECT_ROWS}
        />
      </LegalSection>

      <LegalSection label="2" title="개인정보의 이용 목적">
        <LegalList items={PURPOSE_ITEMS} />
        <LegalText>
          수집한 정보는 위 목적 밖으로 쓰지 않으며, 목적이 바뀌면 미리 알리고
          동의를 받습니다.
        </LegalText>
      </LegalSection>

      <LegalSection label="3" title="보관 기간과 파기">
        <LegalTable
          columns={["구분", "보관 기간", "파기 방법"]}
          widths={["24%", "22%", "54%"]}
          rows={RETENTION_ROWS}
        />
        <LegalText>
          관계 법령에 따라 보존해야 하는 정보가 생기면 그 법령이 정한 기간
          동안만 따로 보관한 뒤 파기합니다.
        </LegalText>
      </LegalSection>

      <LegalSection
        label="4"
        title="처리 위탁과 제3자 제공"
        description="서비스를 운영하기 위해 아래 업체에 개인정보 처리를 맡깁니다. 그 밖에 회원의 개인정보를 제3자에게 제공하지 않습니다."
      >
        <LegalTable
          columns={["업체", "맡기는 일", "전달되는 항목"]}
          widths={["20%", "38%", "42%"]}
          rows={PROCESSOR_ROWS}
        />
        <LegalText>
          위 업체는 해외 사업자라 정보가 국외에 있는 서버에서 보관·처리될 수
          있습니다. 이전되는 국가와 방식 등 자세한 내용이 궁금하면 아래 문의처로
          연락해주세요.
        </LegalText>
      </LegalSection>

      <LegalSection label="5" title="쿠키와 브라우저 저장소">
        <LegalList
          items={[
            "로그인을 유지하기 위해 세션 쿠키(session_id)를 씁니다. 자바스크립트로 읽을 수 없게 설정하며 14일 뒤 만료됩니다.",
            "다크 모드 설정, 불개미 대장 챗의 읽음 표시, 히트맵 새로고침 대기 시간 같은 화면 설정은 이용자 브라우저에만 저장하고 서버로 보내지 않습니다.",
            "브라우저 설정에서 쿠키를 막을 수 있지만, 이 경우 로그인이 필요한 기능은 쓸 수 없습니다.",
          ]}
        />
      </LegalSection>

      <LegalSection label="6" title="안전하게 지키기 위한 조치">
        <LegalList
          items={[
            "비밀번호는 bcrypt 방식으로 단방향 암호화해 저장하며, 운영자도 원래 비밀번호를 알 수 없습니다.",
            "비밀번호를 잊으면 임시 비밀번호를 메일로 보내고, 임시 비밀번호로 로그인하면 비밀번호를 바꾸기 전까지 다른 기능을 쓸 수 없게 합니다.",
            "데이터베이스·메일·외부 서비스 접속 정보는 서버에만 두고 공개 저장소나 화면에 노출하지 않습니다.",
            "운영자용 기능은 별도 인증 키가 있어야만 쓸 수 있습니다.",
          ]}
        />
      </LegalSection>

      <LegalSection label="7" title="이용자의 권리">
        <LegalList
          items={[
            "마이페이지에서 가입 정보와 등급 기록을 확인하고, 비밀번호를 바꾸고, 개미레터 수신 동의를 켜고 끌 수 있습니다.",
            "마이페이지에서 언제든지 회원 탈퇴로 개인정보 삭제를 요청할 수 있습니다.",
            "개인정보 열람·정정·삭제·처리 정지를 원하면 아래 문의처로 요청할 수 있으며, 확인 후 지체 없이 처리합니다.",
          ]}
        />
      </LegalSection>

      <LegalSection label="8" title="개인정보 문의">
        <LegalText>
          개인정보 처리와 관련한 문의·요청·불만은 <ContactEmail />
          으로 메일을 보내주세요. 확인 후 메일로 답변드립니다.
        </LegalText>
        <LegalText>
          개인정보 침해에 대한 신고나 상담이 필요하면
          개인정보침해신고센터(privacy.kisa.or.kr, 국번 없이 118)나
          개인정보분쟁조정위원회(kopico.go.kr, 1833-6972)에 문의할 수 있습니다.
        </LegalText>
      </LegalSection>

      <LegalSection label="9" title="방침의 변경">
        <LegalText>
          이 방침을 바꾸면 시행 전에 서비스 화면으로 알리고, 이 페이지의 최종
          업데이트 날짜를 고칩니다.
        </LegalText>
      </LegalSection>

      <LegalNotice>
        ⓘ 시세·뉴스·AI 콘텐츠가 어디에서 오는지는 데이터 출처·방법론 페이지에서
        확인할 수 있습니다.
      </LegalNotice>
    </StaticPage>
  )
}
