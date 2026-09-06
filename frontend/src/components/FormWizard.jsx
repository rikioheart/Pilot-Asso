import { useState } from "react";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Assistant multi-étapes réutilisable (Prompt 8F — morcellement des formulaires longs).
 * `steps` : [{ title, content, valid?: boolean, hint?: string }]
 * Navigation arrière sans perte de données (l'état est porté par le parent).
 * Action principale toujours en bas à droite, en bordeaux, taille cohérente.
 */
export function FormWizard({ steps, onSubmit, submitLabel = "Enregistrer", testId = "wizard", submitting = false }) {
  const [step, setStep] = useState(0);
  const total = steps.length;
  const current = steps[step];
  const last = step === total - 1;
  const blocked = current.valid === false;
  const pct = Math.round(((step + 1) / total) * 100);

  const goNext = () => { if (!blocked) setStep((s) => Math.min(s + 1, total - 1)); };
  const goPrev = () => setStep((s) => Math.max(s - 1, 0));
  const handlePrimary = () => { if (last) { if (!blocked) onSubmit(); } else goNext(); };

  return (
    <div data-testid={testId}>
      <div className="mb-5" data-testid={`${testId}-progress`}>
        <div className="flex flex-wrap items-center justify-between gap-1 text-xs font-semibold">
          <span className="text-[var(--marine)]">Étape {step + 1} sur {total} — {current.title}</span>
          <span className="text-muted-foreground" data-testid={`${testId}-progress-pct`}>{pct} %</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted" role="progressbar"
          aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-[var(--bordeaux)] transition-all duration-300"
            style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="space-y-4">{current.content}</div>

      {blocked && current.hint && (
        <p className="mt-3 rounded-lg bg-[var(--marine-a8)] px-3 py-2 text-sm text-[var(--marine)]"
          data-testid={`${testId}-hint`}>{current.hint}</p>
      )}

      <div className="sticky bottom-0 -mx-6 mt-6 flex items-center justify-between gap-3 border-t bg-card px-6 py-4">
        <Button type="button" variant="ghost" className="rounded-full" data-testid={`${testId}-back`}
          onClick={goPrev} disabled={step === 0}>
          <ChevronLeft className="mr-1 h-4 w-4" /> Précédent
        </Button>
        <Button type="button" disabled={blocked || submitting} data-testid={`${testId}-primary`}
          className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" onClick={handlePrimary}>
          {last
            ? (<><Check className="mr-1 h-4 w-4" /> {submitLabel}</>)
            : (<>Continuer <ChevronRight className="ml-1 h-4 w-4" /></>)}
        </Button>
      </div>
    </div>
  );
}
