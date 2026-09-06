import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, Dog as DogIcon, MapPin, Clock, Stethoscope } from "lucide-react";
import { api } from "@/lib/api";
import { SectionCard, EmptyState } from "@/components/Ui";
import { NewsFeed } from "@/components/NewsFeed";
import { Button } from "@/components/ui/button";

const fmt = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" }) : "");

/** Prompt 8G — Les 3 blocs d'accueil communs : progression du chien, fil d'actualité, participations à venir. */
export const BaseHomeBlocks = () => {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/dashboard/member").then((r) => setData(r.data)).catch(() => setData(false)); }, []);

  const dogs = data?.dog_cards || [];
  const next = data?.next_items || [];

  return (
    <div className="space-y-6" data-testid="home-base-blocks">
      <section data-testid="home-news"><NewsFeed /></section>

      <section className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <SectionCard title={dogs.length > 1 ? "Mes chiens" : "Mon chien"} icon={DogIcon} testId="home-dogs"
          actions={<Link to="/dogs" className="text-sm font-semibold text-[var(--bordeaux)] hover:underline"
            data-testid="home-dogs-link">Suivi complet</Link>}>
          {dogs.length === 0 ? (
            <EmptyState testId="home-dogs-empty" module="dashboard" icon={DogIcon} title="Aucun chien enregistré"
              description="Ajoutez votre chien à votre profil pour suivre sa progression."
              action={<Link to="/profile"><Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                data-testid="home-add-dog-cta">Ajouter mon chien</Button></Link>} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {dogs.map((d) => (
                <div key={d.dog_id} className="rounded-xl border bg-muted/40 p-4" data-testid={`home-dog-${d.dog_id}`}>
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
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Mes participations à venir" icon={CalendarDays} testId="home-next"
          actions={<Link to="/participations" className="text-sm font-semibold text-[var(--bordeaux)] hover:underline"
            data-testid="home-next-link">Toutes</Link>}>
          {next.length === 0 ? (
            <EmptyState testId="home-next-empty" module="activities" title="Rien de prévu pour l'instant"
              description="Inscrivez-vous à une balade ou un atelier pour la voir apparaître ici."
              action={<Link to="/activities"><Button variant="outline" className="rounded-full"
                data-testid="home-activities-cta">Voir les activités</Button></Link>} />
          ) : (
            <div className="space-y-2">
              {next.map((n) => (
                <Link key={n.id} to={n.link} data-testid={`home-next-${n.id}`}
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
          )}
        </SectionCard>
      </section>
    </div>
  );
};

export default BaseHomeBlocks;
