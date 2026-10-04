# withdrawal_feedback_service.py
# 탈퇴 사유 저장 - auth_user와 아무 관계도 맺지 않는 완전 익명 통계. 계정 삭제와 순서/트랜잭션을
# 절대 얽지 않는다(이 저장이 실패해도 탈퇴 자체는 진행돼야 한다 - 라우터에서 best-effort로 감싼다)

from sqlalchemy.ext.asyncio import AsyncSession

from backend.domain.auth.models.withdrawal_feedback import WithdrawalFeedback


async def record_feedback(session: AsyncSession, reason: str, custom_text: str | None) -> None:
    session.add(WithdrawalFeedback(reason=reason, custom_text=custom_text if reason == "기타" else None))
    await session.commit()
