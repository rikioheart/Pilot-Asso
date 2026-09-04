import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, MapPin, Share2, PawPrint } from "lucide-react";
import { api } from "@/lib/api";
import { LogoLockup } from "@/components/Logo";
import { ProCardQr } from "@/components/ProCardQr";
import { Button } from "@/components/ui/button";

export default function Public() {
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get("/public/page").then((r) => setData(r.data)).catch(() => setData({ enabled: false }));
  }, []);

  const share = async () => {
    const url = window.location.href;
    try { await navigator.clipboard.writeText(url); toast.success("Lien copié !"); }
    catch { toast.message(url); }
  };

  if (!data) return null;
  if (!data.enabled) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--surface-alt)] p-8 text-center" data-testid="public-disabled">
        <p className="text-muted-foreground">La page publique n'est pas disponible pour le moment.</p>
      </div>
    );
  }

  const { config, events, pros, activities } = data;

  return (
    <div className="min-h-screen bg-[var(--surface-alt)]" data-testid="public-page">
      <header className="border-b bg-[var(--marine)] px-6 py-5 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <LogoLockup size={44} />
          <Button onClick={share} data-testid="public-share-button"
            className="rounded-full bg-white/15 hover:bg-white/25"><Share2 className="mr-2 h-4 w-4" /> Partager</Button>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="font-display text-4xl font-extrabold text-[var(--marine)] sm:text-5xl">{data.association_name}</h1>
        <p className="mt-4 max-w-2xl text-base text-muted-foreground">{config.intro}</p>
      </section>

      {config.show_events && (
        <section className="mx-auto max-w-5xl px-6 pb-12" data-testid="public-events">
          <h2 className="mb-5 font-display text-2xl font-bold text-[var(--marine)]">Agenda public</h2>
          {events.length === 0 ? (
            <p className="text-muted-foreground">Aucun événement public à venir pour l'instant.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((e) => (
                <div key={e.event_id} className="rounded-xl border bg-card p-4" data-testid={`public-event-${e.event_id}`}>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-[var(--bordeaux)]">
                    <CalendarDays className="h-3.5 w-3.5" /> {new Date(e.start_date).toLocaleDateString("fr-FR")}
                  </p>
                  <p className="mt-1 font-semibold text-[var(--marine)]">{e.title}</p>
                  {e.location && <p className="flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-3 w-3" /> {e.location}</p>}
                  {e.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{e.description}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {config.show_pros && (
        <section className="mx-auto max-w-5xl px-6 pb-12" data-testid="public-pros">
          <h2 className="mb-5 font-display text-2xl font-bold text-[var(--marine)]">Nos professionnels</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pros.map((p) => (
              <div key={p.user_id} className="rounded-xl border bg-card p-4 text-center" data-testid={`public-pro-${p.user_id}`}>
                <p className="font-semibold text-[var(--marine)]">{p.display_name}</p>
                {p.city && <p className="text-xs text-muted-foreground">{p.city}</p>}
                {p.bio && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{p.bio}</p>}
                <div className="mt-3 flex justify-center"><ProCardQr userId={p.user_id} name={p.display_name} /></div>
              </div>
            ))}
          </div>
        </section>
      )}

      {config.show_gallery && (
        <section className="mx-auto max-w-5xl px-6 pb-16" data-testid="public-gallery">
          <h2 className="mb-5 font-display text-2xl font-bold text-[var(--marine)]">Nos activités récentes</h2>
          {activities.length === 0 ? (
            <p className="text-muted-foreground">Bientôt en ligne.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {activities.map((a) => (
                <div key={a.activity_id} className="rounded-xl border bg-card p-4" data-testid={`public-activity-${a.activity_id}`}>
                  <PawPrint className="h-5 w-5 text-[var(--bordeaux)]" />
                  <p className="mt-2 font-semibold text-[var(--marine)]">{a.title}</p>
                  {a.date && <p className="text-xs text-muted-foreground">{new Date(a.date).toLocaleDateString("fr-FR")}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <footer className="border-t px-6 py-6 text-center text-xs text-muted-foreground">
        {data.association_name} · Page publique
      </footer>
    </div>
  );
}
