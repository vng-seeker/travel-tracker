import { useState } from "react";
import {
  Plus,
  Trash2,
  MapPin,
  Camera,
  Calendar,
  Plane,
  Settings,
} from "lucide-react";
import api from "../../api/client";
import type { Trip } from "../../types";
import TripSetup from "../TripSetup/TripSetup";

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
  const [showSetup, setShowSetup] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | undefined>();

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

  const handleSetupComplete = (trip: Trip) => {
    setShowSetup(false);
    setEditingTrip(undefined);
    onTripsChange();
    onSelectTrip(trip);
  };

  const handleEditTrip = (e: React.MouseEvent, trip: Trip) => {
    e.stopPropagation();
    setEditingTrip(trip);
    setShowSetup(true);
  };

  if (showSetup) {
    return (
      <TripSetup
        trip={editingTrip}
        onComplete={handleSetupComplete}
        onBack={() => {
          setShowSetup(false);
          setEditingTrip(undefined);
        }}
      />
    );
  }

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
          <button
            onClick={() => setShowSetup(true)}
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
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-white/70 text-xs flex items-center gap-1">
                      <MapPin size={11} />
                      {trip.country}
                    </p>
                    {trip.travel_style && (
                      <span className="text-white/50 text-xs">
                        · {trip.travel_style}
                      </span>
                    )}
                  </div>
                </div>
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={(e) => handleEditTrip(e, trip)}
                    className="p-1.5 bg-black/30 hover:bg-amber-600 rounded-full text-white transition-colors"
                    title="Configurer"
                  >
                    <Settings size={14} />
                  </button>
                  <button
                    onClick={(e) => handleDelete(e, trip)}
                    className="p-1.5 bg-black/30 hover:bg-red-600 rounded-full text-white transition-colors"
                    title="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="p-4 flex items-center gap-4 text-xs text-stone-400">
                <span className="flex items-center gap-1">
                  <Camera size={12} />
                  {trip.photo_count} photo{trip.photo_count !== 1 ? "s" : ""}
                </span>
                {(trip.start_date || trip.date_range_start) && (
                  <span className="flex items-center gap-1">
                    <Calendar size={12} />
                    {trip.start_date
                      ? new Date(trip.start_date).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : trip.date_range_start
                      ? new Date(trip.date_range_start).toLocaleDateString(
                          "fr-FR",
                          { month: "short", year: "numeric" }
                        )
                      : ""}
                    {(trip.end_date || trip.date_range_end) && (
                      <>
                        {" → "}
                        {trip.end_date
                          ? new Date(trip.end_date).toLocaleDateString("fr-FR", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : trip.date_range_end
                          ? new Date(trip.date_range_end).toLocaleDateString(
                              "fr-FR",
                              { month: "short", year: "numeric" }
                            )
                          : ""}
                      </>
                    )}
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
