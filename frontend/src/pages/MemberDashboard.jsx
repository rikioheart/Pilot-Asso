import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CalendarDays, ListChecks, Dog as DogIcon, Star, Gift, HandHeart } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, KpiCard, EmptyState, WelcomeBanner } from "@/components/Ui";
import { ActivityFeed, EngagementCard } from "@/components/ActivityFeed";
import { StatusBadge, DeadlineChip } from "@/components/Badges";
import { Button } from "@/components/ui/button";

export default function MemberDashboard() {
  const [data, setData] = useState(null);
  const [feed, setFeed] = useState(null);
  const [engagement, setEngagement] = useState(null);
  const navigate = useNavigate();


  const load = useCallback(() => {
    api.get("/dashboard/member").then((r) => setData(r.data)).catch(() => setData(false));
    api.get("/feed").then((r) => setFeed(r.data)).catch(() => {});
    api.get("/me/engagement").then((r) => setEngagement(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  if (!data) return <p className="text-muted-foreground">Chargement…</p>;
  const k = data.kpis;

  const claim = async (taskId) => {
    try {
      await api.post(`/tasks/${taskId}/claim`);
      toast.success("Merci ! La tâche vous est attribuée.");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div data-testid="member-dashboard">
      <WelcomeBanner testId="member-welcome" greeting="Espace adhérent"
        name={`Bonjour ${data.profile?.first_name || ""}`}
        message="Vos inscriptions, vos avantages, vos chiens et les actualités de l'association."
        badges={engagement?.badges}
        actions={
          <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="member-advantages-cta"
            onClick={() => navigate("/advantages")}>Voir mes avantages</Button>
        } />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
        <KpiCard testId="member-kpi-activities" label="Mes activités" value={k.activities} icon={CalendarDays}
          onClick={() => navigate("/activities")} />
        <KpiCard testId="member-kpi-registrations" label="Prochaines inscriptions" value={k.registrations}
          icon={CalendarDays} onClick={() => navigate("/participations")} />
        <KpiCard testId="member-kpi-tasks" label="Tâches bénévoles" value={k.volunteer_tasks} icon={ListChecks}
          tone="bordeaux" />
        <KpiCard testId="member-kpi-dogs" label="Mes chiens" value={k.dogs} icon={DogIcon} tone="bordeaux" />
        <KpiCard testId="member-kpi-loyalty" label="Points fidélité" value={k.loyalty_points} icon={Star}
          tone="bordeaux" onClick={() => navigate("/loyalty")} />
        <KpiCard testId="member-kpi-advantages" label="Avantages" value={k.advantages} icon={Gift}
          onClick={() => navigate("/directory")} />
      </section>

      {data.upcoming?.length > 0 && (
        <section className="mt-6 rounded-xl border bg-card p-5" data-testid="member-upcoming">
          <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">Mes prochaines inscriptions</h2>
          <div className="mt-4 space-y-2">
            {data.upcoming.map((u) => (
              <Link key={`${u.title}-${u.date}`} to={u.link} data-testid={`member-upcoming-${u.date}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 transition-colors hover:border-[#800020]/40 hover:bg-muted/50">
                <span>
                  <span className="text-sm font-semibold text-[#002060]">{u.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{u.location || ""}</span>
                </span>
                <span className="text-xs font-semibold text-[#800020]">
                  {new Date(u.date).toLocaleDateString("fr-FR")} · {u.role === "VOLUNTEER" ? "bénévole" : "participant"}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <EngagementCard engagement={engagement} />
        <ActivityFeed feed={feed} />

        <div className="rounded-xl border bg-card p-5" data-testid="member-my-tasks">
          <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">Mes tâches</h2>
          <div className="mt-4 space-y-2">
            {data.my_tasks.length === 0 && (
              <EmptyState testId="member-tasks-empty" title="Aucune tâche en cours"
                description="Prenez une mission bénévole ouverte ci-contre : chaque coup de main compte." />
            )}
            {data.my_tasks.map((t) => (
              <Link key={t.task_id} to={`/projects/${t.project_id}`} data-testid={`member-task-${t.task_id}`}
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

        <div className="rounded-xl border bg-card p-5" data-testid="member-volunteer-tasks">
          <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">Missions bénévoles ouvertes</h2>
          <div className="mt-4 space-y-2">
            {data.open_volunteer_tasks.length === 0 && (
              <EmptyState testId="member-volunteer-empty" title="Aucune mission ouverte"
                description="Le Bureau publiera bientôt de nouvelles missions." />
            )}
            {data.open_volunteer_tasks.map((t) => (
              <div key={t.task_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3"
                data-testid={`member-volunteer-${t.task_id}`}>
                <div>
                  <p className="text-sm font-semibold text-[#002060]">{t.title}</p>
                  <DeadlineChip deadline={t.deadline} />
                </div>
                <Button size="sm" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                  data-testid={`member-claim-${t.task_id}`} onClick={() => claim(t.task_id)}>
                  <HandHeart className="mr-2 h-4 w-4" /> Je m'en occupe
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5" data-testid="member-dogs">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">Mes chiens</h2>
            <Link to="/profile" data-testid="member-manage-dogs-link"
              className="text-sm font-semibold text-[#800020] hover:underline">Gérer</Link>
          </div>
          <div className="mt-4 space-y-3">
            {data.dogs.length === 0 && (
              <EmptyState testId="member-dogs-empty" title="Aucun chien enregistré"
                description="Ajoutez votre chien depuis votre profil pour faciliter les inscriptions." />
            )}
            {data.dogs.map((d) => (
              <div key={d.dog_id} className="rounded-lg border px-4 py-3" data-testid={`member-dog-${d.dog_id}`}>
                <p className="font-semibold text-[#002060]">{d.name}</p>
                <p className="text-xs text-muted-foreground">{d.breed} · {d.character}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5">
          <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">Rester informé</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Retrouvez vos avantages, la bibliothèque des adhérents et les jeux-concours dans le menu de gauche.
          </p>
          <Link to="/notifications" data-testid="member-notifications-link"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#002060] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#001740]">
            {data.unread_notifications} notification(s) non lue(s)
          </Link>
        </div>
      </section>
    </div>
  );
}
