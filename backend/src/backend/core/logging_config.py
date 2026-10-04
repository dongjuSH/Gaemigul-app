# logging_config.py
# 로그 설정 (전 도메인 공용). 터미널과 backend/logs/timeline.log에 같이 남긴다.
#
# 쓰는 법: 파일 맨 위에서 logger를 만들고 print 대신 쓴다. setup_logging()은 main.py가 서버 시작 시 부른다
#   logger = logging.getLogger(__name__)
#   logger.warning("브리핑 생성 실패 - %s", error)
#
# 레벨 기준
#   INFO     정상 흐름 (수집 시작·완료, 휴장일 건너뜀)
#   WARNING  일부 실패했지만 슬롯은 저장됨 (LLM 실패, 휴장일 조회 실패 등)
#   ERROR    슬롯 전체 실패 (exc_info=True로 스택까지)
# 문제만 보려면: grep -E "WARNING|ERROR" logs/timeline.log

import logging
import time
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path
from zoneinfo import ZoneInfo

_KST = ZoneInfo("Asia/Seoul")

# 로그 파일 위치: backend/logs/timeline.log (git에 올리지 않는다)
LOG_DIR = Path(__file__).resolve().parents[3] / "logs"
LOG_FILE = LOG_DIR / "timeline.log"

# 보관 일수. 자정마다 날짜를 붙여 넘기고(timeline.log.2026-09-14) 이만큼만 남긴다
_BACKUP_DAYS = 14

# 한 줄 형식: 시각 레벨 파일명 | 메시지
_FORMAT = "%(asctime)s %(levelname)-7s %(module)-22s | %(message)s"
_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# 외부 라이브러리 로그 레벨. 요청·작업 등록마다 INFO가 쏟아져서 WARNING 이상만 남긴다
# apscheduler의 WARNING(예약 시각 놓침 "was missed by")은 꼭 봐야 하므로 WARNING보다 높이지 말 것
_QUIET_LOGGERS = {
    "httpx": logging.WARNING,
    "httpcore": logging.WARNING,
    "apscheduler": logging.WARNING,
}

_configured = False


# 로그 시각을 기기 지역 시간이 아니라 한국 시간으로 찍는다
def _kst_converter(timestamp: float) -> time.struct_time:
    from datetime import datetime

    return datetime.fromtimestamp(timestamp, _KST).timetuple()


# 로그 설정을 적용한다. 여러 번 불러도 한 번만 적용된다 (핸들러가 중복되면 같은 줄이 두 번 찍힌다)
# level을 바꾸면 우리 코드의 최소 로그 레벨이 바뀐다. 파일을 못 만들면 터미널에만 남긴다
def setup_logging(level: int = logging.INFO) -> None:
    global _configured
    if _configured:
        return

    formatter = logging.Formatter(_FORMAT, datefmt=_DATE_FORMAT)
    formatter.converter = _kst_converter

    handlers: list[logging.Handler] = [logging.StreamHandler()]

    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        handlers.append(
            TimedRotatingFileHandler(LOG_FILE, when="midnight", backupCount=_BACKUP_DAYS, encoding="utf-8")
        )
    except OSError as error:
        print(f"[경고] 로그 파일을 만들 수 없어 터미널에만 남깁니다 - {error}")

    root = logging.getLogger()
    root.setLevel(level)
    for handler in handlers:
        handler.setFormatter(formatter)
        root.addHandler(handler)

    for name, quiet_level in _QUIET_LOGGERS.items():
        logging.getLogger(name).setLevel(quiet_level)

    _configured = True
    logging.getLogger(__name__).info("로그 설정 완료 - %s (보관 %d일)", LOG_FILE, _BACKUP_DAYS)
