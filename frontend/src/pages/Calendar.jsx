import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CalendarDays, ChevronLeft, ChevronRight, ListFilter } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Ui";
import { Button } from "@/components/ui/button";

const KIND_TONES = {
  ACTIVITY: "bg-[#0f766e]/10 text-[#0f766e] border-[#0f766e]/30",
  EVENT: "bg-[#800020]/10 text-[#800020] border-[#800020]/30",
  TASK: "bg-[#002060]/10 text-[#002060] border-[#002060]/30",
};

const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août",
  "septembre", "octobre", "novembre", "décembre"];
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default function Calendar() {
  const [cursor, setCursor] = useState(() => new Date());
  const [entries, setEntries] = useState([]);
  const [kinds, setKinds] = useState({ ACTIVITY: true, EVENT: true, TASK: true });
  const [view, setView] = useState("month");

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/calendar", {
        params: { start: monthStart.toISOString().slice(0, 10), end: monthEnd.toISOString().slice(0, 10) },
      });
      setEntries(data.entries);
    } catch (e) {
      toast.error(apiError(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => entries.filter((e) => kinds[e.kind]), [entries, kinds]);

  const cells = useMemo(() => {
    const firstWeekday = (monthStart.getDay() + 6) % 7;
    const total = monthEnd.getDate();
    const list = [];
    for (let i = 0; i < firstWeekday; i += 1) list.push(null);
    for (let day = 1; day <= total; day += 1) {
      const date = new Date(cursor.getFullYear(), cursor.getMonth(), day).toISOString().slice(0, 10);
      list.push({ day, date, items: filtered.filter((e) => e.date === date) });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, cursor]);

  const shift = (delta) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1));

  return (
    <div data-testid="calendar-page">
      <PageHeader breadcrumb="Pilotage" title="Calendrier"
        subtitle="Activités, événements et échéances de tâches au même endroit."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="icon" className="rounded-full" data-testid="calendar-prev"
              onClick={() => shift(-1)} aria-label="Mois précédent"><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-40 text-center font-display text-sm font-bold text-[#002060]" data-testid="calendar-month">
              {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
            </span>
            <Button variant="outline" size="icon" className="rounded-full" data-testid="calendar-next"
              onClick={() => shift(1)} aria-label="Mois suivant"><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" className="rounded-full" data-testid="calendar-view-toggle"
              onClick={() => setView(view === "month" ? "list" : "month")}>
              {view === "month" ? <ListFilter className="mr-2 h-4 w-4" /> : <CalendarDays className="mr-2 h-4 w-4" />}
              {view === "month" ? "Liste" : "Mois"}
            </Button>
          </div>
        } />

      <div className="mb-5 flex flex-wrap gap-2">
        {[["ACTIVITY", "Activités"], ["EVENT", "Événements"], ["TASK", "Échéances"]].map(([kind, label]) => (
          <button key={kind} onClick={() => setKinds({ ...kinds, [kind]: !kinds[kind] })}
            data-testid={`calendar-filter-${kind}`}
            className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
              kinds[kind] ? KIND_TONES[kind] : "text-muted-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      {view === "month" ? (
        <div className="overflow-x-auto">
          <div className="min-w-[46rem] rounded-xl border bg-card p-3" data-testid="calendar-grid">
            <div className="grid grid-cols-7 gap-2 pb-2">
              {DAYS.map((d) => (
                <p key={d} className="text-center text-xs font-bold uppercase tracking-wide text-muted-foreground">{d}</p>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {cells.map((cell, index) => (
                <div key={index} data-testid={cell ? `calendar-day-${cell.date}` : undefined}
                  className={`min-h-24 rounded-lg border p-2 ${cell ? "bg-background" : "border-transparent"}`}>
                  {cell && (
                    <>
                      <p className="text-xs font-semibold text-muted-foreground">{cell.day}</p>
                      <div className="mt-1 space-y-1">
                        {cell.items.slice(0, 3).map((e) => (
                          <Link key={`${e.kind}-${e.id}`} to={e.link} data-testid={`calendar-entry-${e.id}`}
                            className={`block truncate rounded border px-1.5 py-0.5 text-[11px] font-medium ${KIND_TONES[e.kind]}`}>
                            {e.start_time ? `${e.start_time} ` : ""}{e.title}
                          </Link>
                        ))}
                        {cell.items.length > 3 && (
                          <p className="text-[11px] text-muted-foreground">+{cell.items.length - 3} autre(s)</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState testId="calendar-empty" title="Rien ce mois-ci"
          description="Créez une activité ou un événement, ou changez de mois." />
      ) : (
        <div className="space-y-2" data-testid="calendar-list">
          {filtered.map((e) => (
            <Link key={`${e.kind}-${e.id}`} to={e.link} data-testid={`calendar-list-entry-${e.id}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-3 transition-colors hover:border-[#800020]/40">
              <span>
                <span className="font-semibold text-[#002060]">{e.title}</span>
                <span className="ml-2 text-xs text-muted-foreground">{e.location || e.category}</span>
              </span>
              <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${KIND_TONES[e.kind]}`}>
                {new Date(e.date).toLocaleDateString("fr-FR")}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
