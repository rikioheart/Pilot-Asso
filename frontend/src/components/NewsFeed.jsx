import { useEffect, useState } from "react";
import { Newspaper, Star, PawPrint, Trophy } from "lucide-react";
import { api, fileUrl } from "@/lib/api";

const CAT = { ANNONCE: "Annonce", ACTIVITE: "Activité", MEMBRE: "Nouveau membre",
  EVENEMENT: "Événement", RESULTAT: "Résultat" };
const HL = { CHIEN_SEMAINE: "Chien de la semaine", REUSSITE: "Réussite" };

function Confetti() {
  const pieces = Array.from({ length: 28 });
  const colors = ["#800020", "#002060", "#c2701a", "#1e7f4f", "#b3261e"];
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" data-testid="news-confetti" aria-hidden>
      <style>{`@keyframes vdcfall{0%{transform:translateY(-10vh) rotate(0);opacity:1}100%{transform:translateY(110vh) rotate(540deg);opacity:0}}`}</style>
      {pieces.map((_, i) => (
        <span key={i} style={{ position: "absolute", top: "-5vh", left: `${Math.random() * 100}%`,
          width: 8, height: 12, background: colors[i % colors.length],
          borderRadius: 2, animation: `vdcfall ${1.6 + Math.random() * 1.2}s ease-in ${Math.random() * 0.4}s forwards` }} />
      ))}
    </div>
  );
}

export function NewsFeed() {
  const [data, setData] = useState(null);
  const [celebrate, setCelebrate] = useState(false);

  useEffect(() => {
    const fetchNews = () => api.get("/news", { params: { limit: 15 } }).then((r) => {
      setData(r.data);
      const h = r.data.highlight;
      if (h) {
        const seen = localStorage.getItem("vdc_seen_highlight");
        const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        const off = localStorage.getItem("vdc_animations_off") === "1";
        if (seen !== h.news_id && !reduce && !off) {
          setCelebrate(true);
          setTimeout(() => setCelebrate(false), 2600);
        }
        localStorage.setItem("vdc_seen_highlight", h.news_id);
      }
    }).catch(() => setData({ items: [], highlight: null }));
    fetchNews();
    window.addEventListener("news:updated", fetchNews);
    return () => window.removeEventListener("news:updated", fetchNews);
  }, []);

  if (!data) return null;
  const { items, highlight } = data;

  return (
    <div className="rounded-xl border bg-card p-5" data-testid="news-feed">
      {celebrate && <Confetti />}
      <h2 className="flex items-center gap-2 font-display text-base md:text-lg font-bold text-[var(--marine)]">
        <Newspaper className="h-4 w-4" /> Actualités de l'association
      </h2>

      {highlight && (
        <div className="mt-4 overflow-hidden rounded-xl border-2 border-[var(--bordeaux-a40)] bg-[var(--bordeaux-a5)]"
          data-testid="news-highlight">
          {highlight.photo?.url && (
            <img src={fileUrl(highlight.photo_file_id)} alt="" className="h-40 w-full object-cover" />
          )}
          <div className="p-4">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--bordeaux)] px-2.5 py-0.5 text-xs font-semibold text-white">
              {highlight.highlight_type === "CHIEN_SEMAINE" ? <PawPrint className="h-3 w-3" /> : <Trophy className="h-3 w-3" />}
              {HL[highlight.highlight_type]}
            </span>
            <p className="mt-2 font-display font-bold text-[var(--marine)]">{highlight.title}</p>
            {highlight.body && <p className="mt-1 text-sm text-muted-foreground">{highlight.body}</p>}
          </div>
        </div>
      )}

      <div className="mt-4 space-y-3" data-testid="news-list">
        {items.filter((n) => !n.pinned || !n.highlight_type).length === 0 && !highlight && (
          <p className="text-sm text-muted-foreground">Aucune actualité pour le moment.</p>
        )}
        {items.filter((n) => !(n.pinned && n.highlight_type)).map((n) => (
          <div key={n.news_id} className="flex gap-3 border-b pb-3 last:border-0" data-testid={`news-item-${n.news_id}`}>
            <Star className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--bordeaux)]" />
            <div>
              <p className="text-sm font-semibold text-[var(--marine)]">
                {n.title}
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{CAT[n.category]}</span>
              </p>
              {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
              <p className="text-xs text-muted-foreground">{new Date(n.publish_at).toLocaleDateString("fr-FR")}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
