# password_service.py
# 비밀번호 해싱·검증, 임시 비밀번호 생성

import secrets
import string

import bcrypt

_TEMP_PASSWORD_LENGTH = 10
# 헷갈리는 문자(0/O, 1/l/I) 제외
_TEMP_PASSWORD_ALPHABET = "".join(c for c in string.ascii_letters + string.digits if c not in "0O1lI")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


# 비밀번호 찾기(3-5)에서 발급하는 임시 비밀번호. 영문+숫자를 항상 섞어 넣어 password_service의
# 강도 규칙(schemas/auth.py의 _validate_password_strength)을 항상 통과하도록 보장한다
def generate_temp_password() -> str:
    letters = secrets.choice(string.ascii_uppercase) + secrets.choice(string.ascii_lowercase)
    digits = secrets.choice(string.digits) + secrets.choice(string.digits)
    rest = "".join(secrets.choice(_TEMP_PASSWORD_ALPHABET) for _ in range(_TEMP_PASSWORD_LENGTH - 4))
    chars = list(letters + digits + rest)
    secrets.SystemRandom().shuffle(chars)
    return "".join(chars)
