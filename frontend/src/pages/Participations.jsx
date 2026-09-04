import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Ui";
import { StatusBadge } from "@/components/Badges";

const ROLE_LABELS = {
  PARTICIPANT: "Participant", VOLUNTEER: "Bénévole", ORGANIZER: "Organisateur",
  PROFESSIONAL: "Professionnel", INTERVENANT: "Intervenant",
};

export default function Participations() {
  const [items, setItems] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/participations/me");
      setItems(data.items);
    } catch (e) {
      toast.error(apiError(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="participations-page">
      <PageHeader breadcrumb="Mon espace" title="Mes participations"
        subtitle="Vos inscriptions aux activités et événements, et votre présence enregistrée." />

      {items.length === 0 ? (
        <EmptyState testId="participations-empty" module="participations" title="Aucune inscription"
          description="Inscrivez-vous à une activité ou un événement depuis le calendrier." />
      ) : (
        <div className="space-y-2" data-testid="participations-list">
          {items.map((p) => (
            <Link key={p.participation_id} to={p.link || "/activities"} data-testid={`participation-${p.participation_id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:border-[var(--bordeaux-a40)]">
              <div>
                <p className="font-semibold text-[var(--marine)]">{p.title || "Inscription"}</p>
                <p className="text-xs text-muted-foreground">
                  {ROLE_LABELS[p.role] || p.role}
                  {p.date && ` · ${new Date(p.date).toLocaleDateString("fr-FR")}`}
                  {p.location && ` · ${p.location}`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={p.registration_status === "CONFIRMED" ? "COMPLETED" : "OPEN"} />
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
                  {p.attendance_status === "PRESENT" ? "présent"
                    : p.attendance_status === "ABSENT" ? "absent"
                    : p.attendance_status === "EXCUSED" ? "excusé" : "présence à confirmer"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
