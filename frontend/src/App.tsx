import { useState, useEffect, useCallback, useRef } from "react";
import {
  Map,
  Upload,
  BookOpen,
  BookImage,
  Camera,
  TrendingUp,
  MapPin,
  Users,
  ArrowLeft,
  Loader2,
  CheckCircle,
  AlertTriangle,
  Settings,
} from "lucide-react";
import api from "./api/client";
import TripDashboard from "./components/TripDashboard/TripDashboard";
import TripMap from "./components/Map/TripMap";
import PhotoUpload from "./components/PhotoUpload/PhotoUpload";
import Timeline from "./components/Timeline/Timeline";
import PhotoDetail from "./components/PhotoDetail/PhotoDetail";
import People from "./components/People/People";
import Album from "./components/Album/Album";
import SettingsPanel from "./components/Settings/Settings";
import type { Trip, Photo, DayInfo, TripStats, ViewMode } from "./types";

const NAV_ITEMS: { id: ViewMode; label: string; icon: typeof Map }[] = [
  { id: "map", label: "Carte", icon: Map },
  { id: "timeline", label: "Journal", icon: BookOpen },
  { id: "album", label: "Album", icon: BookImage },
  { id: "people", label: "Personnes", icon: Users },
  { id: "upload", label: "Ajouter", icon: Upload },
  { id: "settings", label: "Paramètres", icon: Settings },
];

interface UploadingFile {
  file: File;
  progress: number;
  status: "pending" | "uploading" | "done" | "error";
  result?: Photo;
  error?: string;
}

interface ProcessingStatus {
  pending: number;
  done: number;
  errors: number;
  total: number;
}

