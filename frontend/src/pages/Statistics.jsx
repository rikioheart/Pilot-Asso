import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar,
} from "recharts";
import { api, apiError } from "@/lib/api";
import { PageHeader } from "@/components/Ui";
import { Button } from "@/components/ui/button";

const PERIODS = [["month", "Mois"], ["quarter", "Trimestre"], ["year", "Année"]];

const TOTAL_LABELS = [
  ["active_professionals", "Professionnels actifs"],
  ["active_members", "Particuliers actifs"],
  ["new_members", "Nouveaux adhérents"],
  ["projects", "Projets"],
  ["projects_completed", "Projets terminés"],
  ["tasks_completed", "Tâches réalisées"],
  ["active_volunteers", "Bénévoles actifs"],
  ["activities", "Activités"],
  ["events", "Événements"],
  ["participations", "Participations"],
  ["professional_profiles", "Fiches professionnelles"],
  ["loyalty_cards", "Cartes de fidélité"],
  ["loyalty_points", "Points distribués"],
  ["help_requests", "Demandes d'aide"],
  ["help_resolved", "Aides résolues"],
  ["actions_logged", "Actions tracées"],
];

export default function Statistics() {
  const [period, setPeriod] = useState("month");
  const [data, setData] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/stats", { params: { period } });
      setData(data);
    } catch (e) {
      toast.error(apiError(e));
    }
  }, [period]);

  useEffect(() => { load(); }, [load]);

  if (!data) return <p className="text-muted-foreground">Chargement des statistiques…</p>;

  return (
    <div data-testid="statistics-page">
      <PageHeader breadcrumb="Développement associatif" title="Statistiques stratégiques"
        subtitle="L'évolution du réseau et des actions, en un coup d'œil."
        actions={
          <div className="flex gap-2">
            {PERIODS.map(([value, label]) => (
              <Button key={value} size="sm" variant={period === value ? "default" : "outline"}
                data-testid={`stats-period-${value}`}
                className={`rounded-full ${period === value ? "bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" : ""}`}
                onClick={() => setPeriod(value)}>{label}</Button>
            ))}
          </div>
        } />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-4" data-testid="stats-totals">
        {TOTAL_LABELS.map(([key, label]) => (
          <div key={key} className="vdc-kpi" data-testid={`stats-total-${key}`}>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 font-display text-2xl font-extrabold text-[var(--marine)]">{data.totals[key] ?? 0}</p>
          </div>
        ))}
      </section>

      <section className="mt-6 rounded-xl border bg-card p-5" data-testid="stats-chart">
        <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">Évolution</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Nouveaux membres, tâches terminées, projets créés, participations et tampons fidélité.
        </p>
        <div className="mt-6 h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.chart} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="membres" stroke="var(--bordeaux)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="taches" stroke="var(--marine)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="projets" stroke="#0f766e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="participations" stroke="#b45309" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="tampons" stroke="#4c1d95" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="mt-6 rounded-xl border bg-card p-5" data-testid="stats-categories">
        <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">Projets par catégorie</h2>
        <div className="mt-6 h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.projects_by_category} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="category" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" fill="var(--bordeaux)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
