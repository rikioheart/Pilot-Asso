import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, EmptyState } from "@/components/Ui";
import { JoinRequestButton } from "@/components/JoinRequestButton";
import { StatusBadge, DeadlineChip } from "@/components/Badges";
import { Button } from "@/components/ui/button";

const COLUMNS = ["TODO", "IN_PROGRESS", "WAITING", "BLOCKED", "PENDING_VALIDATION", "COMPLETED"];

export default function Tasks() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState(user?.role === "ADMIN_BUREAU" ? "all" : "mine");

  const load = useCallback(async () => {
    try {
      const params = { mine: filter === "mine" || undefined, overdue: filter === "overdue" || undefined,
        volunteer: filter === "volunteer" || undefined };
      const { data } = await api.get("/tasks", { params });
      setItems(data.items);
    } catch (e) {
      toast.error(apiError(e));
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const map = {};
    COLUMNS.forEach((c) => (map[c] = []));
    items.forEach((t) => (map[t.status] ? map[t.status].push(t) : null));
    return map;
  }, [items]);

  const FILTERS = [
    ["all", "Toutes"], ["mine", "Mes tâches"], ["overdue", "En retard"], ["volunteer", "Bénévolat ouvert"],
  ];

  return (
    <div data-testid="tasks-page">
      <PageHeader breadcrumb="Pilotage" title="Tâches"
        subtitle="Vue transversale : ce qui avance, ce qui bloque, ce qui attend une validation."
        actions={<JoinRequestButton kind="HELP_OFFER" variant="default" size="default"
          label="Je propose mon aide" testId="tasks-help-offer" />} />

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <Button key={value} size="sm" variant={filter === value ? "default" : "outline"}
            data-testid={`tasks-filter-${value}`}
            className={`rounded-full ${filter === value ? "bg-[#800020] hover:bg-[#63001a]" : ""}`}
            onClick={() => setFilter(value)}>{label}</Button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState testId="tasks-empty" title="Aucune tâche ici"
          description="Changez de filtre, ou ouvrez un projet pour créer et attribuer des tâches." />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4" data-testid="tasks-kanban">
          {COLUMNS.map((status) => (
            <div key={status} className="w-72 shrink-0" data-testid={`tasks-column-${status}`}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{status}</p>
                <span className="rounded-full bg-muted px-2 text-xs">{grouped[status].length}</span>
              </div>
              <div className="space-y-3">
                {grouped[status].map((t) => (
                  <Link key={t.task_id} to={`/projects/${t.project_id}`} data-testid={`task-card-${t.task_id}`}
                    className="block rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
                    <p className="text-sm font-semibold text-[#002060]">{t.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{t.project_title}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <StatusBadge status={t.status} />
                      <DeadlineChip deadline={t.deadline} />
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{t.assignee_name || "Non attribuée"}</p>
                    {t.needs_help && <p className="mt-1 text-xs font-semibold text-amber-700">Besoin d'aide</p>}
                    {t.blocked_by_title && <p className="mt-1 text-xs text-red-600">Bloquée par : {t.blocked_by_title}</p>}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
