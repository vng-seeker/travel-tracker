import { useState } from "react";
import {
  Calendar,
  MapPin,
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  X,
  CheckSquare,
  Square,
  Trash2,
  Pencil,
  Check,
  RotateCcw,
} from "lucide-react";
import api from "../../api/client";
import type { Photo, DayInfo } from "../../types";

function formatDay(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

interface DayCardProps {
  day: DayInfo;
  photos: Photo[];
  onGenerateSummary: (day: string) => void;
  isGenerating: boolean;
  onPhotoClick?: (photo: Photo) => void;
  onDeletePhoto: (id: number) => void;
  selectionMode: boolean;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onDaysChange: () => void;
}

function DayCard({
  day,
  photos,
  onGenerateSummary,
  isGenerating,
  onPhotoClick,
  onDeletePhoto,
  selectionMode,
  selectedIds,
  onToggleSelect,
  onDaysChange,
}: DayCardProps) {
  const [expanded, setExpanded] = useState(true);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState(day.summary || "");
  const [savingSummary, setSavingSummary] = useState(false);

  const dayPhotos = photos
    .filter((p) => p.taken_at?.startsWith(day.day))
    .sort(
      (a, b) =>
        new Date(a.taken_at!).getTime() - new Date(b.taken_at!).getTime()
    );

  const locations = [
    ...new Set(dayPhotos.map((p) => p.location_name).filter(Boolean)),
  ];

  const allSelected = dayPhotos.length > 0 && dayPhotos.every((p) => selectedIds.has(p.id));

  const toggleSelectAll = () => {
    dayPhotos.forEach((p) => onToggleSelect(p.id));
  };

  const handleSaveSummary = async () => {
    if (!day.summary_id) return;
    setSavingSummary(true);
    try {
      await api.patch(`/api/summaries/${day.summary_id}`, {
        ai_summary: summaryDraft,
      });
      onDaysChange();
      setEditingSummary(false);
    } catch {
      // silent
    } finally {
      setSavingSummary(false);
    }
  };

  const processingPhotos = dayPhotos.filter(
    (p) => p.processing_status === "pending" || p.processing_status === "processing"
  );

  return (
    <div className="bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm">
      <div className="flex items-center">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex-1 flex items-center justify-between p-5 hover:bg-stone-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-vietnam-red to-red-700 flex items-center justify-center text-white">
              <Calendar size={20} />
            </div>
            <div className="text-left">
              <h3 className="font-semibold text-stone-800 capitalize">
                {formatDay(day.day)}
              </h3>
              <div className="flex items-center gap-3 text-xs text-stone-400 mt-0.5">
                <span className="flex items-center gap-1">
                  <ImageIcon size={12} />
                  {day.photo_count} photo{day.photo_count > 1 ? "s" : ""}
                </span>
                {processingPhotos.length > 0 && (
                  <span className="flex items-center gap-1 text-amber-500">
                    <Loader2 size={12} className="animate-spin" />
                    {processingPhotos.length} en analyse
                  </span>
                )}
                {locations.length > 0 && (
                  <span className="flex items-center gap-1">
                    <MapPin size={12} />
                    {locations.slice(0, 2).join(", ")}
                  </span>
                )}
              </div>
            </div>
          </div>
          {expanded ? (
            <ChevronUp size={20} className="text-stone-400" />
          ) : (
            <ChevronDown size={20} className="text-stone-400" />
          )}
        </button>

        {selectionMode && expanded && (
          <button
            onClick={toggleSelectAll}
            className="mr-4 px-3 py-1.5 text-xs rounded-lg border transition-colors"
            title={allSelected ? "Tout désélectionner" : "Tout sélectionner"}
          >
            {allSelected ? (
              <span className="flex items-center gap-1 text-vietnam-red">
                <CheckSquare size={14} /> Tout
              </span>
            ) : (
              <span className="flex items-center gap-1 text-stone-400">
                <Square size={14} /> Tout
              </span>
            )}
          </button>
        )}
      </div>

      {expanded && (
        <div className="px-5 pb-5 space-y-4">
          {/* Editable summary */}
          {day.summary && !editingSummary && (
            <div
              className="group relative bg-amber-50 border border-amber-100 rounded-xl p-4 cursor-pointer hover:bg-amber-100/60 transition-colors"
              onClick={() => {
                setSummaryDraft(day.summary || "");
                setEditingSummary(true);
              }}
            >
              <p className="text-sm text-stone-700 leading-relaxed italic">
                {day.summary}
              </p>
              <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 bg-white/80 rounded-md border border-amber-200">
                <Pencil size={12} className="text-amber-600" />
              </span>
            </div>
          )}

          {editingSummary && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
              <textarea
                value={summaryDraft}
                onChange={(e) => setSummaryDraft(e.target.value)}
                className="w-full p-3 border border-amber-200 rounded-lg text-sm text-stone-700 leading-relaxed italic bg-white focus:outline-none focus:ring-2 focus:ring-amber-300/50 resize-none"
                rows={4}
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSaveSummary}
                  disabled={savingSummary}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-60"
                >
                  {savingSummary ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Enregistrer
                </button>
                <button
                  onClick={() => setEditingSummary(false)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-stone-500 text-xs rounded-lg hover:bg-stone-100"
                >
                  <RotateCcw size={12} />
                  Annuler
                </button>
              </div>
            </div>
          )}

          {!day.has_summary && dayPhotos.length > 0 && (
            <button
              onClick={() => onGenerateSummary(day.day)}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg text-sm font-medium hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50"
            >
              {isGenerating ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Sparkles size={16} />
              )}
              Générer le résumé de la journée
            </button>
          )}

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {dayPhotos.map((photo) => {
              const isSelected = selectedIds.has(photo.id);
              const isPhotoProcessing =
                photo.processing_status === "pending" || photo.processing_status === "processing";
              return (
                <div
                  key={photo.id}
                  className="group relative aspect-square rounded-lg overflow-hidden cursor-pointer"
                  onClick={() => {
                    if (selectionMode) {
                      onToggleSelect(photo.id);
                    } else {
                      onPhotoClick?.(photo);
                    }
                  }}
                >
                  <img
                    src={
                      photo.thumbnail_path
                        ? `/thumbnails/${photo.thumbnail_path}`
                        : `/photos/${photo.filename}`
                    }
                    alt={photo.original_name}
                    className={`w-full h-full object-cover transition-all duration-200 ${
                      isSelected
                        ? "scale-90 rounded-lg ring-2 ring-vietnam-red"
                        : "group-hover:scale-105"
                    }`}
                    loading="lazy"
                  />

                  {isPhotoProcessing && (
                    <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                      <div className="bg-white/90 rounded-full p-1.5">
                        <Loader2 size={14} className="text-amber-500 animate-spin" />
                      </div>
                    </div>
                  )}

                  {!selectionMode && (
                    <>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Supprimer cette photo ?")) {
                            onDeletePhoto(photo.id);
                          }
                        }}
                        className="absolute top-1 right-1 p-1 bg-black/50 hover:bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all"
                        title="Supprimer"
                      >
                        <X size={12} />
                      </button>
                      {photo.location_name && (
                        <span className="absolute bottom-1 left-1 right-1 text-[10px] text-white truncate opacity-0 group-hover:opacity-100 transition-opacity">
                          {photo.location_name}
                        </span>
                      )}
                    </>
                  )}

                  {selectionMode && (
                    <div className="absolute top-1 left-1">
                      {isSelected ? (
                        <CheckSquare size={20} className="text-vietnam-red drop-shadow-md" />
                      ) : (
                        <Square size={20} className="text-white drop-shadow-md" />
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface Props {
  tripId: number;
  photos: Photo[];
  days: DayInfo[];
  onDaysChange: () => void;
  onPhotoClick?: (photo: Photo) => void;
  onDeletePhoto: (id: number) => void;
  onBulkDelete: (ids: number[]) => void;
  onPhotoUpdated?: (photo: Photo) => void;
}

export default function Timeline({
  tripId,
  photos,
  days,
  onDaysChange,
  onPhotoClick,
  onDeletePhoto,
  onBulkDelete,
}: Props) {
  const [generatingDay, setGeneratingDay] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const handleGenerateSummary = async (day: string) => {
    setGeneratingDay(day);
    try {
      await api.post(`/api/trips/${tripId}/summaries/generate`, { day });
      onDaysChange();
    } catch (err) {
      console.error("Failed to generate summary:", err);
    } finally {
      setGeneratingDay(null);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (
      confirm(
        `Supprimer ${selectedIds.size} photo${selectedIds.size > 1 ? "s" : ""} ?`
      )
    ) {
      onBulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
      setSelectionMode(false);
    }
  };

  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  if (days.length === 0) {
    return (
      <div className="text-center py-16">
        <Calendar size={48} className="mx-auto text-stone-300 mb-4" />
        <p className="text-stone-400 text-lg">
          Aucune journée enregistrée
        </p>
        <p className="text-stone-300 text-sm mt-1">
          Uploadez des photos pour commencer votre journal de voyage
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div />
        {!selectionMode ? (
          <button
            onClick={() => setSelectionMode(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-stone-400 hover:text-stone-600 border border-stone-200 rounded-lg hover:border-stone-300 transition-colors"
          >
            <CheckSquare size={14} />
            Sélectionner
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-stone-500">
              {selectedIds.size} sélectionnée{selectedIds.size > 1 ? "s" : ""}
            </span>
            <button
              onClick={handleBulkDelete}
              disabled={selectedIds.size === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors disabled:opacity-30"
            >
              <Trash2 size={14} />
              Supprimer
            </button>
            <button
              onClick={exitSelection}
              className="flex items-center gap-1 px-3 py-1.5 text-xs text-stone-500 hover:text-stone-700 border border-stone-200 rounded-lg transition-colors"
            >
              Annuler
            </button>
          </div>
        )}
      </div>

      {days.map((day) => (
        <DayCard
          key={day.day}
          day={day}
          photos={photos}
          onGenerateSummary={handleGenerateSummary}
          isGenerating={generatingDay === day.day}
          onPhotoClick={onPhotoClick}
          onDeletePhoto={onDeletePhoto}
          selectionMode={selectionMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onDaysChange={onDaysChange}
        />
      ))}
    </div>
  );
}
