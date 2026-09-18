import { useEffect, useState } from "react";
import { toast } from "sonner";
import { confirmDialog, RowMenu } from "@/components/ConfirmDialog";
import { ThemeSettings } from "@/components/ThemeSettings";
import { ModuleIconsSettings } from "@/components/ModuleIconsSettings";
import { CoverPhotoSettings } from "@/components/CoverPhotoSettings";
import { PublicPageSettings } from "@/components/PublicPageSettings";
import { EmptyStateSettings } from "@/components/EmptyStateSettings";
import { DelegationSettings, OnboardingSettings, BlockVisibilitySettings } from "@/components/GovernanceSettings";
import { WeatherSettings } from "@/components/WeatherSettings";
import { DogJournalTemplateSettings } from "@/components/DogJournalTemplateSettings";
import { BiweeklyRecapSettings } from "@/components/BiweeklyRecapSettings";
import { DriveResources } from "@/components/DriveResources";
import { NavLabelsSettings } from "@/components/NavLabelsSettings";
import { RbacMatrixSettings } from "@/components/RbacMatrixSettings";
import { DashboardBlocksSettings } from "@/components/DashboardBlocksSettings";
import { useBlockReload } from "@/components/BlockVisibility";
import { Plus, Trash2, Tags } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, SectionCard, Chip } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function AdminSettings() {
  const reloadBlocks = useBlockReload();
  const [matrix, setMatrix] = useState(null);
  const [taxonomies, setTaxonomies] = useState({ items: [], kinds: {} });
  const [form, setForm] = useState({ kind: "activity_category", label: "" });

  const loadTaxonomies = () =>
    api.get("/taxonomies").then((r) => setTaxonomies(r.data)).catch(() => {});

  useEffect(() => {
    api.get("/settings/rbac").then((r) => setMatrix(r.data)).catch(() => setMatrix(false));
    loadTaxonomies();
  }, []);

  const create = async (event) => {
    event.preventDefault();
    try {
      await api.post("/taxonomies", form);
      toast.success("Valeur ajoutée à la nomenclature");
      setForm({ ...form, label: "" });
      loadTaxonomies();
    } catch (e) { toast.error(apiError(e)); }
  };

  const remove = async (item) => {
    if (!await confirmDialog(`Supprimer « ${item.label} » de la nomenclature ?`)) return;
    try {
      await api.delete(`/taxonomies/${item.taxonomy_id}`);
      toast.success("Valeur supprimée");
      loadTaxonomies();
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div data-testid="admin-settings-page">
      <PageHeader breadcrumb="Bureau" title="Administration"
        subtitle="Charte graphique, nomenclatures configurables, rôles, niveaux et permissions. La vérification est toujours effectuée côté serveur." />

      <ThemeSettings />
      <ModuleIconsSettings />
      <CoverPhotoSettings />
      <PublicPageSettings />
      <EmptyStateSettings />
      <BlockVisibilitySettings onSaved={reloadBlocks} />
      <DelegationSettings />
      <OnboardingSettings />
      <WeatherSettings />
      <DogJournalTemplateSettings />
      <BiweeklyRecapSettings />
      <DriveResources />
      <NavLabelsSettings />
      <DashboardBlocksSettings />
      <RbacMatrixSettings />

      <SectionCard title="Catégories et types configurables" icon={Tags} testId="taxonomies-card"
        subtitle="Ajoutez vos propres catégories d'activités, types d'activités ou types d'événements."
        className="mb-6">
        <form onSubmit={create} className="flex flex-wrap items-end gap-3" data-testid="taxonomy-form">
          <div className="w-full sm:w-64">
            <Label className="text-xs">Nomenclature</Label>
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
              <SelectTrigger data-testid="taxonomy-kind-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(taxonomies.kinds || {}).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-72">
            <Label className="text-xs">Libellé</Label>
            <Input required value={form.label} placeholder="Ex. Atelier sensoriel"
              data-testid="taxonomy-label-input"
              onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </div>
          <Button type="submit" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
            data-testid="taxonomy-submit">
            <Plus className="mr-2 h-4 w-4" /> Ajouter
          </Button>
        </form>

        <div className="mt-5 space-y-4">
          {Object.entries(taxonomies.kinds || {}).map(([kind, kindLabel]) => {
            const items = taxonomies.items.filter((i) => i.kind === kind);
            return (
              <div key={kind} data-testid={`taxonomy-group-${kind}`}>
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{kindLabel}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {items.length === 0 && (
                    <span className="text-sm text-muted-foreground">Aucune valeur personnalisée.</span>
                  )}
                  {items.map((item) => (
                    <span key={item.taxonomy_id} data-testid={`taxonomy-item-${item.taxonomy_id}`}
                      className="inline-flex items-center gap-2 rounded-full bg-[var(--marine-a8)] px-3 py-1 text-sm font-semibold text-[var(--marine)]">
                      {item.label}
                      <RowMenu testId={`taxonomy-menu-${item.taxonomy_id}`} items={[
                        { label: "Supprimer", icon: Trash2, danger: true,
                          testId: `taxonomy-delete-${item.taxonomy_id}`, onSelect: () => remove(item) }]} />
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </SectionCard>

      {!matrix ? <p className="text-muted-foreground">Chargement…</p> : (
        <div className="space-y-6">
          {Object.entries(matrix.levels_by_role).map(([role, levels]) => (
            <div key={role} className="rounded-xl border bg-card p-5" data-testid={`rbac-role-${role}`}>
              <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">{role}</h2>
              <div className="mt-4 space-y-4">
                {levels.map((lvl) => (
                  <div key={lvl}>
                    <p className="text-sm font-semibold text-[var(--bordeaux)]">{lvl}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {role === "ADMIN_BUREAU" ? (
                        <Chip tone="bordeaux">Toutes les permissions ({matrix.permissions.length})</Chip>
                      ) : (
                        (matrix.level_permissions[lvl] || []).map((p) => (
                          <span key={p} className="rounded-full bg-muted px-2.5 py-1 text-xs">{p}</span>
                        ))
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
