import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useViewMode } from "@/components/ViewMode";
import { confirmDialog, RowMenu } from "@/components/ConfirmDialog";
import { FileText, Plus, AlertTriangle, Download, LayoutGrid, List, Table2, Tags, Pencil, Trash2 }
  from "lucide-react";
import { api, apiError, fileUrl } from "@/lib/api";
import { PageHeader, EmptyState, SectionCard, Chip, KpiCard } from "@/components/Ui";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter }
  from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS = { EN_COURS: ["En cours", "amber"], SIGNE: ["Signé", "green"],
  EXPIRE: ["Expiré", "red"], A_RENOUVELER: ["À renouveler", "bordeaux"], ARCHIVE: ["Archivé", "muted"] };
const EMPTY = { title: "", category: "CONTRAT", date: new Date().toISOString().slice(0, 10),
  status: "EN_COURS", expiry_date: "", file_id: null, notes: "", proof_type: "AUTRE",
  visibility: "BUREAU" };

export default function Documents() {
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [view, setView] = useViewMode("documents", "kanban");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [proofType, setProofType] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [editCategory, setEditCategory] = useState(null);

  const load = useCallback(async () => {
    try {
      const [m, docs] = await Promise.all([
        api.get("/documents/meta"),
        api.get("/documents", { params: { q: search || undefined, category: category || undefined,
          proof_type: proofType || undefined } }),
      ]);
      setMeta(m.data); setData(docs.data);
    } catch (e) { toast.error(apiError(e)); }
  }, [search, category, proofType]);

  useEffect(() => { load(); }, [load]);

  const labels = meta?.category_labels || {};
  const grouped = useMemo(() => {
    const map = new Map((meta?.categories || []).map((c) => [c, []]));
    (data?.items || []).forEach((d) => {
      if (!map.has(d.category)) map.set(d.category, []);
      map.get(d.category).push(d);
    });
    return [...map.entries()].filter(([, items]) => items.length > 0 || !category);
  }, [data, meta, category]);

  const openForm = (item = null) => {
    setEditing(item?.document_id || null);
    setForm(item ? { ...EMPTY, ...item, expiry_date: item.expiry_date || "",
      notes: item.notes || "", proof_type: item.proof_type || "AUTRE",
      visibility: item.visibility || "BUREAU" } : EMPTY);
    setOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    const payload = { title: form.title, category: form.category, date: form.date, status: form.status,
      expiry_date: form.expiry_date || null, file_id: form.file_id, notes: form.notes || null,
      proof_type: form.proof_type, visibility: form.visibility };
    try {
      if (editing) await api.put(`/documents/${editing}`, payload);
      else await api.post("/documents", payload);
      toast.success(editing ? "Document mis à jour" : "Document enregistré");
      setOpen(false); setForm(EMPTY); setEditing(null); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const setStatus = async (item, status) => {
    try {
      await api.put(`/documents/${item.document_id}`, { status });
      toast.success("Statut mis à jour");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const remove = async (item, hard) => {
    const reason = window.prompt(hard
      ? `Supprimer DÉFINITIVEMENT « ${item.title} » ? Motif (tracé) :`
      : `Archiver « ${item.title} » ? Motif (tracé) :`);
    if (reason === null) return;
    if (hard && !await confirmDialog("Confirmez-vous la suppression définitive ? Action irréversible.")) return;
    try {
      const { data } = await api.delete(`/documents/${item.document_id}`,
        { params: { reason: reason || "Non précisé", hard } });
      toast.success(data.message); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const saveCategory = async (event) => {
    event.preventDefault();
    try {
      if (editCategory) {
        await api.put(`/documents/categories/${editCategory.doc_category_id}`, { label: newCategory });
        toast.success("Catégorie modifiée");
      } else {
        await api.post("/documents/categories", { label: newCategory });
        toast.success("Catégorie ajoutée");
      }
      setNewCategory(""); setEditCategory(null); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const removeCategory = async (item) => {
    if (!await confirmDialog(`Supprimer la catégorie « ${item.label} » ?`)) return;
    try {
      await api.delete(`/documents/categories/${item.doc_category_id}`);
      toast.success("Catégorie supprimée"); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  if (!data || !meta) return <p className="text-muted-foreground" data-testid="documents-loading">Chargement…</p>;

  const renderCard = (item) => {
    const [label, tone] = STATUS[item.status] || ["—", "muted"];
    return (
      <div key={item.document_id} data-testid={`document-${item.document_id}`}
        className="rounded-xl border bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="font-semibold text-[var(--marine)]">{item.title}</p>
          <Chip tone={tone}>{label}</Chip>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {item.proof_label} · {new Date(item.date).toLocaleDateString("fr-FR")}
          {item.expiry_date ? ` · expire le ${new Date(item.expiry_date).toLocaleDateString("fr-FR")}` : ""}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Chip tone="marine">{item.visibility_label}</Chip>
          {item.is_expiring && <Chip tone="amber">Échéance proche</Chip>}
          {item.is_expired && <Chip tone="red">Expiré</Chip>}
        </div>
        {item.notes && <p className="mt-2 text-xs text-muted-foreground">{item.notes}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {item.file_id && (
            <a href={fileUrl(item.file_id, true)} target="_blank" rel="noreferrer"
              data-testid={`document-download-${item.document_id}`}
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-[var(--marine)] hover:bg-muted">
              <Download className="h-3.5 w-3.5" /> Ouvrir
            </a>
          )}
          {data.is_manager && (
            <>
              {item.status !== "SIGNE" && (
                <Button size="sm" variant="outline" className="rounded-full"
                  data-testid={`document-sign-${item.document_id}`}
                  onClick={() => setStatus(item, "SIGNE")}>Marquer signé</Button>
              )}
              <Button size="sm" variant="outline" className="rounded-full"
                data-testid={`document-edit-${item.document_id}`} onClick={() => openForm(item)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <RowMenu testId={`document-menu-${item.document_id}`} items={[
                { label: "Supprimer définitivement", icon: Trash2, danger: true,
                  testId: `document-delete-${item.document_id}`, onSelect: () => remove(item, true) }]} />
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div data-testid="documents-page">
      <PageHeader breadcrumb="Gestion" title="Contrats & documents"
        subtitle="Classement par catégorie et type de preuve, visibilité par document, rappel 30 jours avant échéance."
        actions={data.is_manager && (
          <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" data-testid="document-create-button"
            onClick={() => openForm()}>
            <Plus className="mr-2 h-4 w-4" /> Nouveau document
          </Button>
        )} />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <KpiCard testId="documents-kpi-total" label="Documents" value={data.total} icon={FileText} />
        <KpiCard testId="documents-kpi-expiring" label="À renouveler sous 30 jours"
          value={data.expiring_count} icon={AlertTriangle} tone="bordeaux" />
        <KpiCard testId="documents-kpi-expired" label="Expirés" value={data.expired_count}
          icon={AlertTriangle} tone="bordeaux" />
      </section>

      <Tabs value={view} onValueChange={setView} className="mt-6 space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <TabsList>
            <TabsTrigger value="kanban" data-testid="documents-view-kanban">
              <LayoutGrid className="mr-1.5 h-3.5 w-3.5" /> Kanban
            </TabsTrigger>
            <TabsTrigger value="list" data-testid="documents-view-list">
              <List className="mr-1.5 h-3.5 w-3.5" /> Liste
            </TabsTrigger>
            <TabsTrigger value="table" data-testid="documents-view-table">
              <Table2 className="mr-1.5 h-3.5 w-3.5" /> Tableau
            </TabsTrigger>
            {data.is_manager && (
              <TabsTrigger value="settings" data-testid="documents-view-settings">
                <Tags className="mr-1.5 h-3.5 w-3.5" /> Paramètres
              </TabsTrigger>
            )}
          </TabsList>
          <div className="w-full sm:w-56">
            <Input value={search} placeholder="Rechercher un document…" data-testid="documents-search-input"
              onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="w-full sm:w-48">
            <Select value={category || "ALL"} onValueChange={(v) => setCategory(v === "ALL" ? "" : v)}>
              <SelectTrigger data-testid="documents-category-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toutes catégories</SelectItem>
                {(meta.categories || []).map((c) => (
                  <SelectItem key={c} value={c}>{labels[c] || c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="w-full sm:w-48">
            <Select value={proofType || "ALL"} onValueChange={(v) => setProofType(v === "ALL" ? "" : v)}>
              <SelectTrigger data-testid="documents-proof-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous types de preuve</SelectItem>
                {(meta.proof_types || []).map((p) => (
                  <SelectItem key={p} value={p}>{meta.proof_labels[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="kanban">
          {data.items.length === 0 ? (
            <EmptyState testId="documents-empty" module="documents" icon={FileText} title="Aucun document"
              description="Déposez les statuts, assurances et contrats de l'association (PDF ou texte)." />
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4" data-testid="documents-kanban">
              {grouped.map(([code, items]) => (
                <div key={code} className="w-80 shrink-0" data-testid={`documents-column-${code}`}>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-widest text-[var(--bordeaux)]">
                      {labels[code] || code}
                    </p>
                    <Chip tone="muted">{items.length}</Chip>
                  </div>
                  <div className="space-y-3">
                    {items.length === 0 ? (
                      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                        Aucun document
                      </p>
                    ) : items.map(renderCard)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="list">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="documents-list">
            {data.items.length === 0
              ? <EmptyState testId="documents-list-empty" module="documents" icon={FileText} title="Aucun document" />
              : data.items.map(renderCard)}
          </div>
        </TabsContent>

        <TabsContent value="table">
          <SectionCard title="Tous les documents" icon={Table2} testId="documents-table-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">Document</th><th className="px-3 py-2">Catégorie</th>
                    <th className="px-3 py-2">Type de preuve</th><th className="px-3 py-2">Visibilité</th>
                    <th className="px-3 py-2">Statut</th><th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.document_id} className="border-b last:border-0"
                      data-testid={`documents-row-${item.document_id}`}>
                      <td className="px-3 py-2 font-semibold text-[var(--marine)]">{item.title}</td>
                      <td className="px-3 py-2 text-xs">{item.category_label}</td>
                      <td className="px-3 py-2 text-xs">{item.proof_label}</td>
                      <td className="px-3 py-2 text-xs">{item.visibility_label}</td>
                      <td className="px-3 py-2 text-xs">{(STATUS[item.status] || ["—"])[0]}</td>
                      <td className="px-3 py-2">
                        <span className="flex gap-1.5">
                          {item.file_id && (
                            <a href={fileUrl(item.file_id, true)} target="_blank" rel="noreferrer"
                              className="inline-flex items-center rounded-full border px-2 py-1 text-xs">
                              <Download className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {data.is_manager && (
                            <>
                              <Button size="sm" variant="outline" className="rounded-full"
                                data-testid={`documents-row-edit-${item.document_id}`}
                                onClick={() => openForm(item)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <RowMenu testId={`documents-row-menu-${item.document_id}`} items={[
                                { label: "Supprimer définitivement", icon: Trash2, danger: true,
                                  testId: `documents-row-delete-${item.document_id}`,
                                  onSelect: () => remove(item, true) }]} />
                            </>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>
        </TabsContent>

        <TabsContent value="settings">
          <SectionCard title="Catégories de documents" icon={Tags} testId="documents-categories-card"
            subtitle="Les catégories d'origine restent disponibles ; ajoutez ou renommez les vôtres.">
            <form onSubmit={saveCategory} className="flex flex-wrap items-end gap-2">
              <div className="flex-1">
                <Label className="text-xs">
                  {editCategory ? `Renommer « ${editCategory.label} »` : "Nouvelle catégorie"}
                </Label>
                <Input required value={newCategory} data-testid="documents-category-input"
                  onChange={(e) => setNewCategory(e.target.value)} />
              </div>
              <Button type="submit" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                data-testid="documents-category-submit">
                {editCategory ? "Enregistrer" : "Ajouter"}
              </Button>
              {editCategory && (
                <Button type="button" variant="outline" className="rounded-full"
                  onClick={() => { setEditCategory(null); setNewCategory(""); }}>Annuler</Button>
              )}
            </form>
            <div className="mt-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Catégories d'origine
              </p>
              <div className="flex flex-wrap gap-2">
                {(meta.categories || [])
                  .filter((c) => !(meta.custom_categories || []).some((x) => x.code === c))
                  .map((c) => <Chip key={c} tone="muted">{labels[c] || c}</Chip>)}
              </div>
              <p className="pt-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Catégories personnalisées
              </p>
              {(meta.custom_categories || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucune catégorie personnalisée.</p>
              ) : (
                <ul className="space-y-2">
                  {meta.custom_categories.map((c) => (
                    <li key={c.doc_category_id} data-testid={`documents-category-${c.doc_category_id}`}
                      className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                      <span className="font-semibold text-[var(--marine)]">{c.label}</span>
                      <span className="flex gap-1.5">
                        <Button size="sm" variant="outline" className="rounded-full"
                          data-testid={`documents-category-edit-${c.doc_category_id}`}
                          onClick={() => { setEditCategory(c); setNewCategory(c.label); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <RowMenu testId={`documents-category-menu-${c.doc_category_id}`} items={[
                          { label: "Supprimer la catégorie", icon: Trash2, danger: true,
                            testId: `documents-category-delete-${c.doc_category_id}`,
                            onSelect: () => removeCategory(c) }]} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </SectionCard>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="document-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le document" : "Nouveau document"}</DialogTitle>
            <DialogDescription>
              Catégorie, type de preuve et visibilité sont modifiables à tout moment.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Titre</Label>
              <Input value={form.title} required data-testid="document-title-input"
                onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Catégorie</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger data-testid="document-category-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(meta.categories || []).map((c) => (
                      <SelectItem key={c} value={c} data-testid={`document-category-${c}`}>
                        {labels[c] || c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select></div>
              <div><Label>Type de preuve</Label>
                <Select value={form.proof_type} onValueChange={(v) => setForm({ ...form, proof_type: v })}>
                  <SelectTrigger data-testid="document-proof-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(meta.proof_types || []).map((p) => (
                      <SelectItem key={p} value={p} data-testid={`document-proof-${p}`}>
                        {meta.proof_labels[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select></div>
              <div><Label>Visibilité</Label>
                <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v })}>
                  <SelectTrigger data-testid="document-visibility-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(meta.visibilities || []).map((v) => (
                      <SelectItem key={v} value={v} data-testid={`document-visibility-${v}`}>
                        {meta.visibility_labels[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select></div>
              <div><Label>Statut</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger data-testid="document-status-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS).filter(([k]) => k !== "ARCHIVE").map(([k, [label]]) =>
                      <SelectItem key={k} value={k}>{label}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div><Label>Date du document</Label>
                <Input type="date" value={form.date} data-testid="document-date-input"
                  onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div><Label>Date d'expiration</Label>
                <Input type="date" value={form.expiry_date} data-testid="document-expiry-input"
                  onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
            </div>
            {!editing && (
              <div><Label>Fichier (PDF ou texte uniquement)</Label>
                <FileUpload usage="OTHER" accept=".pdf,.txt,.csv" testId="document-file-upload"
                  value={form.file_id} label="Déposer le document"
                  onChange={(id) => setForm({ ...form, file_id: id })} /></div>
            )}
            <div><Label>Notes</Label>
              <Textarea rows={2} value={form.notes} data-testid="document-notes-input"
                onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                data-testid="document-save-button">Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
