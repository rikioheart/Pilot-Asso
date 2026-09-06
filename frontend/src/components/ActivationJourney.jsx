import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ArrowRight, X, Sparkles, Rocket } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";

/** Prompt 8G — Parcours d'activation du nouveau membre (une seule fois, passable, distinct des guides). */
export const ActivationJourney = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user || user.role === "ADMIN_BUREAU" || !profile) return;
    // N'apparaît qu'après la visite guidée, une seule fois.
    if (!profile.onboarding_done && !localStorage.getItem(`vdc_onboarding_${user.user_id}`)) return;
    if (localStorage.getItem(`vdc_activation_${user.user_id}`)) return;
    api.get("/activation/journey").then((r) => {
      if (r.data.eligible) { setData(r.data); setOpen(true); }
    }).catch(() => {});
  }, [user, profile]);

  const finish = async (endpoint) => {
    setOpen(false);
    localStorage.setItem(`vdc_activation_${user.user_id}`, "1");
    try { await api.post(endpoint); } catch { /* le repère local suffit */ }
  };

  if (!open || !data) return null;
  const done = data.steps.filter((s) => s.done).length;
  const pct = Math.round((done / data.steps.length) * 100);

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4" data-testid="activation-overlay">
      <div className="vdc-grain relative w-full max-w-lg overflow-hidden rounded-2xl bg-card">
        <div className="relative bg-[var(--bordeaux)] px-6 py-7 text-white">
          <button onClick={() => finish("/activation/skip")} data-testid="activation-skip" aria-label="Passer"
            className="absolute right-4 top-4 text-white/60 transition-colors hover:text-white">
            <X className="h-5 w-5" />
          </button>
          <div className="relative flex items-center gap-4">
            <Logo size={52} withGlow />
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/70">
                <Rocket className="h-3.5 w-3.5" /> Bien démarrer
              </p>
              <h2 className="mt-1 font-display text-xl font-extrabold" data-testid="activation-title">
                Vos premiers pas dans l'association
              </h2>
            </div>
          </div>
        </div>
        <div className="px-6 py-6">
          <div className="mb-4 flex items-center justify-between text-xs font-semibold">
            <span className="text-[var(--marine)]">{done} sur {data.steps.length} déjà fait</span>
            <span className="text-muted-foreground" data-testid="activation-progress-pct">{pct} %</span>
          </div>
          <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-[var(--bordeaux)] transition-all duration-300"
              style={{ width: `${pct}%` }} />
          </div>
          <ul className="space-y-3">
            {data.steps.map((s) => (
              <li key={s.key} data-testid={`activation-step-${s.key}`}
                className="flex items-start gap-3 rounded-xl border p-3">
                <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                  s.done ? "bg-emerald-600 text-white" : "border-2 border-muted"}`}>
                  {s.done && <Check className="h-3.5 w-3.5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--marine)]">{s.title}</span>
                  <span className="block text-xs text-muted-foreground">{s.description}</span>
                </span>
                {!s.done && (
                  <Button size="sm" variant="ghost" data-testid={`activation-cta-${s.key}`}
                    className="shrink-0 rounded-full text-[var(--bordeaux)]"
                    onClick={() => { setOpen(false); localStorage.setItem(`vdc_activation_${user.user_id}`, "1"); navigate(s.cta_link); }}>
                    {s.cta_label} <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => finish("/activation/skip")} data-testid="activation-close"
              className="text-muted-foreground">Plus tard</Button>
            <Button data-testid="activation-done" onClick={() => finish("/activation/complete")}
              className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]">
              <Sparkles className="mr-2 h-4 w-4" /> C'est parti !
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ActivationJourney;
