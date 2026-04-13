import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  ArrowRight,
  MapPin,
  Calendar,
  Users,
  Plus,
  Trash2,
  Sparkles,
  Globe,
  Compass,
  Save,
  Loader2,
  X,
  Pencil,
} from "lucide-react";
import api from "../../api/client";
import { Trip, Person } from "../../types";

const TRAVEL_STYLES = [
  { value: "famille", label: "Famille", icon: "👨‍👩‍👧‍👦" },
  { value: "couple", label: "Couple", icon: "💑" },
  { value: "solo", label: "Solo", icon: "🧭" },
  { value: "amis", label: "Entre amis", icon: "👯" },
  { value: "backpacking", label: "Backpacking", icon: "🎒" },
  { value: "road-trip", label: "Road trip", icon: "🚗" },
  { value: "luxe", label: "Luxe & détente", icon: "🏖️" },
  { value: "aventure", label: "Aventure", icon: "🏔️" },
  { value: "culture", label: "Culturel", icon: "🏛️" },
  { value: "gastronomie", label: "Gastronomie", icon: "🍜" },
];

const LANGUAGES = [
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "de", label: "Deutsch" },
  { value: "it", label: "Italiano" },
  { value: "pt", label: "Português" },
];

interface TripSetupProps {
  trip?: Trip;
  onComplete: (trip: Trip) => void;
  onBack: () => void;
}

interface PersonDraft {
  id?: number;
  name: string;
  role: string;
  description: string;
}

