export interface Trip {
  id: number;
  name: string;
  country: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  travel_style: string | null;
  ai_context: string | null;
  language: string;
  center_lat: number;
  center_lng: number;
  center_zoom: number;
  cover_photo_id: number | null;
  created_at: string;
  photo_count: number;
  date_range_start: string | null;
  date_range_end: string | null;
}

export interface Photo {
  id: number;
  trip_id: number | null;
  filename: string;
  original_name: string;
  taken_at: string | null;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  category: string | null;
  ai_description: string | null;
  thumbnail_path: string | null;
  processing_status: string;
  created_at: string;
}

export interface DaySummary {
  id: number;
  trip_id: number | null;
  day: string;
  ai_summary: string | null;
  highlights: string | null;
  created_at: string;
}

export interface DayInfo {
  day: string;
  photo_count: number;
  has_summary: boolean;
  summary: string | null;
  summary_id: number | null;
}

export interface TripStats {
  total_photos: number;
  total_days: number;
  categories: Record<string, number>;
  date_range: {
    start: string | null;
    end: string | null;
  };
}

export interface Person {
  id: number;
  trip_id: number;
  name: string;
  role: string | null;
  description: string | null;
  face_count: number;
  photo_count: number;
  sample_crops: string[];
  created_at: string;
}

export interface Face {
  id: number;
  photo_id: number;
  person_id: number | null;
  crop_path: string | null;
  bbox_x: number;
  bbox_y: number;
  bbox_w: number;
  bbox_h: number;
  confidence: number;
  person_name: string | null;
}

export interface FaceGroup {
  representative_crop: string | null;
  face_ids: number[];
  crops: string[];
  count: number;
}

export interface Album {
  album_title: string;
  album_description: string;
  photos: Photo[];
}

export interface SavedAlbumSummary {
  id: number;
  trip_id: number;
  title: string;
  description: string | null;
  photo_count: number;
  cover_thumbnail: string | null;
  created_at: string;
}

export interface SavedAlbumFull {
  id: number;
  title: string;
  description: string | null;
  photos: Photo[];
  created_at: string;
}

export interface AppSettings {
  ai_provider: string;
  ollama_base_url: string;
  ollama_model: string;
  claude_model: string;
}

export interface OllamaStatus {
  status: string;
  models: string[];
  current_model: string;
  current_model_available: boolean;
  error?: string;
}

export type ViewMode = "map" | "timeline" | "upload" | "people" | "album" | "settings";
