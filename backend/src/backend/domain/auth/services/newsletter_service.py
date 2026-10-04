# newsletter_service.py
# 개미레터(뉴스레터) - 매주 월요일 08:00 KST에 그 주(월~금) 비축 캘린더 일정을 요약해
# newsletter_opt_in=true인 유저에게 이메일로 보낸다.
#
# calendar_events 조회는 ORM 모델이 없는 calendar 도메인 관례를 그대로 따라 raw SQL로 한다
# (domain/calendar/services/calendar.py의 get_events_by_month와 같은 패턴).
# 실제 발송은 email_service.send_email()에 위임한다 - find_id/reset_password와 같은 함수를 쓰므로
# SMTP를 붙일 때 이 서비스는 그대로 둔 채 email_service 본문만 바꾸면 된다.
#
# HTML 본문은 대부분의 메일 클라이언트(Gmail/네이버/아웃룩)가 flexbox·grid·외부 CSS를 제대로
# 지원하지 않으므로 <table> 레이아웃 + 인라인 style만으로 만든다. 로고는 아직 외부에서 접근
# 가능한 URL이 없어 텍스트 워드마크("🐜 개미굴")로 대체한다.

import html as html_escape
import logging
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from backend.core.config import get_settings
from backend.core.database import get_session_factory
from backend.domain.auth.models.auth import AuthUser
from backend.domain.auth.models.newsletter import NewsletterLog
from backend.domain.auth.services import email_service

logger = logging.getLogger(__name__)

_KST = ZoneInfo("Asia/Seoul")

_NO_EVENTS_MESSAGE = "이번주는 예정된 주요 일정이 없어요."

_BRAND_RED = "#FF2A2A"
_TEXT_DARK = "#1F2937"
_TEXT_MUTED = "#6B7280"
_BORDER = "#E5E7EB"
_CARD_BG = "#F9FAFB"


def _week_range(today: date) -> tuple[date, date]:
    monday = today - timedelta(days=today.weekday())
    friday = monday + timedelta(days=4)
    return monday, friday


class _WeekEvent:
    __slots__ = ("title", "published_at")

    def __init__(self, title: str, published_at: str):
        self.title = title
        self.published_at = published_at


# calendar_events에서 월~금 publishedAt(KST) 범위의 (제목, 발표일)을 발표일 순으로 가져온다
async def _get_week_events(session: AsyncSession, monday: date, friday: date) -> list[_WeekEvent]:
    result = await session.execute(
        text(
            """
            SELECT title, "publishedAt"
            FROM calendar_events
            WHERE "publishedAt" >= :start AND "publishedAt" <= :end
            ORDER BY "publishedAt" ASC, "time" ASC NULLS LAST
            """
        ),
        {"start": monday.isoformat(), "end": friday.isoformat()},
    )
    return [_WeekEvent(title=row[0], published_at=row[1]) for row in result.all()]


# "2026-09-22" -> "9/22(화)"
def _format_event_date(published_at: str) -> str:
    weekday_kr = ("월", "화", "수", "목", "금", "토", "일")
    parsed = datetime.strptime(published_at, "%Y-%m-%d").date()
    return f"{parsed.month}/{parsed.day}({weekday_kr[parsed.weekday()]})"


# 메일 맨 아래 수신 안내. 수신 동의를 받아 보내는 메일이라 언제든 끌 수 있는 방법을 함께 알린다
# (개미레터 수신 동의 안내 페이지 /newsletter-consent와 문구를 맞춘다)
def _opt_out_text(site_url: str) -> str:
    return (
        "이 메일은 개미레터 수신에 동의하신 분께 보내드려요. "
        f"더 이상 받지 않으려면 마이페이지에서 '개미레터 수신'을 꺼주세요: {site_url}/mypage"
    )


def _build_text_body(nickname: str, events: list[_WeekEvent], site_url: str) -> str:
    if not events:
        body = f"{nickname}님, {_NO_EVENTS_MESSAGE}\n\n개미굴에서 오늘의 시장도 확인해보세요: {site_url}"
    else:
        events_text = ", ".join(event.title for event in events)
        body = (
            f"{nickname}님, 이번주는 {events_text} 행사가 예정되어 있습니다. "
            f"자세한 내용은 개미굴에서 확인해보세요.\n\n{site_url}"
        )
    return f"{body}\n\n---\n{_opt_out_text(site_url)}"


def _esc(value: str) -> str:
    return html_escape.escape(value)


