# image_client.py
# 이미지 생성·가공 (전 도메인 공용). 지금은 timeline 보고서 배너(1200x400)에 쓴다.
#   generate_image      영어 그림 설명 -> Pollinations 이미지 바이트 (모델은 .env의 POLLINATIONS_IMAGE_MODEL)
#   add_korean_labels   이미지 위에 한글 제목 간판·키워드 명패를 합성해 JPEG로 (이미지 모델은 한글을 정확히 못 쓴다)
#   image_format        바이트의 파일 형식 -> (확장자, Content-Type)

import time
from io import BytesIO
from pathlib import Path
from urllib.parse import quote

import httpx
from PIL import Image, ImageDraw, ImageFont

from backend.core.config import get_settings

# Pollinations 이미지 주소. 프롬프트는 경로에 URL 인코딩해서 넣고, 키(sk_)는 Authorization 헤더로만 보낸다
# 응답은 이미지 바이트 그대로 온다. 401 키 오류 / 402 잔액 부족 / 429 한도 초과(Retry-After 헤더)
_POLLINATIONS_ENDPOINT = "https://gen.pollinations.ai/image/{prompt}"

# 결과 크기. 프런트 보고서 이미지 영역이 3:1이다. 바꾸면 add_korean_labels의 간판·명패 좌표도 다시 맞춰야 한다
_WIDTH, _HEIGHT = 1200, 400

# 요청 타임아웃(초 - 생성에 수십 초 걸릴 수 있다), 재시도 횟수, 대기(초, 시도마다 배수로 늘어남)
# 429는 Retry-After 헤더만큼, 없으면 _RATE_LIMIT_WAIT_SECONDS x 시도 번호만큼 기다린다
_POLLINATIONS_TIMEOUT_SECONDS = 180.0
_RETRY_COUNT = 3
_RETRY_WAIT_SECONDS = 1.0
_RATE_LIMIT_WAIT_SECONDS = 5.0

# 합성 결과 JPEG 품질. 올리면 선명하지만 파일이 커진다 (88에서 장당 약 80~100KB)
_JPEG_QUALITY = 88

# 한글 합성 폰트 후보 (경로, ttc 안의 글꼴 번호). 앞에서부터 있는 파일을 쓴다. 서버 OS에 맞는 굵은 한글 폰트를 추가한다
_FONT_CANDIDATES = (
    ("/System/Library/Fonts/AppleSDGothicNeo.ttc", 14),  # ExtraBold
    ("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 0),
    ("/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc", 0),
)


# 바이트 앞부분(파일 시그니처)으로 (확장자, Content-Type)을 정한다. JPEG·PNG·WEBP가 아니면 ValueError (업로드하지 않게)
def image_format(content: bytes) -> tuple[str, str]:
    if content.startswith(b"\xff\xd8\xff"):
        return "jpg", "image/jpeg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png", "image/png"
    if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return "webp", "image/webp"
    raise ValueError("지원하지 않는 이미지 형식입니다")


# 크기에 맞는 한글 폰트. 후보가 하나도 없으면 RuntimeError
def _korean_font(size: int) -> ImageFont.FreeTypeFont:
    for candidate, index in _FONT_CANDIDATES:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size, index=index)
    raise RuntimeError("한글 이미지 합성 폰트가 없습니다. Noto Sans CJK Bold를 설치해주세요.")


# 글자가 width x height 안에 들어가는 가장 큰 폰트 (maximum부터 1씩 줄이고, 끝까지 안 들어가면 12)
def _fit_font(draw: ImageDraw.ImageDraw, text: str, width: int, height: int, maximum: int) -> ImageFont.FreeTypeFont:
    for size in range(maximum, 11, -1):
        font = _korean_font(size)
        box = draw.textbbox((0, 0), text, font=font, stroke_width=1)
        if box[2] - box[0] <= width and box[3] - box[1] <= height:
            return font
    return _korean_font(12)


