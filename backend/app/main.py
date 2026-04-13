import asyncio
import logging
from datetime import date
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, text

from .config import settings
from .database import Base, engine, get_db, SessionLocal
from .models import Trip, Photo, DaySummary, Person, Face, SavedAlbum
from .schemas import (
    TripCreate, TripUpdate, TripOut,
    PhotoOut, PhotoUploadResponse, PhotoUpdate,
    BulkDeleteRequest,
    DaySummaryOut, DaySummaryUpdate, GenerateSummaryRequest, TripStatsOut,
    PersonCreate, PersonOut, FaceOut, AssignFacesRequest, FaceGroupOut,
    AlbumGenerateRequest, AlbumOut,
    AlbumSaveRequest, SavedAlbumSummary, SavedAlbumFull,
    AppSettingsOut, AppSettingsUpdate,
)
from .services.photos import validate_extension, save_photo, generate_thumbnail
from .services.exif import extract_metadata_from_bytes
from .services.ai_analyzer import analyze_photo, generate_day_summary, generate_album_selection, TripContext
from .services.geocoding import reverse_geocode, forward_geocode, geocode_country
from .services.face_detection import detect_faces, find_matching_person, cluster_faces

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_processing_queue: asyncio.Queue = asyncio.Queue()

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Travel Tracker", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/photos", StaticFiles(directory=settings.photo_storage_path), name="photos")
app.mount("/thumbnails", StaticFiles(directory=settings.thumbnail_storage_path), name="thumbnails")
app.mount("/face_crops", StaticFiles(directory=settings.face_crop_path), name="face_crops")


def _run_migration():  # noqa: C901
    """Add trip_id columns to existing tables and migrate orphaned data."""
    with engine.connect() as conn:
        result = conn.execute(text("PRAGMA table_info(photos)"))
        columns = [row[1] for row in result]
        if "trip_id" not in columns:
            conn.execute(text("ALTER TABLE photos ADD COLUMN trip_id INTEGER REFERENCES trips(id)"))
            logger.info("Added trip_id column to photos")
        if "processing_status" not in columns:
            conn.execute(text("ALTER TABLE photos ADD COLUMN processing_status VARCHAR(20) DEFAULT 'done'"))
            logger.info("Added processing_status column to photos")
        result2 = conn.execute(text("PRAGMA table_info(day_summaries)"))
        columns2 = [row[1] for row in result2]
        if "trip_id" not in columns2:
            conn.execute(text("ALTER TABLE day_summaries ADD COLUMN trip_id INTEGER REFERENCES trips(id)"))
            logger.info("Added trip_id column to day_summaries")
        # Trip new columns
        result_trips = conn.execute(text("PRAGMA table_info(trips)"))
        trip_cols = [row[1] for row in result_trips]
        for col, sql in [
            ("start_date", "ALTER TABLE trips ADD COLUMN start_date DATE"),
            ("end_date", "ALTER TABLE trips ADD COLUMN end_date DATE"),
            ("travel_style", "ALTER TABLE trips ADD COLUMN travel_style VARCHAR(100)"),
            ("ai_context", "ALTER TABLE trips ADD COLUMN ai_context TEXT"),
            ("language", "ALTER TABLE trips ADD COLUMN language VARCHAR(10) DEFAULT 'fr'"),
        ]:
            if col not in trip_cols:
                conn.execute(text(sql))
                logger.info("Added %s column to trips", col)

        # Person new columns
        result_people = conn.execute(text("PRAGMA table_info(people)"))
        people_cols = [row[1] for row in result_people]
        for col, sql in [
            ("role", "ALTER TABLE people ADD COLUMN role VARCHAR(255)"),
            ("description", "ALTER TABLE people ADD COLUMN description TEXT"),
        ]:
            if col not in people_cols:
                conn.execute(text(sql))
                logger.info("Added %s column to people", col)

        conn.commit()

    with SessionLocal() as db:
        orphan_count = db.query(Photo).filter(Photo.trip_id.is_(None)).count()
        trip_count = db.query(Trip).count()
        if orphan_count > 0 and trip_count == 0:
            trip = Trip(name="Vietnam", country="Vietnam", center_lat=16.0, center_lng=107.0, center_zoom=6)
            db.add(trip)
            db.commit()
            db.query(Photo).filter(Photo.trip_id.is_(None)).update({"trip_id": trip.id})
            db.query(DaySummary).filter(DaySummary.trip_id.is_(None)).update({"trip_id": trip.id})
            db.commit()
            logger.info("Migrated %d orphan photos to trip '%s'", orphan_count, trip.name)


