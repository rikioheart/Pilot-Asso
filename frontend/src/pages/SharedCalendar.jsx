import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CalendarRange, MapPinned, Sparkle, PartyPopper, GraduationCap, CalendarPlus } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState, Chip } from "@/components/Ui";
import { Button } from "@/components/ui/button";

const KINDS = {
  TERRAIN: { label: "Terrains", icon: MapPinned, tone: "bg-[#800020]/10 text-[#800020] border-[#800020]/30" },
  ACTIVITY: { label: "Activités", icon: Sparkle, tone: "bg-[#0f766e]/10 text-[#0f766e] border-[#0f766e]/30" },
  EVENT: { label: "Événements", icon: PartyPopper, tone: "bg-[#002060]/10 text-[#002060] border-[#002060]/30" },
  FORMATION: { label: "Formations", icon: GraduationCap, tone: "bg-amber-500/15 text-amber-700 border-amber-500/30" },
};

export default function SharedCalendar() {
  const [data, setData] = useState(null);
  const [active, setActive] = useState({ TERRAIN: true, ACTIVITY: true, EVENT: true, FORMATION: true });

  const load = useCallback(async () => {
    try {
      const res = await api.get("/calendar/unified");
      setData(res.data);
    } catch (e) { toast.error(apiError(e)); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const grouped = useMemo(() => {
    const items = (data?.items || []).filter((i) => active[i.kind]);
    const map = new Map();
    items.forEach((item) => {
      const key = item.date || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return [...map.entries()];
  }, [data, active]);

  if (!data) return <p className="text-muted-foreground" data-testid="shared-calendar-loading">Chargement…</p>;

  return (
    <div data-testid="shared-calendar-page">
      <PageHeader breadcrumb="Vie de l'asso" title="Agenda partagé"
        subtitle="Réservations de terrain, activités, événements et formations à venir, filtrés selon votre rôle."
        actions={
          <Button variant="outline" className="rounded-full" disabled
            data-testid="google-sync-button" title={data.google_sync?.message}>
            <CalendarPlus className="mr-2 h-4 w-4" /> Google Calendar — bientôt disponible
          </Button>
        } />

      <div className="mb-6 flex flex-wrap gap-2">
        {Object.entries(KINDS).map(([kind, { label, tone }]) => (
          <button key={kind} data-testid={`agenda-filter-${kind}`}
            onClick={() => setActive({ ...active, [kind]: !active[kind] })}
            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors ${
              active[kind] ? tone : "text-muted-foreground"}`}>
            {label}
          </button>
        ))}
      </div>

      {grouped.length === 0 ? (
        <EmptyState testId="agenda-empty" icon={CalendarRange} title="Aucune date à venir"
          description="Les prochaines réservations, activités et formations s'afficheront ici." />
      ) : (
        <div className="space-y-6" data-testid="agenda-list">
          {grouped.map(([date, items]) => (
            <section key={date} data-testid={`agenda-day-${date}`}>
              <p className="mb-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {new Date(date).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric",
                  month: "long", year: "numeric" })}
              </p>
              <div className="space-y-2">
                {items.map((item) => {
                  const meta = KINDS[item.kind] || KINDS.EVENT;
                  const Icon = meta.icon;
                  return (
                    <Link key={`${item.kind}-${item.id}`} to={item.link || "#"}
                      data-testid={`agenda-entry-${item.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 transition-colors hover:border-[#800020]/40">
                      <span className="flex min-w-0 items-start gap-3">
                        <span className={`mt-0.5 grid h-8 w-8 place-items-center rounded-lg border ${meta.tone}`}>
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-[#002060]">{item.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{item.subtitle}</span>
                          {item.description && (
                            <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                          )}
                        </span>
                      </span>
                      <span className="flex flex-wrap items-center gap-2">
                        {item.category && <Chip tone="muted">{item.category}</Chip>}
                        {item.resource && <Chip tone="marine">{item.resource}</Chip>}
                        <Chip tone="bordeaux">
                          {item.start_time ? `${item.start_time}${item.end_time ? `–${item.end_time}` : ""}`
                            : "Journée"}
                        </Chip>
                        <Chip tone="muted">
                          {item.origin === "PLATFORM" ? "Plateforme" : "Source externe"}
                        </Chip>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
