# text_review.py
# LLM이 쓴 문구(타임라인 브리핑·해설, 보고서)를 저장 전에 코드로 검사한다. LLM을 부르지 않는다.
#   REVIEW_MESSAGE     "확인 중" 문단에 화면이 띄울 안내 문구 (응답 맨 위 review_message)
#   review_status      저장된 사유 -> "ok" / "checking"
#   normalize_percent  숫자 뒤 "퍼센트" -> "%"
#   rule_issues        코드로 판단할 수 있는 문제 목록 (자료에 없는 숫자, 숫자 표기 오류, 비교 표현, 애프터마켓 등락률 기준, 권유 표현, 막연한 원인, 투자자 매매 이유 단정, 구어·과장 표현)
#   check              원고에 확실한 자동 수정(퍼센트 표기, "홀로"·"유일하게" 삭제, "확정 수치에 따르면" 삭제)을 적용하고, 남은 문제를 WARNING 로그로 남긴다
#   guide_issues       해설 문단 유형(kind)별 위반 (유형 없음, 뉴스 문단인데 출처 없음, 원리 문단인데 오늘의 원인 단정)
#   needs_check        그 문제가 "확인 중" 표시 대상인지 (보고서처럼 문단 단위 검사를 직접 할 때 쓴다)
#   review             문단 목록을 자동 수정하고, 문제가 있는 문단에 사유를 붙인다 (문단은 빼지 않는다)
# 원인을 지어낸 문장처럼 코드로 판단할 수 없는 오류는 잡지 못한다 -> 표시되지 않은 문장도 자료와 대조해 확인한다

import logging
import re

logger = logging.getLogger(__name__)

# 숫자 뒤 "퍼센트"를 "%"로 바꾼다. 프롬프트로 금지해도 LLM이 가끔 "17.67퍼센트"로 쓴다
_PERCENT_WORD = re.compile(r"(\d)\s*퍼센트")

# 원고 속 숫자 (쉼표·소수점 포함)
_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?")

# 한글 단위가 섞인 수 표기 ("2만3천750원", "1조 5,322억원", "1.5조")
# 자료와 원고가 같은 값을 다르게 적는 일이 잦아서(기사 "2만3천750원" -> 원고 "2만3,750원") 숫자로 펴서 비교한다
_KOREAN_UNIT_NUMBER = re.compile(r"\d[\d,]*(?:\.\d+)?\s*[조억만천](?:\s*\d[\d,]*(?:\.\d+)?\s*[조억만천])*(?:\d[\d,]*(?:\.\d+)?)?")
_UNIT_VALUE = {"조": 10**12, "억": 10**8, "만": 10**4, "천": 10**3}
_UNIT_PART = re.compile(r"(\d+(?:\.\d+)?)([조억만천]?)")

# 다른 대상과 비교해야 쓸 수 있는 표현. 코드가 비교를 확인할 수 없어 원고에서 지운다 (뒤 공백 포함)
# 지워도 문장이 성립하는 말만 넣는다 ("하락장 속 홀로 상승" -> "하락장 속 상승")
_COMPARE_WORDS = re.compile(r"(나홀로|홀로|유일하게)\s*")

# 자료 구분용 말("확정 수치")을 출처처럼 쓴 표현. 확정 수치는 출처를 붙이지 않으므로 지운다
_INTERNAL_SOURCE = re.compile(r"확정\s*수치(에 따르면|에 의하면|상)\s*,?\s*")

# 지운 뒤 연달아 생긴 공백
_SPACES = re.compile(r" {2,}")

# 정규장 상승분을 애프터마켓 상승으로 쓴 문장 (17:30·20:00 급상승 종목 등락률은 전일 종가 대비다)
# 같은 문장 안에서만 찾는다 (문장 끝 = 마침표·물음표·느낌표 뒤 공백 또는 끝. "29.91"의 소수점은 문장 끝이 아니다)
_AFTERMARKET_RISE = re.compile(r"애프터마켓에서(?:(?![.!?](?:\s|$)).)*?(올랐|오른|올라|오르며|상승했|상승한|상승하며|급등했|급등한|급등하며|뛰었|뛴)")

# 읽는 사람에게 판단·행동을 권하는 표현 (투자 권유 금지). 문장 구조가 다양해 자동으로 지우지 않고 경고만 남긴다
# 기사 제목처럼 원문에 있는 표현을 옮긴 경우도 걸릴 수 있다 -> 로그를 보고 판단한다
_ADVICE = re.compile(r"보는 것이 좋|하는 것이 좋|주의(해야|가 필요)|유의(해야|할 필요)|필요가 있습니다|지켜봐야|하세요|하십시오|기회입니다|담아야|사야 합니다|팔아야|권합니다|추천합니다")

