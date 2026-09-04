const PROJECT_TONES = {
  IDEA: "bg-slate-100 text-slate-700",
  TO_REVIEW: "bg-indigo-50 text-indigo-700",
  PLANNED: "bg-sky-50 text-sky-700",
  IN_PROGRESS: "bg-[var(--marine-a10)] text-[var(--marine)]",
  WAITING: "bg-amber-50 text-amber-700",
  BLOCKED: "bg-red-50 text-red-700",
  PENDING_VALIDATION: "bg-[var(--bordeaux-a10)] text-[var(--bordeaux)]",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  ARCHIVED: "bg-muted text-muted-foreground",
  TODO: "bg-slate-100 text-slate-700",
  CANCELLED: "bg-muted text-muted-foreground",
  OPEN: "bg-amber-50 text-amber-700",
  HANDLED: "bg-sky-50 text-sky-700",
  RESOLVED: "bg-emerald-50 text-emerald-700",
};

const LABELS = {
  IDEA: "Idée", TO_REVIEW: "À étudier", PLANNED: "Planifié", IN_PROGRESS: "En cours",
  WAITING: "En attente", BLOCKED: "Bloqué", PENDING_VALIDATION: "À valider", COMPLETED: "Terminé",
  ARCHIVED: "Archivé", TODO: "À faire", CANCELLED: "Annulé", OPEN: "Ouverte", HANDLED: "Prise en charge",
  RESOLVED: "Résolue",
};

export const StatusBadge = ({ status, testId }) => (
  <span data-testid={testId} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${PROJECT_TONES[status] || "bg-muted"}`}>
    {LABELS[status] || status}
  </span>
);

export const DeadlineChip = ({ deadline, testId }) => {
  if (!deadline) return null;
  const date = new Date(deadline);
  const days = Math.ceil((date - new Date()) / 86400000);
  const tone = days < 0 ? "bg-red-50 text-red-700" : days <= 7 ? "bg-amber-50 text-amber-700" : "bg-muted text-muted-foreground";
  const label = days < 0 ? `En retard de ${Math.abs(days)} j` : days === 0 ? "Aujourd'hui" : `J-${days}`;
  return (
    <span data-testid={testId} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>
      {label} · {date.toLocaleDateString("fr-FR")}
    </span>
  );
};