export default function TripSetup({ trip, onComplete, onBack }: TripSetupProps) {
  const isEdit = !!trip;
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 0: Basic info
  const [name, setName] = useState(trip?.name || "");
  const [country, setCountry] = useState(trip?.country || "");
  const [startDate, setStartDate] = useState(trip?.start_date || "");
  const [endDate, setEndDate] = useState(trip?.end_date || "");

  // Step 1: Travel style
  const [travelStyle, setTravelStyle] = useState(trip?.travel_style || "");

  // Step 2: People
  const [people, setPeople] = useState<PersonDraft[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);

  // Step 3: AI context
  const [aiContext, setAiContext] = useState(trip?.ai_context || "");
  const [language, setLanguage] = useState(trip?.language || "fr");

  const fetchPeople = useCallback(async () => {
    if (!trip) return;
    setLoadingPeople(true);
    try {
      const { data } = await api.get<Person[]>(`/api/trips/${trip.id}/people`);
      setPeople(
        data.map((p) => ({
          id: p.id,
          name: p.name,
          role: p.role || "",
          description: p.description || "",
        }))
      );
    } catch {
      /* ignore */
    } finally {
      setLoadingPeople(false);
    }
  }, [trip]);

  useEffect(() => {
    if (trip) fetchPeople();
  }, [trip, fetchPeople]);

  const steps = [
    { label: "Voyage", icon: MapPin },
    { label: "Style", icon: Compass },
    { label: "Voyageurs", icon: Users },
    { label: "IA & Langue", icon: Sparkles },
  ];

  const canNext = () => {
    if (step === 0) return name.trim().length > 0 && country.trim().length > 0;
    return true;
  };

  const addPerson = () => {
    setPeople([...people, { name: "", role: "", description: "" }]);
  };

  const updatePerson = (idx: number, field: keyof PersonDraft, value: string) => {
    const updated = [...people];
    updated[idx] = { ...updated[idx], [field]: value };
    setPeople(updated);
  };

  const removePerson = (idx: number) => {
    setPeople(people.filter((_, i) => i !== idx));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let savedTrip: Trip;

      const tripData = {
        name: name.trim(),
        country: country.trim(),
        start_date: startDate || null,
        end_date: endDate || null,
        travel_style: travelStyle || null,
        ai_context: aiContext.trim() || null,
        language,
      };

      if (isEdit && trip) {
        const { data } = await api.put<Trip>(`/api/trips/${trip.id}`, tripData);
        savedTrip = data;
      } else {
        const { data } = await api.post<Trip>("/api/trips", tripData);
        savedTrip = data;
      }

      // Sync people
      const validPeople = people.filter((p) => p.name.trim().length > 0);

      if (isEdit && trip) {
        const { data: existingPeople } = await api.get<Person[]>(`/api/trips/${trip.id}/people`);
        const existingIds = new Set(existingPeople.map((p) => p.id));
        const draftIds = new Set(validPeople.filter((p) => p.id).map((p) => p.id));

        for (const ep of existingPeople) {
          if (!draftIds.has(ep.id)) {
            await api.delete(`/api/people/${ep.id}`);
          }
        }

        for (const p of validPeople) {
          if (p.id && existingIds.has(p.id)) {
            await api.put(`/api/people/${p.id}`, {
              name: p.name.trim(),
              role: p.role.trim() || null,
              description: p.description.trim() || null,
            });
          } else {
            await api.post(`/api/trips/${savedTrip.id}/people`, {
              name: p.name.trim(),
              role: p.role.trim() || null,
              description: p.description.trim() || null,
            });
          }
        }
      } else {
        for (const p of validPeople) {
          await api.post(`/api/trips/${savedTrip.id}/people`, {
            name: p.name.trim(),
            role: p.role.trim() || null,
            description: p.description.trim() || null,
          });
        }
      }

      onComplete(savedTrip);
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-stone-50 to-amber-50/30">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-stone-500 hover:text-stone-800 transition-colors"
          >
            <ArrowLeft size={18} />
            <span className="text-sm font-medium">Retour</span>
          </button>
          <h1 className="text-lg font-bold text-stone-800">
            {isEdit ? "Configurer le voyage" : "Nouveau voyage"}
          </h1>
          <div className="w-20" />
        </div>

        {/* Step indicator */}
        <div className="max-w-3xl mx-auto px-6 pb-4">
          <div className="flex items-center gap-1">
            {steps.map((s, i) => {
              const Icon = s.icon;
              const isActive = i === step;
              const isDone = i < step;
              return (
                <button
                  key={i}
                  onClick={() => {
                    if (i < step || canNext()) setStep(i);
                  }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? "bg-amber-100 text-amber-800 ring-1 ring-amber-200"
                      : isDone
                      ? "text-green-700 bg-green-50"
                      : "text-stone-400 hover:text-stone-600"
                  }`}
                >
                  <Icon size={14} />
                  <span className="hidden sm:inline">{s.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Step 0: Basic info */}
        {step === 0 && (
          <div className="space-y-6 animate-in fade-in">
            <div>
              <h2 className="text-2xl font-bold text-stone-800 mb-1">
                Informations du voyage
              </h2>
              <p className="text-stone-500 text-sm">
                Les bases : où allez-vous et quand ?
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  Nom du voyage *
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Vietnam 2026, Lune de miel à Bali..."
                  className="w-full px-4 py-2.5 border border-stone-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none transition-all"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  <Globe size={14} className="inline mr-1 -mt-0.5" />
                  Pays / destination *
                </label>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Ex: Vietnam, Italie, Japon..."
                  className="w-full px-4 py-2.5 border border-stone-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">
                    <Calendar size={14} className="inline mr-1 -mt-0.5" />
                    Date de départ
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-4 py-2.5 border border-stone-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1.5">
                    Date de retour
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-4 py-2.5 border border-stone-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none transition-all"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Travel style */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in">
            <div>
              <h2 className="text-2xl font-bold text-stone-800 mb-1">
                Style de voyage
              </h2>
              <p className="text-stone-500 text-sm">
                Aide l'IA à adapter le ton et le vocabulaire des récits
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {TRAVEL_STYLES.map((style) => (
                <button
                  key={style.value}
                  onClick={() =>
                    setTravelStyle(travelStyle === style.value ? "" : style.value)
                  }
                  className={`relative p-4 rounded-2xl border-2 transition-all text-left ${
                    travelStyle === style.value
                      ? "border-amber-400 bg-amber-50 ring-2 ring-amber-200"
                      : "border-stone-200 bg-white hover:border-stone-300 hover:shadow-sm"
                  }`}
                >
                  <span className="text-2xl block mb-2">{style.icon}</span>
                  <span className="text-sm font-medium text-stone-800">
                    {style.label}
                  </span>
                  {travelStyle === style.value && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-amber-400 rounded-full flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>

            <p className="text-xs text-stone-400 text-center">
              Optionnel — tu peux ne rien sélectionner
            </p>
          </div>
        )}

        {/* Step 2: People */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in">
            <div>
              <h2 className="text-2xl font-bold text-stone-800 mb-1">
                Qui participe au voyage ?
              </h2>
              <p className="text-stone-500 text-sm">
                Décris les voyageurs pour aider l'IA à les reconnaître et les
                mentionner dans les récits
              </p>
            </div>

            {loadingPeople ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="text-amber-500 animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {people.map((person, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-2xl border border-stone-200 p-5 space-y-3 group relative"
                  >
                    <button
                      onClick={() => removePerson(idx)}
                      className="absolute top-3 right-3 p-1.5 text-stone-300 hover:text-red-500 rounded-lg hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                    >
                      <X size={16} />
                    </button>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-stone-500 mb-1">
                          Prénom *
                        </label>
                        <input
                          value={person.name}
                          onChange={(e) =>
                            updatePerson(idx, "name", e.target.value)
                          }
                          placeholder="Ex: Sophie"
                          className="w-full px-3 py-2 border border-stone-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-stone-500 mb-1">
                          Rôle / lien
                        </label>
                        <input
                          value={person.role}
                          onChange={(e) =>
                            updatePerson(idx, "role", e.target.value)
                          }
                          placeholder="Ex: ma fille, mon mari, amie..."
                          className="w-full px-3 py-2 border border-stone-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-stone-500 mb-1">
                        Description physique / indices visuels
                      </label>
                      <input
                        value={person.description}
                        onChange={(e) =>
                          updatePerson(idx, "description", e.target.value)
                        }
                        placeholder="Ex: 3 ans, cheveux blonds bouclés, souvent en robe rose"
                        className="w-full px-3 py-2 border border-stone-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none"
                      />
                    </div>
                  </div>
                ))}

                <button
                  onClick={addPerson}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-stone-300 rounded-2xl text-stone-500 hover:border-amber-400 hover:text-amber-700 hover:bg-amber-50/50 transition-all"
                >
                  <Plus size={18} />
                  <span className="text-sm font-medium">Ajouter un voyageur</span>
                </button>
              </div>
            )}

            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <p className="text-xs text-blue-700 leading-relaxed">
                <strong>Astuce :</strong> Plus la description est précise, mieux
                l'IA pourra mentionner les bonnes personnes dans les légendes.
                Les descriptions physiques aident aussi la reconnaissance
                faciale à mieux identifier chacun.
              </p>
            </div>
          </div>
        )}

        {/* Step 3: AI context */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in">
            <div>
              <h2 className="text-2xl font-bold text-stone-800 mb-1">
                Contexte pour l'IA
              </h2>
              <p className="text-stone-500 text-sm">
                Notes libres pour personnaliser les textes générés
              </p>
            </div>

            <div className="bg-white rounded-2xl border border-stone-200 p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  <Sparkles size={14} className="inline mr-1 -mt-0.5" />
                  Contexte / notes pour l'IA
                </label>
                <textarea
                  value={aiContext}
                  onChange={(e) => setAiContext(e.target.value)}
                  rows={4}
                  placeholder={`Ex:\n• Voyage pour fêter nos 10 ans de mariage\n• On adore la street food et les randonnées\n• Premier voyage à l'étranger de notre fille\n• Ton léger et humoristique apprécié`}
                  className="w-full px-4 py-3 border border-stone-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-300 focus:border-amber-400 outline-none transition-all resize-none"
                />
                <p className="text-xs text-stone-400 mt-1.5">
                  Ces informations seront injectées dans chaque prompt IA pour
                  personnaliser les descriptions et résumés.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-stone-700 mb-1.5">
                  <Globe size={14} className="inline mr-1 -mt-0.5" />
                  Langue des textes générés
                </label>
                <div className="flex flex-wrap gap-2">
                  {LANGUAGES.map((lang) => (
                    <button
                      key={lang.value}
                      onClick={() => setLanguage(lang.value)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                        language === lang.value
                          ? "border-amber-400 bg-amber-50 text-amber-800"
                          : "border-stone-200 bg-white text-stone-600 hover:border-stone-300"
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-stone-200">
          <button
            onClick={() => setStep(Math.max(0, step - 1))}
            disabled={step === 0}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all ${
              step === 0
                ? "text-stone-300 cursor-not-allowed"
                : "text-stone-600 hover:bg-stone-100"
            }`}
          >
            <ArrowLeft size={16} />
            Précédent
          </button>

          {step < steps.length - 1 ? (
            <button
              onClick={() => setStep(step + 1)}
              disabled={!canNext()}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium transition-all ${
                canNext()
                  ? "bg-amber-500 text-white hover:bg-amber-600 shadow-sm"
                  : "bg-stone-200 text-stone-400 cursor-not-allowed"
              }`}
            >
              Suivant
              <ArrowRight size={16} />
            </button>
          ) : (
            <button
              onClick={handleSave}
              disabled={saving || !canNext()}
              className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Enregistrement...
                </>
              ) : (
                <>
                  <Save size={16} />
                  {isEdit ? "Enregistrer" : "Créer le voyage"}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
