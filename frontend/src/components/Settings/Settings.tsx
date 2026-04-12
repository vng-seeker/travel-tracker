import { useState, useEffect, useCallback } from "react";
import {
  Settings as SettingsIcon,
  Save,
  Loader2,
  CheckCircle2,
  XCircle,
  Wifi,
  WifiOff,
  Cpu,
  Cloud,
  RefreshCw,
} from "lucide-react";
import api from "../../api/client";
import { AppSettings, OllamaStatus } from "../../types";

export default function SettingsPanel() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [provider, setProvider] = useState<string>("anthropic");
  const [ollamaUrl, setOllamaUrl] = useState<string>("");
  const [ollamaModel, setOllamaModel] = useState<string>("");

  const [ollamaStatus, setOllamaStatus] = useState<OllamaStatus | null>(null);
  const [checkingOllama, setCheckingOllama] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get<AppSettings>("/api/settings");
        setSettings(data);
        setProvider(data.ai_provider);
        setOllamaUrl(data.ollama_base_url);
        setOllamaModel(data.ollama_model);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const checkOllama = useCallback(async () => {
    setCheckingOllama(true);
    setOllamaStatus(null);
    try {
      const { data } = await api.get<OllamaStatus>("/api/settings/ollama-status");
      setOllamaStatus(data);
    } catch {
      setOllamaStatus({
        status: "error",
        error: "Impossible de joindre le backend",
        models: [],
        current_model: ollamaModel,
        current_model_available: false,
      });
    } finally {
      setCheckingOllama(false);
    }
  }, [ollamaModel]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const { data } = await api.patch<AppSettings>("/api/settings", {
        ai_provider: provider,
        ollama_base_url: ollamaUrl,
        ollama_model: ollamaModel,
      });
      setSettings(data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  const hasChanges =
    settings &&
    (provider !== settings.ai_provider ||
      ollamaUrl !== settings.ollama_base_url ||
      ollamaModel !== settings.ollama_model);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div className="flex items-center gap-3">
        <SettingsIcon className="w-7 h-7 text-indigo-600" />
        <h2 className="text-2xl font-bold text-gray-800">Paramètres</h2>
      </div>

      {/* Provider selector */}
      <section className="bg-white rounded-xl shadow-sm border p-6 space-y-5">
        <h3 className="text-lg font-semibold text-gray-700">Fournisseur IA</h3>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => setProvider("anthropic")}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
              provider === "anthropic"
                ? "border-indigo-500 bg-indigo-50 shadow-md"
                : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
          >
            <Cloud
              className={`w-8 h-8 ${provider === "anthropic" ? "text-indigo-600" : "text-gray-400"}`}
            />
            <div className="text-left">
              <p className={`font-semibold ${provider === "anthropic" ? "text-indigo-700" : "text-gray-700"}`}>
                Anthropic Claude
              </p>
              <p className="text-xs text-gray-500">API cloud — {settings?.claude_model}</p>
            </div>
          </button>

          <button
            onClick={() => setProvider("ollama")}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
              provider === "ollama"
                ? "border-emerald-500 bg-emerald-50 shadow-md"
                : "border-gray-200 hover:border-gray-300 bg-white"
            }`}
          >
            <Cpu
              className={`w-8 h-8 ${provider === "ollama" ? "text-emerald-600" : "text-gray-400"}`}
            />
            <div className="text-left">
              <p className={`font-semibold ${provider === "ollama" ? "text-emerald-700" : "text-gray-700"}`}>
                Ollama (local)
              </p>
              <p className="text-xs text-gray-500">Modèle local — pas de clé API</p>
            </div>
          </button>
        </div>
      </section>

      {/* Ollama config */}
      {provider === "ollama" && (
        <section className="bg-white rounded-xl shadow-sm border p-6 space-y-5">
          <h3 className="text-lg font-semibold text-gray-700">Configuration Ollama</h3>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">URL du serveur Ollama</label>
            <input
              type="text"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
              placeholder="http://host.docker.internal:11434"
              className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              Depuis Docker, utilisez <code className="bg-gray-100 px-1 rounded">host.docker.internal</code> pour atteindre le Mac hôte.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1.5">Modèle</label>
            <input
              type="text"
              value={ollamaModel}
              onChange={(e) => setOllamaModel(e.target.value)}
              placeholder="qwen3-vl"
              className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 text-sm"
            />
          </div>

          {/* Connection test */}
          <div className="border-t pt-4 mt-4">
            <button
              onClick={checkOllama}
              disabled={checkingOllama}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 text-sm font-medium transition-colors"
            >
              {checkingOllama ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              Tester la connexion
            </button>

            {ollamaStatus && (
              <div
                className={`mt-3 p-4 rounded-lg border ${
                  ollamaStatus.status === "connected"
                    ? "bg-emerald-50 border-emerald-200"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {ollamaStatus.status === "connected" ? (
                    <>
                      <Wifi className="w-4 h-4 text-emerald-600" />
                      <span className="font-medium text-emerald-700">Connecté</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-4 h-4 text-red-600" />
                      <span className="font-medium text-red-700">Erreur de connexion</span>
                    </>
                  )}
                </div>

                {ollamaStatus.status === "connected" ? (
                  <div className="space-y-1.5 text-sm">
                    <p className="text-gray-600">
                      <span className="font-medium">Modèles disponibles :</span>{" "}
                      {ollamaStatus.models.length > 0
                        ? ollamaStatus.models.join(", ")
                        : "Aucun modèle trouvé"}
                    </p>
                    <div className="flex items-center gap-1.5">
                      {ollamaStatus.current_model_available ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <XCircle className="w-4 h-4 text-amber-600" />
                      )}
                      <span
                        className={
                          ollamaStatus.current_model_available
                            ? "text-emerald-700"
                            : "text-amber-700"
                        }
                      >
                        {ollamaStatus.current_model_available
                          ? `"${ollamaStatus.current_model}" est disponible`
                          : `"${ollamaStatus.current_model}" non trouvé — vérifiez le nom du modèle`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-red-600">{ollamaStatus.error}</p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {/* Anthropic info */}
      {provider === "anthropic" && (
        <section className="bg-white rounded-xl shadow-sm border p-6 space-y-3">
          <h3 className="text-lg font-semibold text-gray-700">Anthropic Claude</h3>
          <p className="text-sm text-gray-600">
            Modèle : <code className="bg-gray-100 px-1.5 py-0.5 rounded text-indigo-700">{settings?.claude_model}</code>
          </p>
          <p className="text-sm text-gray-500">
            La clé API est configurée via la variable d'environnement <code className="bg-gray-100 px-1 rounded">ANTHROPIC_API_KEY</code>.
          </p>
        </section>
      )}

      {/* Save */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-sm transition-all ${
            hasChanges
              ? "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md"
              : "bg-gray-200 text-gray-500 cursor-not-allowed"
          }`}
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Enregistrer
        </button>

        {saved && (
          <span className="inline-flex items-center gap-1.5 text-emerald-600 text-sm font-medium animate-fade-in">
            <CheckCircle2 className="w-4 h-4" />
            Paramètres enregistrés
          </span>
        )}
      </div>
    </div>
  );
}
