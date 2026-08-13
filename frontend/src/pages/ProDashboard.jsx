import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FolderKanban, ListChecks, CheckCircle2, Send, MapPin, Wallet } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, KpiCard, EmptyState } from "@/components/Ui";
import { StatusBadge, DeadlineChip } from "@/components/Badges";

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
        subtitle="Mon activité associative : projets, tâches, validations et historique." />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
        <KpiCard testId="pro-kpi-projects" label="Mes projets" value={k.projects} icon={FolderKanban} />
        <KpiCard testId="pro-kpi-tasks" label="Mes tâches" value={k.tasks} icon={ListChecks} />
        <KpiCard testId="pro-kpi-pending" label="En attente de validation" value={k.pending_validation}
          icon={Send} tone="bordeaux" />
        <KpiCard testId="pro-kpi-completed" label="Tâches validées" value={k.completed} icon={CheckCircle2} />
        <KpiCard testId="pro-kpi-reservations" label="Réservations terrain" value={k.reservations} icon={MapPin} />
        <KpiCard testId="pro-kpi-revenue" label="Ma part" value={`${k.revenue_share} €`} icon={Wallet} tone="bordeaux" />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-5" data-testid="pro-my-tasks">
          <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">Mes tâches en cours</h2>
          <div className="mt-4 space-y-2">
            {data.my_tasks.length === 0 && (
              <EmptyState testId="pro-tasks-empty" title="Aucune tâche en cours"
                description="Rejoignez un projet ou proposez votre aide au Bureau." />
            )}
            {data.my_tasks.map((t) => (
              <Link key={t.task_id} to={`/projects/${t.project_id}`} data-testid={`pro-task-${t.task_id}`}
                className="block rounded-lg border px-4 py-3 transition-colors hover:border-[#800020]/40 hover:bg-muted/50">
                <p className="text-sm font-semibold text-[#002060]">{t.title}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <StatusBadge status={t.status} />
                  <DeadlineChip deadline={t.deadline} />
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5" data-testid="pro-my-projects">
          <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">Mes projets</h2>
          <div className="mt-4 space-y-2">
            {data.my_projects.length === 0 && (
              <EmptyState testId="pro-projects-empty" title="Aucun projet"
                description="Demandez à rejoindre un projet depuis la page Projets." />
            )}
            {data.my_projects.map((p) => (
              <Link key={p.project_id} to={`/projects/${p.project_id}`} data-testid={`pro-project-${p.project_id}`}
                className="block rounded-lg border px-4 py-3 transition-colors hover:border-[#800020]/40 hover:bg-muted/50">
                <p className="text-sm font-semibold text-[#002060]">{p.title}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={p.status} />
                  <span className="text-xs text-muted-foreground">{p.completion_percentage} % avancé</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

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
