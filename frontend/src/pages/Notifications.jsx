import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plane, AlertCircle } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Ui";
import { Button } from "@/components/ui/button";

const LEVEL_COLORS = {
  ACTION: "bg-[var(--bordeaux)]", WARNING: "bg-amber-500", SUCCESS: "bg-emerald-600", INFO: "bg-[var(--marine)]",
};

const FILTERS = [
  ["", "Toutes"], ["priority", "Prioritaires"], ["unread", "Non lues"], ["archived", "Archivées"],
];

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("");
  const [archivedCount, setArchivedCount] = useState(0);
  const [vacation, setVacation] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (filter === "unread") params.unread_only = true;
      if (filter === "priority") params.priority = true;
      if (filter === "archived") params.archived = true;
      const { data } = await api.get("/notifications", { params });
      setItems(data.items);
      setArchivedCount(data.archived_count || 0);
    } catch (e) {
      toast.error(apiError(e));
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/account/settings").then((r) => setVacation(r.data.vacation)).catch(() => {}); }, []);

  const markRead = async (id) => { await api.post(`/notifications/${id}/read`); load(); };

  return (
    <div data-testid="notifications-page">
      <PageHeader breadcrumb="Mon espace" title="Centre de notifications"
        subtitle="Toutes vos notifications, réunies et triées : les priorités d'abord."
        actions={<Button variant="outline" className="rounded-full" data-testid="notifications-mark-all"
          onClick={async () => { await api.post("/notifications/read-all"); load(); toast.success("Tout est lu"); }}>
          Tout marquer comme lu</Button>} />

      {vacation?.active && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
          data-testid="notifications-vacation-banner">
          <Plane className="h-4 w-4 shrink-0" />
          <span>Mode vacances actif jusqu'au {vacation.end_date}. Vos notifications sont archivées et consultables dans « Archivées ».</span>
        </div>
      )}

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <button key={label} onClick={() => setFilter(value)} data-testid={`notifications-filter-${value || "all"}`}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              filter === value ? "border-[var(--bordeaux)] bg-[var(--bordeaux)] text-white" : "hover:border-[var(--marine-a40)]"}`}>
            {label}{value === "archived" && archivedCount ? ` (${archivedCount})` : ""}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState testId="notifications-empty" title="Aucune notification"
          description="Vous serez informé ici des mentions, validations, adhésions et actions importantes." />
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <div key={n.notification_id} data-testid={`notification-row-${n.notification_id}`}
              className={`flex flex-col gap-2 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between ${n.is_read ? "opacity-60" : ""}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${LEVEL_COLORS[n.level] || "bg-[var(--marine)]"}`} />
                <div>
                  <p className="flex items-center gap-2 font-semibold text-[var(--marine)]">
                    {n.title}
                    {n.priority_weight === 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bordeaux)] px-2 py-0.5 text-[10px] font-bold text-white"
                        data-testid={`notification-priority-${n.notification_id}`}>
                        <AlertCircle className="h-3 w-3" /> Prioritaire
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">{n.message}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("fr-FR")}
                    {n.received_during_vacation ? " · reçue pendant vos vacances" : ""}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                {n.link && (
                  <Link to={n.link} data-testid={`notification-open-${n.notification_id}`}
                    className="rounded-full border px-4 py-1.5 text-sm font-semibold text-[var(--marine)] transition-colors hover:bg-muted">
                    Ouvrir
                  </Link>
                )}
                {!n.is_read && (
                  <Button size="sm" variant="ghost" data-testid={`notification-read-${n.notification_id}`}
                    onClick={() => markRead(n.notification_id)}>Marquer lu</Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
