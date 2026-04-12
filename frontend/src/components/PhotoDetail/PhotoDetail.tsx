import { useEffect, useState } from "react";
import { X, MapPin, Calendar, Tag, Trash2, User, Pencil, Check, Loader2, RotateCcw } from "lucide-react";
import api from "../../api/client";
import type { Photo, Face } from "../../types";

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "Date inconnue";
  return new Date(dateStr).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  photo: Photo;
  onClose: () => void;
  onDelete: (id: number) => void;
  onPhotoUpdated?: (photo: Photo) => void;
}

export default function PhotoDetail({ photo, onClose, onDelete, onPhotoUpdated }: Props) {
  const [faces, setFaces] = useState<Face[]>([]);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(photo.ai_description || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get<Face[]>(`/api/photos/${photo.id}/faces`)
      .then(({ data }) => setFaces(data))
      .catch(() => {});
  }, [photo.id]);

  useEffect(() => {
    setDescDraft(photo.ai_description || "");
    setEditingDesc(false);
  }, [photo.id, photo.ai_description]);

  const handleSaveDesc = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch<Photo>(`/api/photos/${photo.id}`, {
        ai_description: descDraft,
      });
      onPhotoUpdated?.(data);
      setEditingDesc(false);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  const isProcessing = photo.processing_status === "pending" || photo.processing_status === "processing";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          <img
            src={`/photos/${photo.filename}`}
            alt={photo.original_name}
            className="w-full max-h-[50vh] object-contain bg-stone-900"
          />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 bg-black/40 hover:bg-black/60 rounded-full text-white transition-colors"
          >
            <X size={20} />
          </button>

          {isProcessing && (
            <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-amber-500/90 rounded-full text-white text-xs font-medium">
              <Loader2 size={12} className="animate-spin" />
              Analyse IA en cours...
            </div>
          )}
          {photo.processing_status === "error" && (
            <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-red-500/90 rounded-full text-white text-xs font-medium">
              Erreur d'analyse
            </div>
          )}
        </div>

        <div className="p-6 space-y-4 overflow-y-auto max-h-[40vh]">
          {/* Editable description */}
          <div className="group relative">
            {editingDesc ? (
              <div className="space-y-2">
                <textarea
                  value={descDraft}
                  onChange={(e) => setDescDraft(e.target.value)}
                  className="w-full p-3 border border-stone-200 rounded-xl text-stone-700 leading-relaxed text-lg italic focus:outline-none focus:ring-2 focus:ring-amber-300/50 resize-none"
                  rows={3}
                  autoFocus
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveDesc}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 disabled:opacity-60"
                  >
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Enregistrer
                  </button>
                  <button
                    onClick={() => {
                      setDescDraft(photo.ai_description || "");
                      setEditingDesc(false);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-stone-500 text-xs rounded-lg hover:bg-stone-100"
                  >
                    <RotateCcw size={12} />
                    Annuler
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="cursor-pointer hover:bg-amber-50/50 rounded-xl p-2 -m-2 transition-colors"
                onClick={() => setEditingDesc(true)}
              >
                {photo.ai_description ? (
                  <p className="text-stone-700 leading-relaxed text-lg italic">
                    "{photo.ai_description}"
                  </p>
                ) : (
                  <p className="text-stone-400 italic text-sm">
                    {isProcessing ? "Description en cours de génération..." : "Cliquez pour ajouter une description"}
                  </p>
                )}
                <span className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 bg-stone-100 rounded-md">
                  <Pencil size={12} className="text-stone-400" />
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            {photo.location_name && (
              <div className="flex items-center gap-1.5 text-sm text-stone-500">
                <MapPin size={16} className="text-vietnam-red" />
                {photo.location_name}
              </div>
            )}
            {photo.taken_at && (
              <div className="flex items-center gap-1.5 text-sm text-stone-500">
                <Calendar size={16} className="text-vietnam-red" />
                {formatDate(photo.taken_at)}
              </div>
            )}
            {photo.category && (
              <div className="flex items-center gap-1.5 text-sm text-stone-500">
                <Tag size={16} className="text-vietnam-red" />
                {photo.category}
              </div>
            )}
          </div>

          {faces.length > 0 && (
            <div className="flex items-center gap-3 flex-wrap">
              <User size={14} className="text-stone-400" />
              {faces.map((face) => (
                <div key={face.id} className="flex items-center gap-1.5">
                  {face.crop_path && (
                    <img
                      src={`/face_crops/${face.crop_path}`}
                      className="w-8 h-8 rounded-full object-cover border border-stone-200"
                      alt=""
                    />
                  )}
                  <span className="text-xs text-stone-500">
                    {face.person_name || "Inconnu"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {photo.latitude && photo.longitude && (
            <p className="text-xs text-stone-300">
              GPS: {photo.latitude.toFixed(5)}, {photo.longitude.toFixed(5)}
            </p>
          )}

          <div className="pt-2 border-t border-stone-100">
            <button
              onClick={() => {
                if (confirm("Supprimer cette photo ?")) {
                  onDelete(photo.id);
                }
              }}
              className="flex items-center gap-2 text-sm text-red-400 hover:text-red-600 transition-colors"
            >
              <Trash2 size={14} />
              Supprimer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