export default function App() {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [view, setView] = useState<ViewMode>("map");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [days, setDays] = useState<DayInfo[]>([]);
  const [stats, setStats] = useState<TripStats | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<Photo | null>(null);

  // Upload queue state (lives at App level to persist across tab switches)
  const [uploadFiles, setUploadFiles] = useState<UploadingFile[]>([]);
  const uploadFilesRef = useRef<UploadingFile[]>([]);
  const [skipAi, setSkipAi] = useState(false);
  const skipAiRef = useRef(false);
  const uploadProcessing = useRef(false);
  const uploadTripId = useRef<number | null>(null);

  // Background processing status
  const [procStatus, setProcStatus] = useState<ProcessingStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  const fetchTrips = useCallback(async () => {
    try {
      const { data } = await api.get<Trip[]>("/api/trips");
      setTrips(data);
    } catch (err) {
      console.error("Failed to fetch trips:", err);
    }
  }, []);

  useEffect(() => {
    fetchTrips();
  }, [fetchTrips]);

  const fetchPhotos = useCallback(async () => {
    if (!selectedTrip) return;
    try {
      const { data } = await api.get<Photo[]>(
        `/api/trips/${selectedTrip.id}/photos?limit=500`
      );
      setPhotos(data);
    } catch (err) {
      console.error("Failed to fetch photos:", err);
    }
  }, [selectedTrip]);

  const fetchDays = useCallback(async () => {
    if (!selectedTrip) return;
    try {
      const { data } = await api.get<DayInfo[]>(
        `/api/trips/${selectedTrip.id}/days`
      );
      setDays(data);
    } catch (err) {
      console.error("Failed to fetch days:", err);
    }
  }, [selectedTrip]);

  const fetchStats = useCallback(async () => {
    if (!selectedTrip) return;
    try {
      const { data } = await api.get<TripStats>(
        `/api/trips/${selectedTrip.id}/stats`
      );
      setStats(data);
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
  }, [selectedTrip]);

  useEffect(() => {
    if (selectedTrip) {
      uploadTripId.current = selectedTrip.id;
      fetchPhotos();
      fetchDays();
      fetchStats();
    }
  }, [selectedTrip, fetchPhotos, fetchDays, fetchStats]);

  // ─── Processing status polling ───
  const pollProcessingStatus = useCallback(async () => {
    if (!selectedTrip) return;
    try {
      const { data } = await api.get<ProcessingStatus>(
        `/api/trips/${selectedTrip.id}/photos/processing-status`
      );
      setProcStatus(data);
      if (data.pending === 0) {
        // All done — refresh data one last time
        fetchPhotos();
        fetchDays();
        fetchStats();
      }
    } catch {
      // silent
    }
  }, [selectedTrip, fetchPhotos, fetchDays, fetchStats]);

  useEffect(() => {
    if (!selectedTrip) {
      setProcStatus(null);
      return;
    }
    pollProcessingStatus();
    pollRef.current = setInterval(pollProcessingStatus, 3000);
    return () => clearInterval(pollRef.current);
  }, [selectedTrip, pollProcessingStatus]);

  // Keep refs in sync with state
  useEffect(() => { uploadFilesRef.current = uploadFiles; }, [uploadFiles]);
  useEffect(() => { skipAiRef.current = skipAi; }, [skipAi]);

  // ─── Upload queue processor ───
  const processNextUpload = useCallback(async () => {
    if (uploadProcessing.current) return;

    const files = uploadFilesRef.current;
    const nextIndex = files.findIndex((f) => f.status === "pending");
    if (nextIndex === -1) return;

    const tripId = uploadTripId.current;
    if (!tripId) return;

    const fileToUpload = files[nextIndex]?.file;
    if (!fileToUpload) return;

    uploadProcessing.current = true;

    setUploadFiles((prev) =>
      prev.map((f, i) =>
        i === nextIndex ? { ...f, status: "uploading" as const, progress: 10 } : f
      )
    );

    const formData = new FormData();
    formData.append("file", fileToUpload);

    try {
      const url = `/api/trips/${tripId}/photos/upload${skipAiRef.current ? "?skip_ai=true" : ""}`;
      const { data } = await api.post(
        url,
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (e) => {
            const pct = e.total ? Math.round((e.loaded / e.total) * 90) + 5 : 50;
            setUploadFiles((prev) =>
              prev.map((f, i) => (i === nextIndex ? { ...f, progress: pct } : f))
            );
          },
        }
      );

      setUploadFiles((prev) =>
        prev.map((f, i) =>
          i === nextIndex
            ? { ...f, status: "done" as const, progress: 100, result: data.photo }
            : f
        )
      );

      setPhotos((prev) => [...prev, data.photo]);
      fetchDays();
      fetchStats();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Erreur lors de l'upload";
      setUploadFiles((prev) =>
        prev.map((f, i) =>
          i === nextIndex
            ? { ...f, status: "error" as const, error: message }
            : f
        )
      );
    } finally {
      uploadProcessing.current = false;
      // Process next file in queue
      const remaining = uploadFilesRef.current.some((f) => f.status === "pending");
      if (remaining) {
        setTimeout(() => processNextUpload(), 100);
      }
    }
  }, [fetchDays, fetchStats]);

  useEffect(() => {
    const hasPending = uploadFiles.some((f) => f.status === "pending");
    if (hasPending && !uploadProcessing.current) {
      processNextUpload();
    }
  }, [uploadFiles, processNextUpload]);

  const addFilesToUpload = useCallback(
    (fileList: FileList) => {
      const newFiles: UploadingFile[] = Array.from(fileList).map((file) => ({
        file,
        progress: 0,
        status: "pending" as const,
      }));
      setUploadFiles((prev) => [...prev, ...newFiles]);
    },
    []
  );

  const clearCompletedUploads = useCallback(() => {
    setUploadFiles((prev) =>
      prev.filter((f) => f.status !== "done" && f.status !== "error")
    );
  }, []);

  const handlePhotoUpdated = useCallback((updated: Photo) => {
    setPhotos((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    if (selectedPhoto && selectedPhoto.id === updated.id) {
      setSelectedPhoto(updated);
    }
  }, [selectedPhoto]);

  const handleSelectTrip = (trip: Trip) => {
    setSelectedTrip(trip);
    setView("map");
    setPhotos([]);
    setDays([]);
    setStats(null);
    uploadTripId.current = trip.id;
  };

  const handleBack = () => {
    setSelectedTrip(null);
    setPhotos([]);
    setDays([]);
    setStats(null);
    fetchTrips();
  };

  const handleDeletePhoto = async (id: number) => {
    try {
      await api.delete(`/api/photos/${id}`);
      setPhotos((prev) => prev.filter((p) => p.id !== id));
      setSelectedPhoto(null);
      fetchDays();
      fetchStats();
    } catch (err) {
      console.error("Failed to delete photo:", err);
    }
  };

  const handleBulkDelete = async (ids: number[]) => {
    try {
      await api.post("/api/photos/bulk-delete", { ids });
      setPhotos((prev) => prev.filter((p) => !ids.includes(p.id)));
      setSelectedPhoto(null);
      fetchDays();
      fetchStats();
    } catch (err) {
      console.error("Failed to bulk delete:", err);
    }
  };

  // Dashboard view
  if (!selectedTrip) {
    return (
      <TripDashboard
        trips={trips}
        onSelectTrip={handleSelectTrip}
        onTripsChange={fetchTrips}
      />
    );
  }

  // Trip view
  const geoCount = photos.filter(
    (p) => p.latitude != null && p.longitude != null
  ).length;

  const uploadsPending = uploadFiles.filter((f) => f.status === "pending" || f.status === "uploading").length;
  const uploadsTotal = uploadFiles.length;
  const uploadsDone = uploadFiles.filter((f) => f.status === "done").length;
  const aiProcessing = procStatus?.pending ?? 0;

  return (
    <div className="h-screen flex flex-col bg-stone-50">
      <header className="bg-white border-b border-stone-200 px-4 py-3 flex-shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={handleBack}
              className="p-1.5 -ml-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors"
              title="Retour aux voyages"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h1 className="text-lg font-bold text-stone-800 leading-tight">
                {selectedTrip.name}
              </h1>
              <p className="text-[11px] text-stone-400 leading-tight flex items-center gap-1">
                <MapPin size={9} />
                {selectedTrip.country}
              </p>
            </div>
          </div>

          {stats && stats.total_photos > 0 && (
            <div className="hidden sm:flex items-center gap-5 text-xs text-stone-400">
              <span className="flex items-center gap-1">
                <Camera size={13} />
                {stats.total_photos} photos
              </span>
              <span className="flex items-center gap-1">
                <TrendingUp size={13} />
                {stats.total_days} jours
              </span>
              <span className="flex items-center gap-1">
                <MapPin size={13} />
                {geoCount} géolocalisées
              </span>
            </div>
          )}

          <nav className="flex bg-stone-100 rounded-lg p-0.5">
            {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setView(id)}
                className={`
                  flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all relative
                  ${
                    view === id
                      ? "bg-white text-vietnam-red shadow-sm"
                      : "text-stone-500 hover:text-stone-700"
                  }
                `}
              >
                <Icon size={16} />
                <span className="hidden sm:inline">{label}</span>
                {id === "upload" && uploadsPending > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-vietnam-red text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {uploadsPending}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {view === "map" && (
          <div className="h-full p-4">
            <div className="h-full rounded-2xl overflow-hidden shadow-lg border border-stone-200">
              <TripMap
                photos={photos}
                centerLat={selectedTrip.center_lat}
                centerLng={selectedTrip.center_lng}
                centerZoom={selectedTrip.center_zoom}
                onPhotoClick={setSelectedPhoto}
              />
            </div>
          </div>
        )}

        {view === "timeline" && (
          <div className="h-full overflow-y-auto p-4">
            <div className="max-w-3xl mx-auto">
              <Timeline
                tripId={selectedTrip.id}
                photos={photos}
                days={days}
                onDaysChange={fetchDays}
                onPhotoClick={setSelectedPhoto}
                onDeletePhoto={handleDeletePhoto}
                onBulkDelete={handleBulkDelete}
                onPhotoUpdated={handlePhotoUpdated}
              />
            </div>
          </div>
        )}

        {view === "album" && (
          <div className="h-full overflow-y-auto p-4">
            <div className="max-w-4xl mx-auto">
              <Album
                tripId={selectedTrip.id}
                totalPhotos={stats?.total_photos ?? photos.length}
                onPhotoClick={setSelectedPhoto}
              />
            </div>
          </div>
        )}

        {view === "people" && (
          <div className="h-full overflow-y-auto p-4">
            <div className="max-w-3xl mx-auto">
              <People tripId={selectedTrip.id} />
            </div>
          </div>
        )}

        {view === "upload" && (
          <div className="h-full overflow-y-auto p-4">
            <div className="max-w-2xl mx-auto space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-stone-800">
                  Ajouter des photos
                </h2>
                <p className="text-stone-400 mt-1">
                  {skipAi
                    ? "Mode local — les photos sont enregistrées sans appel IA (vous pourrez lancer l'analyse plus tard)"
                    : "Uploadez vos photos — l'IA analysera, classera et détectera les visages en arrière-plan"
                  }
                </p>
              </div>
              <PhotoUpload
                files={uploadFiles}
                onAddFiles={addFilesToUpload}
                onClearCompleted={clearCompletedUploads}
                skipAi={skipAi}
                onToggleSkipAi={() => setSkipAi((v) => !v)}
                tripId={selectedTrip.id}
                onPhotosChanged={() => { fetchPhotos(); fetchDays(); fetchStats(); }}
              />
            </div>
          </div>
        )}

        {view === "settings" && (
          <div className="h-full overflow-y-auto p-4">
            <SettingsPanel />
          </div>
        )}
      </main>

      {/* Floating processing indicator */}
      {(uploadsPending > 0 || aiProcessing > 0) && view !== "upload" && (
        <div className="fixed bottom-4 right-4 z-40 bg-white rounded-xl border border-stone-200 shadow-lg p-3 flex items-center gap-3 min-w-[240px]">
          <Loader2 size={18} className="text-vietnam-red animate-spin flex-shrink-0" />
          <div className="text-xs text-stone-600">
            {uploadsPending > 0 && (
              <p className="font-medium">
                Upload : {uploadsDone}/{uploadsTotal} fichier{uploadsTotal > 1 ? "s" : ""}
              </p>
            )}
            {aiProcessing > 0 && (
              <p className="flex items-center gap-1">
                <Loader2 size={10} className="animate-spin" />
                {aiProcessing} photo{aiProcessing > 1 ? "s" : ""} en analyse IA
              </p>
            )}
          </div>
        </div>
      )}

      {/* AI processing indicator (visible in all tabs when processing) */}
      {aiProcessing > 0 && uploadsPending === 0 && view !== "upload" && (
        <div className="fixed bottom-4 right-4 z-40 bg-white rounded-xl border border-stone-200 shadow-lg p-3 flex items-center gap-3">
          <Loader2 size={18} className="text-amber-500 animate-spin flex-shrink-0" />
          <div className="text-xs text-stone-600">
            <p className="font-medium flex items-center gap-1">
              Analyse IA en cours
            </p>
            <p className="text-stone-400">
              {aiProcessing} photo{aiProcessing > 1 ? "s" : ""} restante{aiProcessing > 1 ? "s" : ""}
            </p>
          </div>
        </div>
      )}

      {/* Processing complete toast */}
      {procStatus && procStatus.pending === 0 && procStatus.errors > 0 && (
        <div className="fixed bottom-4 right-4 z-40 bg-amber-50 rounded-xl border border-amber-200 shadow-lg p-3 flex items-center gap-3">
          <AlertTriangle size={18} className="text-amber-500 flex-shrink-0" />
          <p className="text-xs text-amber-700">
            {procStatus.errors} photo{procStatus.errors > 1 ? "s" : ""} en erreur d'analyse
          </p>
        </div>
      )}

      {selectedPhoto && (
        <PhotoDetail
          photo={selectedPhoto}
          onClose={() => setSelectedPhoto(null)}
          onDelete={handleDeletePhoto}
          onPhotoUpdated={handlePhotoUpdated}
        />
      )}
    </div>
  );
}
