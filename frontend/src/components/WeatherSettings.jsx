import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CloudSun } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { SectionCard } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confirmDialog } from "@/components/ConfirmDialog";

export function WeatherSettings() {
  const [status, setStatus] = useState(null);
  const [key, setKey] = useState("");
  const load = () => api.get("/settings/weather").then((r) => setStatus(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (key.trim().length < 8) return toast.error("Clé trop courte");
    try {
      await api.put("/settings/weather", { api_key: key.trim() });
      setKey(""); toast.success("Clé météo enregistrée"); load();
    } catch (e) { toast.error(apiError(e)); }
  };
  const clear = async () => {
    if (!(await confirmDialog("Supprimer la clé météo ?"))) return;
    try { await api.delete("/settings/weather"); toast.success("Clé supprimée"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <SectionCard title="Météo (OpenWeatherMap)" icon={CloudSun} testId="weather-settings-card" className="mb-6"
      subtitle="Saisissez la clé API gratuite OpenWeatherMap pour afficher la météo sur les activités et événements en extérieur. Tant qu'aucune clé n'est saisie, le bloc météo affiche « Météo non configurée ».">
      <div className="flex flex-wrap items-end gap-3" data-testid="weather-settings">
        <div className="w-full sm:w-96">
          <Label className="text-xs">
            Clé API {status?.configured && <span className="text-[var(--status-ok,#1e7f4f)]">· configurée ({status.masked})</span>}
          </Label>
          <Input type="password" value={key} data-testid="weather-key-input"
            placeholder={status?.configured ? "Remplacer la clé…" : "Coller la clé OpenWeatherMap"}
            onChange={(e) => setKey(e.target.value)} />
        </div>
        <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
          data-testid="weather-key-save" onClick={save}>Enregistrer</Button>
        {status?.configured && (
          <Button variant="outline" className="rounded-full" data-testid="weather-key-clear" onClick={clear}>Supprimer</Button>
        )}
      </div>
      <a href="https://home.openweathermap.org/api_keys" target="_blank" rel="noreferrer"
        className="mt-3 inline-block text-sm text-[var(--marine)] hover:underline">Obtenir une clé gratuite →</a>
    </SectionCard>
  );
}
