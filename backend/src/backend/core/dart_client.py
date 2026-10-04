# dart_client.py
# DART(전자공시시스템, Open DART) API 직접 호출
#
# core에 있는 이유: fred_client.py/kis_client.py와 같은 팀 규칙 - API 호출 코드는 도메인 안에
# 두지 않고 core에 모아서 전역으로 쓴다(2026-09-10). 이 파일 자체는 조회 전용이고, DB 저장은
# services/calendar.py의 ingest_preliminary_earnings_from_dart()가 담당한다.
#
# DART 응답은 HTTP 상태와 무관하게 항상 JSON body에 "status"/"message"를 담아 온다(HTTP 200
# 이어도 인증키 오류·데이터 없음 등이 status로만 구분됨) - DART 공식 문서의 상태코드 표.
# corp_code(공시대상회사의 고유번호)는 list.json 등 대부분의 API에서 종목코드 대신 요구되는
# DART 자체 식별자라서, stock_code -> corp_code 매핑은 별도로 고유번호 파일(zip 안의 XML)을
# 받아서 직접 찾아야 한다 - DART가 이름/종목코드로 바로 검색해주는 API는 없다.

from __future__ import annotations

import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime
from io import BytesIO

import httpx

from backend.core.config import get_settings

_BASE_URL = "https://opendart.fss.or.kr/api"

# 요청 타임아웃(초) - 명시하지 않으면 httpx 기본값을 쓰게 된다
_TIMEOUT_SECONDS = 10.0

# DART 공식 응답 상태코드 (opendart.fss.or.kr 개발가이드 - 에러 및 통신 상태 표)
_STATUS_MESSAGES: dict[str, str] = {
    "000": "정상",
    "010": "등록되지 않은 키입니다.",
    "011": "사용할 수 없는 키입니다. 오픈API에 등록되었으나, 일시적으로 사용 중지된 키를 통히 오픈API 서비스 요청한 경우.",
    "012": "접근할 수 없는 IP입니다.",
    "013": "조회된 데이터가 없습니다.",
    "014": "파일이 존재하지 않습니다.",
    "020": "요청 제한을 초과하였습니다.",
    "021": "조회 가능한 회사 개수가 초과하였습니다.(최대 100건)",
    "100": "필드의 부적절한 값입니다.",
    "101": "부적절한 접근입니다.",
    "800": "시스템 점검 중입니다.",
    "900": "정의되지 않은 오류가 발생하였습니다.",
    "901": "사용자 계정의 개인정보 오류로 인한 처리가 오류가 발생하였습니다.",
}


class DartApiError(Exception):
    def __init__(self, status: str, message: str):
        self.status = status
        self.message = message
        super().__init__(f"DART API 오류 [{status}]: {message}")


# crtfc_key(인증키)를 쿼리 파라미터로 보내는 GET 요청 공통 처리. response.raise_for_status()는
# 쓰지 않는다 - 그 예외 메시지에 crtfc_key가 포함된 요청 URL 전체가 그대로 담긴다(FRED와 같은
# 문제). 실패 메시지에는 crtfc_key를 뺀 path만 남긴다. path에는 쿼리스트링이 없으므로(쿼리는
# httpx가 params로 별도로 붙인다) 안전하다.
def _get(path: str, params: dict) -> httpx.Response:
    response = httpx.get(f"{_BASE_URL}{path}", params=params, timeout=_TIMEOUT_SECONDS)
    if response.status_code >= 400:
        raise DartApiError(str(response.status_code), f"DART HTTP 요청 실패 - path={path}")
    return response


