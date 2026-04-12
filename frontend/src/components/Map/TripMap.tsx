import { useEffect, useMemo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import type { Photo } from "../../types";

const CATEGORY_COLORS: Record<string, string> = {
  paysage: "#16a34a",
  nourriture: "#ea580c",
  temple: "#9333ea",
  rue: "#64748b",
  plage: "#0ea5e9",
  marche: "#d97706",
  transport: "#6366f1",
  nature: "#15803d",
  ville: "#dc2626",
  portrait: "#ec4899",
  monument: "#7c3aed",
  activite: "#f59e0b",
  hotel: "#0d9488",
  autre: "#78716c",
};

function createPhotoIcon(photo: Photo): L.DivIcon {
  const color = CATEGORY_COLORS[photo.category || "autre"] || "#78716c";
  const thumbUrl = photo.thumbnail_path
    ? `/thumbnails/${photo.thumbnail_path}`
    : `/photos/${photo.filename}`;

  return L.divIcon({
    className: "",
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -24],
    html: `<img src="${thumbUrl}" style="width:44px;height:44px;border-radius:50%;border:3px solid ${color};box-shadow:0 2px 8px rgba(0,0,0,0.3);object-fit:cover;" />`,
  });
}

function FitBounds({ photos }: { photos: Photo[] }) {
  const map = useMap();
  useEffect(() => {
    const geoPhotos = photos.filter((p) => p.latitude && p.longitude);
    if (geoPhotos.length === 0) return;
    const bounds = L.latLngBounds(
      geoPhotos.map((p) => [p.latitude!, p.longitude!])
    );
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
  }, [photos, map]);
  return null;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface Props {
  photos: Photo[];
  centerLat: number;
  centerLng: number;
  centerZoom: number;
  onPhotoClick?: (photo: Photo) => void;
}

export default function TripMap({
  photos,
  centerLat,
  centerLng,
  centerZoom,
  onPhotoClick,
}: Props) {
  const geoPhotos = useMemo(
    () => photos.filter((p) => p.latitude != null && p.longitude != null),
    [photos]
  );

  const routePoints = useMemo(() => {
    return geoPhotos
      .filter((p) => p.taken_at)
      .sort(
        (a, b) =>
          new Date(a.taken_at!).getTime() - new Date(b.taken_at!).getTime()
      )
      .map((p) => [p.latitude!, p.longitude!] as [number, number]);
  }, [geoPhotos]);

  return (
    <MapContainer
      center={[centerLat, centerLng]}
      zoom={centerZoom}
      className="h-full w-full rounded-xl"
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {geoPhotos.length > 0 && <FitBounds photos={geoPhotos} />}

      {routePoints.length > 1 && (
        <Polyline
          positions={routePoints}
          pathOptions={{
            color: "#DA251D",
            weight: 3,
            opacity: 0.6,
            dashArray: "8, 12",
          }}
        />
      )}

      <MarkerClusterGroup chunkedLoading maxClusterRadius={40}>
        {geoPhotos.map((photo) => (
          <Marker
            key={photo.id}
            position={[photo.latitude!, photo.longitude!]}
            icon={createPhotoIcon(photo)}
            eventHandlers={{ click: () => onPhotoClick?.(photo) }}
          >
            <Popup className="custom-popup" maxWidth={280}>
              <div className="overflow-hidden">
                <img
                  src={
                    photo.thumbnail_path
                      ? `/thumbnails/${photo.thumbnail_path}`
                      : `/photos/${photo.filename}`
                  }
                  alt={photo.original_name}
                  className="w-full h-40 object-cover"
                />
                <div className="p-3">
                  <p className="text-sm text-stone-700 leading-relaxed">
                    {photo.ai_description}
                  </p>
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {photo.category && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full text-white font-medium"
                        style={{
                          backgroundColor:
                            CATEGORY_COLORS[photo.category] || "#78716c",
                        }}
                      >
                        {photo.category}
                      </span>
                    )}
                    {photo.location_name && (
                      <span className="text-xs text-stone-500">
                        {photo.location_name}
                      </span>
                    )}
                  </div>
                  {photo.taken_at && (
                    <p className="text-xs text-stone-400 mt-1">
                      {formatDate(photo.taken_at)}
                    </p>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}
