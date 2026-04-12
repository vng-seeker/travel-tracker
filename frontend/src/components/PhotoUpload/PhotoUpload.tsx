import { useState, useCallback, useRef } from "react";
import {
  Upload,
  ImagePlus,
  CheckCircle,
  AlertCircle,
  Loader2,
  Zap,
  WifiOff,
  Sparkles,
} from "lucide-react";
import api from "../../api/client";
import type { Photo } from "../../types";

interface UploadingFile {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  result?: Photo;
  error?: string;
}

interface Props {
  files: UploadingFile[];
  onAddFiles: (fileList: FileList) => void;
  onClearCompleted: () => void;
  skipAi: boolean;
  onToggleSkipAi: () => void;
  tripId: number;
  onPhotosChanged: () => void;
}

export default function PhotoUpload({
  files,
  onAddFiles,
  onClearCompleted,
  skipAi,
  onToggleSkipAi,
  tripId,
  onPhotosChanged,
}: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (e.dataTransfer.files.length) {
        onAddFiles(e.dataTransfer.files);
      }
    },
    [onAddFiles]
  );

  const handleAnalyzePending = async () => {
    setAnalyzing(true);
    setAnalyzeResult(null);
    try {
      const { data } = await api.post(`/api/trips/${tripId}/photos/analyze-pending`);
      setAnalyzeResult(data.message);
      onPhotosChanged();
    } catch {
      setAnalyzeResult("Erreur lors du lancement de l'analyse");
    } finally {
      setAnalyzing(false);
    }
  };

  const hasCompleted = files.some(
    (f) => f.status === "done" || f.status === "error"
  );

  const doneCount = files.filter((f) => f.status === "done").length;
  const totalCount = files.length;
  const pendingCount = files.filter(
    (f) => f.status === "pending" || f.status === "uploading"
  ).length;
  const isUploading = pendingCount > 0;

  return (
    <div className="space-y-4">
      {/* Mode toggle */}
      <div className="bg-white rounded-xl border border-stone-200 p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {skipAi ? (
              <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center">
                <WifiOff size={18} className="text-stone-500" />
              </div>
            ) : (
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                <Zap size={18} className="text-amber-600" />
              </div>
            )}
            <div>
              <p className="text-sm font-medium text-stone-700">
                {skipAi ? "Mode local" : "Mode IA"}
              </p>
              <p className="text-xs text-stone-400">
                {skipAi
                  ? "Upload rapide, sans appel API — analyse possible après"
                  : "Chaque photo est analysée par l'IA en arrière-plan"
                }
              </p>
            </div>
          </div>
          <button
            onClick={onToggleSkipAi}
            disabled={isUploading}
            className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${
              skipAi ? "bg-stone-300" : "bg-amber-500"
            } ${isUploading ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
            title={isUploading ? "Impossible de changer pendant un upload" : undefined}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200 ${
                skipAi ? "left-0.5" : "left-[26px]"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Analyze button for local-mode photos */}
      {skipAi && doneCount > 0 && !isUploading && (
        <button
          onClick={handleAnalyzePending}
          disabled={analyzing}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl text-sm font-semibold hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-60 shadow-sm"
        >
          {analyzing ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Sparkles size={16} />
          )}
          {analyzing
            ? "Lancement de l'analyse..."
            : "Lancer l'analyse IA sur les photos non analysées"
          }
        </button>
      )}
      {analyzeResult && (
        <p className="text-xs text-center text-stone-500">{analyzeResult}</p>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer
          transition-all duration-200
          ${
            isDragging
              ? "border-vietnam-red bg-red-50 scale-[1.02]"
              : "border-stone-300 hover:border-vietnam-red/50 hover:bg-stone-50"
          }
        `}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".jpg,.jpeg,.png,.heic,.heif,.webp"
          className="hidden"
          onChange={(e) => e.target.files && onAddFiles(e.target.files)}
        />
        <div className="flex flex-col items-center gap-3">
          <div
            className={`p-4 rounded-full transition-colors ${
              isDragging ? "bg-vietnam-red/10" : "bg-stone-100"
            }`}
          >
            <ImagePlus
              size={32}
              className={isDragging ? "text-vietnam-red" : "text-stone-400"}
            />
          </div>
          <div>
            <p className="text-lg font-medium text-stone-700">
              Glissez vos photos ici
            </p>
            <p className="text-sm text-stone-400 mt-1">
              ou cliquez pour parcourir — JPG, PNG, HEIC (iPhone)
            </p>
          </div>
        </div>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-stone-500">
              {doneCount}/{totalCount}{" "}
              fichier{totalCount > 1 ? "s" : ""} envoyé{doneCount > 1 ? "s" : ""}
              {pendingCount > 0 && (
                <span className="text-stone-400 ml-1">
                  ({pendingCount} en attente)
                </span>
              )}
            </h3>
            {hasCompleted && (
              <button
                onClick={onClearCompleted}
                className="text-xs text-stone-400 hover:text-stone-600"
              >
                Effacer terminés
              </button>
            )}
          </div>

          {totalCount > 1 && (
            <div className="w-full h-2 bg-stone-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-vietnam-red to-red-500 rounded-full transition-all duration-500"
                style={{
                  width: `${totalCount > 0 ? (doneCount / totalCount) * 100 : 0}%`,
                }}
              />
            </div>
          )}

          <div className="space-y-1.5 max-h-64 overflow-y-auto">
            {files.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-3 bg-white rounded-lg px-3 py-2 border border-stone-100"
              >
                <div className="flex-shrink-0">
                  {f.status === "done" && (
                    <CheckCircle size={18} className="text-green-500" />
                  )}
                  {f.status === "error" && (
                    <AlertCircle size={18} className="text-red-500" />
                  )}
                  {f.status === "uploading" && (
                    <Loader2
                      size={18}
                      className="text-vietnam-red animate-spin"
                    />
                  )}
                  {f.status === "pending" && (
                    <Upload size={18} className="text-stone-300" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-stone-700 truncate">
                    {f.file.name}
                  </p>
                  {f.status === "uploading" && (
                    <p className="text-xs text-amber-600">Envoi en cours...</p>
                  )}
                  {f.status === "done" && (
                    <p className="text-xs text-green-600">
                      {skipAi
                        ? "Enregistrée (mode local)"
                        : "Enregistrée — analyse IA en arrière-plan"
                      }
                    </p>
                  )}
                  {f.status === "error" && (
                    <p className="text-xs text-red-500">{f.error}</p>
                  )}
                </div>

                {f.status === "uploading" && (
                  <div className="w-20 h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-vietnam-red rounded-full transition-all duration-500"
                      style={{ width: `${f.progress}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
