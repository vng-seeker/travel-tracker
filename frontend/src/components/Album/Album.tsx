import { useState, useRef, useEffect, useCallback } from "react";
import {
  BookImage,
  Sparkles,
  Loader2,
  MapPin,
  Calendar,
  Printer,
  RotateCcw,
  Minus,
  Plus,
  Presentation,
  Play,
  Pause,
  Save,
  FolderOpen,
  Trash2,
  ChevronLeft,
  Clock,
  Images,
} from "lucide-react";
import api from "../../api/client";
import AlbumPresentation from "./AlbumPresentation";
import type { Album as AlbumType, Photo, SavedAlbumSummary, SavedAlbumFull } from "../../types";

function fmtDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function fmtDateShort(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });
}

type Layout = "cover" | "feature" | "duo" | "trio" | "story";
interface Spread {
  layout: Layout;
  photos: Photo[];
}

function buildSpreads(photos: Photo[]): Spread[] {
  if (photos.length === 0) return [];
  const spreads: Spread[] = [];
  let i = 0;

  // First photo is always the cover
  spreads.push({ layout: "cover", photos: [photos[i++]] });

  const cycle: Layout[] = ["duo", "feature", "trio", "story"];
  let ci = 0;

  while (i < photos.length) {
    const layout = cycle[ci % cycle.length];
    ci++;

    if (layout === "duo" && i + 1 < photos.length) {
      spreads.push({ layout: "duo", photos: [photos[i], photos[i + 1]] });
      i += 2;
    } else if (layout === "trio" && i + 2 < photos.length) {
      spreads.push({ layout: "trio", photos: [photos[i], photos[i + 1], photos[i + 2]] });
      i += 3;
    } else if (layout === "feature" || layout === "story") {
      spreads.push({ layout, photos: [photos[i]] });
      i += 1;
    } else {
      spreads.push({ layout: "feature", photos: [photos[i]] });
      i += 1;
    }
  }

  return spreads;
}

function PhotoImg({ photo, className, hero }: { photo: Photo; className?: string; hero?: boolean }) {
  const src = hero
    ? `/photos/${photo.filename}`
    : photo.thumbnail_path
      ? `/thumbnails/${photo.thumbnail_path}`
      : `/photos/${photo.filename}`;
  return <img src={src} alt={photo.original_name} className={className} loading="lazy" />;
}

