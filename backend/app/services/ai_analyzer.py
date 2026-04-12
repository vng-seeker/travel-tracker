import base64
import io
import json
import asyncio
import logging
import re
from pathlib import Path

import anthropic
import httpx
from PIL import Image

from ..config import settings

logger = logging.getLogger(__name__)

_client: anthropic.AsyncAnthropic | None = None
_ollama_client: httpx.AsyncClient | None = None

MAX_IMAGE_DIMENSION = 1024
MAX_RETRIES = 4
RETRY_BASE_DELAY = 2.0

OLLAMA_VISION_TIMEOUT = 120.0
OLLAMA_TEXT_TIMEOUT = 60.0


# ── Clients ───────────────────────────────────────────────

def _get_anthropic_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    return _client


def _get_ollama_client() -> httpx.AsyncClient:
    global _ollama_client
    if _ollama_client is None:
        _ollama_client = httpx.AsyncClient(timeout=httpx.Timeout(OLLAMA_VISION_TIMEOUT))
    return _ollama_client


# ── Image utils ───────────────────────────────────────────

def _image_to_base64(file_path: str | Path) -> tuple[str, str]:
    path = Path(file_path)
    img = Image.open(path)
    if img.mode in ("RGBA", "P"):
        img = img.convert("RGB")

    w, h = img.size
    if w > MAX_IMAGE_DIMENSION or h > MAX_IMAGE_DIMENSION:
        ratio = min(MAX_IMAGE_DIMENSION / w, MAX_IMAGE_DIMENSION / h)
        img = img.resize((int(w * ratio), int(h * ratio)), Image.LANCZOS)
        logger.info("Resized %s from %dx%d to %dx%d", path.name, w, h, img.width, img.height)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    data = base64.standard_b64encode(buf.getvalue()).decode("utf-8")
    return data, "image/jpeg"


# ── JSON parsing (tolerant) ──────────────────────────────

def _extract_json(raw: str) -> dict:
    """Parse JSON from LLM output, stripping thinking blocks, markdown fences, etc."""
    text = re.sub(r"<think>.*?</think>", "", raw, flags=re.DOTALL).strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise json.JSONDecodeError("No valid JSON found", text, 0)


# ── Anthropic calls ──────────────────────────────────────

async def _call_anthropic_with_retry(create_fn, timeout: float = 45.0):
    for attempt in range(MAX_RETRIES + 1):
        try:
            return await asyncio.wait_for(create_fn(), timeout=timeout)
        except anthropic.RateLimitError as e:
            if attempt >= MAX_RETRIES:
                raise
            delay = RETRY_BASE_DELAY * (2 ** attempt)
            logger.warning("Rate limited (attempt %d/%d), retrying in %.1fs: %s", attempt + 1, MAX_RETRIES, delay, e)
            await asyncio.sleep(delay)


async def _anthropic_vision(image_data: str, media_type: str, prompt: str, max_tokens: int = 500) -> str:
    client = _get_anthropic_client()
    response = await _call_anthropic_with_retry(
        lambda: client.messages.create(
            model=settings.claude_model,
            max_tokens=max_tokens,
            messages=[{
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": image_data}},
                    {"type": "text", "text": prompt},
                ],
            }],
        ),
        timeout=45.0,
    )
    return response.content[0].text.strip()


async def _anthropic_text(prompt: str, max_tokens: int = 800) -> str:
    client = _get_anthropic_client()
    response = await _call_anthropic_with_retry(
        lambda: client.messages.create(
            model=settings.claude_model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": prompt}],
        ),
        timeout=45.0,
    )
    return response.content[0].text.strip()


# ── Ollama calls ─────────────────────────────────────────

def _ollama_prompt_no_think(prompt: str) -> str:
    return prompt + "\n\n/no_think"


