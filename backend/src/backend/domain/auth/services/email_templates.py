# email_templates.py
# 아이디 찾기·비밀번호 재설정 같은 계정 알림 메일의 공용 HTML 레이아웃.
#
# newsletter_service.py의 _render_html_body와 같은 스타일(브랜드 레드 톤, <table> 레이아웃)을
# 따른다 - 대부분의 메일 클라이언트(Gmail/네이버/아웃룩)가 flexbox·grid·외부 CSS를 제대로
# 지원하지 않으므로 <table> + 인라인 style만으로 만든다.
#
# find_id/reset_password는 이 모듈로 HTML 본문을 만들어 email_service.send_email(html_body=...)에
# 넘긴다. html_body를 안 넘기면 텍스트 메일만 나간다(send_email 쪽 동작) - 실제로 예쁜 메일이
# 오려면 반드시 이 모듈로 만든 html_body를 같이 넘겨야 한다.

import html as html_escape

from backend.core.config import get_settings

_BRAND_RED = "#FF2A2A"
_TEXT_DARK = "#1F2937"
_TEXT_MUTED = "#6B7280"
_BORDER = "#E5E7EB"
_CARD_BG = "#F9FAFB"


def _esc(value: str) -> str:
    return html_escape.escape(value)


# 아이디/임시 비밀번호처럼 강조해서 보여줄 값 하나를 카드로 감싼다
def render_highlight_card(label: str, value: str) -> str:
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background-color:{_CARD_BG};border:1px solid {_BORDER};border-radius:8px;">
      <tr>
        <td style="padding:16px 20px;text-align:center;">
          <p style="margin:0 0 6px 0;font-size:12px;color:{_TEXT_MUTED};">{_esc(label)}</p>
          <p style="margin:0;font-size:20px;font-weight:bold;color:{_BRAND_RED};letter-spacing:0.5px;">{_esc(value)}</p>
        </td>
      </tr>
    </table>
    """


# 계정 알림 메일(아이디 찾기/임시 비밀번호 안내) 공용 레이아웃 - 헤더 + 안내문 + 강조 카드 +
# 로그인 버튼 + 푸터. highlight는 render_highlight_card()가 만든 HTML을 그대로 받는다
def render_account_email_html(
    heading: str,
    intro: str,
    highlight: str,
    cta_label: str = "로그인하러 가기",
) -> str:
    login_url = f"{get_settings().frontend_url}/login"

    return f"""<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>개미굴</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F3F4F6;font-family:'Apple SD Gothic Neo',Pretendard,'Malgun Gothic',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F3F4F6;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
                 style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid {_BORDER};">

            <tr>
              <td style="padding:32px 24px 4px 24px;border-top:4px solid {_BRAND_RED};">
                <p style="margin:0;font-size:18px;font-weight:bold;color:{_TEXT_DARK}; text-align:center;">
                  {_esc(heading)} 🐜
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:4px 24px 20px 24px;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:{_TEXT_MUTED}; text-align:center;">
                  {_esc(intro)}
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:0 24px 24px 24px;">
                {highlight}
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:0 24px 32px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" style="border-radius:8px;background-color:{_BRAND_RED};">
                      <a href="{login_url}"
                         style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px;">
                        {_esc(cta_label)}
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 24px;border-top:1px solid {_BORDER};background-color:{_CARD_BG};">
                <p style="margin:0;font-size:11px;color:{_TEXT_MUTED}; text-align:center;">
                  © 2026 Anthill. All rights reserved.
                </p>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>"""