# 뉴스에 이유가 없을 때 LLM이 지어 붙이는 막연한 원인 ("개별 호재나 기대감이 작용했기 때문입니다"). 자료에 그 원인이 있는지 코드가 알 수 없어 경고만 남긴다
_VAGUE_CAUSE = re.compile(r"(호재|기대감|수급|매수세|투자 심리|투심)[^.!?]{0,20}(작용|영향|덕분|때문)")

# 투자자가 사고판 속마음(우려·기대)을 이유로 단정한 문장 ("우려 때문에 외국인과 기관이 주식을 팔았습니다"). 뉴스에 그 이유가 있는지 코드가 알 수 없어 경고만 남긴다
# 한 문장 안에서 "우려/기대/걱정 ... 때문에/탓에/으로 ... 외국인/기관/개인/투자자 ... 팔/사/매도/매수" 순서를 찾는다
_ACTOR_MOTIVE = re.compile(r"(우려|기대|걱정|불안|공포)[^.!?]{0,25}(때문에|탓에|으로|로 인해)[^.!?]{0,25}(외국인|기관|개인|투자자)[^.!?]{0,20}(팔|사들|샀|매도|매수|내놓|담)")

# 구어·과장 표현, 하루 하락을 부르는 "약세장". 뜻이 바뀔 수 있어 자동으로 지우지 않고 경고만 남긴다
_COLLOQUIAL = re.compile(r"팔아\s*치|쓸어\s*담|쏟아\s*[내냈부]|약세장")

# 검사하지 않는 키 (태그는 단어 목록이고, kind·seq·issues는 문장이 아니다)
_SKIP_KEYS = {"tags", "kind", "seq", "issues"}

# 해설 문단 유형. BEGINNER_PROMPT가 문단마다 고르게 한 값이다 (바꾸면 프롬프트도 같이 고칠 것)
_GUIDE_KINDS = ("news", "mechanism", "meaning")

# 뉴스에서 가져왔다는 표시. news 문단에는 반드시 있어야 한다
_SOURCE_MARK = re.compile(r"에 따르면|에 의하면|뉴스에서|밝혔|발표했|보도")

# 원인을 이어붙이는 표현
_CAUSE = re.compile(r"때문|탓에|덕분|여파로|영향으로|로 인해|원인으로|배경에는")

# 일반 원리임을 드러내는 표현. mechanism·meaning 문단이 원인을 말할 때는 이 표시가 있어야 한다
_PRINCIPLE_MARK = re.compile(r"일반적으로|보통|대체로|흔히|경향이 있|여겨집니다|알려져 있|수 있습니다|수 있어")

# 보류할 문제. 사실과 다를 수 있는 것만 넣는다 (나머지는 표현 문제라 경고만 남기고 내보낸다)
_CHECK_ISSUES = ("자료에 없는 숫자", "숫자 표기 오류", "막연한 원인", "투자자 매매 이유 단정", "권유 표현", "애프터마켓", "문단 유형", "출처 표기")


# 화면에 띄울 안내 문구. 자동 검사에 걸린 문단에만 붙는다 (걸린 사유 자체는 응답에 넣지 않는다 - 검수용)
# 문구를 바꾸면 프런트 수정 없이 바로 반영된다 (응답 맨 위 review_message로 한 번만 내려간다)
REVIEW_MESSAGE = "AI가 작성한 문구로, 자료와 대조가 필요한 부분입니다."


# 저장된 검사 사유 -> 응답의 검증 상태. 사유가 없으면 정상 문구다
def review_status(note: str | None) -> str:
    return "checking" if note else "ok"


def normalize_percent(text: str) -> str:
    return _PERCENT_WORD.sub(r"\1%", text)


# 원고 dict·list 안의 문자열을 전부 꺼낸다
def _texts(value) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [text for key, item in value.items() if key not in _SKIP_KEYS for text in _texts(item)]
    if isinstance(value, list):
        return [text for item in value for text in _texts(item)]
    return []


# "2만3천750" -> "23750". 단위 없는 꼬리 숫자는 그대로 더한다
def _expand_korean_number(token: str) -> str:
    total = 0.0
    for match in _UNIT_PART.finditer(token.replace(",", "").replace(" ", "")):
        value = float(match.group(1))
        total += value * _UNIT_VALUE[match.group(2)] if match.group(2) else value
    return str(int(total)) if total.is_integer() else str(total)


# 글 안의 한글 단위 수 표기를 전부 숫자로 편다 (자료 쪽을 펴 두면 원고와 표기가 달라도 같은 값으로 맞는다)
def _expand_korean_numbers(text: str) -> str:
    return _KOREAN_UNIT_NUMBER.sub(lambda match: _expand_korean_number(match.group()), text)


