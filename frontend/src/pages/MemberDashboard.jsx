import { useEffect, useState } from "react";
import { CalendarDays, ListChecks, Dog as DogIcon, Star, Gift, Bell } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { PageHeader, KpiCard, EmptyState } from "@/components/Ui";

export default function MemberDashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/dashboard/member").then((r) => setData(r.data)).catch(() => setData(false));
  }, []);

  if (!data) return <p className="text-muted-foreground">Chargement…</p>;
  const k = data.kpis;

  return (
    <div data-testid="member-dashboard">
      <PageHeader breadcrumb="Espace adhérent"
        title={`Bonjour ${data.profile?.first_name || ""}`}
        subtitle="Vos activités, vos chiens, votre carte de fidélité et vos avantages." />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
        <KpiCard testId="member-kpi-activities" label="Mes activités" value={k.activities} icon={CalendarDays} />
        <KpiCard testId="member-kpi-registrations" label="Inscriptions" value={k.registrations} icon={CalendarDays} />
        <KpiCard testId="member-kpi-tasks" label="Tâches bénévoles" value={k.volunteer_tasks} icon={ListChecks} />
        <KpiCard testId="member-kpi-dogs" label="Mes chiens" value={k.dogs} icon={DogIcon} tone="bordeaux" />
        <KpiCard testId="member-kpi-loyalty" label="Points fidélité" value={k.loyalty_points} icon={Star} tone="bordeaux" />
        <KpiCard testId="member-kpi-advantages" label="Avantages" value={k.advantages} icon={Gift} />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
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
          <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">Prochaines étapes</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Les activités, événements, inscriptions et la carte de fidélité arrivent dans les prochaines phases.
          </p>
          <Link to="/notifications" data-testid="member-notifications-link"
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-[#002060] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#001740]">
            <Bell className="h-4 w-4" /> {data.unread_notifications} notification(s) non lue(s)
          </Link>
        </div>
      </section>
    </div>
  );
}
