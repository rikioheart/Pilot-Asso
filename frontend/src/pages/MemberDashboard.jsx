import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CalendarDays, Dog as DogIcon, FolderKanban, MapPin, Clock, Stethoscope } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { EmptyState, WelcomeBanner, SectionCard } from "@/components/Ui";
import { EngagementCard } from "@/components/ActivityFeed";
import { NewsFeed } from "@/components/NewsFeed";
import { StatusBadge, DeadlineChip } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { useBlockVisible } from "@/components/BlockVisibility";

const fmt = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : "");

export default function MemberDashboard() {
  const [data, setData] = useState(null);
  const [engagement, setEngagement] = useState(null);
  const navigate = useNavigate();
  const showDogs = useBlockVisible("member.dogs");
  const showNext = useBlockVisible("member.next");
  const showWork = useBlockVisible("member.work");
  const showVolunteer = useBlockVisible("member.volunteer");
  const showEngagement = useBlockVisible("member.engagement");

  const load = useCallback(() => {
    api.get("/dashboard/member").then((r) => setData(r.data)).catch(() => setData(false));
    api.get("/me/engagement").then((r) => setEngagement(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!data) return <p className="text-muted-foreground">Chargement…</p>;

  const claim = async (taskId) => {
    try { await api.post(`/tasks/${taskId}/claim`); toast.success("Merci ! La tâche vous est attribuée."); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  const dogs = showDogs ? (data.dog_cards || []) : [];
  const next = showNext ? (data.next_items || []) : [];
  const work = showWork ? [...(data.my_projects || []).map((p) => ({ ...p, kind: "project" })),
    ...(data.my_tasks || []).map((t) => ({ ...t, kind: "task" }))] : [];
  const zones = [dogs.length > 0, next.length > 0, work.length > 0].filter(Boolean).length;
  const cols = zones === 3 ? "lg:grid-cols-[5fr_3fr_2fr]" : zones === 2 ? "lg:grid-cols-[3fr_2fr]" : "lg:grid-cols-1";

  return (
    <div data-testid="member-dashboard">
      <WelcomeBanner testId="member-welcome" greeting="Espace adhérent"
        name={`Bonjour ${data.profile?.first_name || ""}`}
        message="Vos chiens, vos prochaines sorties et ce à quoi vous participez."
        badges={engagement?.badges}
        actions={
          <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" data-testid="member-advantages-cta"
            onClick={() => navigate("/advantages")}>Voir mes avantages</Button>
        } />

      {zones === 0 && (
        <EmptyState testId="member-dashboard-empty" module="dashboard" icon={DogIcon} title="Bienvenue !"
          description="Ajoutez votre chien à votre profil pour démarrer, puis inscrivez-vous à une première activité."
          action={<Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
            data-testid="member-add-dog-cta" onClick={() => navigate("/profile")}>Ajouter mon chien</Button>} />
      )}

      <section className="mb-6" data-testid="member-news"><NewsFeed /></section>

      <section className={`grid gap-6 ${cols}`} data-testid="member-zones">
        {dogs.length > 0 && (
          <SectionCard title={dogs.length > 1 ? "Mes chiens" : "Mon chien"} icon={DogIcon} testId="member-zone-dogs"
            actions={<Link to="/dogs" className="text-sm font-semibold text-[var(--bordeaux)] hover:underline"
              data-testid="member-dogs-link">Suivi complet</Link>}>
            <div className="grid gap-3 sm:grid-cols-2">
              {dogs.map((d) => (
                <div key={d.dog_id} className="rounded-xl border bg-muted/40 p-4" data-testid={`member-dog-${d.dog_id}`}>
                  <p className="font-display text-lg font-bold text-[var(--marine)]">{d.name}</p>
                  <p className="text-xs text-muted-foreground">{d.breed || "Race non renseignée"}</p>
                  <div className="mt-3 space-y-1.5 text-sm">
                    <p className="flex items-start gap-2"><Stethoscope className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--bordeaux)]" />
                      <span>{d.last_report
                        ? <>Dernier suivi le {fmt(d.last_report.date)}{d.last_report.title ? ` · ${d.last_report.title}` : ""}</>
                        : "Aucun suivi enregistré pour l'instant"}</span></p>
                    <p className="flex items-start gap-2"><Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--bordeaux)]" />
                      <span>{d.next_appointment
                        ? <>Prochain rendez-vous : {fmt(d.next_appointment.date)} · {d.next_appointment.title}</>
                        : "Pas de rendez-vous à venir"}</span></p>
                    {d.open_case && <p className="text-xs font-semibold text-amber-700">Dossier en cours : {d.open_case.title}</p>}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )}

        {next.length > 0 && (
          <SectionCard title="Prochainement" icon={CalendarDays} testId="member-zone-next"
            actions={<Link to="/activities" className="text-sm font-semibold text-[var(--bordeaux)] hover:underline"
              data-testid="member-activities-link">Toutes</Link>}>
            <div className="space-y-2">
              {next.map((n) => (
                <Link key={n.id} to={n.link} data-testid={`member-next-${n.id}`}
                  className="block rounded-lg border px-4 py-3 transition-colors hover:border-[var(--bordeaux-a40)] hover:bg-muted/50">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--bordeaux)]">
                    {n.kind === "event" ? "Événement" : "Activité"} · {fmt(n.date)}{n.time ? ` · ${n.time}` : ""}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-[var(--marine)]">{n.title}</p>
                  {n.location && <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3" /> {n.location}</p>}
                </Link>
              ))}
            </div>
          </SectionCard>
        )}

        {work.length > 0 && (
          <SectionCard title="En cours" icon={FolderKanban} testId="member-zone-work">
            <div className="space-y-2">
              {work.slice(0, 6).map((w) => (
                <Link key={w.kind + (w.project_id || "") + (w.task_id || "")}
                  to={`/projects/${w.project_id}`} data-testid={`member-work-${w.task_id || w.project_id}`}
                  className="block rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/50">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{w.kind === "task" ? "Tâche" : "Projet"}</p>
                  <p className="text-sm font-semibold text-[var(--marine)]">{w.title}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <StatusBadge status={w.status} />
                    {w.deadline && <DeadlineChip deadline={w.deadline} />}
                  </div>
                </Link>
              ))}
            </div>
          </SectionCard>
        )}
      </section>

      {showVolunteer && (data.open_volunteer_tasks || []).length > 0 && (
        <SectionCard title="Coups de main recherchés" testId="member-volunteer-tasks" className="mt-6" secondary
          subtitle="Des missions ouvertes à tous les adhérents : choisissez celle qui vous parle.">
          <div className="space-y-2">
            {data.open_volunteer_tasks.map((t) => (
              <div key={t.task_id} className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
                data-testid={`member-volunteer-${t.task_id}`}>
                <div><p className="text-sm font-semibold text-[var(--marine)]">{t.title}</p>
                  <p className="text-xs text-muted-foreground">{t.project_title}</p></div>
                <Button size="sm" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                  data-testid={`member-claim-${t.task_id}`} onClick={() => claim(t.task_id)}>Je m'en occupe</Button>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {showEngagement && engagement && <div className="mt-6" data-focus-secondary="true"><EngagementCard data={engagement} /></div>}
    </div>
  );
}