function Caption({ photo, large }: { photo: Photo; large?: boolean }) {
  return (
    <div className={large ? "space-y-3" : "space-y-1.5"}>
      {photo.ai_description && (
        <p
          className={`font-album italic text-stone-600 leading-relaxed ${
            large ? "text-xl md:text-2xl" : "text-sm md:text-base"
          }`}
        >
          {photo.ai_description}
        </p>
      )}
      <div className={`flex items-center gap-4 ${large ? "text-sm" : "text-xs"} text-stone-400`}>
        {photo.location_name && (
          <span className="flex items-center gap-1">
            <MapPin size={large ? 13 : 11} className="flex-shrink-0" />
            {photo.location_name}
          </span>
        )}
        {photo.taken_at && (
          <span className="flex items-center gap-1">
            <Calendar size={large ? 13 : 11} className="flex-shrink-0" />
            {large ? fmtDate(photo.taken_at) : fmtDateShort(photo.taken_at)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Spread renderers ─────────────────────────────────

function CoverSpread({ photo, title, description, count, onClick }: {
  photo: Photo; title: string; description: string; count: number;
  onClick?: (p: Photo) => void;
}) {
  return (
    <div className="album-spread album-cover relative rounded-2xl overflow-hidden cursor-pointer group"
      onClick={() => onClick?.(photo)}>
      <div className="aspect-[3/2] sm:aspect-[16/9] md:aspect-[2/1]">
        <PhotoImg photo={photo} hero className="w-full h-full object-cover" />
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />
      <div className="absolute inset-0 flex flex-col items-center justify-end pb-10 md:pb-14 px-6 text-center">
        <div className="w-12 h-px bg-white/40 mb-5" />
        <h2 className="font-album text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-tight">
          {title}
        </h2>
        <p className="font-album italic text-white/70 mt-3 max-w-xl text-sm md:text-base leading-relaxed">
          {description}
        </p>
        <p className="text-white/40 text-xs mt-5 tracking-[0.2em] uppercase font-light">
          {count} photographies
        </p>
      </div>
    </div>
  );
}

function FeatureSpread({ photo, onClick }: { photo: Photo; onClick?: (p: Photo) => void }) {
  return (
    <div className="album-spread space-y-4">
      <div className="rounded-xl overflow-hidden cursor-pointer group" onClick={() => onClick?.(photo)}>
        <div className="aspect-[16/10] overflow-hidden">
          <PhotoImg photo={photo} hero className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700" />
        </div>
      </div>
      <div className="max-w-2xl mx-auto text-center px-4">
        <Caption photo={photo} large />
      </div>
    </div>
  );
}

function DuoSpread({ photos, onClick }: { photos: Photo[]; onClick?: (p: Photo) => void }) {
  return (
    <div className="album-spread grid grid-cols-1 sm:grid-cols-2 gap-4">
      {photos.map((photo) => (
        <div key={photo.id} className="space-y-3">
          <div className="rounded-xl overflow-hidden cursor-pointer group" onClick={() => onClick?.(photo)}>
            <div className="aspect-[4/3] overflow-hidden">
              <PhotoImg photo={photo} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700" />
            </div>
          </div>
          <div className="px-1">
            <Caption photo={photo} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TrioSpread({ photos, onClick }: { photos: Photo[]; onClick?: (p: Photo) => void }) {
  const [main, ...rest] = photos;
  return (
    <div className="album-spread grid grid-cols-1 sm:grid-cols-5 gap-4">
      <div className="sm:col-span-3 space-y-3">
        <div className="rounded-xl overflow-hidden cursor-pointer group" onClick={() => onClick?.(main)}>
          <div className="aspect-[4/3] sm:aspect-auto sm:h-full overflow-hidden">
            <PhotoImg photo={main} hero className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700" />
          </div>
        </div>
      </div>
      <div className="sm:col-span-2 flex flex-col gap-4">
        {rest.map((photo) => (
          <div key={photo.id} className="flex-1 space-y-2">
            <div className="rounded-xl overflow-hidden cursor-pointer group h-full" onClick={() => onClick?.(photo)}>
              <div className="aspect-[4/3] sm:aspect-auto sm:h-full overflow-hidden">
                <PhotoImg photo={photo} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="sm:col-span-5 px-1">
        <Caption photo={main} />
      </div>
    </div>
  );
}

function StorySpread({ photo, onClick }: { photo: Photo; onClick?: (p: Photo) => void }) {
  return (
    <div className="album-spread grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
      <div className="rounded-xl overflow-hidden cursor-pointer group" onClick={() => onClick?.(photo)}>
        <div className="aspect-[3/4] overflow-hidden">
          <PhotoImg photo={photo} hero className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-700" />
        </div>
      </div>
      <div className="flex flex-col justify-center px-2 md:px-6 py-4">
        {photo.ai_description && (
          <blockquote className="font-album text-2xl md:text-3xl italic text-stone-700 leading-snug border-l-2 border-stone-300 pl-6">
            {photo.ai_description}
          </blockquote>
        )}
        <div className="flex items-center gap-4 text-sm text-stone-400 mt-6">
          {photo.location_name && (
            <span className="flex items-center gap-1.5">
              <MapPin size={14} />
              {photo.location_name}
            </span>
          )}
          {photo.taken_at && (
            <span className="flex items-center gap-1.5">
              <Calendar size={14} />
              {fmtDate(photo.taken_at)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Separator ─────────────────────────────────────────

function Separator() {
  return (
    <div className="flex items-center justify-center py-2">
      <div className="w-8 h-px bg-stone-300" />
      <div className="w-1.5 h-1.5 rounded-full bg-stone-300 mx-3" />
      <div className="w-8 h-px bg-stone-300" />
    </div>
  );
}

// ── Main component ────────────────────────────────────

interface Props {
  tripId: number;
  totalPhotos: number;
  onPhotoClick?: (photo: Photo) => void;
}

export default function Album({ tripId, totalPhotos, onPhotoClick }: Props) {
  const [count, setCount] = useState(() => Math.min(20, Math.max(1, totalPhotos)));
  const [album, setAlbum] = useState<AlbumType | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [presenting, setPresenting] = useState(false);
  const [autoScroll, setAutoScroll] = useState(false);
  const [autoIdx, setAutoIdx] = useState(0);
  const spreadRefs = useRef<(HTMLDivElement | null)[]>([]);
  const autoTimer = useRef<ReturnType<typeof setTimeout>>();

  const [savedAlbums, setSavedAlbums] = useState<SavedAlbumSummary[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewingSavedId, setViewingSavedId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const maxCount = Math.min(totalPhotos, 100);

  const fetchSavedAlbums = useCallback(async () => {
    setLoadingSaved(true);
    try {
      const { data } = await api.get<SavedAlbumSummary[]>(`/api/trips/${tripId}/albums`);
      setSavedAlbums(data);
    } catch {
      // silent
    } finally {
      setLoadingSaved(false);
    }
  }, [tripId]);

  useEffect(() => {
    fetchSavedAlbums();
  }, [fetchSavedAlbums]);

  const handleSaveAlbum = async () => {
    if (!album) return;
    setSaving(true);
    try {
      await api.post(`/api/trips/${tripId}/albums`, {
        title: album.album_title,
        description: album.album_description,
        photo_ids: album.photos.map((p) => p.id),
      });
      await fetchSavedAlbums();
    } catch {
      setError("Erreur lors de la sauvegarde");
    } finally {
      setSaving(false);
    }
  };

  const handleLoadAlbum = async (albumId: number) => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<SavedAlbumFull>(`/api/albums/${albumId}`);
      setAlbum({
        album_title: data.title,
        album_description: data.description || "",
        photos: data.photos,
      });
      setViewingSavedId(albumId);
    } catch {
      setError("Erreur lors du chargement de l'album");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAlbum = async (albumId: number) => {
    setDeletingId(albumId);
    try {
      await api.delete(`/api/albums/${albumId}`);
      setSavedAlbums((prev) => prev.filter((a) => a.id !== albumId));
      if (viewingSavedId === albumId) {
        setAlbum(null);
        setViewingSavedId(null);
      }
    } catch {
      setError("Erreur lors de la suppression");
    } finally {
      setDeletingId(null);
    }
  };

  const stopAutoScroll = useCallback(() => {
    setAutoScroll(false);
    clearTimeout(autoTimer.current);
  }, []);

  useEffect(() => {
    if (!autoScroll) return;
    const totalSpreads = spreadRefs.current.length;
    if (totalSpreads === 0) { stopAutoScroll(); return; }

    autoTimer.current = setTimeout(() => {
      const nextIdx = autoIdx + 1;
      if (nextIdx >= totalSpreads) {
        stopAutoScroll();
        return;
      }
      setAutoIdx(nextIdx);
      spreadRefs.current[nextIdx]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 4000);

    return () => clearTimeout(autoTimer.current);
  }, [autoScroll, autoIdx, stopAutoScroll]);

  const startAutoScroll = () => {
    if (!album) return;
    setAutoIdx(0);
    setAutoScroll(true);
    spreadRefs.current[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setViewingSavedId(null);
    try {
      const { data } = await api.post<AlbumType>(
        `/api/trips/${tripId}/album/generate`,
        { count }
      );
      setAlbum(data);
    } catch (err) {
      console.error("Failed to generate album:", err);
      setError("Erreur lors de la génération de l'album");
    } finally {
      setLoading(false);
    }
  };

  if (totalPhotos === 0) {
    return (
      <div className="text-center py-16">
        <BookImage size={48} className="mx-auto text-stone-300 mb-4" />
        <p className="text-stone-400 text-lg">Aucune photo dans ce voyage</p>
        <p className="text-stone-300 text-sm mt-1">
          Uploadez des photos pour créer un album
        </p>
      </div>
    );
  }

  const spreads = album ? buildSpreads(album.photos) : [];

  return (
    <div className="space-y-6">
      {/* ─── Controls (hidden on print) ─── */}
      <div className="album-controls bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-stone-800 to-stone-900 flex items-center justify-center flex-shrink-0">
            <BookImage size={22} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-stone-800">
              Album photo
            </h2>
            <p className="text-sm text-stone-400 mt-1">
              L'IA compose un album en sélectionnant les photos les plus
              emblématiques et en les agençant dans une mise en page magazine.
            </p>

            <div className="mt-5 flex items-center gap-6 flex-wrap">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-stone-600">Photos :</label>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setCount((c) => Math.max(1, c - 1))}
                    disabled={count <= 1}
                    className="p-1 rounded-md border border-stone-200 hover:bg-stone-50 disabled:opacity-30"
                  >
                    <Minus size={14} />
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={maxCount}
                    value={count}
                    onChange={(e) => {
                      const v = parseInt(e.target.value, 10);
                      if (!isNaN(v)) setCount(Math.max(1, Math.min(maxCount, v)));
                    }}
                    className="w-16 text-center py-1.5 border border-stone-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-stone-400/30"
                  />
                  <button
                    onClick={() => setCount((c) => Math.min(maxCount, c + 1))}
                    disabled={count >= maxCount}
                    className="p-1 rounded-md border border-stone-200 hover:bg-stone-50 disabled:opacity-30"
                  >
                    <Plus size={14} />
                  </button>
                </div>
                <span className="text-xs text-stone-400">sur {totalPhotos}</span>
              </div>

              <button
                onClick={handleGenerate}
                disabled={loading}
                className="flex items-center gap-2 px-5 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-semibold hover:bg-stone-800 transition-all disabled:opacity-60 shadow-sm"
              >
                {loading ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : album ? (
                  <RotateCcw size={16} />
                ) : (
                  <Sparkles size={16} />
                )}
                {loading ? "Création..." : album ? "Regénérer" : "Créer l'album"}
              </button>
            </div>
            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
          </div>
        </div>
      </div>

      {/* ─── Saved Albums (hidden on print) ─── */}
      {(savedAlbums.length > 0 || loadingSaved) && (
        <div className="album-controls bg-white rounded-2xl border border-stone-200 p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <FolderOpen size={18} className="text-stone-500" />
            <h3 className="text-base font-semibold text-stone-700">Albums enregistrés</h3>
            <span className="text-xs text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
              {savedAlbums.length}
            </span>
          </div>
          {loadingSaved ? (
            <div className="flex items-center gap-2 text-stone-400 text-sm py-3">
              <Loader2 size={14} className="animate-spin" />
              Chargement...
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {savedAlbums.map((sa) => (
                <div
                  key={sa.id}
                  className={`group relative rounded-xl border overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                    viewingSavedId === sa.id
                      ? "border-amber-400 ring-2 ring-amber-200 bg-amber-50/30"
                      : "border-stone-200 hover:border-stone-300 bg-stone-50/50"
                  }`}
                  onClick={() => handleLoadAlbum(sa.id)}
                >
                  <div className="flex gap-3 p-3">
                    {sa.cover_thumbnail ? (
                      <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                        <img
                          src={`/thumbnails/${sa.cover_thumbnail}`}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="w-16 h-16 rounded-lg bg-stone-200 flex items-center justify-center flex-shrink-0">
                        <Images size={20} className="text-stone-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-stone-700 truncate">{sa.title}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-stone-400">
                        <span className="flex items-center gap-1">
                          <Images size={11} />
                          {sa.photo_count}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={11} />
                          {new Date(sa.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteAlbum(sa.id); }}
                    disabled={deletingId === sa.id}
                    className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/80 border border-stone-200 text-stone-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                    title="Supprimer"
                  >
                    {deletingId === sa.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Presentation mode ─── */}
      {presenting && album && (
        <AlbumPresentation
          photos={album.photos}
          title={album.album_title}
          description={album.album_description}
          onClose={() => setPresenting(false)}
        />
      )}

      {/* ─── Album body ─── */}
      {album && (
        <div className="album-book bg-[#faf9f7] rounded-3xl border border-stone-200/80 shadow-xl overflow-hidden">
          <div className="album-pages space-y-10 md:space-y-14 p-4 sm:p-6 md:p-10 lg:p-14">
            {spreads.map((spread, idx) => (
              <div key={idx} ref={(el) => { spreadRefs.current[idx] = el; }}>
                {spread.layout === "cover" && (
                  <CoverSpread
                    photo={spread.photos[0]}
                    title={album.album_title}
                    description={album.album_description}
                    count={album.photos.length}
                    onClick={onPhotoClick}
                  />
                )}
                {spread.layout === "feature" && (
                  <FeatureSpread photo={spread.photos[0]} onClick={onPhotoClick} />
                )}
                {spread.layout === "duo" && (
                  <DuoSpread photos={spread.photos} onClick={onPhotoClick} />
                )}
                {spread.layout === "trio" && (
                  <TrioSpread photos={spread.photos} onClick={onPhotoClick} />
                )}
                {spread.layout === "story" && (
                  <StorySpread photo={spread.photos[0]} onClick={onPhotoClick} />
                )}
                {idx < spreads.length - 1 && <Separator />}
              </div>
            ))}

            {/* Colophon */}
            <div className="text-center pt-6 pb-4 space-y-2">
              <div className="w-10 h-px bg-stone-300 mx-auto" />
              <p className="font-album text-sm italic text-stone-400 pt-2">
                {album.photos.length} photographies
              </p>
              <p className="text-[11px] text-stone-300 tracking-[0.15em] uppercase">
                Généré par Travel Tracker
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="album-controls border-t border-stone-200/60 bg-white/60 backdrop-blur p-4 flex justify-center gap-3 flex-wrap">
            {!viewingSavedId && (
              <button
                onClick={handleSaveAlbum}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-60"
              >
                {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {saving ? "Enregistrement..." : "Enregistrer"}
              </button>
            )}
            {viewingSavedId && (
              <button
                onClick={() => { setAlbum(null); setViewingSavedId(null); }}
                className="flex items-center gap-2 px-5 py-2.5 bg-stone-100 text-stone-600 rounded-xl text-sm font-medium hover:bg-stone-200 transition-colors"
              >
                <ChevronLeft size={15} />
                Fermer
              </button>
            )}
            <button
              onClick={autoScroll ? stopAutoScroll : startAutoScroll}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
                autoScroll
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : "bg-stone-200 text-stone-700 hover:bg-stone-300"
              }`}
            >
              {autoScroll ? <Pause size={15} /> : <Play size={15} />}
              {autoScroll ? "Arrêter" : "Défilement auto"}
            </button>
            <button
              onClick={() => setPresenting(true)}
              className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-sm font-semibold hover:from-amber-600 hover:to-orange-600 transition-all shadow-sm"
            >
              <Presentation size={15} />
              Présentation
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-6 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-medium hover:bg-stone-800 transition-colors"
            >
              <Printer size={15} />
              Imprimer / PDF
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