def _render_event_cards_html(events: list[_WeekEvent]) -> str:
    if not events:
        return f"""
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
               style="background-color:{_CARD_BG};border:1px solid {_BORDER};border-radius:8px;">
          <tr>
            <td style="padding:20px;text-align:center;font-size:14px;color:{_TEXT_MUTED};">
              {_esc(_NO_EVENTS_MESSAGE)}
            </td>
          </tr>
        </table>
        """

    rows = []
    for event in events:
        rows.append(f"""
        <tr>
          <td style="padding:0 0 10px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                   style="background-color:{_CARD_BG};border:1px solid {_BORDER};border-radius:8px;">
              <tr>
                <td width="72" valign="middle"
                    style="padding:14px 8px 14px 16px;font-size:13px;font-weight:bold;color:{_BRAND_RED};white-space:nowrap;">
                  {_esc(_format_event_date(event.published_at))}
                </td>
                <td valign="middle"
                    style="padding:14px 16px 14px 8px;font-size:14px;color:{_TEXT_DARK};border-left:1px solid {_BORDER};">
                  {_esc(event.title)}
                </td>
              </tr>
            </table>
          </td>
        </tr>
        """)
    return f"""
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      {"".join(rows)}
    </table>
    """


def _render_html_body(nickname: str, events: list[_WeekEvent], site_url: str) -> str:
    calendar_url = f"{site_url}/calendar"
    mypage_url = f"{site_url}/mypage"

    if events:
        intro = "이번주는 아래 일정이 예정되어 있어요. 미리 챙겨보세요!"
    else:
        intro = "이번주는 특별히 챙길 일정은 없지만, 오늘의 시장은 개미굴에서 확인해보세요."

    return f"""<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>개미굴 개미레터</title>
  </head>
  <body style="margin:0;padding:0;background-color:#F3F4F6;font-family:'Apple SD Gothic Neo',Pretendard,'Malgun Gothic',sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F3F4F6;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
                 style="max-width:600px;width:100%;background-color:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid {_BORDER};">

            <tr>
              <td style="padding:32px 24px 4px 24px;border-top:4px solid {_BRAND_RED};">
                <p style="margin:0;font-size:18px;font-weight:bold;color:{_TEXT_DARK};">
                  {_esc(nickname)}님, 이번주 개미레터가 도착했어요 🐜
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:4px 24px 20px 24px;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:{_TEXT_MUTED};">
                  {_esc(intro)}
                </p>
              </td>
            </tr>

            <tr>
              <td style="padding:0 24px 24px 24px;">
                {_render_event_cards_html(events)}
              </td>
            </tr>

            <tr>
              <td align="center" style="padding:0 24px 32px 24px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td align="center" style="border-radius:8px;background-color:{_BRAND_RED};">
                      <a href="{calendar_url}"
                         style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:8px;">
                        개미굴에서 자세히 보기
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:20px 24px;border-top:1px solid {_BORDER};background-color:{_CARD_BG};">
                <p style="margin:0 0 8px 0;font-size:11px;line-height:1.6;color:{_TEXT_MUTED};">
                  이 메일은 개미레터 수신에 동의하신 분께 보내드려요.
                  더 이상 받지 않으려면
                  <a href="{mypage_url}" style="color:{_TEXT_MUTED};text-decoration:underline;">마이페이지</a>에서
                  '개미레터 수신'을 꺼주세요.
                </p>
                <p style="margin:0;font-size:11px;color:{_TEXT_MUTED};">
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


def _build_message(nickname: str, events: list[_WeekEvent]) -> tuple[str, str, str]:
    subject = "[개미굴] 이번주 개미레터가 도착했어요 💌"
    site_url = get_settings().frontend_url
    text_body = _build_text_body(nickname, events, site_url)
    html_body = _render_html_body(nickname, events, site_url)
    return subject, text_body, html_body


async def _already_sent(session: AsyncSession, user_id: int, week_start: str) -> bool:
    row = await session.execute(
        text("SELECT 1 FROM newsletter_log WHERE user_id = :user_id AND week_start = :week_start"),
        {"user_id": user_id, "week_start": week_start},
    )
    return row.first() is not None


# 스케줄러(main.py)가 매주 월요일 08:00 KST에 호출한다.
async def run_scheduled_newsletter() -> None:
    today = datetime.now(_KST).date()
    monday, friday = _week_range(today)
    week_start = monday.isoformat()

    async with get_session_factory()() as session:
        events = await _get_week_events(session, monday, friday)

        users = (await session.scalars(select(AuthUser).where(AuthUser.newsletter_opt_in.is_(True)))).all()

        sent_count = 0
        skipped_count = 0
        failed_count = 0

        for user in users:
            if await _already_sent(session, user.id, week_start):
                skipped_count += 1
                continue

            subject, text_body, html_body = _build_message(user.nickname, events)
            if not email_service.send_email(user.email, subject, text_body, html_body):
                failed_count += 1
                continue

            session.add(NewsletterLog(user_id=user.id, week_start=week_start))
            try:
                await session.commit()
                sent_count += 1
            except IntegrityError:
                # 동시 실행 등으로 같은 주에 이미 기록된 경우 - 발송은 됐으니 실패로 세지 않는다
                await session.rollback()

        logger.info(
            "[개미레터] %s 주간 발송 완료 - 대상 %d명, 발송 %d, 이미 발송됨 %d, 실패 %d",
            week_start,
            len(users),
            sent_count,
            skipped_count,
            failed_count,
        )
