import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, MapPin, Gift, X } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, EmptyState } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Directory() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ q: "", category: "", department: "", specialty: "" });
  const [focus, setFocus] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/professionals", {
        params: {
          q: filters.q || undefined, category: filters.category || undefined,
          department: filters.department || undefined, specialty: filters.specialty || undefined,
        },
      });
      setItems(data.items);
      setCategories(data.categories || []);
    } catch (e) {
      toast.error(apiError(e));
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (userId) => {
    try {
      const { data } = await api.get(`/professionals/${userId}`);
      setFocus(data);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div data-testid="directory-page">
      <PageHeader breadcrumb="Réseau" title="Annuaire des professionnels"
        subtitle="Les compétences du réseau, filtrables par spécialité, catégorie et département." />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">Recherche</Label>
          <Input value={filters.q} data-testid="directory-search-input" placeholder="Nom, structure, mot-clé"
            onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Catégorie</Label>
          <Select value={filters.category || "ALL"}
            onValueChange={(v) => setFilters({ ...filters, category: v === "ALL" ? "" : v })}>
            <SelectTrigger data-testid="directory-category-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toutes</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c} data-testid={`directory-category-${c}`}>{c.replaceAll("_", " ")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Département</Label>
          <Input value={filters.department} data-testid="directory-department-filter" placeholder="45, 77, 89, 91…"
            onChange={(e) => setFilters({ ...filters, department: e.target.value })} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Spécialité</Label>
          <Input value={filters.specialty} data-testid="directory-specialty-filter" placeholder="Chiots, ostéopathie…"
            onChange={(e) => setFilters({ ...filters, specialty: e.target.value })} />
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState testId="directory-empty" title="Aucun professionnel trouvé"
          description="Ajustez vos filtres, ou complétez votre fiche depuis « Mon profil » si vous êtes professionnel." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="directory-list">
          {items.map((p) => (
            <button key={p.user_id} onClick={() => openDetail(p.user_id)} data-testid={`directory-card-${p.user_id}`}
              className="rounded-xl border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md">
              <p className="font-display font-bold text-[#002060]">{p.company_name || p.display_name}</p>
              <p className="text-xs text-muted-foreground">{p.display_name}</p>
              <p className="mt-2 inline-block rounded-full bg-[#800020]/8 px-2.5 py-0.5 text-xs font-semibold text-[#800020]">
                {(p.professional_category || "AUTRE").replaceAll("_", " ")}
              </p>
              {p.description && <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{p.description}</p>}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(p.specialties || []).slice(0, 4).map((s) => (
                  <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-xs">{s}</span>
                ))}
              </div>
              <p className="mt-3 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /> {p.service_area || p.city || "Zone non précisée"}
                {p.departments?.length > 0 && ` · ${p.departments.join(", ")}`}
              </p>
              {p.member_advantages && (
                <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#002060]">
                  <Gift className="h-3 w-3" /> Avantage adhérent
                </p>
              )}
            </button>
          ))}
        </div>
      )}

      {focus && (
        <div className="fixed inset-0 z-50 flex justify-end" data-testid="directory-detail-drawer">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFocus(null)} />
          <div className="relative h-full w-full max-w-lg overflow-y-auto bg-card p-6">
            <button onClick={() => setFocus(null)} data-testid="directory-detail-close"
              className="absolute right-4 top-4 text-muted-foreground hover:text-[#800020]" aria-label="Fermer">
              <X className="h-5 w-5" />
            </button>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Fiche professionnelle</p>
            <h2 className="mt-2 font-display text-2xl font-extrabold text-[#002060]">
              {focus.details.company_name || focus.profile?.display_name}
            </h2>
            <p className="text-sm text-muted-foreground">{focus.profile?.display_name} · {focus.access_level}</p>
            {focus.details.description && <p className="mt-4 text-sm">{focus.details.description}</p>}

            {focus.details.services?.length > 0 && (
              <section className="mt-6">
                <h3 className="font-display text-sm font-bold uppercase tracking-wide text-[#002060]">Services</h3>
                <ul className="mt-2 list-inside list-disc text-sm text-muted-foreground">
                  {focus.details.services.map((s) => <li key={s}>{s}</li>)}
                </ul>
              </section>
            )}
            {focus.details.specialties?.length > 0 && (
              <section className="mt-6">
                <h3 className="font-display text-sm font-bold uppercase tracking-wide text-[#002060]">Spécialités</h3>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {focus.details.specialties.map((s) => (
                    <span key={s} className="rounded-full bg-muted px-2.5 py-1 text-xs">{s}</span>
                  ))}
                </div>
              </section>
            )}
            {focus.details.member_advantages && (
              <section className="mt-6 rounded-xl bg-[#800020]/5 p-4">
                <h3 className="font-display text-sm font-bold text-[#800020]">Avantage adhérent</h3>
                <p className="mt-1 text-sm">{focus.details.member_advantages}</p>
              </section>
            )}
            <section className="mt-6 space-y-1 text-sm">
              <p><span className="text-muted-foreground">Zone : </span>{focus.details.service_area || "—"}</p>
              <p><span className="text-muted-foreground">Départements : </span>{(focus.details.departments || []).join(", ") || "—"}</p>
              <p><span className="text-muted-foreground">Téléphone : </span>{focus.details.phone || "—"}</p>
              <p><span className="text-muted-foreground">E-mail : </span>{focus.details.email || "—"}</p>
              {focus.details.website && (
                <a href={focus.details.website} target="_blank" rel="noopener noreferrer"
                  data-testid="directory-detail-website"
                  className="inline-flex items-center gap-1 font-semibold text-[#800020] hover:underline">
                  Site internet <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </section>
            {user?.role === "ADMIN_BUREAU" && (
              <section className="mt-6 rounded-xl border p-4 text-sm" data-testid="directory-detail-partnership">
                <h3 className="font-display text-sm font-bold text-[#002060]">Partenariat (Bureau)</h3>
                <p className="mt-1">Statut : {focus.details.partnership_status || "—"}</p>
                <p>Pourcentage : {focus.details.partnership_percentage ?? "—"} %</p>
                <p>Contrat : {focus.details.contract_status || "—"} {focus.details.contract_reference || ""}</p>
              </section>
            )}
            {focus.projects?.length > 0 && (
              <section className="mt-6">
                <h3 className="font-display text-sm font-bold uppercase tracking-wide text-[#002060]">Projets</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {focus.projects.map((p) => <li key={p.project_id}>{p.title} — {p.status}</li>)}
                </ul>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
