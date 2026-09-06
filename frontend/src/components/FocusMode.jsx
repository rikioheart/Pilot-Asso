import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Eye, EyeOff, Play, Pause, RotateCcw, Timer } from "lucide-react";

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

  useEffect(() => {
    const sync = () => setPages(read());
    window.addEventListener("vdc-focus-changed", sync);
    return () => window.removeEventListener("vdc-focus-changed", sync);
  }, []);

  const toggle = useCallback(() => {
    const next = active ? pages.filter((p) => p !== pathname) : [...pages, pathname];
    sessionStorage.setItem(KEY, JSON.stringify(next));
    setPages(next);
    window.dispatchEvent(new Event("vdc-focus-changed"));
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

const WORK = 25 * 60;
const BREAK = 5 * 60;

/** Mini-minuteur Pomodoro doux (aide au rythme, sans alarme) — visible en mode focus. */
export const FocusPomodoro = () => {
  const { active } = useFocusMode();
  const [phase, setPhase] = useState("work");
  const [seconds, setSeconds] = useState(WORK);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(() => setSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (seconds > 0) return;
    const next = phase === "work" ? "break" : "work";
    setPhase(next);
    setSeconds(next === "work" ? WORK : BREAK);
    setRunning(false);
  }, [seconds, phase]);

  const reset = () => { setRunning(false); setPhase("work"); setSeconds(WORK); };
  if (!active) return null;

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const isBreak = phase === "break";

  return (
    <div data-testid="focus-pomodoro"
      className="fixed bottom-24 left-4 z-40 w-52 rounded-2xl border bg-card/95 p-4 shadow-lg backdrop-blur lg:bottom-6">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <Timer className="h-3.5 w-3.5" />
        <span data-testid="focus-pomodoro-phase">{isBreak ? "Petite pause" : "Concentration"}</span>
      </div>
      <p className="mt-1 font-display text-3xl font-extrabold tabular-nums text-[var(--marine)]"
        data-testid="focus-pomodoro-time">{mm}:{ss}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {isBreak ? "Respirez, revenez en douceur." : "Un pas à la fois, à votre rythme."}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={() => setRunning((r) => !r)} data-testid="focus-pomodoro-toggle"
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[var(--bordeaux)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--bordeaux-dark)]">
          {running ? <><Pause className="h-3.5 w-3.5" /> Pause</> : <><Play className="h-3.5 w-3.5" /> Démarrer</>}
        </button>
        <button type="button" onClick={reset} data-testid="focus-pomodoro-reset" aria-label="Réinitialiser"
          className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-[var(--marine)]">
          <RotateCcw className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};
