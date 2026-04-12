from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    ai_provider: str = "anthropic"
    ollama_base_url: str = "http://host.docker.internal:11434"
    ollama_model: str = "qwen3-vl"
    database_url: str = "sqlite:///./data/travel_tracker.db"
    photo_storage_path: str = "./data/photos"
    thumbnail_storage_path: str = "./data/thumbnails"
    face_crop_path: str = "./data/face_crops"
    max_file_size: int = 20 * 1024 * 1024  # 20 MB
    thumbnail_width: int = 400
    face_crop_size: int = 160
    claude_model: str = "claude-sonnet-4-20250514"
    face_similarity_threshold: float = 0.4

    model_config = {"env_file": ".env"}


settings = Settings()

Path(settings.photo_storage_path).mkdir(parents=True, exist_ok=True)
Path(settings.thumbnail_storage_path).mkdir(parents=True, exist_ok=True)
Path(settings.face_crop_path).mkdir(parents=True, exist_ok=True)