async def _process_single_photo(photo_id: int):
    """Background: AI analysis, geocoding, face detection for one photo."""
    with SessionLocal() as db:
        photo = db.query(Photo).filter(Photo.id == photo_id).first()
        if not photo or photo.processing_status not in ("pending", "processing"):
            return

        photo.processing_status = "processing"
        db.commit()

        trip = db.query(Trip).filter(Trip.id == photo.trip_id).first()
        photo_path = Path(settings.photo_storage_path) / photo.filename
        ctx = _build_trip_context(trip, db) if trip else TripContext()

        try:
            ai_result = await analyze_photo(photo_path, ctx=ctx)

            if ai_result.get("location_guess"):
                if not photo.location_name:
                    photo.location_name = ai_result["location_guess"]
                if not photo.latitude or not photo.longitude:
                    lat, lng = await forward_geocode(ai_result["location_guess"], country)
                    if lat and lng:
                        photo.latitude = lat
                        photo.longitude = lng

            photo.category = ai_result.get("category", "autre")
            photo.ai_description = ai_result.get("description", "")

            detected_faces = detect_faces(photo_path)
            known_people = _get_known_embeddings(db, photo.trip_id)
            for fd in detected_faces:
                person_id = find_matching_person(fd["embedding"], known_people) if known_people else None
                face = Face(
                    photo_id=photo.id,
                    person_id=person_id,
                    embedding=fd["embedding"],
                    crop_path=fd["crop_path"],
                    bbox_x=fd["bbox_x"],
                    bbox_y=fd["bbox_y"],
                    bbox_w=fd["bbox_w"],
                    bbox_h=fd["bbox_h"],
                    confidence=fd["confidence"],
                )
                db.add(face)

            photo.processing_status = "done"
            db.commit()
            logger.info("Processed photo %d (%s)", photo.id, photo.original_name)

        except Exception as e:
            logger.error("Error processing photo %d: %s", photo.id, e)
            photo.processing_status = "error"
            db.commit()


async def _photo_processing_worker():
    """Background loop that processes photos from the queue one at a time."""
    logger.info("Photo processing worker started")
    while True:
        photo_id = await _processing_queue.get()
        try:
            await _process_single_photo(photo_id)
        except Exception as e:
            logger.error("Unexpected worker error for photo %d: %s", photo_id, e)
        finally:
            _processing_queue.task_done()


@app.on_event("startup")
async def on_startup():
    _run_migration()
    # Re-queue photos that were left pending/processing (e.g. after restart)
    with SessionLocal() as db:
        stuck = db.query(Photo).filter(Photo.processing_status.in_(["pending", "processing"])).all()
        for p in stuck:
            await _processing_queue.put(p.id)
        if stuck:
            logger.info("Re-queued %d stuck photos for processing", len(stuck))
    asyncio.create_task(_photo_processing_worker())


# ── Health ──────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok"}


# ── Settings ─────────────────────────────────────────────

@app.get("/api/settings", response_model=AppSettingsOut)
async def get_settings():
    return AppSettingsOut(
        ai_provider=settings.ai_provider,
        ollama_base_url=settings.ollama_base_url,
        ollama_model=settings.ollama_model,
        claude_model=settings.claude_model,
    )


