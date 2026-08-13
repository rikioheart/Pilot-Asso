import { useEffect, useState } from "react";
import { FolderKanban, ListChecks, CalendarDays, Send, MapPin, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, KpiCard, EmptyState } from "@/components/Ui";

export default function ProDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard/pro").then((r) => setData(r.data)).catch(() => setData(false));
  }, []);

  if (!data) return <p className="text-muted-foreground">Chargement…</p>;
  const k = data.kpis;

  return (
    <div data-testid="pro-dashboard">
      <PageHeader breadcrumb="Espace professionnel"
        title={`Bonjour ${data.profile?.first_name || ""}`}
        subtitle="Votre activité associative : projets, tâches, événements et revenus." />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
        <KpiCard testId="pro-kpi-projects" label="Mes projets" value={k.projects} icon={FolderKanban} />
        <KpiCard testId="pro-kpi-tasks" label="Mes tâches" value={k.tasks} icon={ListChecks} />
        <KpiCard testId="pro-kpi-events" label="Mes événements" value={k.events} icon={CalendarDays} />
        <KpiCard testId="pro-kpi-proposals" label="Mes propositions" value={k.proposals} icon={Send} />
        <KpiCard testId="pro-kpi-reservations" label="Réservations terrain" value={k.reservations} icon={MapPin} />
        <KpiCard testId="pro-kpi-revenue" label="Ma part" value={`${k.revenue_share} €`} icon={Wallet} tone="bordeaux" />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5" data-testid="pro-permissions">
          <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">Mes droits</h2>
          <p className="mt-1 text-sm text-muted-foreground">Niveau : {user?.access_level}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {data.permissions.map((p) => (
              <span key={p} data-testid={`permission-badge-${p}`}
                className="rounded-full bg-[#002060]/8 px-3 py-1 text-xs font-medium text-[#002060]">{p}</span>
            ))}
          </div>
        </div>
        <div className="rounded-xl border bg-card p-5" data-testid="pro-history">
          <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">Mon historique</h2>
          <div className="mt-4 space-y-3">
            {data.history.length === 0 && (
              <EmptyState testId="pro-history-empty" title="Aucune action encore"
                description="Vos actions apparaîtront ici et resteront tracées." />
            )}
            {data.history.map((l) => (
              <div key={l.log_id} className="border-l-2 border-[#800020]/40 pl-3">
                <p className="text-sm font-semibold text-[#002060]">{l.action} · {l.module}</p>
                <p className="text-xs text-muted-foreground">{new Date(l.timestamp).toLocaleString("fr-FR")}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
