import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Ui";
import { Button } from "@/components/ui/button";

const FILTERS = [
  ["", "Toutes"], ["unread", "Non lues"], ["NEW_MEMBERSHIP", "Membres"],
  ["MEMBERSHIP_APPROVED", "Validations"], ["SYSTEM", "Système"],
];

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("");

  const load = useCallback(async () => {
    try {
      const params = filter === "unread" ? { unread_only: true } : filter ? { type: filter } : {};
      const { data } = await api.get("/notifications", { params });
      setItems(data.items);
    } catch (e) {
      toast.error(apiError(e));
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id) => {
    await api.post(`/notifications/${id}/read`);
    load();
  };

  return (
    <div data-testid="notifications-page">
      <PageHeader breadcrumb="Mon espace" title="Notifications"
        actions={<Button variant="outline" className="rounded-full" data-testid="notifications-mark-all"
          onClick={async () => { await api.post("/notifications/read-all"); load(); toast.success("Tout est lu"); }}>
          Tout marquer comme lu</Button>} />

      <div className="mb-5 flex flex-wrap gap-2">
        {FILTERS.map(([value, label]) => (
          <button key={label} onClick={() => setFilter(value)} data-testid={`notifications-filter-${label.toLowerCase()}`}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              filter === value ? "border-[var(--bordeaux)] bg-[var(--bordeaux)] text-white" : "hover:border-[var(--marine-a40)]"}`}>
            {label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState testId="notifications-empty" title="Aucune notification"
          description="Vous serez informé ici des validations, adhésions et actions importantes." />
      ) : (
        <div className="space-y-2">
          {items.map((n) => (
            <div key={n.notification_id} data-testid={`notification-row-${n.notification_id}`}
              className={`flex flex-col gap-2 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between ${n.is_read ? "opacity-60" : ""}`}>
              <div>
                <p className="font-semibold text-[var(--marine)]">{n.title}</p>
                <p className="text-sm text-muted-foreground">{n.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("fr-FR")} · {n.type}
                </p>
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
