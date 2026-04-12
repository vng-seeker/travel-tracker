import uuid
from pathlib import Path

from PIL import Image
import pillow_heif

from ..config import settings

pillow_heif.register_heif_opener()

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"}


def validate_extension(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


def save_photo(file_bytes: bytes, original_name: str) -> str:
    ext = Path(original_name).suffix.lower()
    if ext in (".heic", ".heif"):
        ext = ".jpg"
    unique_name = f"{uuid.uuid4().hex}{ext}"
    dest = Path(settings.photo_storage_path) / unique_name
    dest.write_bytes(file_bytes)

    if Path(original_name).suffix.lower() in (".heic", ".heif"):
        _convert_heic_to_jpeg(dest)

    return unique_name


def _convert_heic_to_jpeg(path: Path):
    img = Image.open(path)
    img = img.convert("RGB")
    img.save(path, "JPEG", quality=92)


def generate_thumbnail(photo_filename: str) -> str:
    source = Path(settings.photo_storage_path) / photo_filename
    thumb_name = f"thumb_{photo_filename}"
    thumb_ext = Path(thumb_name).suffix.lower()
    if thumb_ext not in (".jpg", ".jpeg", ".png", ".webp"):
        thumb_name = f"thumb_{Path(photo_filename).stem}.jpg"

    dest = Path(settings.thumbnail_storage_path) / thumb_name

    img = Image.open(source)
    img = img.convert("RGB")

    ratio = settings.thumbnail_width / img.width
    new_height = int(img.height * ratio)
    img = img.resize((settings.thumbnail_width, new_height), Image.LANCZOS)
    img.save(dest, "JPEG", quality=85)

    return thumb_name
