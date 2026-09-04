import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarCheck, GraduationCap, Gift, HandHeart, Settings2, Briefcase } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, SectionCard, EmptyState, Chip, KpiCard } from "@/components/Ui";
import { DisplayPreferences } from "@/components/DisplayPreferences";
import { ProSpaceForm, FunctionDescription } from "@/components/ProSpaceForm";
import { Button } from "@/components/ui/button";

const TABS = [["RECAP", "Mon récapitulatif"], ["PREFERENCES", "Affichage & accessibilité"],
  ["FUNCTION", "Ma fonction"], ["PRO", "Espace professionnel"]];

export default function MySpace() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("RECAP");
  const isPro = user?.role === "PROFESSIONNEL" || user?.role === "ADMIN_BUREAU";

  useEffect(() => { api.get("/me/space").then((r) => setData(r.data)).catch(() => setData(false)); }, []);

  if (!data) return <p className="text-muted-foreground" data-testid="my-space-loading">Chargement…</p>;

  const upcoming = [...data.activities, ...data.events].filter((i) => i.upcoming);

  return (
    <div data-testid="my-space-page">
      <PageHeader breadcrumb="Mon espace" title="Mon espace personnel"
        subtitle="Ce que vous avez rejoint, vos préférences d'affichage et votre fiche." />

      <div className="mb-6 flex flex-wrap gap-2" data-testid="my-space-tabs">
        {TABS.filter(([key]) => key !== "PRO" || isPro).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} data-testid={`my-space-tab-${key}`}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === key ? "bg-[var(--marine)] text-white" : "bg-muted text-[var(--marine)] hover:bg-muted/70"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "RECAP" && (
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <KpiCard testId="space-kpi-activities" label="Activités rejointes"
              value={data.activities.length} icon={CalendarCheck} />
            <KpiCard testId="space-kpi-events" label="Événements" value={data.events.length}
              icon={CalendarCheck} />
            <KpiCard testId="space-kpi-formations" label="Formations suivies"
              value={data.formations.length} icon={GraduationCap} />
            <KpiCard testId="space-kpi-advantages" label="Avantages utilisés"
              value={data.advantages_claimed} icon={Gift} tone="bordeaux" />
          </section>

          <SectionCard title="Mes prochains rendez-vous" icon={CalendarCheck} testId="space-upcoming">
            {upcoming.length === 0 ? (
              <EmptyState testId="space-upcoming-empty" title="Aucun rendez-vous à venir"
                description="Inscrivez-vous à une balade ou un atelier depuis le calendrier."
                action={<Link to="/calendar"><Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                  data-testid="space-calendar-link">Voir le calendrier</Button></Link>} />
            ) : (
              <ul className="space-y-2">
                {upcoming.map((item) => (
                  <li key={item.title + (item.date || item.start_date)}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm">
                    <span className="font-semibold text-[var(--marine)]">{item.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.date || item.start_date).toLocaleDateString("fr-FR")}
                      {item.location ? ` · ${item.location}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="Mes propositions d'aide" icon={HandHeart} testId="space-join-requests">
            {data.join_requests.length === 0 ? (
              <EmptyState testId="space-requests-empty" icon={HandHeart} title="Aucune proposition envoyée"
                description="Depuis Projets ou Tâches, proposez votre aide en un clic : le Bureau vous répondra."
                action={<Link to="/tasks"><Button variant="outline" className="rounded-full"
                  data-testid="space-tasks-link">Voir les tâches</Button></Link>} />
            ) : (
              <ul className="space-y-2">
                {data.join_requests.map((request) => (
                  <li key={request.request_id} data-testid={`space-request-${request.request_id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm">
                    <span>
                      <span className="font-semibold text-[var(--marine)]">
                        {request.target_title || "Proposition d'aide"}
                      </span>
                      {request.message && (
                        <span className="block text-xs text-muted-foreground">{request.message}</span>
                      )}
                    </span>
                    <Chip tone={{ ACCEPTED: "green", REFUSED: "red" }[request.status] || "amber"}>
                      {{ ACCEPTED: "Acceptée", REFUSED: "Non retenue" }[request.status] || "En attente"}
                    </Chip>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>
      )}

      {tab === "PREFERENCES" && <DisplayPreferences />}
      {tab === "FUNCTION" && <FunctionDescription />}
      {tab === "PRO" && isPro && <ProSpaceForm />}

      {tab === "PREFERENCES" && (
        <p className="mt-6 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Settings2 className="h-3.5 w-3.5" /> Vos informations personnelles se modifient dans
          <Link to="/profile" className="font-semibold text-[var(--bordeaux)] hover:underline">Mon profil</Link>.
        </p>
      )}
      {tab === "PRO" && (
        <p className="mt-6 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Briefcase className="h-3.5 w-3.5" /> Votre fiche alimente automatiquement l'annuaire professionnel.
        </p>
      )}
    </div>
  );
}