# box 가운데에 글자를 그린다. 안쪽 여백을 뺀 크기에 맞춰 폰트를 줄인다
def _draw_centered_text(
    draw: ImageDraw.ImageDraw,
    text: str,
    box: tuple[int, int, int, int],
    maximum: int,
    *,
    horizontal_padding: int = 8,
    vertical_padding: int = 4,
) -> None:
    left, top, right, bottom = box
    font = _fit_font(draw, text, right - left - horizontal_padding * 2, bottom - top - vertical_padding * 2, maximum)
    bounds = draw.textbbox((0, 0), text, font=font, stroke_width=1)
    x = left + (right - left - (bounds[2] - bounds[0])) / 2 - bounds[0]
    y = top + (bottom - top - (bounds[3] - bounds[1])) / 2 - bounds[1]
    ink = (68, 36, 20)
    draw.text((x, y), text, font=font, fill=ink)


# box 자리에 목재 명패를 그린다 (그림자·테두리·나뭇결). pegs=True면 양쪽 위에 못 장식 (제목 간판용)
def _draw_wood_plaque(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], *, radius: int, pegs: bool) -> None:
    left, top, right, bottom = box
    draw.rounded_rectangle((left + 5, top + 7, right + 5, bottom + 7), radius=radius, fill=(72, 42, 25))
    draw.rounded_rectangle(box, radius=radius, fill=(228, 181, 121), outline=(137, 83, 43), width=3)
    draw.rounded_rectangle((left + 5, top + 4, right - 5, bottom - 5), radius=max(4, radius - 4), outline=(245, 210, 158), width=2)
    # 일정한 직선 대신 길이가 다른 얇은 결을 넣어 플라스틱 판처럼 보이지 않게 한다.
    for offset, inset in ((14, 28), (29, 17), (45, 36), (62, 22)):
        y = top + offset
        if y < bottom - 8:
            draw.line((left + inset, y, right - inset - 9, y), fill=(205, 151, 94), width=1)
    if pegs:
        for x in (left + 16, right - 16):
            draw.ellipse((x - 5, top + 10, x + 5, top + 20), fill=(114, 67, 38), outline=(82, 47, 28), width=1)


# 제목 간판 위치 (왼쪽, 위, 오른쪽, 아래). 폭은 제목 길이에 맞추고(최소 300px), 화면 양끝 64px·글자 좌우 28px 여백을 둔다
# 높이 58~72px, 위 12px. 바꾸면 prompts.IMAGE_STYLE의 "upper 82 pixels"(비워 둘 윗부분)도 같이 맞춘다
def _title_box(draw: ImageDraw.ImageDraw, headline: str) -> tuple[int, int, int, int]:
    side_margin = 64
    horizontal_padding = 28
    max_width = _WIDTH - side_margin * 2
    font = _fit_font(draw, headline, max_width - horizontal_padding * 2, 44, 38)
    bounds = draw.textbbox((0, 0), headline, font=font)
    text_width = bounds[2] - bounds[0]
    text_height = bounds[3] - bounds[1]
    width = min(max_width, max(300, text_width + horizontal_padding * 2))
    height = min(72, max(58, text_height + 22))
    left = (_WIDTH - width) // 2
    return left, 12, left + width, 12 + height


# 모델이 아래쪽에 흰 띠를 남기면(250px 아래에서 거의 흰 줄이 4줄 연속) 띠 위 장면만 잘라 전체 크기로 늘린다. 띠가 없으면 그대로
def _fill_frame_with_scene(image: Image.Image) -> Image.Image:
    pixels = image.load()
    white_start = None
    consecutive = 0
    for y in range(250, _HEIGHT):
        sampled = [pixels[x, y] for x in range(0, _WIDTH, 8)]
        white_ratio = sum(min(pixel) >= 242 and max(pixel) - min(pixel) <= 12 for pixel in sampled) / len(sampled)
        consecutive = consecutive + 1 if white_ratio >= 0.9 else 0
        if consecutive >= 4:
            white_start = y - 3
            break
    if white_start is None:
        return image
    return image.crop((0, 0, _WIDTH, max(260, white_start))).resize((_WIDTH, _HEIGHT), Image.Resampling.LANCZOS)


