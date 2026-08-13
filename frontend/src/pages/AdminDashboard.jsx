import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, Briefcase, UserCheck, Clock, ShieldAlert, Crown, TrendingUp } from "lucide-react";
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
        subtitle="Ce qui existe, ce qui avance, ce qui doit être validé — en un coup d'œil."
        actions={<Button onClick={() => navigate("/admin/members?status=PENDING")} data-testid="dashboard-validate-cta"
          className="rounded-full bg-[#800020] hover:bg-[#63001a]">Valider les adhésions</Button>} />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
        <KpiCard testId="kpi-members" label="Membres" value={k.members} icon={Users} onClick={() => navigate("/admin/members")} />
        <KpiCard testId="kpi-professionals" label="Professionnels" value={k.professionals} icon={Briefcase}
          onClick={() => navigate("/admin/members?role=PROFESSIONNEL")} />
        <KpiCard testId="kpi-individuals" label="Particuliers" value={k.individuals} icon={UserCheck}
          onClick={() => navigate("/admin/members?role=PARTICULIER")} />
        <KpiCard testId="kpi-pending" label="En attente" value={k.pending_members} icon={Clock} tone="bordeaux"
          hint="À valider par le Bureau" onClick={() => navigate("/admin/members?status=PENDING")} />
        <KpiCard testId="kpi-suspended" label="Suspendus" value={k.suspended} icon={ShieldAlert} tone="bordeaux" />
        <KpiCard testId="kpi-bureau" label="Bureau" value={k.bureau} icon={Crown} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="rounded-xl border bg-card p-5" data-testid="weekly-progress-widget">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-[#800020]" />
            <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">Progression cette semaine</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Chaque petit progrès compte.</p>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Nouveaux membres", w.new_members],
              ["Validations", w.validations],
              ["Connexions", w.logins],
              ["Actions tracées", w.actions],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted/60 p-4">
                <p className="font-display text-2xl font-extrabold text-[#800020]">{value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          <h3 className="mt-8 font-display text-sm font-bold uppercase tracking-wide text-[#002060]">
            Adhésions en attente
          </h3>
          <div className="mt-3 space-y-2" data-testid="pending-list">
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
      </section>
    </div>
  );
}
