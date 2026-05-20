from functools import lru_cache

import httpx
from letta_client import Letta
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    letta_base_url: str = "http://letta:8283"
    letta_server_password: str
    # 0 = no cap (loads entire upload into memory). Set bytes to mitigate DoS via huge uploads.
    vision_max_upload_bytes: int = 0
    vision_max_request_bytes: int = 25 * 1024 * 1024
    letta_client_read_timeout_seconds: float = 600.0


@lru_cache
def get_settings() -> Settings:
    return Settings()


def get_letta_client() -> Letta:
    settings = get_settings()
    return Letta(
        base_url=settings.letta_base_url,
        api_key=settings.letta_server_password,
        timeout=httpx.Timeout(
            settings.letta_client_read_timeout_seconds,
            connect=5.0,
        ),
        max_retries=0,
    )
