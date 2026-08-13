import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Users, Briefcase, UserCheck, Clock, FolderKanban, CheckCircle2, AlertTriangle,
  LifeBuoy, HandHeart, Ban, TrendingUp,
} from "lucide-react";
import { api } from "@/lib/api";
import { PageHeader, KpiCard, EmptyState } from "@/components/Ui";
import { Button } from "@/components/ui/button";

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/dashboard/admin").then((r) => setData(r.data)).catch(() => setData(false));
  }, []);

  if (!data) return <p className="text-muted-foreground" data-testid="admin-dashboard-loading">Chargement du cockpit…</p>;

  const k = data.kpis;
  const w = data.weekly_progress;

  return (
    <div data-testid="admin-dashboard">
      <PageHeader breadcrumb="Bureau" title="Tableau de bord du Bureau"
        subtitle="Ce qui existe, ce qui avance, ce qui bloque, ce qui doit être validé."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" data-testid="dashboard-projects-cta"
              onClick={() => navigate("/projects")}>Voir les projets</Button>
            <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="dashboard-validate-cta"
              onClick={() => navigate("/admin/validation")}>Valider les actions</Button>
          </div>
        } />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
        <KpiCard testId="kpi-members" label="Membres" value={k.members} icon={Users} onClick={() => navigate("/admin/members")} />
        <KpiCard testId="kpi-professionals" label="Professionnels" value={k.professionals} icon={Briefcase}
          onClick={() => navigate("/directory")} />
        <KpiCard testId="kpi-individuals" label="Particuliers" value={k.individuals} icon={UserCheck}
          onClick={() => navigate("/admin/members?role=PARTICULIER")} />
        <KpiCard testId="kpi-active-projects" label="Projets actifs" value={k.active_projects} icon={FolderKanban}
          onClick={() => navigate("/projects")} />
        <KpiCard testId="kpi-tasks-to-validate" label="Tâches à valider" value={k.tasks_to_validate} icon={CheckCircle2}
          tone="bordeaux" onClick={() => navigate("/admin/validation")} />
        <KpiCard testId="kpi-pending" label="Adhésions en attente" value={k.pending_members} icon={Clock} tone="bordeaux"
          onClick={() => navigate("/admin/members?status=PENDING")} />
      </section>

      <section className="mt-3 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6 sm:mt-4">
        <KpiCard testId="kpi-overdue" label="Tâches en retard" value={k.overdue_tasks} icon={AlertTriangle}
          tone="bordeaux" onClick={() => navigate("/tasks")} />
        <KpiCard testId="kpi-help" label="Besoins d'aide" value={k.help_requests} icon={LifeBuoy} tone="bordeaux"
          onClick={() => navigate("/admin/help")} />
        <KpiCard testId="kpi-volunteer-open" label="Bénévolat ouvert" value={k.volunteer_tasks_open} icon={HandHeart}
          onClick={() => navigate("/tasks")} />
        <KpiCard testId="kpi-blocked" label="Tâches bloquées" value={k.blocked_tasks} icon={Ban}
          onClick={() => navigate("/tasks")} />
        <KpiCard testId="kpi-suspended" label="Suspendus" value={k.suspended} icon={Ban} />
        <KpiCard testId="kpi-bureau" label="Bureau" value={k.bureau} icon={Users} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5" data-testid="weekly-progress-widget">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#800020]" />
              <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">Progression cette semaine</h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Chaque petit progrès compte.</p>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-5">
              {[
                ["Tâches terminées", w.tasks_completed],
                ["Validations", w.validations],
                ["Nouveaux projets", w.new_projects],
                ["Nouveaux membres", w.new_members],
                ["Actions tracées", w.actions],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-muted/60 p-4">
                  <p className="font-display text-2xl font-extrabold text-[#800020]">{value}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5" data-testid="validation-queue">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">Actions à valider</h2>
              <Link to="/admin/validation" className="text-sm font-semibold text-[#800020] hover:underline"
                data-testid="validation-queue-link">Tout voir</Link>
            </div>
            <div className="mt-4 space-y-2">
              {data.validation_queue.length === 0 && (
                <EmptyState testId="validation-queue-empty" title="Rien en attente"
                  description="Les tâches terminées apparaîtront ici avec leur preuve." />
              )}
              {data.validation_queue.map((t) => (
                <Link key={t.task_id} to="/admin/validation" data-testid={`validation-queue-item-${t.task_id}`}
                  className="flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors hover:border-[#800020]/40 hover:bg-muted/50">
                  <span className="font-semibold text-[#002060]">{t.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.submitted_at ? new Date(t.submitted_at).toLocaleDateString("fr-FR") : ""}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5" data-testid="pending-list">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">Adhésions en attente</h2>
              <Link to="/admin/members?status=PENDING" className="text-sm font-semibold text-[#800020] hover:underline">
                Gérer
              </Link>
            </div>
            <div className="mt-4 space-y-2">
              {data.pending_list.length === 0 && (
                <EmptyState testId="pending-list-empty" title="Aucune demande en attente"
                  description="Les nouvelles inscriptions apparaîtront ici pour validation." />
              )}
              {data.pending_list.map((u) => (
                <button key={u.user_id} onClick={() => navigate(`/admin/members?focus=${u.user_id}`)}
                  data-testid={`pending-item-${u.user_id}`}
                  className="flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left text-sm transition-colors hover:border-[#800020]/40 hover:bg-muted/50">
                  <span className="font-semibold text-[#002060]">{u.email}</span>
                  <span className="text-xs text-muted-foreground">{u.role}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5" data-testid="help-widget">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">Qui a besoin d'aide</h2>
              <Link to="/admin/help" className="text-sm font-semibold text-[#800020] hover:underline"
                data-testid="help-widget-link">Tout voir</Link>
            </div>
            <div className="mt-4 space-y-3">
              {data.help_list.length === 0 && (
                <p className="text-sm text-muted-foreground">Personne n'a signalé de blocage cette semaine.</p>
              )}
              {data.help_list.map((h) => (
                <div key={h.help_id} className="rounded-lg border-l-2 border-amber-400 bg-muted/40 px-3 py-2"
                  data-testid={`help-widget-item-${h.help_id}`}>
                  <p className="text-sm font-semibold text-[#002060]">{h.user_name}</p>
                  <p className="text-xs text-muted-foreground">{h.message}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5" data-testid="activity-feed">
            <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">Fil d'activité</h2>
            <div className="mt-4 space-y-3">
              {data.activity_feed.length === 0 && <p className="text-sm text-muted-foreground">Aucune action enregistrée.</p>}
              {data.activity_feed.map((l) => (
                <div key={l.log_id} className="border-l-2 border-[#800020]/40 pl-3">
                  <p className="text-sm font-semibold text-[#002060]">{l.action} · {l.module}</p>
                  <p className="text-xs text-muted-foreground">
                    {l.user_email} — {new Date(l.timestamp).toLocaleString("fr-FR")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
