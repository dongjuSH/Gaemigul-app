# email_service.py
# 실제 이메일 발송(SMTP). find_id_service/reset_password_service, newsletter_service가 모두
# 이 함수 하나만 통해서 이메일을 보낸다.
#
# SMTP_HOST/SMTP_USER/SMTP_PASSWORD 중 하나라도 .env에 없으면 실제 발송 대신 로그로만 남긴다
# (로컬 개발 시 SMTP 계정 없이도 회원가입/아이디 찾기 흐름을 그대로 테스트할 수 있게 하기 위함).
#
# 발송 실패(SMTP 인증 오류, 연결 실패 등)는 여기서 잡아 로그만 남기고 예외를 밖으로 던지지 않는다 -
# find_id/reset_password/newsletter 어느 쪽도 이메일 발송 실패로 전체 요청이 500이 되면 안 된다.

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from backend.core.config import get_settings

logger = logging.getLogger(__name__)


# html_body를 같이 주면 text/plain + text/html 멀티파트로 보낸다(HTML을 못 그리는 클라이언트는
# body의 일반 텍스트로 자동 대체됨). html_body가 없으면 기존처럼 텍스트 메일만 보낸다.
def send_email(to: str, subject: str, body: str, html_body: str | None = None) -> bool:
    settings = get_settings()

    if not (settings.smtp_host and settings.smtp_user and settings.smtp_password):
        # 아이디·임시 비밀번호가 포함될 수 있으므로 메일 본문은 로그에 남기지 않는다.
        logger.info("[이메일 발송 스텁] SMTP 설정 없음 - to=%s subject=%s", to, subject)
        return False

    if html_body:
        message = MIMEMultipart("alternative")
        message.attach(MIMEText(body, "plain"))
        message.attach(MIMEText(html_body, "html"))
    else:
        message = MIMEText(body)
    message["Subject"] = subject
    message["From"] = settings.smtp_user
    message["To"] = to

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as server:
            server.starttls()
            server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_user, [to], message.as_string())
    except Exception as error:
        logger.error("[이메일 발송 실패] to=%s subject=%s - %s: %s", to, subject, type(error).__name__, error)
        return False

    logger.info("[이메일 발송 완료] to=%s subject=%s", to, subject)
    return True
