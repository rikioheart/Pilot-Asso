import { useState } from "react";
import { CloudSun, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

const DAY_FMT = (d) => new Date(d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

export function WeatherWidget({ location, testId = "weather" }) {
  const [state, setState] = useState(null); // null | 'loading' | data | 'not_configured' | 'not_found' | 'error'
  if (!location) return null;

  const fetchWeather = async () => {
    setState("loading");
    try {
      const { data } = await api.get("/weather", { params: { location } });
      if (!data.configured) setState("not_configured");
      else if (!data.found) setState("not_found");
      else setState(data);
    } catch {
      setState("error");
    }
  };

  return (
    <div className="space-y-2" data-testid={`${testId}-widget`}>
      {state === null && (
        <Button size="sm" variant="outline" className="rounded-full" data-testid={`${testId}-fetch`} onClick={fetchWeather}>
          <CloudSun className="mr-1 h-3.5 w-3.5" /> Voir la météo (3 jours)
        </Button>
      )}
      {state === "loading" && (
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground" data-testid={`${testId}-loading`}>
          <Loader2 className="h-4 w-4 animate-spin" /> Chargement de la météo…
        </p>
      )}
      {state === "not_configured" && (
        <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground" data-testid={`${testId}-not-configured`}>
          Météo non configurée — le Bureau doit saisir une clé OpenWeatherMap dans les réglages.
        </p>
      )}
      {state === "not_found" && (
        <p className="text-sm text-muted-foreground" data-testid={`${testId}-not-found`}>
          Lieu introuvable pour la météo (« {location} »).
        </p>
      )}
      {state === "error" && (
        <p className="text-sm text-[var(--bordeaux)]" data-testid={`${testId}-error`}>
          Service météo momentanément indisponible.
        </p>
      )}
      {state && typeof state === "object" && (
        <div className="grid grid-cols-3 gap-2" data-testid={`${testId}-forecast`}>
          {state.days.map((d) => (
            <div key={d.date} className="rounded-lg border bg-card p-2 text-center" data-testid={`${testId}-day-${d.date}`}>
              <p className="text-xs font-semibold text-[var(--marine)]">{DAY_FMT(d.date)}</p>
              <img alt={d.description} className="mx-auto h-10 w-10"
                src={`https://openweathermap.org/img/wn/${d.icon}@2x.png`} />
              <p className="text-sm font-bold text-[var(--bordeaux)]">{d.temp_max}° <span className="text-muted-foreground font-normal">/ {d.temp_min}°</span></p>
              <p className="text-[10px] capitalize text-muted-foreground">{d.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