# 이미지 위에 한글 제목 간판(위)과 키워드 명패(아래, 최대 4개)를 합성해 JPEG 바이트로 돌려준다
#   headline  제목 (길이에 맞춰 간판 폭·글자 크기가 바뀐다)
#   labels    키워드. 빈 값은 건너뛰고 앞에서 4개만 쓴다. 명패는 가로 240px, y=332에 가운데 정렬
# 이미지를 읽지 못하면 PIL 예외(OSError 계열)가 난다
def add_korean_labels(content: bytes, *, headline: str, labels: list[str]) -> bytes:
    image = Image.open(BytesIO(content)).convert("RGB")
    if image.size != (_WIDTH, _HEIGHT):
        image = image.resize((_WIDTH, _HEIGHT), Image.Resampling.LANCZOS)
    image = _fill_frame_with_scene(image)
    draw = ImageDraw.Draw(image)

    # 상단 제목은 장면 속 목재 간판처럼 보이도록 그림자·나뭇결·못 장식을 함께 그린다.
    title_box = _title_box(draw, headline)
    _draw_wood_plaque(draw, title_box, radius=11, pegs=True)
    _draw_centered_text(draw, headline, title_box, 38, horizontal_padding=28, vertical_padding=9)

    # 키워드는 배경을 가리지 않는 개별 목재 명패로 올리고 제목과 같은 서체·재질을 쓴다.
    visible = [label for label in labels if label][:4]
    if visible:
        gap, plaque_width, plaque_height = 18, 240, 52
        total = len(visible) * plaque_width + (len(visible) - 1) * gap
        start = (_WIDTH - total) // 2
        for index, label in enumerate(visible):
            left = start + index * (plaque_width + gap)
            box = (left, 332, left + plaque_width, 332 + plaque_height)
            _draw_wood_plaque(draw, box, radius=9, pegs=False)
            _draw_centered_text(draw, label, box, 27)

    output = BytesIO()
    image.save(output, format="JPEG", quality=_JPEG_QUALITY, optimize=True, progressive=True, subsampling=1)
    return output.getvalue()


# 영어 그림 설명으로 이미지를 만들어 바이트로 돌려준다 (글자는 넣지 않는다 - 한글은 add_korean_labels로 합성)
# 5xx·429·연결 오류는 재시도하고 나머지 4xx(402 잔액 부족 포함)는 바로 에러를 낸다
# 키가 없으면 RuntimeError, 응답이 이미지가 아니면 ValueError
def generate_image(prompt: str) -> bytes:
    settings = get_settings()
    if not settings.pollinations_api_key:
        raise RuntimeError("POLLINATIONS_API_KEY가 .env에 없습니다.")

    last_error = None
    for attempt in range(_RETRY_COUNT):
        wait = _RETRY_WAIT_SECONDS * (attempt + 1)
        try:
            response = httpx.get(
                _POLLINATIONS_ENDPOINT.format(prompt=quote(prompt, safe="")),
                headers={"Authorization": f"Bearer {settings.pollinations_api_key}"},
                params={"model": settings.pollinations_image_model, "width": _WIDTH, "height": _HEIGHT},
                timeout=_POLLINATIONS_TIMEOUT_SECONDS,
                follow_redirects=True,
            )
            response.raise_for_status()
            if not response.headers.get("content-type", "").startswith("image/"):
                raise ValueError(f"Pollinations 응답이 이미지가 아닙니다 - {response.headers.get('content-type')}: {response.text[:200]}")
            image_format(response.content)
            return response.content
        except httpx.HTTPStatusError as error:
            status = error.response.status_code
            if status < 500 and status != 429:
                raise
            last_error = error
            if status == 429:
                retry_after = error.response.headers.get("retry-after", "")
                wait = float(retry_after) if retry_after.replace(".", "", 1).isdigit() else _RATE_LIMIT_WAIT_SECONDS * (attempt + 1)
        except httpx.TransportError as error:
            last_error = error

        if attempt < _RETRY_COUNT - 1:
            time.sleep(wait)

    raise last_error