# 그 숫자가 자료에 있는가. 같은 숫자 문자열이 있거나, 자료 숫자를 원고 자릿수로 반올림·버림하면 같으면 통과
#   (자료 1.23 -> 원고 1.2, 자료 "-2조 2,984억원" -> 원고 "2조 2,984억원")
def _known_number(raw: str, plain_source: str, source_numbers: list[float]) -> bool:
    if not raw or raw in plain_source:
        return True
    value = float(raw)
    decimals = len(raw.split(".")[1]) if "." in raw else 0
    return any(round(abs(number), decimals) == value or int(abs(number) * 10**decimals) / 10**decimals == value for number in source_numbers)


# 원고 속 숫자 중 자료에 없는 것
# 한글 단위가 섞인 표기("2만3,750원")는 토막 내지 않고 통째로 값을 펴서 비교한다 (안 그러면 "3,750"만 떼어 보고 없다고 한다)
# 두 자리 이하 정수는 날짜·개수·"3%대"처럼 흔해서, 1900~2099 네 자리 정수는 연도라서 검사하지 않는다
def _unknown_numbers(text: str, plain_source: str, source_numbers: list[float]) -> list[str]:
    unknown = []
    spans = [(match.start(), match.end(), _expand_korean_number(match.group())) for match in _KOREAN_UNIT_NUMBER.finditer(text)]
    for start, end, value in spans:
        if not _known_number(value, plain_source, source_numbers):
            unknown.append(f"자료에 없는 숫자 '{text[start:end]}' (…{text[max(0, start - 20):end + 20]}…)")

    for match in _NUMBER.finditer(text):
        if any(start <= match.start() < end for start, end, _ in spans):
            continue
        raw = match.group().rstrip(",").replace(",", "")
        if "." not in raw and (len(raw) <= 2 or (len(raw) == 4 and raw[:2] in ("19", "20"))):
            continue
        if _known_number(raw, plain_source, source_numbers):
            continue
        unknown.append(f"자료에 없는 숫자 '{match.group()}' (…{text[max(0, match.start() - 20):match.end() + 20]}…)")
    return unknown


# 세 자리마다 찍지 않은 쉼표 ("1,5322억원"). 값은 맞아도 표기가 틀린 것이라 숫자 대조와 따로 잡는다
def _comma_issues(text: str) -> list[str]:
    issues = []
    for match in _NUMBER.finditer(text):
        groups = match.group().rstrip(",").split(".")[0].split(",")
        if len(groups) > 1 and (any(len(part) != 3 for part in groups[1:]) or not 1 <= len(groups[0]) <= 3):
            issues.append(f"숫자 표기 오류 '{match.group()}' (…{text[max(0, match.start() - 20):match.end() + 20]}…)")
    return issues


# 코드로 판단할 수 있는 문제 목록
#   texts             검사할 문구들
#   source            LLM에 준 자료 전체 (JSON 문자열)
#   aftermarket_basis True면 "애프터마켓에서 OO% 올랐다" 표현을 잡는다 (17:30·20:00 슬롯)
def rule_issues(texts: list[str], source: str, *, aftermarket_basis: bool = False) -> list[str]:
    # 자료도 한글 단위를 편 것을 함께 본다 (기사가 "1.8조", 원고가 "1조 8,000억원"으로 써도 같은 값으로 맞는다)
    expanded_source = _expand_korean_numbers(source)
    plain_source = f"{source} {expanded_source}".replace(",", "")
    source_numbers = [float(raw.replace(",", "")) for raw in _NUMBER.findall(source) + _NUMBER.findall(expanded_source) if raw.replace(",", "").rstrip(".")]
    issues = []
    for text in texts:
        issues.extend(_unknown_numbers(text, plain_source, source_numbers))
        issues.extend(_comma_issues(text))
        if _COMPARE_WORDS.search(text):
            issues.append(f"비교 표현 (…{text[:60]}…)")
        if aftermarket_basis and _AFTERMARKET_RISE.search(text):
            issues.append(f"애프터마켓 상승으로 쓴 전일 대비 등락률 (…{text[:60]}…)")
        if _ADVICE.search(text):
            issues.append(f"권유 표현 (…{text[:60]}…)")
        if _VAGUE_CAUSE.search(text):
            issues.append(f"막연한 원인 - 자료에 있는지 확인 (…{text[:60]}…)")
        if _ACTOR_MOTIVE.search(text):
            issues.append(f"투자자 매매 이유 단정 - 뉴스에 있는지 확인 (…{text[:60]}…)")
        if _COLLOQUIAL.search(text):
            issues.append(f"구어·과장 표현 (…{text[:60]}…)")
    return issues


# 문자열 하나에 자동 수정을 적용한다
def _fixed(text: str) -> str:
    return _SPACES.sub(" ", _INTERNAL_SOURCE.sub("", _COMPARE_WORDS.sub("", normalize_percent(text.strip())))).strip()