async def _ollama_vision(image_data: str, prompt: str, max_tokens: int = 500) -> str:
    client = _get_ollama_client()
    url = f"{settings.ollama_base_url}/v1/chat/completions"
    body = {
        "model": settings.ollama_model,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_data}"}},
                {"type": "text", "text": _ollama_prompt_no_think(prompt)},
            ],
        }],
        "max_tokens": max_tokens,
        "stream": False,
    }
    resp = await client.post(url, json=body, timeout=OLLAMA_VISION_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


async def _ollama_text(prompt: str, max_tokens: int = 800) -> str:
    client = _get_ollama_client()
    url = f"{settings.ollama_base_url}/v1/chat/completions"
    body = {
        "model": settings.ollama_model,
        "messages": [{"role": "user", "content": _ollama_prompt_no_think(prompt)}],
        "max_tokens": max_tokens,
        "stream": False,
    }
    resp = await client.post(url, json=body, timeout=OLLAMA_TEXT_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    return data["choices"][0]["message"]["content"].strip()


# ── Prompt builders ──────────────────────────────────────

def _build_photo_prompt(country: str, person_names: list[str] | None = None) -> str:
    people_hint = ""
    if person_names:
        names_str = ", ".join(person_names)
        people_hint = f"\nPersonnes connues dans ce voyage : {names_str}. Si tu reconnais l'une d'elles, mentionne-la dans la description."

    return f"""Tu es un assistant de voyage expert. Analyse cette photo prise pendant un voyage en/au {country}.{people_hint}

Réponds UNIQUEMENT avec un objet JSON valide (pas de texte autour), avec ces champs :
- "description": une description vivante et évocatrice de la photo en 2-3 phrases en français, comme un récit de voyage
- "category": une catégorie parmi: paysage, nourriture, temple, rue, plage, marche, transport, nature, ville, portrait, monument, activite, hotel, autre
- "location_guess": si tu reconnais le lieu précis, sinon null

Exemple de réponse :
{{"description": "Le soleil se couche sur la baie, peignant les montagnes d'or et de pourpre. Les bateaux traditionnels glissent silencieusement sur les eaux émeraude.", "category": "paysage", "location_guess": "Baie d'Ha Long"}}"""


def _build_summary_prompt(day_date: str, descriptions: str, country: str, person_names: list[str] | None = None) -> str:
    people_hint = ""
    if person_names:
        names_str = ", ".join(person_names)
        people_hint = f"\nPersonnes présentes dans ce voyage : {names_str}. Si elles apparaissent dans les descriptions, mentionne-les par leur prénom dans le récit pour le rendre plus personnel."

    return f"""Tu es un écrivain de voyage talentueux. À partir des descriptions de photos prises le {day_date} pendant un voyage en/au {country}, rédige un résumé de la journée.{people_hint}

Photos de la journée :
{descriptions}

Réponds UNIQUEMENT avec un objet JSON valide :
- "summary": un récit de voyage captivant de 3-5 phrases en français, racontant la journée comme dans un carnet de voyage
- "highlights": les 2-3 moments forts de la journée, séparés par des virgules"""


def _build_album_prompt(count: int, country: str, photos_info: str, person_names: list[str] | None = None) -> str:
    people_hint = ""
    if person_names:
        names_str = ", ".join(person_names)
        people_hint = f"\nLes voyageurs sont : {names_str}. Mentionne-les dans la description de l'album et intègre des photos où ils apparaissent."

    return f"""Tu es un directeur artistique spécialisé dans les albums de voyage. Tu dois sélectionner les {count} photos les plus emblématiques d'un voyage en/au {country} pour créer un album photo mémorable.{people_hint}

Critères de sélection (par ordre de priorité) :
1. Diversité : varier les catégories (paysage, nourriture, portrait, monument...), les lieux et les jours
2. Impact visuel : privilégier les photos avec des descriptions évocatrices
3. Couverture temporelle : représenter différents moments du voyage
4. Lieux iconiques : inclure les endroits emblématiques reconnus
5. Moments humains : inclure des photos avec les voyageurs pour personnaliser l'album

Voici les photos disponibles :
{photos_info}

Réponds UNIQUEMENT avec un objet JSON valide :
- "selected_ids": liste de {count} IDs de photos sélectionnées, dans l'ordre chronologique
- "album_title": un titre poétique pour l'album en français (ex: "Vietnam, entre terre et mer")
- "album_description": 2-3 phrases résumant l'esprit du voyage, en français"""


# ── Public API (dispatch by provider) ────────────────────

def _is_ollama() -> bool:
    return settings.ai_provider == "ollama"


async def analyze_photo(
    file_path: str | Path,
    country: str = "ce pays",
    person_names: list[str] | None = None,
) -> dict:
    fallback = {"description": "", "category": "autre", "location_guess": None}

    if not _is_ollama() and not settings.anthropic_api_key:
        fallback["description"] = "Analyse IA non disponible (clé API manquante)"
        return fallback

    image_data, media_type = _image_to_base64(file_path)
    prompt = _build_photo_prompt(country, person_names)

    try:
        if _is_ollama():
            raw = await _ollama_vision(image_data, prompt)
        else:
            raw = await _anthropic_vision(image_data, media_type, prompt)

        return _extract_json(raw)

    except asyncio.TimeoutError:
        logger.warning("Photo analysis timed out for %s", file_path)
        fallback["description"] = "Analyse expirée"
        return fallback
    except json.JSONDecodeError:
        logger.warning("Failed to parse response for %s: %s", file_path, raw[:200] if "raw" in dir() else "?")
        fallback["description"] = raw if "raw" in dir() else "Erreur d'analyse"
        return fallback
    except anthropic.APIError as e:
        logger.error("Anthropic API error: %s", e)
        fallback["description"] = "Erreur API Anthropic"
        return fallback
    except httpx.HTTPStatusError as e:
        logger.error("Ollama HTTP error: %s", e)
        fallback["description"] = "Erreur Ollama"
        return fallback
    except Exception as e:
        logger.error("Unexpected analysis error: %s", e)
        fallback["description"] = "Erreur d'analyse"
        return fallback


async def generate_day_summary(
    day_date: str,
    descriptions: list[str],
    country: str = "ce pays",
    person_names: list[str] | None = None,
) -> dict:
    fallback = {"summary": "", "highlights": ""}

    if not _is_ollama() and not settings.anthropic_api_key:
        fallback["summary"] = "Résumé IA non disponible (clé API manquante)"
        return fallback

    numbered = "\n".join(f"{i+1}. {d}" for i, d in enumerate(descriptions))
    prompt = _build_summary_prompt(day_date, numbered, country, person_names)

    try:
        if _is_ollama():
            raw = await _ollama_text(prompt)
        else:
            raw = await _anthropic_text(prompt)

        return _extract_json(raw)

    except asyncio.TimeoutError:
        return {"summary": "Génération du résumé expirée", "highlights": ""}
    except json.JSONDecodeError:
        logger.warning("Failed to parse day summary: %s", raw[:200] if "raw" in dir() else "?")
        return {"summary": raw if "raw" in dir() else "Erreur", "highlights": ""}
    except (anthropic.APIError, httpx.HTTPStatusError) as e:
        logger.error("API error for summary: %s", e)
        return {"summary": "Erreur API", "highlights": ""}
    except Exception as e:
        logger.error("Unexpected summary error: %s", e)
        return {"summary": "Erreur", "highlights": ""}


async def generate_album_selection(
    count: int,
    country: str,
    photos_info: list[dict],
    person_names: list[str] | None = None,
) -> dict:
    fallback_ids = [p["id"] for p in photos_info[:count]]
    fallback = {
        "selected_ids": fallback_ids,
        "album_title": f"Album — {country}",
        "album_description": "",
    }

    if not _is_ollama() and not settings.anthropic_api_key:
        fallback["album_description"] = "Sélection IA non disponible (clé API manquante)."
        return fallback

    lines = []
    for p in photos_info:
        parts = [f"ID:{p['id']}"]
        if p.get("taken_at"):
            parts.append(f"date:{p['taken_at']}")
        if p.get("category"):
            parts.append(f"catégorie:{p['category']}")
        if p.get("location_name"):
            parts.append(f"lieu:{p['location_name']}")
        if p.get("ai_description"):
            parts.append(f"description:{p['ai_description'][:150]}")
        lines.append(" | ".join(parts))

    photos_text = "\n".join(lines)
    prompt = _build_album_prompt(count, country, photos_text, person_names)

    try:
        if _is_ollama():
            raw = await _ollama_text(prompt, max_tokens=1000)
        else:
            raw = await _anthropic_text(prompt, max_tokens=1000)

        result = _extract_json(raw)
        valid_ids = {p["id"] for p in photos_info}
        result["selected_ids"] = [i for i in result.get("selected_ids", []) if i in valid_ids]
        return result

    except asyncio.TimeoutError:
        logger.warning("Album generation timed out")
        fallback["album_description"] = "Génération expirée — sélection par défaut."
        return fallback
    except json.JSONDecodeError:
        logger.warning("Failed to parse album response: %s", raw[:200] if "raw" in dir() else "?")
        fallback["album_description"] = "Erreur d'analyse — sélection par défaut."
        return fallback
    except (anthropic.APIError, httpx.HTTPStatusError) as e:
        logger.error("API error for album: %s", e)
        fallback["album_description"] = "Erreur API — sélection par défaut."
        return fallback
    except Exception as e:
        logger.error("Unexpected album error: %s", e)
        fallback["album_description"] = "Erreur — sélection par défaut."
        return fallback