@app.patch("/api/settings", response_model=AppSettingsOut)
async def update_settings(payload: AppSettingsUpdate):
    if payload.ai_provider is not None:
        if payload.ai_provider not in ("anthropic", "ollama"):
            raise HTTPException(status_code=400, detail="ai_provider doit être 'anthropic' ou 'ollama'")
        settings.ai_provider = payload.ai_provider
    if payload.ollama_base_url is not None:
        settings.ollama_base_url = payload.ollama_base_url.rstrip("/")
    if payload.ollama_model is not None:
        settings.ollama_model = payload.ollama_model
    logger.info("Settings updated: provider=%s, ollama_url=%s, ollama_model=%s",
                settings.ai_provider, settings.ollama_base_url, settings.ollama_model)
    return AppSettingsOut(
        ai_provider=settings.ai_provider,
        ollama_base_url=settings.ollama_base_url,
        ollama_model=settings.ollama_model,
        claude_model=settings.claude_model,
    )


@app.get("/api/settings/ollama-status")
async def check_ollama_status():
    """Check if Ollama is reachable and list available models."""
    import httpx
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{settings.ollama_base_url}/api/tags")
            resp.raise_for_status()
            data = resp.json()
            models = [m["name"] for m in data.get("models", [])]
            current_available = any(
                settings.ollama_model in m for m in models
            )
            return {
                "status": "connected",
                "models": models,
                "current_model": settings.ollama_model,
                "current_model_available": current_available,
            }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e),
            "models": [],
            "current_model": settings.ollama_model,
            "current_model_available": False,
        }


# ── Trips CRUD ──────────────────────────────────────────

def _build_trip_context(trip: Trip, db: Session) -> TripContext:
    people = db.query(Person).filter(Person.trip_id == trip.id).all()
    people_dicts = [
        {"name": p.name, "role": p.role, "description": p.description}
        for p in people
    ] if people else None
    return TripContext(
        country=trip.country,
        travel_style=trip.travel_style,
        ai_context=trip.ai_context,
        language=trip.language or "fr",
        people=people_dicts,
    )


def _enrich_trip(trip: Trip, db: Session) -> dict:
    photo_count = db.query(func.count(Photo.id)).filter(Photo.trip_id == trip.id).scalar() or 0
    min_d = db.query(func.min(Photo.taken_at)).filter(Photo.trip_id == trip.id).scalar()
    max_d = db.query(func.max(Photo.taken_at)).filter(Photo.trip_id == trip.id).scalar()
    data = TripOut.model_validate(trip).model_dump()
    data["photo_count"] = photo_count
    data["date_range_start"] = str(min_d.date()) if min_d else None
    data["date_range_end"] = str(max_d.date()) if max_d else None
    return data


@app.post("/api/trips", response_model=TripOut)
async def create_trip(payload: TripCreate, db: Session = Depends(get_db)):
    lat, lng, zoom = await geocode_country(payload.country)
    trip = Trip(
        name=payload.name,
        country=payload.country,
        start_date=payload.start_date,
        end_date=payload.end_date,
        travel_style=payload.travel_style,
        ai_context=payload.ai_context,
        language=payload.language,
        center_lat=lat,
        center_lng=lng,
        center_zoom=zoom,
    )
    db.add(trip)
    db.commit()
    db.refresh(trip)
    return _enrich_trip(trip, db)


@app.get("/api/trips", response_model=list[TripOut])
async def list_trips(db: Session = Depends(get_db)):
    trips = db.query(Trip).order_by(Trip.created_at.desc()).all()
    return [_enrich_trip(t, db) for t in trips]


@app.get("/api/trips/{trip_id}", response_model=TripOut)
async def get_trip(trip_id: int, db: Session = Depends(get_db)):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Voyage non trouvé")
    return _enrich_trip(trip, db)


@app.put("/api/trips/{trip_id}", response_model=TripOut)
async def update_trip(trip_id: int, payload: TripUpdate, db: Session = Depends(get_db)):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Voyage non trouvé")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(trip, field, value)
    db.commit()
    db.refresh(trip)
    return _enrich_trip(trip, db)


@app.delete("/api/trips/{trip_id}")
async def delete_trip(trip_id: int, db: Session = Depends(get_db)):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Voyage non trouvé")
    for photo in trip.photos:
        _delete_photo_files(photo)
    db.delete(trip)
    db.commit()
    return {"message": f"Voyage '{trip.name}' supprimé"}


