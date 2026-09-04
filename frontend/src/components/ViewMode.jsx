import { useCallback, useState } from "react";
import { LayoutGrid, List, Table2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

const VIEWS = [["kanban", "Kanban", LayoutGrid], ["list", "Liste", List], ["table", "Tableau", Table2]];

/** Mode d'affichage mémorisé par module et par profil (profile.preferences.view_modes). */
export const useViewMode = (module, fallback = "kanban") => {
  const { profile, setProfile } = useAuth();
  const stored = profile?.preferences?.view_modes?.[module];
  const [local, setLocal] = useState(stored || fallback);
  const value = stored || local;

  const set = useCallback(async (next) => {
    setLocal(next);
    const view_modes = { ...(profile?.preferences?.view_modes || {}), [module]: next };
    setProfile?.((p) => (p ? { ...p, preferences: { ...(p.preferences || {}), view_modes } } : p));
    try { await api.put("/profiles/me/preferences", { view_modes }); } catch { /* silencieux */ }
  }, [module, profile, setProfile]);

  return [value, set];
};

export const ViewModeSwitch = ({ value, onChange, modes = ["kanban", "list", "table"], testId = "view-mode" }) => (
  <div className="inline-flex rounded-full border bg-card p-0.5" role="group" aria-label="Mode d'affichage"
    data-testid={testId}>
    {VIEWS.filter(([k]) => modes.includes(k)).map(([k, label, Icon]) => (
      <button key={k} type="button" onClick={() => onChange(k)} aria-pressed={value === k}
        data-testid={`${testId}-${k}`}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
          value === k ? "bg-[var(--bordeaux)] text-white" : "text-muted-foreground hover:bg-muted"}`}>
        <Icon className="h-3.5 w-3.5" /> <span className="hidden sm:inline">{label}</span>
      </button>
    ))}
  </div>
);
