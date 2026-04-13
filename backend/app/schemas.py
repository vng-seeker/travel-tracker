from datetime import datetime, date
from pydantic import BaseModel, constr


class TripCreate(BaseModel):
    name: constr(min_length=1, max_length=255)
    country: constr(min_length=1, max_length=255)
    start_date: date | None = None
    end_date: date | None = None
    travel_style: str | None = None
    ai_context: str | None = None
    language: str = "fr"


class TripUpdate(BaseModel):
    name: str | None = None
    country: str | None = None
    description: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    travel_style: str | None = None
    ai_context: str | None = None
    language: str | None = None
    center_lat: float | None = None
    center_lng: float | None = None
    center_zoom: int | None = None
    cover_photo_id: int | None = None


class TripOut(BaseModel):
    id: int
    name: str
    country: str
    description: str | None
    start_date: date | None
    end_date: date | None
    travel_style: str | None
    ai_context: str | None
    language: str
    center_lat: float
    center_lng: float
    center_zoom: int
    cover_photo_id: int | None
    created_at: datetime
    photo_count: int = 0
    date_range_start: str | None = None
    date_range_end: str | None = None

    model_config = {"from_attributes": True}


class PhotoOut(BaseModel):
    id: int
    trip_id: int | None
    filename: str
    original_name: str
    taken_at: datetime | None
    latitude: float | None
    longitude: float | None
    location_name: str | None
    category: str | None
    ai_description: str | None
    thumbnail_path: str | None
    processing_status: str = "done"
    created_at: datetime

    model_config = {"from_attributes": True}


class PhotoUploadResponse(BaseModel):
    photo: PhotoOut
    message: str


class PhotoUpdate(BaseModel):
    ai_description: str | None = None
    category: str | None = None
    location_name: str | None = None


class DaySummaryUpdate(BaseModel):
    ai_summary: str | None = None
    highlights: str | None = None


class DaySummaryOut(BaseModel):
    id: int
    trip_id: int | None
    day: date
    ai_summary: str | None
    highlights: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class BulkDeleteRequest(BaseModel):
    ids: list[int]


class GenerateSummaryRequest(BaseModel):
    day: date


class TripStatsOut(BaseModel):
    total_photos: int
    total_days: int
    categories: dict[str, int]
    date_range: dict[str, str | None]


class PersonCreate(BaseModel):
    name: constr(min_length=1, max_length=255)
    role: str | None = None
    description: str | None = None


class PersonOut(BaseModel):
    id: int
    trip_id: int
    name: str
    role: str | None = None
    description: str | None = None
    face_count: int = 0
    photo_count: int = 0
    sample_crops: list[str] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class FaceOut(BaseModel):
    id: int
    photo_id: int
    person_id: int | None
    crop_path: str | None
    bbox_x: float
    bbox_y: float
    bbox_w: float
    bbox_h: float
    confidence: float
    person_name: str | None = None

    model_config = {"from_attributes": True}


class AssignFacesRequest(BaseModel):
    face_ids: list[int]


class FaceGroupOut(BaseModel):
    representative_crop: str | None
    face_ids: list[int]
    crops: list[str]
    count: int


class AlbumGenerateRequest(BaseModel):
    count: int


class AlbumOut(BaseModel):
    album_title: str
    album_description: str
    photos: list[PhotoOut]


class AlbumSaveRequest(BaseModel):
    title: str
    description: str
    photo_ids: list[int]


class SavedAlbumSummary(BaseModel):
    id: int
    trip_id: int
    title: str
    description: str | None
    photo_count: int
    cover_thumbnail: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class SavedAlbumFull(BaseModel):
    id: int
    title: str
    description: str | None
    photos: list[PhotoOut]
    created_at: datetime


class AppSettingsOut(BaseModel):
    ai_provider: str
    ollama_base_url: str
    ollama_model: str
    claude_model: str


class AppSettingsUpdate(BaseModel):
    ai_provider: str | None = None
    ollama_base_url: str | None = None
    ollama_model: str | None = None
