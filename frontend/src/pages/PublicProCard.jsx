import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { Globe, Mail, MapPin, Phone, Linkedin, Facebook, Instagram } from "lucide-react";
import { API } from "@/lib/api";

const label = (c) => (c || "").replace(/_/g, " ").toLowerCase().replace(/^\w/, (m) => m.toUpperCase());

export default function PublicProCard() {
  const { userId } = useParams();
  const [card, setCard] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    axios.get(`${API}/public/professionals/${userId}`)
      .then((r) => setCard(r.data))
      .catch(() => setError("Cette carte de visite n'existe pas ou n'est plus disponible."));
  }, [userId]);

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f3ee] p-6" data-testid="public-card-error">
        <p className="text-center text-[var(--marine)]">{error}</p>
      </main>
    );
  }
  if (!card) return <main className="grid min-h-screen place-items-center bg-[#f6f3ee]">Chargement…</main>;

  const image = card.has_logo ? `${API}/public/professionals/${userId}/image?kind=logo`
    : card.has_avatar ? `${API}/public/professionals/${userId}/image?kind=avatar` : null;
  const socials = Object.entries(card.social_links || {}).filter(([, v]) => v);

  return (
    <main className="min-h-screen bg-[#f6f3ee] px-4 py-10 sm:py-16" data-testid="public-card-page">
      <article className="mx-auto max-w-xl overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="h-3 bg-[var(--bordeaux)]" />
        <div className="p-7 sm:p-10">
          <div className="flex items-start gap-5">
            {image && <img src={image} alt="" className="h-20 w-20 rounded-xl border object-cover"
              data-testid="public-card-image" />}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[var(--bordeaux)]">
                {label(card.professional_category) || "Professionnel"}
              </p>
              <h1 className="mt-1 font-display text-2xl font-extrabold text-[var(--marine)] sm:text-3xl"
                data-testid="public-card-name">
                {card.company_name || card.display_name}
              </h1>
              {card.company_name && card.display_name && (
                <p className="text-sm text-muted-foreground">{card.display_name}</p>
              )}
            </div>
          </div>

          {card.description && <p className="mt-6 text-base leading-relaxed text-slate-700"
            data-testid="public-card-description">{card.description}</p>}

          {(card.specialties?.length > 0 || card.services?.length > 0) && (
            <div className="mt-6 flex flex-wrap gap-2">
              {[...(card.specialties || []), ...(card.services || [])].map((s) => (
                <span key={s} className="rounded-full bg-[#f6f3ee] px-3 py-1 text-xs font-semibold text-[var(--marine)]">
                  {s}
                </span>
              ))}
            </div>
          )}

          <dl className="mt-8 space-y-3 text-sm">
            {(card.service_area || card.city) && (
              <div className="flex items-center gap-3"><MapPin className="h-4 w-4 text-[var(--bordeaux)]" />
                <span>{card.service_area || card.city}{card.departments?.length ? ` · ${card.departments.join(", ")}` : ""}</span></div>
            )}
            {card.phone && <div className="flex items-center gap-3"><Phone className="h-4 w-4 text-[var(--bordeaux)]" />
              <a href={`tel:${card.phone}`} className="underline" data-testid="public-card-phone">{card.phone}</a></div>}
            {card.email && <div className="flex items-center gap-3"><Mail className="h-4 w-4 text-[var(--bordeaux)]" />
              <a href={`mailto:${card.email}`} className="underline" data-testid="public-card-email">{card.email}</a></div>}
            {card.website && <div className="flex items-center gap-3"><Globe className="h-4 w-4 text-[var(--bordeaux)]" />
              <a href={card.website} target="_blank" rel="noopener noreferrer" className="underline break-all"
                data-testid="public-card-website">{card.website}</a></div>}
          </dl>

          {socials.length > 0 && (
            <div className="mt-6 flex flex-wrap items-center gap-3" data-testid="public-card-socials">
              {socials.map(([k, v]) => {
                const key = k.toLowerCase();
                const Icon = key.includes("linkedin") ? Linkedin
                  : key.includes("facebook") ? Facebook
                  : key.includes("instagram") ? Instagram : Globe;
                return (
                  <a key={k} href={v} target="_blank" rel="noopener noreferrer" aria-label={k}
                    data-testid={`public-card-social-${key}`}
                    className="grid h-10 w-10 place-items-center rounded-full border text-[var(--marine)] transition-colors hover:bg-[var(--marine-a8)] hover:text-[var(--bordeaux)]">
                    <Icon className="h-5 w-5" />
                  </a>
                );
              })}
            </div>
          )}
        </div>
        <footer className="border-t bg-[#f6f3ee] px-7 py-4 text-center text-xs text-muted-foreground">
          Professionnel membre de l'association <span className="font-semibold text-[var(--marine)]">La Voix du Chien</span>
        </footer>
      </article>
    </main>
  );
}
