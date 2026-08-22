import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Boxes, Plus, LayoutGrid, Table2, Trash2, Pencil, ArrowDownUp, Tags, Euro, Link2 }
  from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState, SectionCard, Chip, KpiCard } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter }
  from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const DIRECTIONS = { IN: "Entrée", OUT: "Sortie", ADJUST: "Ajustement" };
const emptyItem = { name: "", category: "", description: "", quantity: 0, alert_threshold: 5,
  unit: "pièce", origin: "", location: "", unit_cost: "", project_id: "", task_id: "" };
const emptyMovement = { direction: "IN", quantity: 1, reason: "", payment_method: "ESPECES",
  date: new Date().toISOString().slice(0, 10), amount: "" };

export default function Stock() {
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState(null);
  const [summary, setSummary] = useState(null);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [view, setView] = useState("kanban");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [itemOpen, setItemOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [item, setItem] = useState(emptyItem);
  const [detail, setDetail] = useState(null);
  const [movements, setMovements] = useState([]);
  const [movement, setMovement] = useState(emptyMovement);
  const [newCategory, setNewCategory] = useState("");
  const [editCategory, setEditCategory] = useState(null);

  const load = useCallback(async () => {
    try {
      const [m, items, sum] = await Promise.all([
        api.get("/stock/meta"),
        api.get("/stock/items", { params: { q: search || undefined, category: category || undefined } }),
        api.get("/stock/finance-summary"),
      ]);
      setMeta(m.data); setData(items.data); setSummary(sum.data);
    } catch (e) { toast.error(apiError(e)); }
  }, [search, category]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/projects").then((r) => setProjects(r.data.items || [])).catch(() => {});
    api.get("/tasks").then((r) => setTasks(r.data.items || [])).catch(() => {});
  }, []);

  const categories = meta?.categories || [];
  const grouped = useMemo(() => {
    const map = new Map(categories.map((c) => [c.name, []]));
    (data?.items || []).forEach((i) => {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category).push(i);
    });
    return [...map.entries()].filter(([, items]) => items.length > 0 || !category);
  }, [data, categories, category]);

  const openItem = (source = null) => {
    setEditing(source?.item_id || null);
    setItem(source ? { ...emptyItem, ...source, unit_cost: source.unit_cost ?? "",
      project_id: source.project_id || "", task_id: source.task_id || "" } : emptyItem);
    setItemOpen(true);
  };

  const saveItem = async (event) => {
    event.preventDefault();
    if (!item.category) return toast.error("La catégorie est obligatoire");
    const payload = {
      name: item.name, category: item.category, description: item.description || null,
      alert_threshold: Number(item.alert_threshold) || 0, unit: item.unit,
      origin: item.origin || null, location: item.location || null,
      unit_cost: item.unit_cost === "" ? null : Number(item.unit_cost),
      project_id: item.project_id || null, task_id: item.task_id || null,
    };
    try {
      if (editing) await api.put(`/stock/items/${editing}`, payload);
      else await api.post("/stock/items", { ...payload, quantity: Number(item.quantity) || 0 });
      toast.success(editing ? "Article mis à jour" : "Article ajouté à l'inventaire");
      setItemOpen(false); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const openDetail = async (source) => {
    setDetail(source); setMovement(emptyMovement);
    try {
      const { data } = await api.get("/stock/movements", { params: { item_id: source.item_id } });
      setMovements(data.items);
    } catch (e) { toast.error(apiError(e)); }
  };

  const addMovement = async (event) => {
    event.preventDefault();
    try {
      await api.post(`/stock/items/${detail.item_id}/movements`, {
        direction: movement.direction, quantity: Number(movement.quantity) || 1,
        reason: movement.reason || null, payment_method: movement.payment_method,
        date: movement.date, amount: movement.amount === "" ? null : Number(movement.amount) });
      toast.success("Mouvement enregistré");
      const [items, mvts] = await Promise.all([
        api.get("/stock/items"), api.get("/stock/movements", { params: { item_id: detail.item_id } })]);
      setData(items.data);
      setMovements(mvts.data.items);
      setDetail((items.data.items || []).find((i) => i.item_id === detail.item_id) || detail);
      setMovement(emptyMovement);
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const removeItem = async (source, hard) => {
    const question = hard
      ? `Supprimer DÉFINITIVEMENT « ${source.name} » et son historique ? Motif (tracé) :`
      : `Archiver « ${source.name} » ? Motif (tracé) :`;
    const reason = window.prompt(question);
    if (reason === null) return;
    if (hard && !window.confirm("Confirmez-vous la suppression définitive ? Action irréversible.")) return;
    try {
      const { data } = await api.delete(`/stock/items/${source.item_id}`,
        { params: { reason: reason || "Non précisé", hard } });
      toast.success(data.message);
      setDetail(null); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const saveCategory = async (event) => {
    event.preventDefault();
    try {
      if (editCategory) {
        await api.put(`/stock/categories/${editCategory.category_id}`, { name: newCategory });
        toast.success("Catégorie modifiée : les articles ont été mis à jour");
      } else {
        await api.post("/stock/categories", { name: newCategory });
        toast.success("Catégorie ajoutée");
      }
      setNewCategory(""); setEditCategory(null); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  if (!data || !meta) return <p className="text-muted-foreground" data-testid="stock-loading">Chargement…</p>;

  const renderCard = (i) => (
    <button key={i.item_id} onClick={() => openDetail(i)} data-testid={`stock-item-${i.item_id}`}
      className="w-full rounded-xl border bg-card p-4 text-left transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-[#002060]">{i.name}</span>
        <Chip tone={i.is_low ? "amber" : "muted"}>{i.quantity} {i.unit}</Chip>
      </div>
      {i.description && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{i.description}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {i.unit_cost ? <Chip tone="muted">{Number(i.unit_cost).toFixed(2)} €/u</Chip> : null}
        {i.project_title && (
          <Chip tone="marine" testId={`stock-link-project-${i.item_id}`}>
            <Link2 className="h-3 w-3" /> {i.project_title}
          </Chip>
        )}
        {i.task_title && (
          <Chip tone="bordeaux" testId={`stock-link-task-${i.item_id}`}>
            <Link2 className="h-3 w-3" /> {i.task_title}
          </Chip>
        )}
        {i.is_low && <Chip tone="amber">Seuil atteint</Chip>}
      </div>
    </button>
  );

  return (
    <div data-testid="stock-page">
      <PageHeader breadcrumb="Terrain & équipements" title="Stocks et inventaire"
        subtitle="Inventaire catégorisé, mouvements datés avec mode de paiement, liens vers projets et tâches."
        actions={
          <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="stock-create-button"
            onClick={() => openItem()}>
            <Plus className="mr-2 h-4 w-4" /> Nouvel article
          </Button>
        } />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Articles" value={data.total} icon={Boxes} testId="kpi-items" />
        <KpiCard label="Unités en stock" value={data.total_units} tone="marine" testId="kpi-units" />
        <KpiCard label="Sous le seuil" value={data.low_count} tone="bordeaux" testId="kpi-low" />
        <KpiCard label="Valeur du stock" value={`${summary?.stock_value ?? 0} €`} icon={Euro}
          tone="marine" testId="kpi-value" />
      </div>

      <Tabs value={view} onValueChange={setView} className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <TabsList>
            <TabsTrigger value="kanban" data-testid="stock-view-kanban">
              <LayoutGrid className="mr-1.5 h-3.5 w-3.5" /> Kanban
            </TabsTrigger>
            <TabsTrigger value="table" data-testid="stock-view-table">
              <Table2 className="mr-1.5 h-3.5 w-3.5" /> Tableau
            </TabsTrigger>
            <TabsTrigger value="settings" data-testid="stock-view-settings">
              <Tags className="mr-1.5 h-3.5 w-3.5" /> Paramètres
            </TabsTrigger>
          </TabsList>
          <div className="w-full sm:w-64">
            <Input value={search} placeholder="Rechercher un article…" data-testid="stock-search-input"
              onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="w-full sm:w-56">
            <Select value={category || "ALL"} onValueChange={(v) => setCategory(v === "ALL" ? "" : v)}>
              <SelectTrigger data-testid="stock-category-filter"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toutes les catégories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.category_id} value={c.name}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <TabsContent value="kanban">
          {data.items.length === 0 ? (
            <EmptyState testId="stock-empty" icon={Boxes} title="Inventaire vide"
              description="Ajoutez un premier article en choisissant sa catégorie." />
          ) : (
            <div className="flex gap-4 overflow-x-auto pb-4" data-testid="stock-kanban">
              {grouped.map(([name, items]) => (
                <div key={name} className="w-72 shrink-0" data-testid={`stock-column-${name}`}>
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#800020]">{name}</p>
                    <Chip tone="muted">{items.length}</Chip>
                  </div>
                  <div className="space-y-3">
                    {items.length === 0 ? (
                      <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                        Aucun article
                      </p>
                    ) : items.map(renderCard)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="table">
          <SectionCard title="Inventaire" icon={Table2} testId="stock-table-card">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">Article</th><th className="px-3 py-2">Catégorie</th>
                    <th className="px-3 py-2">Quantité</th><th className="px-3 py-2">Coût</th>
                    <th className="px-3 py-2">Liens</th><th className="px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((i) => (
                    <tr key={i.item_id} className="border-b last:border-0" data-testid={`stock-row-${i.item_id}`}>
                      <td className="px-3 py-2 font-semibold text-[#002060]">{i.name}</td>
                      <td className="px-3 py-2 text-xs">{i.category}</td>
                      <td className="px-3 py-2">
                        <span className={i.is_low ? "font-bold text-amber-700" : ""}>
                          {i.quantity} {i.unit}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {i.unit_cost ? `${Number(i.unit_cost).toFixed(2)} €` : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {[i.project_title, i.task_title].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex gap-1.5">
                          <Button size="sm" variant="outline" className="rounded-full"
                            data-testid={`stock-movement-${i.item_id}`} onClick={() => openDetail(i)}>
                            <ArrowDownUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="outline" className="rounded-full"
                            data-testid={`stock-edit-${i.item_id}`} onClick={() => openItem(i)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="outline"
                            className="rounded-full text-red-700 hover:bg-red-50"
                            data-testid={`stock-delete-${i.item_id}`} onClick={() => removeItem(i, true)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Catégories d'inventaire" icon={Tags} testId="stock-categories-card"
              subtitle="Ajoutez ou renommez une catégorie : les articles suivent automatiquement.">
              <form onSubmit={saveCategory} className="flex flex-wrap items-end gap-2">
                <div className="flex-1">
                  <Label className="text-xs">
                    {editCategory ? `Renommer « ${editCategory.name} »` : "Nouvelle catégorie"}
                  </Label>
                  <Input required value={newCategory} data-testid="stock-category-input"
                    onChange={(e) => setNewCategory(e.target.value)} />
                </div>
                <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                  data-testid="stock-category-submit">
                  {editCategory ? "Enregistrer" : "Ajouter"}
                </Button>
                {editCategory && (
                  <Button type="button" variant="outline" className="rounded-full"
                    onClick={() => { setEditCategory(null); setNewCategory(""); }}>Annuler</Button>
                )}
              </form>
              <ul className="mt-4 space-y-2">
                {categories.map((c) => (
                  <li key={c.category_id} data-testid={`stock-category-${c.category_id}`}
                    className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                    <span>
                      <span className="font-semibold text-[#002060]">{c.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {c.items_count || 0} article(s)
                      </span>
                    </span>
                    <Button size="sm" variant="outline" className="rounded-full"
                      data-testid={`stock-category-edit-${c.category_id}`}
                      onClick={() => { setEditCategory(c); setNewCategory(c.name); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            </SectionCard>

            <SectionCard title="Récapitulatif financier des stocks" icon={Euro} testId="stock-finance-card"
              subtitle={`${summary?.movements_count || 0} mouvement(s) · ${summary?.total_amount || 0} € tracé(s)`}>
              {(summary?.by_method || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun mouvement enregistré.</p>
              ) : (
                <ul className="space-y-2">
                  {summary.by_method.map((m) => (
                    <li key={m.method} data-testid={`stock-method-${m.method}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                      <span className="font-semibold text-[#002060]">{m.label}</span>
                      <span className="flex flex-wrap gap-2">
                        <Chip tone="muted">{m.count} mouvement(s)</Chip>
                        <Chip tone="marine">+{m.in} / -{m.out}</Chip>
                        <Chip tone="bordeaux">{m.amount.toFixed(2)} €</Chip>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={itemOpen} onOpenChange={setItemOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="stock-item-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier l'article" : "Nouvel article"}</DialogTitle>
            <DialogDescription>
              La catégorie est obligatoire ; vous pouvez lier l'article à un projet ou une tâche.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveItem} className="space-y-4">
            <div><Label>Nom *</Label>
              <Input required value={item.name} data-testid="stock-name-input"
                onChange={(e) => setItem({ ...item, name: e.target.value })} /></div>
            <div><Label>Catégorie *</Label>
              <Select value={item.category} onValueChange={(v) => setItem({ ...item, category: v })}>
                <SelectTrigger data-testid="stock-category-select">
                  <SelectValue placeholder="Choisir une catégorie" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.category_id} value={c.name}
                      data-testid={`stock-category-option-${c.name}`}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select></div>
            <div><Label>Description</Label>
              <Textarea rows={2} value={item.description || ""} data-testid="stock-description-input"
                onChange={(e) => setItem({ ...item, description: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-3">
              {!editing && (
                <div><Label>Quantité initiale</Label>
                  <Input type="number" value={item.quantity} data-testid="stock-quantity-input"
                    onChange={(e) => setItem({ ...item, quantity: e.target.value })} /></div>
              )}
              <div><Label>Unité</Label>
                <Input value={item.unit} data-testid="stock-unit-input"
                  onChange={(e) => setItem({ ...item, unit: e.target.value })} /></div>
              <div><Label>Seuil d'alerte</Label>
                <Input type="number" value={item.alert_threshold} data-testid="stock-threshold-input"
                  onChange={(e) => setItem({ ...item, alert_threshold: e.target.value })} /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Coût unitaire (€)</Label>
                <Input type="number" step="0.01" value={item.unit_cost} data-testid="stock-cost-input"
                  onChange={(e) => setItem({ ...item, unit_cost: e.target.value })} /></div>
              <div><Label>Emplacement</Label>
                <Input value={item.location || ""} data-testid="stock-location-input"
                  onChange={(e) => setItem({ ...item, location: e.target.value })} /></div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Projet lié</Label>
                <Select value={item.project_id || "NONE"}
                  onValueChange={(v) => setItem({ ...item, project_id: v === "NONE" ? "" : v })}>
                  <SelectTrigger data-testid="stock-project-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Aucun</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.project_id} value={p.project_id}>{p.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select></div>
              <div><Label>Tâche liée</Label>
                <Select value={item.task_id || "NONE"}
                  onValueChange={(v) => setItem({ ...item, task_id: v === "NONE" ? "" : v })}>
                  <SelectTrigger data-testid="stock-task-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Aucune</SelectItem>
                    {tasks.map((t) => (
                      <SelectItem key={t.task_id} value={t.task_id}>{t.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select></div>
            </div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid="stock-save-button">Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="stock-detail-dialog">
          <DialogHeader>
            <DialogTitle>{detail?.name}</DialogTitle>
            <DialogDescription>
              {detail?.category} · {detail?.quantity} {detail?.unit} en stock
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {detail.project_title && (
                  <Chip tone="marine"><Link2 className="h-3 w-3" /> Projet : {detail.project_title}</Chip>
                )}
                {detail.task_title && (
                  <Chip tone="bordeaux"><Link2 className="h-3 w-3" /> Tâche : {detail.task_title}</Chip>
                )}
                <Button size="sm" variant="outline" className="rounded-full"
                  data-testid="stock-detail-edit" onClick={() => { setDetail(null); openItem(detail); }}>
                  <Pencil className="mr-1.5 h-3.5 w-3.5" /> Modifier
                </Button>
                <Button size="sm" variant="outline" className="rounded-full text-red-700 hover:bg-red-50"
                  data-testid="stock-detail-delete" onClick={() => removeItem(detail, true)}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Supprimer
                </Button>
              </div>

              <form onSubmit={addMovement} className="rounded-xl border bg-muted/40 p-4"
                data-testid="stock-movement-form">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Nouveau mouvement
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div><Label className="text-xs">Type</Label>
                    <Select value={movement.direction}
                      onValueChange={(v) => setMovement({ ...movement, direction: v })}>
                      <SelectTrigger data-testid="movement-direction-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(DIRECTIONS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select></div>
                  <div><Label className="text-xs">Quantité</Label>
                    <Input type="number" min="1" value={movement.quantity} data-testid="movement-quantity-input"
                      onChange={(e) => setMovement({ ...movement, quantity: e.target.value })} /></div>
                  <div><Label className="text-xs">Mode de paiement</Label>
                    <Select value={movement.payment_method}
                      onValueChange={(v) => setMovement({ ...movement, payment_method: v })}>
                      <SelectTrigger data-testid="movement-payment-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(meta.payment_methods || []).map((p) => (
                          <SelectItem key={p} value={p} data-testid={`movement-payment-${p}`}>
                            {meta.payment_labels[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select></div>
                  <div><Label className="text-xs">Date du mouvement</Label>
                    <Input type="date" value={movement.date} data-testid="movement-date-input"
                      onChange={(e) => setMovement({ ...movement, date: e.target.value })} /></div>
                  <div><Label className="text-xs">Montant (€, optionnel)</Label>
                    <Input type="number" step="0.01" value={movement.amount} data-testid="movement-amount-input"
                      onChange={(e) => setMovement({ ...movement, amount: e.target.value })} /></div>
                  <div><Label className="text-xs">Motif</Label>
                    <Input value={movement.reason} data-testid="movement-reason-input"
                      onChange={(e) => setMovement({ ...movement, reason: e.target.value })} /></div>
                </div>
                <Button type="submit" className="mt-3 rounded-full bg-[#002060] hover:bg-[#001740]"
                  data-testid="movement-save-button">Enregistrer le mouvement</Button>
              </form>

              <div data-testid="stock-movement-history">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Historique des mouvements
                </p>
                {movements.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">Aucun mouvement.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {movements.map((m) => (
                      <li key={m.movement_id} data-testid={`movement-${m.movement_id}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                        <span>
                          <span className="font-semibold text-[#002060]">
                            {DIRECTIONS[m.direction]} · {m.quantity} {detail.unit}
                          </span>
                          <p className="text-xs text-muted-foreground">
                            {m.date || (m.created_at || "").slice(0, 10)} · {m.created_by_name}
                            {m.reason ? ` · ${m.reason}` : ""}
                          </p>
                        </span>
                        <span className="flex flex-wrap gap-2">
                          {m.payment_label && <Chip tone="muted">{m.payment_label}</Chip>}
                          {m.amount ? <Chip tone="bordeaux">{Number(m.amount).toFixed(2)} €</Chip> : null}
                          <Chip tone="marine">{m.quantity_before} → {m.quantity_after}</Chip>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
