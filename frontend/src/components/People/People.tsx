import { useState, useEffect, useCallback } from "react";
import {
  Users,
  UserPlus,
  Loader2,
  Pencil,
  Trash2,
  Check,
  X,
} from "lucide-react";
import api from "../../api/client";
import type { Person, FaceGroup } from "../../types";

interface Props {
  tripId: number;
}

export default function People({ tripId }: Props) {
  const [people, setPeople] = useState<Person[]>([]);
  const [faceGroups, setFaceGroups] = useState<FaceGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [naming, setNaming] = useState<{ groupIdx: number; name: string } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [peopleRes, facesRes] = await Promise.all([
        api.get<Person[]>(`/api/trips/${tripId}/people`),
        api.get<FaceGroup[]>(`/api/trips/${tripId}/faces/unidentified`),
      ]);
      setPeople(peopleRes.data);
      setFaceGroups(facesRes.data);
    } catch (err) {
      console.error("Failed to fetch people:", err);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleNameGroup = async (group: FaceGroup) => {
    if (!naming || !naming.name.trim()) return;

    try {
      const { data: person } = await api.post<Person>(
        `/api/trips/${tripId}/people`,
        { name: naming.name.trim() }
      );
      await api.post(`/api/people/${person.id}/assign`, {
        face_ids: group.face_ids,
      });
      setNaming(null);
      fetchData();
    } catch (err) {
      console.error("Failed to name group:", err);
    }
  };

  const handleAssignToExisting = async (
    group: FaceGroup,
    personId: number
  ) => {
    try {
      await api.post(`/api/people/${personId}/assign`, {
        face_ids: group.face_ids,
      });
      fetchData();
    } catch (err) {
      console.error("Failed to assign:", err);
    }
  };

  const handleRename = async (personId: number) => {
    if (!editName.trim()) return;
    try {
      await api.put(`/api/people/${personId}`, { name: editName.trim() });
      setEditingId(null);
      fetchData();
    } catch (err) {
      console.error("Failed to rename:", err);
    }
  };

  const handleDelete = async (personId: number, name: string) => {
    if (!confirm(`Supprimer "${name}" ? Les visages seront détachés.`)) return;
    try {
      await api.delete(`/api/people/${personId}`);
      fetchData();
    } catch (err) {
      console.error("Failed to delete person:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={32} className="animate-spin text-stone-300" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Known people */}
      <div>
        <h2 className="text-lg font-semibold text-stone-800 mb-4 flex items-center gap-2">
          <Users size={20} />
          Personnes ({people.length})
        </h2>

        {people.length === 0 && faceGroups.length === 0 && (
          <div className="text-center py-12">
            <Users size={48} className="mx-auto text-stone-300 mb-4" />
            <p className="text-stone-400">
              Aucun visage détecté pour l'instant
            </p>
            <p className="text-stone-300 text-sm mt-1">
              Uploadez des photos avec des personnes pour commencer
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {people.map((person) => (
            <div
              key={person.id}
              className="bg-white rounded-xl border border-stone-200 p-4 flex items-center gap-4"
            >
              <div className="flex -space-x-2">
                {person.sample_crops.slice(0, 3).map((crop, i) => (
                  <img
                    key={i}
                    src={`/face_crops/${crop}`}
                    className="w-10 h-10 rounded-full border-2 border-white object-cover"
                    alt=""
                  />
                ))}
                {person.sample_crops.length === 0 && (
                  <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center">
                    <Users size={16} className="text-stone-400" />
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                {editingId === person.id ? (
                  <div className="flex items-center gap-1">
                    <input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="px-2 py-1 border rounded text-sm w-full"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(person.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <button
                      onClick={() => handleRename(person.id)}
                      className="p-1 text-green-600"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="p-1 text-stone-400"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <p className="font-medium text-stone-800 truncate">
                    {person.name}
                  </p>
                )}
                <p className="text-xs text-stone-400">
                  {person.face_count} visage{person.face_count > 1 ? "s" : ""} ·{" "}
                  {person.photo_count} photo{person.photo_count > 1 ? "s" : ""}
                </p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setEditingId(person.id);
                    setEditName(person.name);
                  }}
                  className="p-1.5 text-stone-400 hover:text-stone-600 rounded"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => handleDelete(person.id, person.name)}
                  className="p-1.5 text-stone-400 hover:text-red-500 rounded"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Unidentified face groups */}
      {faceGroups.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-stone-800 mb-4 flex items-center gap-2">
            <UserPlus size={20} />
            Visages non identifiés ({faceGroups.reduce((s, g) => s + g.count, 0)})
          </h2>

          <div className="space-y-3">
            {faceGroups.map((group, idx) => (
              <div
                key={idx}
                className="bg-white rounded-xl border border-stone-200 p-4"
              >
                <div className="flex items-center gap-4">
                  <div className="flex -space-x-2 flex-shrink-0">
                    {group.crops.slice(0, 5).map((crop, i) => (
                      <img
                        key={i}
                        src={`/face_crops/${crop}`}
                        className="w-12 h-12 rounded-full border-2 border-white object-cover"
                        alt=""
                      />
                    ))}
                  </div>

                  <div className="flex-1">
                    <p className="text-sm text-stone-600">
                      {group.count} visage{group.count > 1 ? "s" : ""}{" "}
                      similaire{group.count > 1 ? "s" : ""}
                    </p>

                    {naming?.groupIdx === idx ? (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          value={naming.name}
                          onChange={(e) =>
                            setNaming({ ...naming, name: e.target.value })
                          }
                          placeholder="Prénom..."
                          className="px-2 py-1 border rounded text-sm flex-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleNameGroup(group);
                            if (e.key === "Escape") setNaming(null);
                          }}
                        />
                        <button
                          onClick={() => handleNameGroup(group)}
                          className="px-3 py-1 bg-vietnam-red text-white rounded text-sm"
                        >
                          OK
                        </button>
                        <button
                          onClick={() => setNaming(null)}
                          className="p-1 text-stone-400"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <button
                          onClick={() =>
                            setNaming({ groupIdx: idx, name: "" })
                          }
                          className="px-3 py-1 bg-stone-100 hover:bg-stone-200 rounded-full text-xs font-medium text-stone-600 transition-colors"
                        >
                          + Nouveau nom
                        </button>
                        {people.map((p) => (
                          <button
                            key={p.id}
                            onClick={() =>
                              handleAssignToExisting(group, p.id)
                            }
                            className="px-3 py-1 border border-stone-200 hover:border-vietnam-red hover:text-vietnam-red rounded-full text-xs text-stone-500 transition-colors"
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
