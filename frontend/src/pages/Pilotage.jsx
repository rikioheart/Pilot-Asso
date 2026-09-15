import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Gauge, Dog, AlertTriangle, Users, Target, CheckCircle2 } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, SectionCard, Chip } from "@/components/Ui";

const fmt = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "Aucune");

const Counter = ({ icon: Icon, label, value, testId }) => (
  <div className="rounded-xl border bg-card p-4" data-testid={testId}>
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-full bg-[var(--marine-a5)] text-[var(--marine)]">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="font-display text-2xl font-bold text-[var(--marine)]">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  </div>
);

export default function Pilotage() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/pilotage").then((r) => setData(r.data)).catch((e) => toast.error(apiError(e)));
  }, []);

  if (!data) return null;
  const c = data.counters;

  return (
    <div className="space-y-6" data-testid="pilotage-page">
      <PageHeader title="Pilotage du suivi" subtitle="Vue de supervision en lecture seule des chiens en suivi actif." />

      <div className="grid gap-3 sm:grid-cols-3">
        <Counter icon={Dog} label="Chiens en suivi actif" value={c.active_dogs} testId="pilotage-count-active" />
        <Counter icon={Target} label="Objectifs en cours" value={c.objectives_en_cours} testId="pilotage-count-encours" />
        <Counter icon={CheckCircle2} label="Objectifs atteints ce mois-ci" value={c.objectives_atteints_mois} testId="pilotage-count-atteints" />
      </div>

      <SectionCard title="Chiens en suivi" icon={Gauge} testId="pilotage-table-card"
        subtitle="Les lignes en évidence signalent une absence d'intervention depuis plus de 21 jours. Cliquez une ligne pour ouvrir la fiche.">
        {data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="pilotage-empty">Aucun chien en suivi actif.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-2 pr-3">Chien</th>
                  <th className="py-2 pr-3">Propriétaire</th>
                  <th className="py-2 pr-3">Référent</th>
                  <th className="py-2 pr-3">Dernière intervention</th>
                  <th className="py-2 pr-3">Équipe</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.dog_id} data-testid={`pilotage-row-${r.dog_id}`}
                    className={`border-b transition-colors hover:bg-muted/40 ${r.stale ? "bg-[var(--bordeaux-a5,rgba(122,30,45,0.06))]" : ""}`}>
                    <td className="py-2 pr-3">
                      <Link to={`/dogs?open=${r.dog_id}`} data-testid={`pilotage-link-${r.dog_id}`}
                        className="font-semibold text-[var(--marine)] hover:underline">{r.name}</Link>
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.owner_name}</td>
                    <td className="py-2 pr-3">{r.referent_name || <span className="text-muted-foreground">Non désigné</span>}</td>
                    <td className="py-2 pr-3">
                      <span className={r.stale ? "font-semibold text-[var(--bordeaux)]" : ""}>{fmt(r.last_intervention)}</span>
                      {r.stale && (
                        <Chip tone="bordeaux"><AlertTriangle className="h-3 w-3" /> {r.days_since != null ? `${r.days_since} j` : "jamais"}</Chip>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      {r.shared ? (
                        <Chip tone="marine"><Users className="h-3 w-3" /> {r.team_count} pros</Chip>
                      ) : (
                        <span className="text-xs text-muted-foreground">{r.team_count || 0}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
