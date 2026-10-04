import {
  ContactEmail,
  LegalList,
  LegalNotice,
  LegalSection,
  LegalTable,
  LegalText,
  StaticPage,
} from "@/components/common"

// 개미레터(뉴스레터) 수신 동의 안내. 회원가입 "개미레터 수신에 동의합니다 (선택)" 체크박스에서 연결한다.
// 선택 동의라 이용 목적·항목·보유 기간·거부 권리를 따로 알린다(개인정보 보호법).
// 발송 로직: backend/src/backend/domain/auth/services/newsletter_service.py
//   매주 월요일 08:00, 발송 시점에 newsletter_opt_in=true인 회원만, 같은 주 중복 발송은 newsletter_log로 막는다
// 광고를 싣게 되면 이 페이지와 메일 제목의 "(광고)" 표시, 별도 동의를 먼저 준비해야 한다

const CONSENT_ROWS = [
  [
    "이용 목적",
    "매주 월요일 오전 8시에 그 주(월~금) 이벤트 일정 캘린더의 주요 일정을 요약해 메일로 보내드립니다.",
  ],
  [
    "이용 항목",
    "이메일 주소, 닉네임(메일 인사말), 발송 기록(같은 주에 두 번 보내지 않기 위한 기록)",
  ],
  [
    "보유 기간",
    "동의를 철회하거나 회원 탈퇴할 때까지. 발송 기록은 회원 탈퇴 시 함께 삭제합니다.",
  ],
  ["발송 방식", "Google(Gmail) 메일 발송 서비스를 통해 보냅니다."],
  [
    "동의 거부 권리",
    "동의하지 않을 수 있으며, 동의하지 않아도 서비스의 다른 기능은 모두 똑같이 이용할 수 있습니다.",
  ],
]

export default function NewsletterConsentPage() {
  return (
    <StaticPage
      title="개미레터 수신 동의"
      updatedAt="2026-09-27"
      intro="개미레터는 한 주의 주요 경제·기업 일정을 미리 알려드리는 주간 메일입니다. 수신 동의는 선택이며, 언제든지 끌 수 있습니다."
    >
      <LegalSection label="1" title="동의 내용">
        <LegalTable
          columns={["구분", "내용"]}
          widths={["24%", "76%"]}
          rows={CONSENT_ROWS}
        />
      </LegalSection>

      <LegalSection label="2" title="수신을 끄는 방법">
        <LegalList
          items={[
            "마이페이지 > 내 정보 > '개미레터 수신'을 끄면 됩니다.",
            "받은 메일 맨 아래의 마이페이지 링크로도 바로 이동할 수 있습니다.",
            "끄면 바로 반영되어 다음 발송부터 메일이 가지 않습니다. 다시 켜면 다음 월요일부터 받을 수 있습니다.",
          ]}
        />
      </LegalSection>

      <LegalSection label="3" title="개미레터에 담기는 내용">
        <LegalList
          items={[
            "개미레터는 캘린더 일정 요약과 개미굴 링크만 담으며, 광고를 싣지 않습니다.",
            "광고성 정보를 보내게 되면 메일 제목에 ‘(광고)’를 표시하고, 광고 수신 동의를 따로 받습니다. 그 전에는 광고성 메일을 보내지 않습니다.",
            "일정 안내일 뿐 특정 종목의 매수·매도를 권하지 않습니다.",
          ]}
        />
      </LegalSection>

      <LegalSection label="4" title="문의">
        <LegalText>
          개미레터 수신과 관련한 문의는 <ContactEmail />
          으로 보내주세요.
        </LegalText>
      </LegalSection>

      <LegalNotice>
        ⓘ 개미레터에 쓰이는 정보를 포함한 개인정보 처리 전반은
        개인정보처리방침에서 확인할 수 있습니다.
      </LegalNotice>
    </StaticPage>
  )
}
