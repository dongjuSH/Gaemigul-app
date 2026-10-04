# market 모델 모음. create_tables.py가 이 패키지를 import해 테이블을 등록한다

from backend.domain.market.models.exchange_rate import ExchangeRateSnapshot

__all__ = ["ExchangeRateSnapshot"]