# ── Photos (scoped by trip) ─────────────────────────────

def _delete_photo_files(photo: Photo):
    photo_path = Path(settings.photo_storage_path) / photo.filename
    if photo_path.exists():
        photo_path.unlink()
    if photo.thumbnail_path:
        thumb_path = Path(settings.thumbnail_storage_path) / photo.thumbnail_path
        if thumb_path.exists():
            thumb_path.unlink()
    for face in photo.faces:
        if face.crop_path:
            crop_path = Path(settings.face_crop_path) / face.crop_path
            if crop_path.exists():
                crop_path.unlink()


@app.post("/api/trips/{trip_id}/photos/upload", response_model=PhotoUploadResponse)
async def upload_photo(
    trip_id: int,
    file: UploadFile = File(...),
    skip_ai: bool = False,
    db: Session = Depends(get_db),
):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Voyage non trouvé")

    if not file.filename or not validate_extension(file.filename):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Type de fichier non supporté")

    contents = await file.read()
    if len(contents) > settings.max_file_size:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Fichier trop volumineux")

    metadata = extract_metadata_from_bytes(contents)
    filename = save_photo(contents, file.filename)
    photo_path = Path(settings.photo_storage_path) / filename
    thumbnail_name = generate_thumbnail(filename)

    latitude = metadata["latitude"]
    longitude = metadata["longitude"]
    location_name = None
    if latitude and longitude:
        location_name = await reverse_geocode(latitude, longitude)

    photo = Photo(
        trip_id=trip_id,
        filename=filename,
        original_name=file.filename,
        taken_at=metadata["taken_at"],
        latitude=latitude,
        longitude=longitude,
        location_name=location_name,
        thumbnail_path=thumbnail_name,
        processing_status="done" if skip_ai else "pending",
    )
    db.add(photo)
    db.commit()
    db.refresh(photo)

    if not trip.cover_photo_id:
        trip.cover_photo_id = photo.id
        db.commit()

    if skip_ai:
        # Local-only: run face detection (local) but skip LLM calls
        try:
            detected_faces = detect_faces(photo_path)
            known_people = _get_known_embeddings(db, trip_id)
            for fd in detected_faces:
                person_id = find_matching_person(fd["embedding"], known_people) if known_people else None
                face = Face(
                    photo_id=photo.id,
                    person_id=person_id,
                    embedding=fd["embedding"],
                    crop_path=fd["crop_path"],
                    bbox_x=fd["bbox_x"],
                    bbox_y=fd["bbox_y"],
                    bbox_w=fd["bbox_w"],
                    bbox_h=fd["bbox_h"],
                    confidence=fd["confidence"],
                )
                db.add(face)
            db.commit()
        except Exception as e:
            logger.warning("Face detection failed for %s: %s", photo.original_name, e)

        return PhotoUploadResponse(photo=PhotoOut.model_validate(photo), message="Photo enregistrée (mode local)")

    await _processing_queue.put(photo.id)
    return PhotoUploadResponse(photo=PhotoOut.model_validate(photo), message="Photo enregistrée, analyse en cours")


@app.post("/api/trips/{trip_id}/photos/analyze-pending")
async def analyze_pending_photos(trip_id: int, db: Session = Depends(get_db)):
    """Queue all photos without AI analysis for background processing."""
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Voyage non trouvé")

    unanalyzed = db.query(Photo).filter(
        Photo.trip_id == trip_id,
        Photo.processing_status == "done",
        Photo.ai_description.is_(None),
    ).all()

    count = 0
    for p in unanalyzed:
        p.processing_status = "pending"
        count += 1
    db.commit()

    for p in unanalyzed:
        await _processing_queue.put(p.id)

    return {"message": f"{count} photo(s) envoyée(s) pour analyse IA", "count": count}