# corp_code 목록(전체 상장·비상장사 고유번호 파일)을 받아서 파싱한다.
# DART가 list.json 등에서 요구하는 corp_code는 종목코드와 다른 자체 식별자라서, 이 파일로
# stock_code -> corp_code를 미리 찾아둬야 한다.
# 정상 응답은 zip(그 안에 CORPCODE.xml)이지만, 인증키가 틀리는 등 에러가 나면 zip이 아니라
# <result><status>.../<message>...</result> 형태의 XML이 그냥 그대로 온다(실제 라이브 호출로
# 확인 - list.json처럼 항상 JSON에 status를 담아 오는 게 아니라 응답 형식 자체가 달라진다).
def get_corp_codes() -> list[dict]:
    settings = get_settings()
    response = _get("/corpCode.xml", {"crtfc_key": settings.dart_api_key})

    try:
        with zipfile.ZipFile(BytesIO(response.content)) as zf:
            name = zf.namelist()[0]
            xml_bytes = zf.read(name)
    except zipfile.BadZipFile:
        xml_bytes = response.content

    root = ET.fromstring(xml_bytes)

    # 정상 응답도 루트 태그가 <result>라서 태그명으로는 에러 여부를 구분할 수 없다 - 정상은
    # <result><list>...</list>...</result>(회사마다 하나씩), 에러는 <result><status>.../
    # <message>...</result> 형태다. status 자식 유무로 구분한다.
    status_el = root.find("status")
    if status_el is not None:
        status = status_el.text or "900"
        message = root.findtext("message", default=_STATUS_MESSAGES.get(status, "알 수 없는 오류"))
        raise DartApiError(status, message)

    corps = []
    for item in root.findall("list"):
        corps.append(
            {
                "corp_code": item.findtext("corp_code"),
                "corp_name": item.findtext("corp_name"),
                "stock_code": (item.findtext("stock_code") or "").strip() or None,
                "modify_date": item.findtext("modify_date"),
            }
        )
    return corps


# corp_code 목록에서 종목코드로 상장사를 찾는다. stock_code가 없는(비상장) 항목은 애초에
# 대상이 아니라서 제외된다. 동명이인/중복 상장 케이스는 없다고 가정한다(종목코드는 유일).
def find_corp_by_stock_code(corp_codes: list[dict], stock_code: str) -> dict | None:
    for corp in corp_codes:
        if corp["stock_code"] == stock_code:
            return corp
    return None


# 공시검색 API (GET /api/list.json). corp_code 하나로 특정 회사의 공시만 조회한다.
# bgn_de/end_de는 "YYYYMMDD" 형식. pblntf_ty(공시유형)를 주면 그 유형만 필터링된다
# (정기공시="A" - 사업보고서/반기보고서/분기보고서가 여기 속한다).
# 1페이지(page_count)를 넘는 기간을 조회하면 자동으로 다음 페이지까지 이어서 받아 전체를
# 반환한다(2단계 조사에서 삼성전자 1.75년치가 3,875건/39페이지였던 것 확인 - 1페이지만 받으면
# 조용히 나머지가 잘려나가는 문제가 있었다).
def get_disclosure_list(
    corp_code: str,
    bgn_de: str,
    end_de: str,
    *,
    pblntf_ty: str | None = None,
    page_count: int = 100,
) -> list[dict]:
    settings = get_settings()
    all_items: list[dict] = []
    page_no = 1

    while True:
        params: dict[str, str | int] = {
            "crtfc_key": settings.dart_api_key,
            "corp_code": corp_code,
            "bgn_de": bgn_de,
            "end_de": end_de,
            "page_no": page_no,
            "page_count": page_count,
        }
        if pblntf_ty is not None:
            params["pblntf_ty"] = pblntf_ty

        response = _get("/list.json", params)
        body = response.json()

        status = body["status"]
        if status == "013":
            # "조회된 데이터가 없습니다" - 에러가 아니라 정상적으로 있을 수 있는 상황(해당
            # 기간에 공시가 없었을 뿐)이라 예외를 던지지 않고 지금까지 모은 것만 반환한다
            break
        if status != "000":
            message = body.get("message", _STATUS_MESSAGES.get(status, "알 수 없는 오류"))
            raise DartApiError(status, message)

        all_items.extend(body.get("list", []))
        total_page = body.get("total_page", 1)
        if page_no >= total_page:
            break
        page_no += 1

    return all_items


# report_nm에 이 키워드가 있으면 분기별 잠정실적 공시다. 삼성전자/SK하이닉스/현대차 3개 기업으로
# 실제 라이브 데이터를 확인해서 정한 키워드다 - 정정 공시는 앞에 "[기재정정]"만 붙는다.
# 주의: 짧게 "영업(잠정)실적"만 쓰면 안 된다 - 현대차는 "연결재무제표기준영업(잠정)실적(공정공시)"
# (분기 실적, 분기당 1건)과 별개로 매달 "영업(잠정)실적(공정공시)"(월간 판매실적, 접두사 없음)도
# 공시해서, 짧은 키워드로는 월간 판매실적까지 21개월치 28건이 잘못 걸리는 걸 실제 호출로 확인했다.
# "연결재무제표기준"까지 포함해야 분기 실적만 정확히 걸러진다.
_PRELIMINARY_EARNINGS_KEYWORD = "연결재무제표기준영업(잠정)실적"

