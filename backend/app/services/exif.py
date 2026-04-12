import io
import logging
from datetime import datetime
from pathlib import Path

from PIL import Image
from PIL.ExifTags import TAGS, GPSTAGS
import pillow_heif

pillow_heif.register_heif_opener()

logger = logging.getLogger(__name__)


def _get_exif_data(image: Image.Image) -> dict:
    exif_data = {}
    try:
        info = image.getexif()
    except Exception:
        return exif_data

    if not info:
        return exif_data

    for tag_id, value in info.items():
        tag = TAGS.get(tag_id, tag_id)
        exif_data[tag] = value

    try:
        ifd = info.get_ifd(0x8825)
        if ifd:
            gps_data = {}
            for tag_id, value in ifd.items():
                tag = GPSTAGS.get(tag_id, tag_id)
                gps_data[tag] = value
            exif_data["GPSInfo"] = gps_data
    except Exception as e:
        logger.warning("Failed to read GPS IFD: %s", e)

    return exif_data


def _convert_to_degrees(value) -> float:
    d, m, s = value
    return float(d) + float(m) / 60.0 + float(s) / 3600.0


def extract_gps(exif_data: dict) -> tuple[float | None, float | None]:
    gps_info = exif_data.get("GPSInfo")
    if not gps_info:
        return None, None

    lat = gps_info.get("GPSLatitude")
    lat_ref = gps_info.get("GPSLatitudeRef")
    lon = gps_info.get("GPSLongitude")
    lon_ref = gps_info.get("GPSLongitudeRef")

    if not all([lat, lat_ref, lon, lon_ref]):
        return None, None

    try:
        latitude = _convert_to_degrees(lat)
        if lat_ref == "S":
            latitude = -latitude

        longitude = _convert_to_degrees(lon)
        if lon_ref == "W":
            longitude = -longitude

        if -90 <= latitude <= 90 and -180 <= longitude <= 180:
            return latitude, longitude
    except (TypeError, ValueError) as e:
        logger.warning("GPS conversion error: %s", e)

    return None, None


def extract_datetime(exif_data: dict) -> datetime | None:
    for tag in ("DateTimeOriginal", "DateTimeDigitized", "DateTime"):
        dt_str = exif_data.get(tag)
        if dt_str:
            try:
                return datetime.strptime(str(dt_str), "%Y:%m:%d %H:%M:%S")
            except ValueError:
                continue
    return None


def extract_metadata_from_bytes(file_bytes: bytes) -> dict:
    """Extract EXIF metadata from raw bytes — BEFORE any conversion.

    This is critical for HEIC files: converting HEIC to JPEG strips GPS data,
    so we must read EXIF from the original bytes.
    """
    try:
        image = Image.open(io.BytesIO(file_bytes))
        exif_data = _get_exif_data(image)
        latitude, longitude = extract_gps(exif_data)
        taken_at = extract_datetime(exif_data)

        logger.info(
            "EXIF extracted: lat=%s, lon=%s, date=%s, GPS keys=%s",
            latitude, longitude, taken_at,
            list(exif_data.get("GPSInfo", {}).keys()) if exif_data.get("GPSInfo") else "none",
        )

        return {
            "latitude": latitude,
            "longitude": longitude,
            "taken_at": taken_at,
            "width": image.width,
            "height": image.height,
        }
    except Exception as e:
        logger.error("Failed to extract EXIF: %s", e)
        return {
            "latitude": None,
            "longitude": None,
            "taken_at": None,
            "width": 0,
            "height": 0,
        }