@app.get("/api/trips/{trip_id}/photos/processing-status")
async def get_processing_status(trip_id: int, db: Session = Depends(get_db)):
    pending = db.query(func.count(Photo.id)).filter(
        Photo.trip_id == trip_id, Photo.processing_status.in_(["pending", "processing"])
    ).scalar() or 0
    total = db.query(func.count(Photo.id)).filter(Photo.trip_id == trip_id).scalar() or 0
    done = db.query(func.count(Photo.id)).filter(
        Photo.trip_id == trip_id, Photo.processing_status == "done"
    ).scalar() or 0
    errors = db.query(func.count(Photo.id)).filter(
        Photo.trip_id == trip_id, Photo.processing_status == "error"
    ).scalar() or 0
    return {"pending": pending, "done": done, "errors": errors, "total": total}


def _get_known_embeddings(db: Session, trip_id: int) -> list[dict]:
    people = db.query(Person).filter(Person.trip_id == trip_id).all()
    result = []
    for person in people:
        embeddings = [f.embedding for f in person.faces if f.embedding]
        if embeddings:
            result.append({"person_id": person.id, "embeddings": embeddings})
    return result


@app.get("/api/trips/{trip_id}/photos", response_model=list[PhotoOut])
async def list_photos(
    trip_id: int,
    limit: int = 200,
    offset: int = 0,
    category: str | None = None,
    day: date | None = None,
    person_id: int | None = None,
    db: Session = Depends(get_db),
):
    limit = min(limit, 500)
    query = db.query(Photo).filter(Photo.trip_id == trip_id)

    if category:
        query = query.filter(Photo.category == category)
    if day:
        query = query.filter(func.date(Photo.taken_at) == day)
    if person_id:
        photo_ids = [f.photo_id for f in db.query(Face.photo_id).filter(Face.person_id == person_id).all()]
        query = query.filter(Photo.id.in_(photo_ids))

    return [
        PhotoOut.model_validate(p)
        for p in query.order_by(Photo.taken_at.asc().nullslast()).offset(offset).limit(limit).all()
    ]


@app.get("/api/photos/{photo_id}", response_model=PhotoOut)
async def get_photo(photo_id: int, db: Session = Depends(get_db)):
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo non trouvée")
    return PhotoOut.model_validate(photo)


@app.delete("/api/photos/{photo_id}")
async def delete_photo(photo_id: int, db: Session = Depends(get_db)):
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo non trouvée")
    _delete_photo_files(photo)
    db.delete(photo)
    db.commit()
    return {"message": "Photo supprimée"}


@app.post("/api/photos/bulk-delete")
async def bulk_delete_photos(request: BulkDeleteRequest, db: Session = Depends(get_db)):
    if len(request.ids) > 200:
        raise HTTPException(status_code=400, detail="Maximum 200 photos à la fois")
    photos = db.query(Photo).filter(Photo.id.in_(request.ids)).all()
    deleted = 0
    for photo in photos:
        _delete_photo_files(photo)
        db.delete(photo)
        deleted += 1
    db.commit()
    return {"message": f"{deleted} photo(s) supprimée(s)", "deleted": deleted}


@app.patch("/api/photos/{photo_id}", response_model=PhotoOut)
async def update_photo(photo_id: int, payload: PhotoUpdate, db: Session = Depends(get_db)):
    photo = db.query(Photo).filter(Photo.id == photo_id).first()
    if not photo:
        raise HTTPException(status_code=404, detail="Photo non trouvée")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(photo, field, value)
    db.commit()
    db.refresh(photo)
    return PhotoOut.model_validate(photo)


# ── Days & Summaries (scoped by trip) ───────────────────

@app.get("/api/trips/{trip_id}/days")
async def list_days(trip_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(func.date(Photo.taken_at).label("day"), func.count(Photo.id).label("count"))
        .filter(Photo.trip_id == trip_id, Photo.taken_at.isnot(None))
        .group_by(func.date(Photo.taken_at))
        .order_by(func.date(Photo.taken_at).asc())
        .all()
    )
    days = []
    for row in rows:
        summary = db.query(DaySummary).filter(DaySummary.trip_id == trip_id, DaySummary.day == row.day).first()
        days.append({
            "day": row.day,
            "photo_count": row.count,
            "has_summary": summary is not None,
            "summary": summary.ai_summary if summary else None,
            "summary_id": summary.id if summary else None,
        })
    return days


