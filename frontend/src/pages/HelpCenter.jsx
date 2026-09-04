import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { confirmDialog, RowMenu } from "@/components/ConfirmDialog";
import { LifeBuoy, Plus, Search, BookOpen, IdCard, Check, X, Trash2, Pencil, ShieldCheck }
  from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState, SectionCard, Chip } from "@/components/Ui";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter }
  from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor, RichContent } from "@/components/RichTextEditor";

const emptyGuide = { title: "", module: "AUTRE", role_scopes: ["PARTICULIER"], summary: "",
  content: "", visibility: "ALL" };
const emptySheet = { member_id: "", role_title: "", responsibilities: "", daily_actions: "",
  modules: [], visibility: "PRO_BUREAU", notes: "" };

export default function HelpCenter() {
  const { user } = useAuth();
  const [meta, setMeta] = useState(null);
  const [guides, setGuides] = useState(null);
  const [sheets, setSheets] = useState(null);
  const [members, setMembers] = useState([]);
  const [search, setSearch] = useState("");
  const [module, setModule] = useState("");
  const [roleScope, setRoleScope] = useState("");
  const [guideOpen, setGuideOpen] = useState(false);
  const [guide, setGuide] = useState(emptyGuide);
  const [editingGuide, setEditingGuide] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheet, setSheet] = useState(emptySheet);
  const [editingSheet, setEditingSheet] = useState(null);
  const [reading, setReading] = useState(null);

  const load = useCallback(async () => {
    try {
      const [g, s] = await Promise.all([
        api.get("/guides", { params: { q: search || undefined, module: module || undefined,
          role_scope: roleScope || undefined } }),
        api.get("/job-sheets", { params: { q: search || undefined } }),
      ]);
      setGuides(g.data); setSheets(s.data);
    } catch (e) { toast.error(apiError(e)); }
  }, [search, module, roleScope]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/help/meta").then((r) => setMeta(r.data)).catch(() => {});
    api.get("/members", { params: { status: "ACTIVE", limit: 100 } })
      .then((r) => setMembers(r.data.items || [])).catch(() => {});
  }, []);

  const isManager = guides?.is_manager;
  const canPropose = meta?.can_propose;
  const moduleLabels = meta?.module_labels || {};

  const grouped = useMemo(() => {
    const map = new Map();
    (guides?.items || []).forEach((g) => {
      if (!map.has(g.module)) map.set(g.module, []);
      map.get(g.module).push(g);
    });
    return [...map.entries()];
  }, [guides]);

  const submitGuide = async (event) => {
    event.preventDefault();
    if (guide.role_scopes.length === 0) return toast.error("Choisissez au moins un rôle concerné");
    const plain = (guide.content || "").replace(/<[^>]*>/g, "").trim();
    if (plain.length < 10 && !guide.content?.includes("<img")) return toast.error("Le contenu doit faire au moins 10 caractères");
    try {
      if (editingGuide) await api.put(`/guides/${editingGuide}`, guide);
      else await api.post("/guides", guide);
      toast.success(isManager ? "Guide publié"
        : "Guide envoyé au Bureau pour validation");
      setGuideOpen(false); setGuide(emptyGuide); setEditingGuide(null); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const submitSheet = async (event) => {
    event.preventDefault();
    if (!sheet.member_id) return toast.error("Sélectionnez le membre concerné");
    try {
      if (editingSheet) {
        const { member_id, ...rest } = sheet;
        await api.put(`/job-sheets/${editingSheet}`, rest);
      } else await api.post("/job-sheets", sheet);
      toast.success(editingSheet ? "Fiche de poste mise à jour" : "Fiche de poste publiée");
      setSheetOpen(false); setSheet(emptySheet); setEditingSheet(null); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const review = async (item, decision) => {
    const comment = decision === "REFUSE" ? window.prompt("Motif du refus") : null;
    if (decision === "REFUSE" && !comment) return;
    const visibility = decision === "PUBLISH"
      ? (window.prompt("Visibilité : ALL (tous), PRO_BUREAU, BUREAU", "ALL") || "ALL").toUpperCase()
      : "BUREAU";
    try {
      await api.post(`/guides/${item.guide_id}/review`, { decision, visibility, comment });
      toast.success(decision === "PUBLISH" ? "Guide publié" : "Guide refusé");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const removeGuide = async (item) => {
    const reason = window.prompt(`Supprimer « ${item.title} » ? Motif (tracé) :`);
    if (reason === null) return;
    if (!await confirmDialog("Confirmez-vous la suppression ?")) return;
    try {
      const { data } = await api.delete(`/guides/${item.guide_id}`, { params: { reason } });
      toast.success(data.message); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const removeSheet = async (item) => {
    const reason = window.prompt(`Supprimer la fiche « ${item.role_title} » ? Motif (tracé) :`);
    if (reason === null) return;
    if (!await confirmDialog("Confirmez-vous la suppression définitive ?")) return;
    try {
      const { data } = await api.delete(`/documents/${item.document_id}`,
        { params: { reason: reason || "Non précisé", hard: true } });
      toast.success(data.message); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  if (!guides || !sheets || !meta) {
    return <p className="text-muted-foreground" data-testid="help-loading">Chargement…</p>;
  }

  const guideCard = (g) => (
    <div key={g.guide_id} data-testid={`guide-${g.guide_id}`}
      className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <button onClick={() => setReading(g)} data-testid={`guide-open-${g.guide_id}`}
          className="text-left font-semibold text-[var(--marine)] hover:underline">{g.title}</button>
        <Chip tone={g.status === "PUBLISHED" ? "green" : g.status === "PENDING" ? "amber" : "muted"}>
          {g.status_label}
        </Chip>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {g.module_label} · {g.author_name}{g.is_pro_contribution ? " (professionnel)" : ""}
      </p>
      {g.summary && <p className="mt-2 text-sm text-muted-foreground">{g.summary}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(g.role_scope_labels || []).map((r) => <Chip key={r} tone="marine">{r}</Chip>)}
        <Chip tone="muted">{g.visibility_label}</Chip>
      </div>
      {g.review_comment && g.status === "REFUSED" && (
        <p className="mt-2 text-xs text-[var(--bordeaux)]">Motif : {g.review_comment}</p>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {isManager && g.status === "PENDING" && (
          <>
            <Button size="sm" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
              data-testid={`guide-publish-${g.guide_id}`} onClick={() => review(g, "PUBLISH")}>
              <Check className="mr-1.5 h-3.5 w-3.5" /> Publier
            </Button>
            <Button size="sm" variant="outline" className="rounded-full"
              data-testid={`guide-refuse-${g.guide_id}`} onClick={() => review(g, "REFUSE")}>
              <X className="mr-1.5 h-3.5 w-3.5" /> Refuser
            </Button>
          </>
        )}
        {(isManager || g.author_id === user?.user_id) && (
          <Button size="sm" variant="outline" className="rounded-full"
            data-testid={`guide-edit-${g.guide_id}`}
            onClick={() => {
              setEditingGuide(g.guide_id);
              setGuide({ title: g.title, module: g.module, role_scopes: g.role_scopes || [],
                summary: g.summary || "", content: g.content, visibility: g.visibility });
              setGuideOpen(true);
            }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        {isManager && (
          <RowMenu testId={`guide-menu-${g.guide_id}`} items={[
            { label: "Supprimer", icon: Trash2, danger: true, testId: `guide-delete-${g.guide_id}`,
              onSelect: () => removeGuide(g) }]} />
        )}
      </div>
    </div>
  );

  return (
    <div data-testid="help-center-page">
      <PageHeader breadcrumb="Aide" title="Espace aide"
        subtitle="Guides d'utilisation par rôle et par module, fiches de poste et ressources de référence."
        actions={
          <div className="flex flex-wrap gap-2">
            {canPropose && (
              <Button variant={isManager ? "outline" : "default"}
                className={`rounded-full ${isManager ? "" : "bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"}`}
                data-testid="guide-create-button"
                onClick={() => { setEditingGuide(null); setGuide(emptyGuide); setGuideOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" /> {isManager ? "Nouveau guide" : "Proposer une fiche"}
              </Button>
            )}
            {isManager && (
              <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                data-testid="sheet-create-button"
                onClick={() => { setEditingSheet(null); setSheet(emptySheet); setSheetOpen(true); }}>
                <Plus className="mr-2 h-4 w-4" /> Fiche de poste
              </Button>
            )}
          </div>
        } />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" value={search} placeholder="Rechercher un guide, un mot-clé…"
            data-testid="help-search-input" onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={module || "ALL"} onValueChange={(v) => setModule(v === "ALL" ? "" : v)}>
          <SelectTrigger data-testid="help-module-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les modules</SelectItem>
            {(meta.modules || []).map((m) => (
              <SelectItem key={m} value={m}>{moduleLabels[m] || m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={roleScope || "ALL"} onValueChange={(v) => setRoleScope(v === "ALL" ? "" : v)}>
          <SelectTrigger data-testid="help-role-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tous les rôles</SelectItem>
            {(meta.role_scopes || []).map((r) => (
              <SelectItem key={r} value={r}>{meta.role_scope_labels[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="guides" className="space-y-5">
        <TabsList>
          <TabsTrigger value="guides" data-testid="help-tab-guides">
            <BookOpen className="mr-1.5 h-3.5 w-3.5" /> Guides ({guides.total})
          </TabsTrigger>
          <TabsTrigger value="sheets" data-testid="help-tab-sheets">
            <IdCard className="mr-1.5 h-3.5 w-3.5" /> Fiches de poste ({sheets.total})
          </TabsTrigger>
          {isManager && guides.pending_count > 0 && (
            <TabsTrigger value="pending" data-testid="help-tab-pending">
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> À valider ({guides.pending_count})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="guides">
          {guides.items.length === 0 ? (
            <EmptyState testId="guides-empty" module="guides" icon={LifeBuoy} title="Aucun guide disponible"
              description="Les guides d'utilisation publiés par le Bureau apparaîtront ici." />
          ) : (
            <div className="space-y-6" data-testid="guides-list">
              {grouped.map(([code, items]) => (
                <section key={code} data-testid={`guides-module-${code}`}>
                  <p className="mb-3 text-xs font-bold uppercase tracking-widest text-[var(--bordeaux)]">
                    {moduleLabels[code] || code}
                  </p>
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {items.map(guideCard)}
                  </div>
                </section>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="sheets">
          {sheets.items.length === 0 ? (
            <EmptyState testId="sheets-empty" icon={IdCard} title="Aucune fiche de poste"
              description="Le Bureau publie ici les fiches de poste des membres et représentants." />
          ) : (
            <div className="grid gap-4 md:grid-cols-2" data-testid="sheets-list">
              {sheets.items.map((s) => (
                <div key={s.document_id} data-testid={`sheet-${s.document_id}`}
                  className="rounded-xl border bg-card p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-base md:text-lg font-bold text-[var(--marine)]">
                        {s.role_title}
                      </p>
                      <p className="text-xs text-muted-foreground">{s.member_name}</p>
                    </div>
                    <Chip tone="marine">{s.visibility_label}</Chip>
                  </div>
                  <p className="mt-3 text-sm"><strong>Responsabilités :</strong> {s.responsibilities}</p>
                  {s.daily_actions && (
                    <p className="mt-2 text-sm"><strong>Au quotidien :</strong> {s.daily_actions}</p>
                  )}
                  {(s.module_labels || []).length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {s.module_labels.map((m) => <Chip key={m} tone="muted">{m}</Chip>)}
                    </div>
                  )}
                  {isManager && (
                    <div className="mt-4 flex gap-2">
                      <Button size="sm" variant="outline" className="rounded-full"
                        data-testid={`sheet-edit-${s.document_id}`}
                        onClick={() => {
                          setEditingSheet(s.document_id);
                          setSheet({ member_id: s.member_id, role_title: s.role_title,
                            responsibilities: s.responsibilities, daily_actions: s.daily_actions || "",
                            modules: s.modules || [], visibility: s.visibility,
                            notes: s.notes || "" });
                          setSheetOpen(true);
                        }}>
                        <Pencil className="mr-1.5 h-3.5 w-3.5" /> Modifier
                      </Button>
                      <RowMenu testId={`sheet-menu-${s.document_id}`} items={[
                        { label: "Supprimer", icon: Trash2, danger: true, testId: `sheet-delete-${s.document_id}`,
                          onSelect: () => removeSheet(s) }]} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {isManager && (
          <TabsContent value="pending">
            <SectionCard title="Fiches proposées par les professionnels" icon={ShieldCheck}
              testId="pending-guides">
              <div className="grid gap-4 md:grid-cols-2">
                {guides.items.filter((g) => g.status === "PENDING").map(guideCard)}
              </div>
            </SectionCard>
          </TabsContent>
        )}
      </Tabs>

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="guide-dialog">
          <DialogHeader>
            <DialogTitle>{editingGuide ? "Modifier le guide" : "Nouveau guide"}</DialogTitle>
            <DialogDescription>
              Rédigez court et clair : le guide reste une référence consultable à tout moment.
              {!isManager && " Votre fiche sera soumise au Bureau avant publication."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitGuide} className="space-y-4">
            <div><Label>Titre *</Label>
              <Input required value={guide.title} data-testid="guide-title-input"
                onChange={(e) => setGuide({ ...guide, title: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Module concerné</Label>
                <Select value={guide.module} onValueChange={(v) => setGuide({ ...guide, module: v })}>
                  <SelectTrigger data-testid="guide-module-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(meta.modules || []).map((m) => (
                      <SelectItem key={m} value={m} data-testid={`guide-module-${m}`}>
                        {moduleLabels[m] || m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select></div>
              {isManager && (
                <div><Label>Visibilité</Label>
                  <Select value={guide.visibility}
                    onValueChange={(v) => setGuide({ ...guide, visibility: v })}>
                    <SelectTrigger data-testid="guide-visibility-select"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(meta.visibilities || []).map((v) => (
                        <SelectItem key={v} value={v}>{meta.visibility_labels[v]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select></div>
              )}
            </div>
            <div>
              <Label>Rôles concernés *</Label>
              <div className="mt-2 flex flex-wrap gap-3">
                {(meta.role_scopes || []).map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={guide.role_scopes.includes(r)} data-testid={`guide-role-${r}`}
                      onCheckedChange={(checked) => setGuide({ ...guide,
                        role_scopes: checked ? [...guide.role_scopes, r]
                          : guide.role_scopes.filter((x) => x !== r) })} />
                    {meta.role_scope_labels[r]}
                  </label>
                ))}
              </div>
            </div>
            <div><Label>Résumé en une phrase</Label>
              <Input value={guide.summary} data-testid="guide-summary-input"
                onChange={(e) => setGuide({ ...guide, summary: e.target.value })} /></div>
            <div><Label>Contenu *</Label>
              <RichTextEditor value={guide.content} testId="guide-content-input"
                placeholder="Étape 1 : … Étape 2 : … (titres, gras, listes, liens, images)"
                onChange={(html) => setGuide({ ...guide, content: html })} />
              <p className="mt-1 text-xs text-muted-foreground">
                Les images sont compressées automatiquement (1200 px, 350 Ko max chacune).
              </p></div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                data-testid="guide-save-button">
                {isManager ? "Publier" : "Envoyer au Bureau"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="sheet-dialog">
          <DialogHeader>
            <DialogTitle>{editingSheet ? "Modifier la fiche de poste" : "Nouvelle fiche de poste"}</DialogTitle>
            <DialogDescription>
              La fiche est rattachée au profil du membre et classée dans les Documents.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitSheet} className="space-y-4">
            {!editingSheet && (
              <div><Label>Membre concerné *</Label>
                <Select value={sheet.member_id}
                  onValueChange={(v) => setSheet({ ...sheet, member_id: v })}>
                  <SelectTrigger data-testid="sheet-member-select">
                    <SelectValue placeholder="Choisir un membre" />
                  </SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.profile?.display_name || m.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select></div>
            )}
            <div><Label>Titre du rôle *</Label>
              <Input required value={sheet.role_title} data-testid="sheet-title-input"
                onChange={(e) => setSheet({ ...sheet, role_title: e.target.value })} /></div>
            <div><Label>Responsabilités *</Label>
              <Textarea rows={4} required value={sheet.responsibilities}
                data-testid="sheet-responsibilities-input"
                onChange={(e) => setSheet({ ...sheet, responsibilities: e.target.value })} /></div>
            <div><Label>Actions quotidiennes attendues dans la plateforme</Label>
              <Textarea rows={3} value={sheet.daily_actions} data-testid="sheet-actions-input"
                onChange={(e) => setSheet({ ...sheet, daily_actions: e.target.value })} /></div>
            <div>
              <Label>Modules utilisés</Label>
              <div className="mt-2 flex flex-wrap gap-3">
                {(meta.modules || []).map((m) => (
                  <label key={m} className="flex items-center gap-2 text-xs">
                    <Checkbox checked={sheet.modules.includes(m)} data-testid={`sheet-module-${m}`}
                      onCheckedChange={(checked) => setSheet({ ...sheet,
                        modules: checked ? [...sheet.modules, m]
                          : sheet.modules.filter((x) => x !== m) })} />
                    {moduleLabels[m] || m}
                  </label>
                ))}
              </div>
            </div>
            <div><Label>Visibilité</Label>
              <Select value={sheet.visibility} onValueChange={(v) => setSheet({ ...sheet, visibility: v })}>
                <SelectTrigger data-testid="sheet-visibility-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(meta.visibilities || []).map((v) => (
                    <SelectItem key={v} value={v} data-testid={`sheet-visibility-${v}`}>
                      {meta.visibility_labels[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select></div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                data-testid="sheet-save-button">Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reading} onOpenChange={() => setReading(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="guide-reader">
          <DialogHeader>
            <DialogTitle>{reading?.title}</DialogTitle>
            <DialogDescription>
              {reading?.module_label} · {(reading?.role_scope_labels || []).join(", ")}
            </DialogDescription>
          </DialogHeader>
          <RichContent html={reading?.content} testId="guide-reader-content" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
