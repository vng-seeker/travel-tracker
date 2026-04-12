import { useState, useEffect, useCallback, useRef } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  MapPin,
  Calendar,
} from "lucide-react";
import type { Photo } from "../../types";

function fmtDate(d: string | null): string {
  if (!d) return "";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

interface Slide {
  type: "cover" | "photo" | "end";
  photo?: Photo;
  title?: string;
  description?: string;
  count?: number;
  index?: number;
}

function buildSlides(
  photos: Photo[],
  title: string,
  description: string
): Slide[] {
  const slides: Slide[] = [
    { type: "cover", title, description, count: photos.length },
  ];
  photos.forEach((photo, i) => {
    slides.push({ type: "photo", photo, index: i });
  });
  slides.push({ type: "end", title, count: photos.length });
  return slides;
}

const KENBURNS_VARIANTS = [
  "kb-zoom-in",
  "kb-zoom-out",
  "kb-pan-left",
  "kb-pan-right",
  "kb-pan-up",
] as const;

interface Props {
  photos: Photo[];
  title: string;
  description: string;
  onClose: () => void;
}

export default function AlbumPresentation({
  photos,
  title,
  description,
  onClose,
}: Props) {
  const slides = buildSlides(photos, title, description);
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const [animKey, setAnimKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [showUI, setShowUI] = useState(true);
  const uiTimeout = useRef<ReturnType<typeof setTimeout>>();
  const autoTimeout = useRef<ReturnType<typeof setTimeout>>();

  const goTo = useCallback(
    (idx: number, dir: "next" | "prev") => {
      if (idx < 0 || idx >= slides.length) return;
      setDirection(dir);
      setCurrent(idx);
      setAnimKey((k) => k + 1);
    },
    [slides.length]
  );

  const next = useCallback(() => {
    if (current < slides.length - 1) goTo(current + 1, "next");
    else if (playing) setPlaying(false);
  }, [current, slides.length, goTo, playing]);

  const prev = useCallback(() => {
    if (current > 0) goTo(current - 1, "prev");
  }, [current, goTo]);

  // Keyboard
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [next, prev, onClose]);

  // Auto-play
  useEffect(() => {
    if (!playing) return;
    autoTimeout.current = setTimeout(next, 5000);
    return () => clearTimeout(autoTimeout.current);
  }, [playing, current, next]);

  // Auto-hide UI
  const bumpUI = useCallback(() => {
    setShowUI(true);
    clearTimeout(uiTimeout.current);
    uiTimeout.current = setTimeout(() => setShowUI(false), 3000);
  }, []);

  useEffect(() => {
    bumpUI();
    return () => clearTimeout(uiTimeout.current);
  }, [current, bumpUI]);

  // Lock scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const slide = slides[current];
  const kb =
    KENBURNS_VARIANTS[(current * 7 + 3) % KENBURNS_VARIANTS.length];
  const progress = ((current + 1) / slides.length) * 100;

  return (
    <div
      className="pres-root fixed inset-0 z-[100] bg-black select-none"
      onMouseMove={bumpUI}
      onClick={bumpUI}
    >
      {/* ── Slide content ── */}
      <div
        key={animKey}
        className={`absolute inset-0 pres-slide pres-slide-${direction}`}
      >
        {/* ── COVER ── */}
        {slide.type === "cover" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {photos[0] && (
              <div className="absolute inset-0">
                <img
                  src={`/photos/${photos[0].filename}`}
                  className={`w-full h-full object-cover ${kb}`}
                  alt=""
                />
                <div className="absolute inset-0 bg-black/60" />
              </div>
            )}
            <div className="relative z-10 text-center px-8 max-w-3xl pres-text-reveal">
              <div className="w-16 h-px bg-white/30 mx-auto mb-8" />
              <h1 className="font-album text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold text-white tracking-tight leading-[1.1]">
                {slide.title}
              </h1>
              <p className="font-album italic text-white/60 mt-6 text-lg md:text-xl leading-relaxed">
                {slide.description}
              </p>
              <div className="mt-10 flex items-center justify-center gap-6">
                <div className="w-12 h-px bg-white/20" />
                <p className="text-white/30 text-xs tracking-[0.25em] uppercase">
                  {slide.count} photographies
                </p>
                <div className="w-12 h-px bg-white/20" />
              </div>
            </div>
          </div>
        )}

        {/* ── PHOTO ── */}
        {slide.type === "photo" && slide.photo && (
          <div className="absolute inset-0">
            <img
              src={`/photos/${slide.photo.filename}`}
              className={`w-full h-full object-cover ${kb}`}
              alt={slide.photo.original_name}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-black/20 pointer-events-none" />

            <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12 lg:p-16 pres-text-reveal">
              <div className="max-w-3xl">
                {slide.photo.ai_description && (
                  <p className="font-album text-xl sm:text-2xl md:text-3xl italic text-white/90 leading-snug">
                    {slide.photo.ai_description}
                  </p>
                )}
                <div className="flex items-center gap-5 mt-4 text-white/50 text-sm">
                  {slide.photo.location_name && (
                    <span className="flex items-center gap-1.5">
                      <MapPin size={14} />
                      {slide.photo.location_name}
                    </span>
                  )}
                  {slide.photo.taken_at && (
                    <span className="flex items-center gap-1.5">
                      <Calendar size={14} />
                      {fmtDate(slide.photo.taken_at)}
                    </span>
                  )}
                  {slide.photo.category && (
                    <span className="px-2.5 py-0.5 rounded-full border border-white/20 text-white/40 text-xs">
                      {slide.photo.category}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Photo counter */}
            <div className="absolute top-6 right-8 pres-text-reveal">
              <span className="font-album text-white/30 text-lg">
                <span className="text-white/70 text-2xl font-semibold">
                  {(slide.index ?? 0) + 1}
                </span>
                {" / "}
                {photos.length}
              </span>
            </div>
          </div>
        )}

        {/* ── END ── */}
        {slide.type === "end" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-stone-950 to-black">
            <div className="text-center px-8 pres-text-reveal">
              <div className="w-20 h-px bg-white/20 mx-auto mb-8" />
              <p className="font-album text-3xl md:text-4xl italic text-white/70">
                {slide.title}
              </p>
              <p className="text-white/25 text-sm mt-6 tracking-[0.2em] uppercase">
                {slide.count} photographies
              </p>
              <div className="w-20 h-px bg-white/20 mx-auto mt-8" />
              <p className="text-white/15 text-xs mt-8 tracking-wider">
                Travel Tracker
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Controls overlay ── */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-500 ${
          showUI ? "opacity-100" : "opacity-0"
        }`}
      >
        {/* Progress bar */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-white/10 pointer-events-auto">
          <div
            className="h-full bg-white/60 transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2.5 rounded-full bg-white/10 backdrop-blur-sm text-white/70 hover:text-white hover:bg-white/20 transition-all pointer-events-auto"
        >
          <X size={20} />
        </button>

        {/* Nav arrows */}
        {current > 0 && (
          <button
            onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 backdrop-blur-sm text-white/70 hover:text-white hover:bg-white/20 transition-all pointer-events-auto"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {current < slides.length - 1 && (
          <button
            onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 backdrop-blur-sm text-white/70 hover:text-white hover:bg-white/20 transition-all pointer-events-auto"
          >
            <ChevronRight size={24} />
          </button>
        )}

        {/* Bottom bar */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 pointer-events-auto">
          <button
            onClick={() => setPlaying((p) => !p)}
            className="p-2.5 rounded-full bg-white/10 backdrop-blur-sm text-white/70 hover:text-white hover:bg-white/20 transition-all"
            title={playing ? "Pause" : "Lecture auto"}
          >
            {playing ? <Pause size={18} /> : <Play size={18} />}
          </button>

          {/* Dot nav */}
          <div className="flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/10 backdrop-blur-sm">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i, i > current ? "next" : "prev")}
                className={`rounded-full transition-all duration-300 ${
                  i === current
                    ? "w-6 h-2 bg-white"
                    : "w-2 h-2 bg-white/30 hover:bg-white/50"
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
