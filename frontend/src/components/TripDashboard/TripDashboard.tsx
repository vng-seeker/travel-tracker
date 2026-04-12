import { useState } from "react";
import {
  Plus,
  Trash2,
  MapPin,
  Camera,
  Calendar,
  Plane,
} from "lucide-react";
import api from "../../api/client";
import type { Trip } from "../../types";

interface Props {
  trips: Trip[];
  onSelectTrip: (trip: Trip) => void;
  onTripsChange: () => void;
}

export default function TripDashboard({
  trips,
  onSelectTrip,
  onTripsChange,
}: Props) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [creating, setCreating] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !country.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post<Trip>("/api/trips", {
        name: name.trim(),
        country: country.trim(),
      });
      setName("");
      setCountry("");
      setShowForm(false);
      onTripsChange();
      onSelectTrip(data);
    } catch (err) {
      console.error("Failed to create trip:", err);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, trip: Trip) => {
    e.stopPropagation();
    if (
      !confirm(
        `Supprimer le voyage "${trip.name}" et toutes ses photos ?`
      )
    )
      return;
    try {
      await api.delete(`/api/trips/${trip.id}`);
      onTripsChange();
    } catch (err) {
      console.error("Failed to delete trip:", err);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-vietnam-red to-red-700 mb-4">
            <Plane size={28} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-stone-800">Travel Tracker</h1>
          <p className="text-stone-400 mt-2">
            Vos voyages, vos souvenirs, racontés par l'IA
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* New trip card */}
          {!showForm ? (
            <button
              onClick={() => setShowForm(true)}
              className="group border-2 border-dashed border-stone-300 rounded-2xl p-8 flex flex-col items-center justify-center gap-3 hover:border-vietnam-red/50 hover:bg-white transition-all min-h-[220px]"
            >
              <div className="w-12 h-12 rounded-full bg-stone-100 group-hover:bg-red-50 flex items-center justify-center transition-colors">
                <Plus
                  size={24}
                  className="text-stone-400 group-hover:text-vietnam-red"
                />
              </div>
              <span className="text-sm font-medium text-stone-400 group-hover:text-stone-600">
                Nouveau voyage
              </span>
            </button>
          ) : (
            <form
              onSubmit={handleCreate}
              className="bg-white rounded-2xl border border-stone-200 p-6 shadow-sm space-y-4 min-h-[220px] flex flex-col justify-between"
            >
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="Nom du voyage"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-vietnam-red/30 focus:border-vietnam-red"
                  autoFocus
                />
                <input
                  type="text"
                  placeholder="Pays ou destination"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full px-3 py-2 border border-stone-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-vietnam-red/30 focus:border-vietnam-red"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={creating || !name.trim() || !country.trim()}
                  className="flex-1 py-2 bg-vietnam-red text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {creating ? "Création..." : "Créer"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-4 py-2 border border-stone-200 rounded-lg text-sm text-stone-500 hover:bg-stone-50"
                >
                  Annuler
                </button>
              </div>
            </form>
          )}

          {/* Trip cards */}
          {trips.map((trip) => (
            <div
              key={trip.id}
              onClick={() => onSelectTrip(trip)}
              className="group bg-white rounded-2xl border border-stone-200 overflow-hidden shadow-sm hover:shadow-md hover:border-stone-300 transition-all cursor-pointer"
            >
              <div className="h-32 bg-gradient-to-br from-stone-100 to-stone-200 relative overflow-hidden">
                {trip.cover_photo_id && (
                  <img
                    src={`/thumbnails/thumb_${trips.length > 0 ? "" : ""}${trip.cover_photo_id}`}
                    className="w-full h-full object-cover"
                    alt=""
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                <div className="absolute bottom-3 left-4 right-4">
                  <h3 className="text-white font-bold text-lg leading-tight">
                    {trip.name}
                  </h3>
                  <p className="text-white/70 text-xs flex items-center gap-1 mt-0.5">
                    <MapPin size={11} />
                    {trip.country}
                  </p>
                </div>
                <button
                  onClick={(e) => handleDelete(e, trip)}
                  className="absolute top-2 right-2 p-1.5 bg-black/30 hover:bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all"
                  title="Supprimer"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="p-4 flex items-center gap-4 text-xs text-stone-400">
                <span className="flex items-center gap-1">
                  <Camera size={12} />
                  {trip.photo_count} photo{trip.photo_count !== 1 ? "s" : ""}
                </span>
                {trip.date_range_start && (
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {new Date(trip.date_range_start).toLocaleDateString("fr-FR", {
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
