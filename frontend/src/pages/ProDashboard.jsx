import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ListChecks, CalendarDays, Sparkle, Star, UserCircle, FileText, Boxes, Link2, Clock, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import { NewsFeed } from "@/components/NewsFeed";
import { PageHeader, KpiCard, EmptyState, SectionCard, Chip } from "@/components/Ui";
import { StatusBadge, DeadlineChip } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { VisibleBlock } from "@/components/BlockVisibility";

const fmt = (d) => new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const short = (d) => new Date(d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

const Slot = ({ item, testId }) => (
  <Link to={item.activity_id ? `/activities?focus=${item.activity_id}` : `/events/${item.event_id}`} data-testid={testId}
    className="flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors hover:border-[var(--bordeaux-a40)] hover:bg-muted/50">
    <div className="w-16 shrink-0 text-xs font-semibold text-[var(--bordeaux)]">
      {item.start_time || (item.start_date || "").slice(11, 16) || "—"}
    </div>
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-semibold text-[var(--marine)]">{item.title}</p>
      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
        {item.date && !item.activity_id ? null : null}
        <span>{short(item.date || item.start_date)}</span>
        {item.location && <><MapPin className="ml-2 h-3 w-3" /> {item.location}</>}
      </p>
    </div>
    <StatusBadge status={item.status} />
  </Link>
);

export default function ProDashboard() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/dashboard/pro").then((r) => setData(r.data)).catch(() => setData(false)); }, []);
  if (!data) return <p className="text-muted-foreground">Chargement…</p>;

  const k = data.kpis;
  const today = data.today_activities || [];
  const week = [...(data.week_activities || []), ...(data.week_events || [])]
    .sort((a, b) => (a.date || a.start_date).localeCompare(b.date || b.start_date));
  const connected = Object.entries(data.connections || {}).filter(([, v]) => v);

  return (
    <div data-testid="pro-dashboard">
      <PageHeader breadcrumb={fmt(data.today)} title={`Bonjour ${data.profile?.first_name || ""}`}
        subtitle="Votre journée et votre semaine en un coup d'œil."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="rounded-full">
              <Link to="/profile" data-testid="pro-profile-link"><UserCircle className="mr-2 h-4 w-4" /> Ma fiche</Link>
            </Button>
            <Button asChild className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]">
              <Link to="/documents" data-testid="pro-documents-link">
                <FileText className="mr-2 h-4 w-4" /> Mes documents{data.my_documents_count ? ` (${data.my_documents_count})` : ""}
              </Link>
            </Button>
          </div>
        } />

      {connected.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-2" data-testid="pro-connections">
          {connected.map(([key]) => (
            <Chip key={key} tone="green"><Link2 className="h-3 w-3" />
              {key === "google_calendar" ? "Google Calendar connecté" : "Rintintin Pro connecté"}</Chip>
          ))}
        </div>
      )}

      <VisibleBlock id="pro.kpis"><section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4" data-focus-secondary="true">
        <KpiCard testId="pro-kpi-today" label="Aujourd'hui" value={today.length} icon={Clock} tone="bordeaux" />
        <KpiCard testId="pro-kpi-week" label="Cette semaine" value={week.length} icon={CalendarDays} />
        <KpiCard testId="pro-kpi-tasks" label="Tâches assignées" value={k.tasks} icon={ListChecks} />
        <KpiCard testId="pro-kpi-stamps" label="Participations validées" value={k.stamps} icon={Star} tone="bordeaux" />
      </section></VisibleBlock>

      <section className="mt-6" data-testid="pro-news"><NewsFeed /></section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="space-y-6">
          <VisibleBlock id="pro.today"><SectionCard title="Aujourd'hui" icon={Sparkle} testId="pro-today">
            {today.length === 0 ? (
              <EmptyState testId="pro-today-empty" module="activities" title="Rien de prévu aujourd'hui"
                description="Profitez-en pour préparer la semaine ou proposer une nouvelle activité."
                action={<Button asChild className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]">
                  <Link to="/activities?new=1" data-testid="pro-create-activity">Proposer une activité</Link></Button>} />
            ) : <div className="space-y-2">{today.map((a) => <Slot key={a.activity_id} item={a} testId={`pro-today-${a.activity_id}`} />)}</div>}
          </SectionCard></VisibleBlock>

          <VisibleBlock id="pro.week"><SectionCard title="Semaine en cours" icon={CalendarDays} testId="pro-week"
            subtitle={`Jusqu'au ${short(data.week_end)}`}>
            {week.length === 0 ? (
              <p className="text-sm text-muted-foreground" data-testid="pro-week-empty">Aucune activité ni événement planifié sur les 7 prochains jours.</p>
            ) : <div className="space-y-2">{week.map((a) => <Slot key={a.activity_id || a.event_id} item={a}
              testId={`pro-week-${a.activity_id || a.event_id}`} />)}</div>}
          </SectionCard></VisibleBlock>
        </div>

        <div className="space-y-6">
          <VisibleBlock id="pro.tasks"><SectionCard title="Mes tâches" icon={ListChecks} testId="pro-my-tasks"
            actions={<Link to="/tasks" className="text-sm font-semibold text-[var(--bordeaux)] hover:underline">Tout voir</Link>}>
            {data.my_tasks.length === 0 ? (
              <EmptyState testId="pro-tasks-empty" module="tasks" title="Aucune tâche assignée"
                description="Les tâches que le Bureau vous confie apparaîtront ici." />
            ) : (
              <div className="space-y-2">
                {data.my_tasks.map((t) => (
                  <Link key={t.task_id} to={`/projects/${t.project_id}`} data-testid={`pro-task-${t.task_id}`}
                    className="block rounded-lg border px-4 py-3 transition-colors hover:border-[var(--bordeaux-a40)] hover:bg-muted/50">
                    <p className="text-sm font-semibold text-[var(--marine)]">{t.title}</p>
                    <div className="mt-2 flex flex-wrap gap-2"><StatusBadge status={t.status} /><DeadlineChip deadline={t.deadline} /></div>
                  </Link>
                ))}
              </div>
            )}
          </SectionCard></VisibleBlock>

          {(data.low_stock || []).length > 0 && (<VisibleBlock id="pro.low_stock">
            <SectionCard title="Stock bas" icon={Boxes} testId="pro-low-stock" secondary
              actions={<Link to="/stock" className="text-sm font-semibold text-[var(--bordeaux)] hover:underline">Stocks</Link>}>
              <ul className="space-y-1.5 text-sm">
                {data.low_stock.map((s) => (
                  <li key={s.item_id} className="flex justify-between rounded-lg bg-muted/50 px-3 py-2" data-testid={`pro-low-${s.item_id}`}>
                    <span className="font-semibold text-[var(--marine)]">{s.name}</span>
                    <span className="text-amber-700">{s.quantity} restant(s)</span>
                  </li>
                ))}
              </ul>
            </SectionCard></VisibleBlock>
          )}
        </div>
      </section>
    </div>
  );
}
