from datetime import datetime, date
from sqlalchemy import (
    Integer, String, Float, DateTime, Date, Text, LargeBinary,
    ForeignKey, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .database import Base


class Trip(Base):
    __tablename__ = "trips"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    country: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    center_lat: Mapped[float] = mapped_column(Float, default=20.0)
    center_lng: Mapped[float] = mapped_column(Float, default=0.0)
    center_zoom: Mapped[int] = mapped_column(Integer, default=6)
    cover_photo_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    photos: Mapped[list["Photo"]] = relationship("Photo", back_populates="trip", cascade="all, delete-orphan")
    summaries: Mapped[list["DaySummary"]] = relationship("DaySummary", back_populates="trip", cascade="all, delete-orphan")
    people: Mapped[list["Person"]] = relationship("Person", back_populates="trip", cascade="all, delete-orphan")
    saved_albums: Mapped[list["SavedAlbum"]] = relationship("SavedAlbum", back_populates="trip", cascade="all, delete-orphan")


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    trip_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("trips.id"), nullable=True, index=True)
    filename: Mapped[str] = mapped_column(String(255), unique=True)
    original_name: Mapped[str] = mapped_column(String(255))
    taken_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ai_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    thumbnail_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    processing_status: Mapped[str] = mapped_column(String(20), default="done")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    trip: Mapped["Trip | None"] = relationship("Trip", back_populates="photos")
    faces: Mapped[list["Face"]] = relationship("Face", back_populates="photo", cascade="all, delete-orphan")


class DaySummary(Base):
    __tablename__ = "day_summaries"
    __table_args__ = (UniqueConstraint("trip_id", "day", name="uq_trip_day"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    trip_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("trips.id"), nullable=True, index=True)
    day: Mapped[date] = mapped_column(Date)
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    highlights: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    trip: Mapped["Trip | None"] = relationship("Trip", back_populates="summaries")


class SavedAlbum(Base):
    __tablename__ = "saved_albums"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    trip_id: Mapped[int] = mapped_column(Integer, ForeignKey("trips.id"), index=True)
    title: Mapped[str] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    photo_ids_json: Mapped[str] = mapped_column(Text)
    photo_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    trip: Mapped["Trip"] = relationship("Trip", back_populates="saved_albums")


class Person(Base):
    __tablename__ = "people"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    trip_id: Mapped[int] = mapped_column(Integer, ForeignKey("trips.id"), index=True)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    trip: Mapped["Trip"] = relationship("Trip", back_populates="people")
    faces: Mapped[list["Face"]] = relationship("Face", back_populates="person")


class Face(Base):
    __tablename__ = "faces"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    photo_id: Mapped[int] = mapped_column(Integer, ForeignKey("photos.id", ondelete="CASCADE"), index=True)
    person_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("people.id", ondelete="SET NULL"), nullable=True, index=True)
    embedding: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)
    crop_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    bbox_x: Mapped[float] = mapped_column(Float, default=0)
    bbox_y: Mapped[float] = mapped_column(Float, default=0)
    bbox_w: Mapped[float] = mapped_column(Float, default=0)
    bbox_h: Mapped[float] = mapped_column(Float, default=0)
    confidence: Mapped[float] = mapped_column(Float, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    photo: Mapped["Photo"] = relationship("Photo", back_populates="faces")
    person: Mapped["Person | None"] = relationship("Person", back_populates="faces")
