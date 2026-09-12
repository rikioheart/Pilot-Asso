import { useState } from "react";
import { Link } from "react-router-dom";
import { HeartHandshake, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export const iaRelanceEnabled = () => localStorage.getItem("vdc_ia_relance") !== "off";

/** Prompt 11 F3 — Relance douce après un décrochage (> 21 j), affichée une seule fois par reconnexion. */
export const RelanceWelcome = () => {
  const { profile } = useAuth();
  const [info, setInfo] = useState(() => {
    const raw = sessionStorage.getItem("vdc_relance");
    if (raw) sessionStorage.removeItem("vdc_relance");
    if (!raw || !iaRelanceEnabled()) return null;
    try { return JSON.parse(raw); } catch { return null; }
  });
  if (!info) return null;
  const name = profile?.first_name ? ` ${profile.first_name}` : "";
  const weeks = Math.round((info.days || 0) / 7);
  const gap = weeks >= 2 ? `Cela fait environ ${weeks} semaines` : "Cela fait un moment";

  return (
    <div data-testid="relance-welcome"
      className="mb-6 flex items-start gap-3 rounded-xl border border-[var(--sable)] bg-[var(--marine-a5)] px-4 py-4">
      <HeartHandshake className="mt-0.5 h-6 w-6 shrink-0 text-[var(--bordeaux)]" />
      <div className="flex-1">
        <p className="font-semibold text-[var(--marine)]">Contente de vous revoir{name}</p>
        <p className="mt-1 text-sm text-foreground/80">
          {gap} qu'on ne s'était pas vus — votre chien et l'association vous attendaient.
          Reprenez tranquillement là où vous en étiez, rien ne presse.
        </p>
        <Link to="/dogs" data-testid="relance-welcome-resume"
          className="mt-2 inline-block text-sm font-semibold text-[var(--bordeaux)] hover:underline">
          Reprendre en douceur
        </Link>
      </div>
      <button data-testid="relance-welcome-dismiss" aria-label="Fermer" onClick={() => setInfo(null)}
        className="rounded-full p-1 text-muted-foreground hover:text-[var(--marine)]">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default RelanceWelcome;