@app.post("/api/trips/{trip_id}/summaries/generate", response_model=DaySummaryOut)
async def generate_summary(trip_id: int, request: GenerateSummaryRequest, db: Session = Depends(get_db)):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Voyage non trouvé")

    photos = (
        db.query(Photo)
        .filter(Photo.trip_id == trip_id, func.date(Photo.taken_at) == request.day)
        .order_by(Photo.taken_at.asc())
        .all()
    )
    if not photos:
        raise HTTPException(status_code=404, detail="Aucune photo pour cette date")

    descriptions = [p.ai_description for p in photos if p.ai_description]
    if not descriptions:
        raise HTTPException(status_code=400, detail="Aucune description disponible")

    ctx = _build_trip_context(trip, db)
    result = await generate_day_summary(str(request.day), descriptions, ctx=ctx)

    existing = db.query(DaySummary).filter(DaySummary.trip_id == trip_id, DaySummary.day == request.day).first()
    if existing:
        existing.ai_summary = result.get("summary", "")
        existing.highlights = result.get("highlights", "")
        db.commit()
        db.refresh(existing)
        return DaySummaryOut.model_validate(existing)

    summary = DaySummary(trip_id=trip_id, day=request.day, ai_summary=result.get("summary", ""), highlights=result.get("highlights", ""))
    db.add(summary)
    db.commit()
    db.refresh(summary)
    return DaySummaryOut.model_validate(summary)


@app.patch("/api/summaries/{summary_id}", response_model=DaySummaryOut)
async def update_summary(summary_id: int, payload: DaySummaryUpdate, db: Session = Depends(get_db)):
    summary = db.query(DaySummary).filter(DaySummary.id == summary_id).first()
    if not summary:
        raise HTTPException(status_code=404, detail="Résumé non trouvé")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(summary, field, value)
    db.commit()
    db.refresh(summary)
    return DaySummaryOut.model_validate(summary)


@app.get("/api/trips/{trip_id}/stats", response_model=TripStatsOut)
async def get_stats(trip_id: int, db: Session = Depends(get_db)):
    total_photos = db.query(func.count(Photo.id)).filter(Photo.trip_id == trip_id).scalar() or 0
    total_days = (
        db.query(func.count(distinct(func.date(Photo.taken_at))))
        .filter(Photo.trip_id == trip_id, Photo.taken_at.isnot(None))
        .scalar() or 0
    )
    cat_rows = db.query(Photo.category, func.count(Photo.id)).filter(Photo.trip_id == trip_id).group_by(Photo.category).all()
    categories = {cat or "autre": count for cat, count in cat_rows}
    min_date = db.query(func.min(Photo.taken_at)).filter(Photo.trip_id == trip_id).scalar()
    max_date = db.query(func.max(Photo.taken_at)).filter(Photo.trip_id == trip_id).scalar()
    return TripStatsOut(
        total_photos=total_photos,
        total_days=total_days,
        categories=categories,
        date_range={
            "start": str(min_date.date()) if min_date else None,
            "end": str(max_date.date()) if max_date else None,
        },
    )


# ── Album ────────────────────────────────────────────────

