import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";

const KEY = "vdc_focus_pages";
const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch { return []; } };
export const resetFocusPages = () => sessionStorage.removeItem(KEY);

/** Mode focus page par page : masque les blocs secondaires, notifications et alertes. */
export const useFocusMode = () => {
  const { pathname } = useLocation();
  const [pages, setPages] = useState(read);
  const active = pages.includes(pathname);

  useEffect(() => {
    document.documentElement.dataset.focus = active ? "on" : "off";
  }, [active, pathname]);

  const toggle = useCallback(() => {
    const next = active ? pages.filter((p) => p !== pathname) : [...pages, pathname];
    sessionStorage.setItem(KEY, JSON.stringify(next));
    setPages(next);
  }, [active, pages, pathname]);

  return { active, toggle };
};

export const FocusToggle = () => {
  const { active, toggle } = useFocusMode();
  return (
    <button type="button" onClick={toggle} data-testid="focus-mode-toggle" aria-pressed={active}
      title={active ? "Quitter le mode focus sur cette page" : "Mode focus : ne garder que l'essentiel sur cette page"}
      className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors ${
        active ? "bg-[var(--bordeaux)] text-white" : "text-muted-foreground hover:bg-muted"}`}>
      {active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      <span className="hidden md:inline">{active ? "Focus actif" : "Focus"}</span>
    </button>
  );
};