def _apply(value):
    if isinstance(value, str):
        return _fixed(value)
    if isinstance(value, dict):
        return {key: (item if key in _SKIP_KEYS else _apply(item)) for key, item in value.items()}
    if isinstance(value, list):
        return [_apply(item) for item in value]
    return value


# 원고에 자동 수정을 적용한 사본을 돌려주고, 수정한 것과 남은 문제를 로그로 남긴다 (모양은 원고와 같다)
#   label   로그에 찍을 이름 (예: "20:00 브리핑·해설", "DAILY 2026-09-14 보고서")
#   draft   원고 (문자열·목록·dict. "tags" 키는 검사하지 않는다)
#   source  원고를 쓸 때 LLM에 준 자료 (JSON 문자열)
def check(label: str, draft, source: str, *, aftermarket_basis: bool = False):
    before = _texts(draft)
    result = _apply(draft)
    after = _texts(result)

    changed = [f"{old} -> {new}" for old, new in zip(before, after) if old.strip() != new]
    if changed:
        logger.info("%s 자동 수정 %d건: %s", label, len(changed), " / ".join(changed))

    issues = rule_issues(after, source, aftermarket_basis=aftermarket_basis)
    if issues:
        logger.warning("%s 자동 검사 문제 %d건 (저장 후 확인 필요): %s", label, len(issues), " / ".join(issues))
    return result


# 이 문제가 "확인 중" 표시 대상인지 (사실이 틀릴 수 있는 것만 True. 표현 문제는 경고만 남긴다)
def needs_check(issue: str) -> bool:
    return issue.startswith(_CHECK_ISSUES)


# 해설 문단 유형(kind)별 위반. kind는 BEGINNER_PROMPT가 문단마다 고르게 한 값이다
#   news       뉴스에 적힌 사건 -> "뉴스에 따르면" 같은 출처 표기가 있어야 한다
#   mechanism  일반 원리 -> 원인을 말하려면 "일반적으로"처럼 원리임을 드러내는 표현이 있어야 한다
#   meaning    값의 뜻 -> mechanism과 같다
# 유형이 없거나 뉴스 문단에 출처가 없으면 표시 대상이고(_CHECK_ISSUES), 원인 단정은 오탐이 있을 수 있어 경고만 남긴다
def guide_issues(kind: str, texts: list[str]) -> list[str]:
    if kind not in _GUIDE_KINDS:
        return [f"문단 유형이 없거나 잘못됨 '{kind}'"]
    joined = " ".join(texts)
    if kind == "news":
        return [] if _SOURCE_MARK.search(joined) else [f"출처 표기 없는 뉴스 문단 (…{joined[:60]}…)"]
    if _CAUSE.search(joined) and not _PRINCIPLE_MARK.search(joined):
        return [f"원리 문단인데 오늘의 원인을 단정 (…{joined[:60]}…)"]
    return []


# 문단 목록을 자동 수정하고, 사실이 틀릴 수 있는 문단에 사유("issues")를 붙인다. 문단을 빼지는 않는다
#   label   로그에 찍을 이름 (예: "20:00 해설")
#   items   [{"title", "body", ...}] 목록. 해설에는 "kind"가 들어 있다
#   source  문단을 쓸 때 LLM에 준 자료 (JSON 문자열)
# 반환: (문단 목록 전체, 사유가 붙은 문단만 모은 목록)
# 사유가 붙은 문단은 화면에 "확인 중"으로 표시하고(프런트), 검수 테이블에도 남겨 사람이 확인한다
# 표현 문제(구어·비교 표현 등)는 사유를 붙이지 않고 경고 로그만 남긴다
def review(label: str, items: list[dict], source: str, *, aftermarket_basis: bool = False) -> tuple[list[dict], list[dict]]:
    reviewed: list[dict] = []
    flagged: list[dict] = []
    for original, item in zip(items, _apply(items)):
        texts = _texts(item)
        changed = [f"{old} -> {new}" for old, new in zip(_texts(original), texts) if old.strip() != new]
        if changed:
            logger.info("%s 자동 수정 %d건: %s", label, len(changed), " / ".join(changed))

        issues = rule_issues(texts, source, aftermarket_basis=aftermarket_basis)
        if "kind" in item:
            issues += guide_issues(item.get("kind") or "", texts)

        checking = [issue for issue in issues if needs_check(issue)]
        if checking:
            item = {**item, "issues": checking}
            flagged.append(item)
        elif issues:
            logger.warning("%s 표현 문제 %d건 (표시 없이 내보냄): %s", label, len(issues), " / ".join(issues))
        reviewed.append(item)

    if flagged:
        logger.warning("%s 확인 필요 %d건 (화면에 '확인 중' 표시): %s", label, len(flagged), " / ".join("·".join(row["issues"]) for row in flagged))
    return reviewed, flagged