@app.post("/api/trips/{trip_id}/album/generate", response_model=AlbumOut)
async def generate_album(trip_id: int, request: AlbumGenerateRequest, db: Session = Depends(get_db)):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Voyage non trouvé")

    count = max(1, min(request.count, 100))

    photos = (
        db.query(Photo)
        .filter(Photo.trip_id == trip_id)
        .order_by(Photo.taken_at.asc().nullslast())
        .all()
    )
    if not photos:
        raise HTTPException(status_code=400, detail="Aucune photo dans ce voyage")

    if count >= len(photos):
        return AlbumOut(
            album_title=f"{trip.name} — L'intégrale",
            album_description=f"Toutes les {len(photos)} photos de votre voyage en/au {trip.country}.",
            photos=[PhotoOut.model_validate(p) for p in photos],
        )

    photos_info = [
        {
            "id": p.id,
            "taken_at": str(p.taken_at.date()) if p.taken_at else None,
            "category": p.category,
            "location_name": p.location_name,
            "ai_description": p.ai_description,
        }
        for p in photos
    ]

    ctx = _build_trip_context(trip, db)
    result = await generate_album_selection(count, photos_info, ctx=ctx)
    selected_ids = result.get("selected_ids", [])

    if not selected_ids:
        selected_ids = [p.id for p in photos[:count]]

    id_order = {pid: idx for idx, pid in enumerate(selected_ids)}
    selected = db.query(Photo).filter(Photo.id.in_(selected_ids)).all()
    selected.sort(key=lambda p: id_order.get(p.id, 999))

    return AlbumOut(
        album_title=result.get("album_title", f"Album — {trip.name}"),
        album_description=result.get("album_description", ""),
        photos=[PhotoOut.model_validate(p) for p in selected],
    )


# ── Saved Albums ─────────────────────────────────────────

@app.post("/api/trips/{trip_id}/albums", response_model=SavedAlbumSummary)
async def save_album(trip_id: int, request: AlbumSaveRequest, db: Session = Depends(get_db)):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Voyage non trouvé")

    import json
    album = SavedAlbum(
        trip_id=trip_id,
        title=request.title,
        description=request.description,
        photo_ids_json=json.dumps(request.photo_ids),
        photo_count=len(request.photo_ids),
    )
    db.add(album)
    db.commit()
    db.refresh(album)

    cover = None
    if request.photo_ids:
        first_photo = db.query(Photo).filter(Photo.id == request.photo_ids[0]).first()
        if first_photo and first_photo.thumbnail_path:
            cover = first_photo.thumbnail_path

    data = SavedAlbumSummary.model_validate(album).model_dump()
    data["cover_thumbnail"] = cover
    return data


@app.get("/api/trips/{trip_id}/albums", response_model=list[SavedAlbumSummary])
async def list_saved_albums(trip_id: int, db: Session = Depends(get_db)):
    import json
    albums = db.query(SavedAlbum).filter(SavedAlbum.trip_id == trip_id).order_by(SavedAlbum.created_at.desc()).all()
    result = []
    for album in albums:
        cover = None
        try:
            ids = json.loads(album.photo_ids_json)
            if ids:
                first_photo = db.query(Photo).filter(Photo.id == ids[0]).first()
                if first_photo and first_photo.thumbnail_path:
                    cover = first_photo.thumbnail_path
        except (json.JSONDecodeError, IndexError):
            pass
        data = SavedAlbumSummary.model_validate(album).model_dump()
        data["cover_thumbnail"] = cover
        result.append(data)
    return result


