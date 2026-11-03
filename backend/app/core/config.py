from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

# Repository root: proofline/
PROJECT_ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=PROJECT_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    model_api_key: SecretStr | None = None
    meta_api_base_url: str = "https://api.meta.ai"
    meta_api_timeout_seconds: float = 60.0
    video_analysis_model: str = "muse-spark-1.3"
    video_analysis_endpoint: str = "/v1/responses"
    verification_min_confidence: float = 0.6
    verification_max_follow_ups: int = 3
    # How many AI analyses one worker may start per hour.
    worker_analysis_per_hour: int = 20
    # How many frames are sampled from each Before and After video.
    score_frames_per_video: int = 4
    # How many seconds of the After video are listened to for the challenge code.
    score_audio_seconds: int = 90
    # Whether a worker's own sufficiently strong work is approved automatically.
    self_approve_enabled: bool = True
    self_approve_min_score: int = 80

    # Demo and tests: answer AI calls with built-in sample responses.
    model_mock: bool = False

    # Web security. CORS_ORIGINS is a comma-separated list, for example
    # "http://localhost:5173,https://proofline.example.com". Empty = off.
    cors_origins: str = ""
    rate_limit_enabled: bool = True
    trust_proxy_headers: bool = False
    log_level: str = "INFO"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached application settings."""
    return Settings()
