import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Boxes, Plus, AlertTriangle, ArrowDownUp, History } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState, Chip, KpiCard, SectionCard } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Stock() {
  const [data, setData] = useState(null);
  const [categories, setCategories] = useState([]);
  const [members, setMembers] = useState([]);
  const [movements, setMovements] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", category: "", quantity: "0", alert_threshold: "5",
    unit: "pièce", origin: "", location: "", unit_cost: "" });
  const [move, setMove] = useState(null);
  const [moveForm, setMoveForm] = useState({ direction: "OUT", quantity: "1", reason: "", related_user_id: "" });

  const load = useCallback(async () => {
    const [items, cats] = await Promise.all([api.get("/stock/items"), api.get("/stock/categories")]);
    setData(items.data); setCategories(cats.data.items || []);
  }, []);

  useEffect(() => {
    load();
    api.get("/members").then((r) => setMembers(r.data.items || [])).catch(() => {});
  }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post("/stock/items", { ...form, quantity: Number(form.quantity) || 0,
        alert_threshold: Number(form.alert_threshold) || 0,
        unit_cost: form.unit_cost ? Number(form.unit_cost) : null });
      toast.success("Article ajouté");
      setOpen(false); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const addCategory = async () => {
    const name = window.prompt("Nom de la nouvelle catégorie");
    if (!name) return;
    try {
      await api.post("/stock/categories", { name });
      toast.success("Catégorie créée");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const submitMovement = async (event) => {
    event.preventDefault();
    try {
      await api.post(`/stock/items/${move.item_id}/movements`, { ...moveForm,
        quantity: Number(moveForm.quantity), related_user_id: moveForm.related_user_id || null });
      toast.success("Mouvement enregistré");
      setMove(null); setMoveForm({ direction: "OUT", quantity: "1", reason: "", related_user_id: "" });
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const showMovements = async (item) => {
    const { data } = await api.get(`/stock/movements?item_id=${item.item_id}`);
    setMovements({ item, items: data.items });
  };

  if (!data) return <p className="text-muted-foreground" data-testid="stock-loading">Chargement…</p>;

  return (
    <div data-testid="stock-page">
      <PageHeader breadcrumb="Gestion" title="Stocks"
        subtitle="Goodies, matériel et supports pédagogiques, avec alerte automatique sous le seuil."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" data-testid="stock-category-button"
              onClick={addCategory}>Nouvelle catégorie</Button>
            <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="stock-create-button"
              onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nouvel article
            </Button>
          </div>
        } />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard testId="stock-kpi-items" label="Articles" value={data.total} icon={Boxes} />
        <KpiCard testId="stock-kpi-units" label="Unités en stock" value={data.total_units} icon={Boxes} />
        <KpiCard testId="stock-kpi-low" label="Sous le seuil" value={data.low_count} icon={AlertTriangle}
          tone="bordeaux" />
        <KpiCard testId="stock-kpi-categories" label="Catégories" value={categories.length} icon={Boxes} />
      </section>

      <div className="mt-6">
        {data.items.length === 0 ? (
          <EmptyState testId="stock-empty" icon={Boxes} title="Aucun article en stock"
            description="Créez vos catégories puis ajoutez goodies, matériel et supports." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.items.map((item) => (
              <div key={item.item_id} data-testid={`stock-card-${item.item_id}`}
                className={`rounded-xl border bg-card p-5 transition-shadow hover:shadow-md ${
                  item.is_low ? "border-[#800020]/40" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-display font-bold text-[#002060]">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.category}</p>
                  </div>
                  {item.is_low && <Chip tone="red"><AlertTriangle className="h-3 w-3" /> Seuil atteint</Chip>}
                </div>
                <p className="mt-4 font-display text-3xl font-extrabold text-[#800020]">
                  {item.quantity} <span className="text-sm font-semibold text-muted-foreground">{item.unit}(s)</span>
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Seuil d'alerte : {item.alert_threshold}{item.location ? ` · ${item.location}` : ""}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" className="rounded-full bg-[#002060] hover:bg-[#001740]"
                    data-testid={`stock-move-${item.item_id}`} onClick={() => setMove(item)}>
                    <ArrowDownUp className="mr-1.5 h-3.5 w-3.5" /> Entrée / sortie
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-full"
                    data-testid={`stock-history-${item.item_id}`} onClick={() => showMovements(item)}>
                    <History className="mr-1.5 h-3.5 w-3.5" /> Historique
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="stock-dialog">
          <DialogHeader><DialogTitle>Nouvel article</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Nom</Label>
              <Input value={form.name} required data-testid="stock-name-input"
                onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>Catégorie</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger data-testid="stock-category-select">
                  <SelectValue placeholder="Choisir une catégorie" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.category_id} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><Label>Quantité</Label>
                <Input type="number" value={form.quantity} data-testid="stock-quantity-input"
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
              <div><Label>Seuil d'alerte</Label>
                <Input type="number" value={form.alert_threshold} data-testid="stock-threshold-input"
                  onChange={(e) => setForm({ ...form, alert_threshold: e.target.value })} /></div>
              <div><Label>Unité</Label>
                <Input value={form.unit} data-testid="stock-unit-input"
                  onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
              <div><Label>Origine</Label>
                <Input value={form.origin} data-testid="stock-origin-input"
                  onChange={(e) => setForm({ ...form, origin: e.target.value })} /></div>
              <div><Label>Emplacement</Label>
                <Input value={form.location} data-testid="stock-location-input"
                  onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
              <div><Label>Coût unitaire (€)</Label>
                <Input type="number" step="0.01" value={form.unit_cost} data-testid="stock-cost-input"
                  onChange={(e) => setForm({ ...form, unit_cost: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid="stock-save-button">Ajouter</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!move} onOpenChange={() => setMove(null)}>
        <DialogContent data-testid="stock-move-dialog">
          <DialogHeader><DialogTitle>Mouvement — {move?.name}</DialogTitle></DialogHeader>
          <form onSubmit={submitMovement} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Type</Label>
                <Select value={moveForm.direction} onValueChange={(v) => setMoveForm({ ...moveForm, direction: v })}>
                  <SelectTrigger data-testid="move-direction-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">Entrée</SelectItem>
                    <SelectItem value="OUT">Sortie</SelectItem>
                    <SelectItem value="ADJUST">Correction d'inventaire</SelectItem>
                  </SelectContent>
                </Select></div>
              <div><Label>Quantité</Label>
                <Input type="number" min="1" value={moveForm.quantity} required data-testid="move-quantity-input"
                  onChange={(e) => setMoveForm({ ...moveForm, quantity: e.target.value })} /></div>
            </div>
            <div><Label>Motif</Label>
              <Input value={moveForm.reason} data-testid="move-reason-input"
                onChange={(e) => setMoveForm({ ...moveForm, reason: e.target.value })} /></div>
            <div><Label>Profil associé (traçabilité)</Label>
              <Select value={moveForm.related_user_id}
                onValueChange={(v) => setMoveForm({ ...moveForm, related_user_id: v })}>
                <SelectTrigger data-testid="move-member-select">
                  <SelectValue placeholder="Facultatif" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.profile?.display_name || m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select></div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid="move-save-button">Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!movements} onOpenChange={() => setMovements(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto" data-testid="stock-history-dialog">
          <DialogHeader><DialogTitle>Historique — {movements?.item.name}</DialogTitle></DialogHeader>
          <SectionCard title="Mouvements" testId="stock-movements-list">
            <ul className="space-y-2">
              {movements?.items.map((m) => (
                <li key={m.movement_id} className="rounded-lg border px-3 py-2 text-sm">
                  <p className="font-semibold text-[#002060]">
                    {m.direction === "IN" ? "+" : m.direction === "OUT" ? "-" : "="}{m.quantity} — {m.reason}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.quantity_before} → {m.quantity_after} · {m.created_by_name}
                    {m.related_user_name ? ` · pour ${m.related_user_name}` : ""} ·
                    {" "}{new Date(m.created_at).toLocaleDateString("fr-FR")}
                  </p>
                </li>
              ))}
            </ul>
          </SectionCard>
        </DialogContent>
      </Dialog>
    </div>
  );
}
