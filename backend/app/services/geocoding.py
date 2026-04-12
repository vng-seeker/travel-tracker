import httpx
import logging

logger = logging.getLogger(__name__)

NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
HEADERS = {"User-Agent": "TravelTracker/1.0"}


async def reverse_geocode(latitude: float, longitude: float) -> str | None:
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{NOMINATIM_BASE}/reverse",
                params={
                    "lat": latitude,
                    "lon": longitude,
                    "format": "json",
                    "zoom": 14,
                    "accept-language": "fr",
                },
                headers=HEADERS,
                timeout=10.0,
            )
            response.raise_for_status()
            data = response.json()

            address = data.get("address", {})
            parts = []
            for key in ("tourism", "village", "town", "city", "county", "state"):
                if key in address:
                    parts.append(address[key])
                    if len(parts) >= 2:
                        break

            return ", ".join(parts) if parts else data.get("display_name", "").split(",")[0]

    except Exception as e:
        logger.warning("Reverse geocoding failed for (%s, %s): %s", latitude, longitude, e)
        return None


async def forward_geocode(place_name: str, country: str = "") -> tuple[float | None, float | None]:
    query = f"{place_name}, {country}" if country else place_name
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{NOMINATIM_BASE}/search",
                params={
                    "q": query,
                    "format": "json",
                    "limit": 1,
                    "accept-language": "fr",
                },
                headers=HEADERS,
                timeout=10.0,
            )
            response.raise_for_status()
            results = response.json()

            if results:
                lat = float(results[0]["lat"])
                lon = float(results[0]["lon"])
                logger.info("Forward geocoded '%s' -> (%s, %s)", place_name, lat, lon)
                return lat, lon

    except Exception as e:
        logger.warning("Forward geocoding failed for '%s': %s", place_name, e)

    return None, None


async def geocode_country(country: str) -> tuple[float, float, int]:
    """Get center coordinates and zoom level for a country."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{NOMINATIM_BASE}/search",
                params={
                    "q": country,
                    "format": "json",
                    "limit": 1,
                    "accept-language": "fr",
                },
                headers=HEADERS,
                timeout=10.0,
            )
            response.raise_for_status()
            results = response.json()

            if results:
                lat = float(results[0]["lat"])
                lon = float(results[0]["lon"])
                return lat, lon, 6

    except Exception as e:
        logger.warning("Country geocoding failed for '%s': %s", country, e)

    return 20.0, 0.0, 3