@app.get("/api/albums/{album_id}", response_model=SavedAlbumFull)
async def get_saved_album(album_id: int, db: Session = Depends(get_db)):
    import json
    album = db.query(SavedAlbum).filter(SavedAlbum.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album non trouvé")

    photo_ids = json.loads(album.photo_ids_json)
    id_order = {pid: idx for idx, pid in enumerate(photo_ids)}
    photos = db.query(Photo).filter(Photo.id.in_(photo_ids)).all()
    photos.sort(key=lambda p: id_order.get(p.id, 999))

    return SavedAlbumFull(
        id=album.id,
        title=album.title,
        description=album.description,
        photos=[PhotoOut.model_validate(p) for p in photos],
        created_at=album.created_at,
    )


@app.delete("/api/albums/{album_id}")
async def delete_saved_album(album_id: int, db: Session = Depends(get_db)):
    album = db.query(SavedAlbum).filter(SavedAlbum.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album non trouvé")
    db.delete(album)
    db.commit()
    return {"message": "Album supprimé"}


# ── People & Faces ──────────────────────────────────────

@app.get("/api/trips/{trip_id}/people", response_model=list[PersonOut])
async def list_people(trip_id: int, db: Session = Depends(get_db)):
    people = db.query(Person).filter(Person.trip_id == trip_id).order_by(Person.name).all()
    result = []
    for person in people:
        faces = db.query(Face).filter(Face.person_id == person.id).all()
        photo_ids = set(f.photo_id for f in faces)
        sample_crops = [f.crop_path for f in faces[:5] if f.crop_path]
        data = PersonOut.model_validate(person).model_dump()
        data["face_count"] = len(faces)
        data["photo_count"] = len(photo_ids)
        data["sample_crops"] = sample_crops
        result.append(data)
    return result


@app.post("/api/trips/{trip_id}/people", response_model=PersonOut)
async def create_person(trip_id: int, payload: PersonCreate, db: Session = Depends(get_db)):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Voyage non trouvé")
    person = Person(trip_id=trip_id, name=payload.name, role=payload.role, description=payload.description)
    db.add(person)
    db.commit()
    db.refresh(person)
    data = PersonOut.model_validate(person).model_dump()
    data["face_count"] = 0
    data["photo_count"] = 0
    data["sample_crops"] = []
    return data


@app.put("/api/people/{person_id}", response_model=PersonOut)
async def update_person(person_id: int, payload: PersonCreate, db: Session = Depends(get_db)):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Personne non trouvée")
    person.name = payload.name
    if payload.role is not None:
        person.role = payload.role
    if payload.description is not None:
        person.description = payload.description
    db.commit()
    db.refresh(person)
    faces = db.query(Face).filter(Face.person_id == person.id).all()
    data = PersonOut.model_validate(person).model_dump()
    data["face_count"] = len(faces)
    data["photo_count"] = len(set(f.photo_id for f in faces))
    data["sample_crops"] = [f.crop_path for f in faces[:5] if f.crop_path]
    return data


@app.delete("/api/people/{person_id}")
async def delete_person(person_id: int, db: Session = Depends(get_db)):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Personne non trouvée")
    db.query(Face).filter(Face.person_id == person_id).update({"person_id": None})
    db.delete(person)
    db.commit()
    return {"message": f"Personne '{person.name}' supprimée"}


@app.post("/api/people/{person_id}/assign")
async def assign_faces_to_person(person_id: int, request: AssignFacesRequest, db: Session = Depends(get_db)):
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Personne non trouvée")
    updated = db.query(Face).filter(Face.id.in_(request.face_ids)).update({"person_id": person_id}, synchronize_session="fetch")
    db.commit()
    return {"message": f"{updated} visage(s) assigné(s) à {person.name}"}


@app.get("/api/trips/{trip_id}/faces/unidentified", response_model=list[FaceGroupOut])
async def list_unidentified_faces(trip_id: int, db: Session = Depends(get_db)):
    photo_ids = [p.id for p in db.query(Photo.id).filter(Photo.trip_id == trip_id).all()]
    if not photo_ids:
        return []

    faces = db.query(Face).filter(Face.photo_id.in_(photo_ids), Face.person_id.is_(None)).all()
    if not faces:
        return []

    face_data = [{"face_id": f.id, "embedding": f.embedding} for f in faces if f.embedding]
    groups = cluster_faces(face_data)

    face_map = {f.id: f for f in faces}
    result = []
    for group_ids in groups:
        crops = [face_map[fid].crop_path for fid in group_ids if fid in face_map and face_map[fid].crop_path]
        result.append(FaceGroupOut(
            representative_crop=crops[0] if crops else None,
            face_ids=group_ids,
            crops=crops[:8],
            count=len(group_ids),
        ))
    return result


@app.get("/api/photos/{photo_id}/faces", response_model=list[FaceOut])
async def get_photo_faces(photo_id: int, db: Session = Depends(get_db)):
    faces = db.query(Face).filter(Face.photo_id == photo_id).all()
    result = []
    for f in faces:
        data = FaceOut.model_validate(f).model_dump()
        if f.person:
            data["person_name"] = f.person.name
        result.append(data)
    return result