# 2단계 조사에서 확인한 실측 간격: 같은 분기의 1차(가이던스)->2차(상세) 공시 간격은 22~24일,
# 서로 다른 분기의 1차 공시끼리는 60일 이상 떨어져 있었다. 그 중간인 45일을 기준으로 날짜를
# 묶어서 "같은 분기 발표 묶음"을 나눈다.
_QUARTER_GAP_DAYS = 45


# 잠정실적 공시(1차+2차, 정정 포함)를 전부 찾은 뒤, 분기별로 가장 이른 날짜(1차)만 골라 반환한다.
# - 정정("[기재정정]") 공시는 원본과 같은 rcept_dt에 올라온 "수정본"일 뿐 새로운 발표가 아니라서
#   (2단계 조사에서 실제 라이브 데이터로 확인 - 정정은 항상 원본과 같은 날짜), 날짜 단위로 합쳐서
#   하루에 하나만 남긴다 - 대표 실적 이벤트와 중복 생성되지 않도록 하는 처리
# - 그렇게 날짜 단위로 정리한 뒤, 45일 이상 간격이 벌어지면 다른 분기로 보고 그룹을 나누고,
#   각 그룹에서 가장 이른 날짜(1차)만 채택한다
def get_preliminary_earnings(corp_code: str, start_date: str, end_date: str) -> list[dict]:
    disclosures = get_disclosure_list(corp_code, start_date, end_date)
    earnings = [d for d in disclosures if _PRELIMINARY_EARNINGS_KEYWORD in d.get("report_nm", "")]

    by_date: dict[str, dict] = {}
    for item in sorted(earnings, key=lambda d: d["rcept_no"]):
        by_date[item["rcept_dt"]] = item
    unique_dates = sorted(by_date)

    first_of_group: list[dict] = []
    group: list[str] = []
    for d in unique_dates:
        if group:
            gap = (datetime.strptime(d, "%Y%m%d") - datetime.strptime(group[-1], "%Y%m%d")).days
            if gap > _QUARTER_GAP_DAYS:
                first_of_group.append(by_date[group[0]])
                group = []
        group.append(d)
    if group:
        first_of_group.append(by_date[group[0]])

    return first_of_group


# 단일회사 주요계정 API (GET /api/fnlttSinglAcnt.json). reprt_code: "11013"=1분기보고서,
# "11012"=반기보고서, "11014"=3분기보고서, "11011"=사업보고서(연간). CFS(연결재무제표)를
# 우선 쓰고, CFS 행이 없으면 OFS(별도재무제표)로 대체한다. account_nm이 정확히 "매출액"/
# "영업이익"/"당기순이익(손실)"인 행만 찾는다(2단계 조사에서 실제 응답 필드로 확인한 이름).
# 값이 없으면(회사가 아직 그 항목을 공시하지 않았거나 계정명이 다르면) 에러 대신 None을 준다.
# thstrm_amount는 천단위 콤마가 포함된 문자열이라 콤마를 제거하고 정수로 바꾼다.
def get_key_accounts(corp_code: str, bsns_year: str, reprt_code: str = "11011") -> dict:
    settings = get_settings()
    response = _get(
        "/fnlttSinglAcnt.json",
        {
            "crtfc_key": settings.dart_api_key,
            "corp_code": corp_code,
            "bsns_year": bsns_year,
            "reprt_code": reprt_code,
        },
    )
    body = response.json()

    status = body["status"]
    if status == "013":
        return {"revenue": None, "operating_income": None, "net_income": None}
    if status != "000":
        message = body.get("message", _STATUS_MESSAGES.get(status, "알 수 없는 오류"))
        raise DartApiError(status, message)

    rows = body.get("list", [])

    def _find(account_nm: str) -> int | None:
        for fs_div in ("CFS", "OFS"):
            for row in rows:
                if row["fs_div"] == fs_div and row["account_nm"] == account_nm:
                    raw = row.get("thstrm_amount")
                    if not raw:
                        return None
                    # DART는 값이 없는 계정을 콤마 없는 대시 한 글자("-")로 표기하는 경우가
                    # 있다(69번 항목 - 한전기술 실측으로 확인) - 숫자로 못 바꾸면 임의로
                    # 0 등을 만들지 않고 확인 안 된 값(None)으로 처리한다.
                    cleaned = raw.replace(",", "").strip()
                    if not cleaned or cleaned == "-":
                        return None
                    try:
                        return int(cleaned)
                    except ValueError:
                        return None
        return None

    return {
        "revenue": _find("매출액"),
        "operating_income": _find("영업이익"),
        "net_income": _find("당기순이익(손실)"),
    }
