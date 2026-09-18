import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { api } from "@/lib/api";

/** Regroupe les informations secondaires du tableau de bord : repliées par défaut, dépliables et mémorisées. */
export const SecondaryPanel = ({ children, title = "Informations complémentaires" }) => {
  const [open, setOpen] = useState(null);

  useEffect(() => {
    api.get("/dashboard/layout").then((r) => setOpen(!!r.data.secondary_open)).catch(() => setOpen(false));
  }, []);

  if (open === null) return null;

  const toggle = () => {
    const v = !open;
    setOpen(v);
    api.put("/account/dashboard", { secondary_open: v }).catch(() => {});
  };

  return (
    <div className="mt-section" data-testid="dashboard-secondary">
      <button type="button" onClick={toggle} data-testid="dashboard-secondary-toggle"
        className="flex w-full items-center justify-between rounded-xl border bg-card p-card text-left transition-colors hover:border-[var(--bordeaux-a40)]">
        <span className="font-display text-base font-bold text-[var(--marine)]">{title}</span>
        <ChevronDown className={`h-5 w-5 text-[var(--bordeaux)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="mt-4 space-y-6" data-testid="dashboard-secondary-content">{children}</div>}
    </div>
  );
};

export default SecondaryPanel;
