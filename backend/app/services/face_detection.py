import logging
import uuid
import numpy as np
from pathlib import Path
from PIL import Image

from ..config import settings

logger = logging.getLogger(__name__)

_app = None


def _get_app():
    global _app
    if _app is None:
        try:
            import insightface
            _app = insightface.app.FaceAnalysis(
                name="buffalo_l",
                providers=["CPUExecutionProvider"],
            )
            _app.prepare(ctx_id=0, det_size=(640, 640))
            logger.info("InsightFace model loaded successfully")
        except Exception as e:
            logger.error("Failed to load InsightFace: %s", e)
            return None
    return _app


def detect_faces(image_path: str | Path) -> list[dict]:
    """Detect faces in an image, returning bboxes, embeddings, and crops."""
    app = _get_app()
    if app is None:
        return []

    try:
        img = Image.open(image_path).convert("RGB")
        img_array = np.array(img)

        # InsightFace expects BGR
        img_bgr = img_array[:, :, ::-1]
        detected = app.get(img_bgr)

        results = []
        for face in detected:
            bbox = face.bbox.astype(int)
            x1, y1, x2, y2 = bbox
            x1, y1 = max(0, x1), max(0, y1)
            x2, y2 = min(img.width, x2), min(img.height, y2)

            if x2 - x1 < 20 or y2 - y1 < 20:
                continue

            crop = img.crop((x1, y1, x2, y2))
            crop = crop.resize((settings.face_crop_size, settings.face_crop_size), Image.LANCZOS)

            crop_name = f"face_{uuid.uuid4().hex}.jpg"
            crop_dest = Path(settings.face_crop_path) / crop_name
            crop.save(crop_dest, "JPEG", quality=90)

            embedding = face.embedding
            embedding_bytes = embedding.astype(np.float32).tobytes()

            results.append({
                "bbox_x": float(x1) / img.width,
                "bbox_y": float(y1) / img.height,
                "bbox_w": float(x2 - x1) / img.width,
                "bbox_h": float(y2 - y1) / img.height,
                "confidence": float(face.det_score),
                "embedding": embedding_bytes,
                "crop_path": crop_name,
            })

        logger.info("Detected %d faces in %s", len(results), image_path)
        return results

    except Exception as e:
        logger.error("Face detection failed for %s: %s", image_path, e)
        return []


def embedding_from_bytes(data: bytes) -> np.ndarray:
    return np.frombuffer(data, dtype=np.float32)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def find_matching_person(
    embedding_bytes: bytes,
    known_people: list[dict],
    threshold: float | None = None,
) -> int | None:
    """Compare a face embedding against known people's average embeddings.
    known_people: [{"person_id": int, "embeddings": [bytes, ...]}]
    Returns person_id if match found, else None.
    """
    if threshold is None:
        threshold = settings.face_similarity_threshold

    emb = embedding_from_bytes(embedding_bytes)
    best_score = 0.0
    best_person_id = None

    for person in known_people:
        for known_bytes in person["embeddings"]:
            known_emb = embedding_from_bytes(known_bytes)
            score = cosine_similarity(emb, known_emb)
            if score > best_score:
                best_score = score
                best_person_id = person["person_id"]

    if best_score >= threshold and best_person_id is not None:
        logger.info("Face matched person %d with score %.3f", best_person_id, best_score)
        return best_person_id

    return None


def cluster_faces(face_data: list[dict], threshold: float | None = None) -> list[list[int]]:
    """Cluster unidentified faces by similarity.
    face_data: [{"face_id": int, "embedding": bytes}]
    Returns groups of face_ids.
    """
    if threshold is None:
        threshold = settings.face_similarity_threshold

    if not face_data:
        return []

    embeddings = [embedding_from_bytes(f["embedding"]) for f in face_data]
    face_ids = [f["face_id"] for f in face_data]
    assigned = [False] * len(face_data)
    groups = []

    for i in range(len(face_data)):
        if assigned[i]:
            continue
        group = [face_ids[i]]
        assigned[i] = True

        for j in range(i + 1, len(face_data)):
            if assigned[j]:
                continue
            score = cosine_similarity(embeddings[i], embeddings[j])
            if score >= threshold:
                group.append(face_ids[j])
                assigned[j] = True

        groups.append(group)

    groups.sort(key=len, reverse=True)
    return groups
