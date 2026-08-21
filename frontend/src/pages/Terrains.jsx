import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { MapPinned, Plus, CalendarCheck, Check, X, Sparkle, Euro, BadgeEuro } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState, Chip, SectionCard } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";

const TERRAIN_STATUS = { DISPONIBLE: ["Disponible", "green"], AMENAGEMENT: ["En aménagement", "amber"],
  INDISPONIBLE: ["Indisponible", "red"], ARCHIVE: ["Archivé", "muted"] };
const RES_STATUS = { PENDING: ["En attente", "amber"], CONFIRMED: ["Confirmée", "green"],
  REFUSED: ["Refusée", "red"], CANCELLED: ["Annulée", "muted"] };
const PAYMENT_STATUS = { FREE: ["Gratuite", "muted"], EXPECTED: ["À encaisser", "amber"],
  PAID: ["Encaissée", "green"] };

const emptyTerrain = { name: "", location: "", description: "", status: "DISPONIBLE",
  surface: "", capacity: "", access_notes: "", hourly_rates: {} };

const hoursBetween = (start, end) => {
  const toMin = (v) => { const [h, m] = (v || "0:0").split(":"); return Number(h) * 60 + Number(m || 0); };
  return Math.max(toMin(end) - toMin(start), 0) / 60;
};

export default function Terrains() {
  const { can } = useAuth();
  const [meta, setMeta] = useState(null);
  const [data, setData] = useState(null);
  const [reservations, setReservations] = useState(null);
  const [terrainOpen, setTerrainOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [terrain, setTerrain] = useState(emptyTerrain);
  const [request, setRequest] = useState(null);
  const [form, setForm] = useState({ date: "", start_time: "09:00", end_time: "12:00",
    category: "SEANCE_SIMPLE", purpose: "", description: "", resource: "", is_free: false,
    expected_people: "" });

  const load = useCallback(async () => {
    const [m, t, r] = await Promise.all([api.get("/terrains/meta"), api.get("/terrains"),
      api.get("/terrain-reservations")]);
    setMeta(m.data); setData(t.data); setReservations(r.data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const labels = meta?.category_labels || {};
  const categories = meta?.categories || [];

  const openTerrain = (item = null) => {
    setEditing(item?.terrain_id || null);
    setTerrain(item ? { ...emptyTerrain, ...item, capacity: item.capacity ?? "",
      hourly_rates: item.hourly_rates || {} } : emptyTerrain);
    setTerrainOpen(true);
  };

  const saveTerrain = async (event) => {
    event.preventDefault();
    const payload = { name: terrain.name, location: terrain.location, description: terrain.description,
      status: terrain.status, surface: terrain.surface, access_notes: terrain.access_notes,
      capacity: terrain.capacity ? Number(terrain.capacity) : null,
      hourly_rates: Object.fromEntries(Object.entries(terrain.hourly_rates || {})
        .map(([k, v]) => [k, Number(v) || 0])) };
    try {
      if (editing) await api.put(`/terrains/${editing}`, payload);
      else await api.post("/terrains", payload);
      toast.success(editing ? "Terrain mis à jour" : "Terrain enregistré");
      setTerrainOpen(false); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const submitRequest = async (event) => {
    event.preventDefault();
    try {
      await api.post("/terrain-reservations", { ...form, terrain_id: request.terrain_id,
        expected_people: form.expected_people ? Number(form.expected_people) : null });
      toast.success("Demande envoyée au Bureau");
      setRequest(null); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const review = async (reservation, decision) => {
    const comment = decision === "REFUSE" ? window.prompt("Motif du refus") : null;
    if (decision === "REFUSE" && !comment) return;
    try {
      await api.post(`/terrain-reservations/${reservation.reservation_id}/review`, { decision, comment });
      toast.success(decision === "CONFIRM"
        ? "Réservation confirmée — écriture financière provisoire créée" : "Demande refusée");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const markPaid = async (reservation) => {
    try {
      await api.post(`/terrain-reservations/${reservation.reservation_id}/paid`);
      toast.success("Location encaissée : écriture financière validée");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  if (!data || !meta) return <p className="text-muted-foreground" data-testid="terrains-loading">Chargement…</p>;

  const estimatedRate = request ? Number((request.hourly_rates || {})[form.category] || 0) : 0;
  const estimated = form.is_free ? 0
    : Math.round(estimatedRate * hoursBetween(form.start_time, form.end_time) * 100) / 100;

  return (
    <div data-testid="terrains-page">
      <PageHeader breadcrumb="Terrain & équipements" title="Terrains"
        subtitle="Disponibilités, tarifs horaires, activités proposées et demandes de réservation."
        actions={data.is_manager && (
          <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="terrain-create-button"
            onClick={() => openTerrain()}>
            <Plus className="mr-2 h-4 w-4" /> Nouveau terrain
          </Button>
        )} />

      {data.items.length === 0 ? (
        <EmptyState testId="terrains-empty" icon={MapPinned} title="Aucun terrain enregistré"
          description="Les terrains et leurs équipements seront décrits ici par le Bureau." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {data.items.map((item) => {
            const [label, tone] = TERRAIN_STATUS[item.status] || ["—", "muted"];
            const rates = Object.entries(item.hourly_rates || {}).filter(([, v]) => Number(v) > 0);
            return (
              <div key={item.terrain_id} data-testid={`terrain-card-${item.terrain_id}`}
                className="rounded-xl border bg-card p-5 transition-shadow hover:shadow-md">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-base md:text-lg font-bold text-[#002060]">{item.name}</h3>
                  <Chip tone={tone}>{label}</Chip>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{item.location}</p>
                <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.surface && <Chip tone="muted">{item.surface}</Chip>}
                  {item.capacity && <Chip tone="muted">{item.capacity} personnes</Chip>}
                  {(item.equipment || []).map((eq) => <Chip key={eq} tone="marine">{eq}</Chip>)}
                </div>

                {rates.length > 0 && (
                  <div className="mt-4" data-testid={`terrain-rates-${item.terrain_id}`}>
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Tarifs horaires
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {rates.map(([cat, value]) => (
                        <Chip key={cat} tone="bordeaux">
                          <Euro className="h-3 w-3" /> {labels[cat] || cat} — {Number(value).toFixed(2)} €/h
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}

                {item.activities?.length > 0 && (
                  <div className="mt-4 rounded-lg bg-muted/50 p-3">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Activités proposées ici
                    </p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {item.activities.map((a) => (
                        <li key={a.activity_id} className="flex items-center gap-2 text-[#002060]">
                          <Sparkle className="h-3 w-3 text-[#800020]" /> {a.title}
                          <span className="text-xs text-muted-foreground">
                            {new Date(a.date).toLocaleDateString("fr-FR")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {item.confirmed_reservations?.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Créneaux déjà réservés
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {item.confirmed_reservations.map((r, i) => (
                        <Chip key={i} tone="amber">
                          {new Date(r.date).toLocaleDateString("fr-FR")} · {r.start_time}-{r.end_time}
                        </Chip>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  {can("terrain.reserve") && item.status === "DISPONIBLE" && (
                    <Button size="sm" className="rounded-full bg-[#002060] hover:bg-[#001740]"
                      data-testid={`terrain-reserve-${item.terrain_id}`}
                      onClick={() => setRequest(item)}>
                      <CalendarCheck className="mr-1.5 h-3.5 w-3.5" /> Demander une réservation
                    </Button>
                  )}
                  {data.is_manager && (
                    <Button size="sm" variant="outline" className="rounded-full"
                      data-testid={`terrain-edit-${item.terrain_id}`} onClick={() => openTerrain(item)}>
                      <BadgeEuro className="mr-1.5 h-3.5 w-3.5" /> Modifier / tarifs
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <SectionCard title={data.is_manager ? "Demandes de réservation" : "Mes demandes"} icon={CalendarCheck}
        testId="terrain-reservations" className="mt-6">
        {reservations?.items.length === 0 ? (
          <EmptyState testId="terrain-reservations-empty" icon={CalendarCheck} title="Aucune demande"
            description="Les demandes de réservation apparaîtront ici avec leur statut." />
        ) : (
          <ul className="space-y-2">
            {reservations?.items.map((res) => {
              const [label, tone] = RES_STATUS[res.status] || ["—", "muted"];
              const [payLabel, payTone] = PAYMENT_STATUS[res.payment_status] || ["—", "muted"];
              return (
                <li key={res.reservation_id} data-testid={`reservation-${res.reservation_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm">
                  <span>
                    <span className="font-semibold text-[#002060]">{res.terrain_name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {new Date(res.date).toLocaleDateString("fr-FR")} · {res.start_time}-{res.end_time} ·
                      {" "}{labels[res.category] || res.category}
                    </span>
                    <p className="text-xs text-muted-foreground">{res.requested_by_name} — {res.purpose}</p>
                    <p className="mt-1 text-xs font-semibold text-[#800020]"
                      data-testid={`reservation-amount-${res.reservation_id}`}>
                      {res.amount > 0
                        ? `${res.amount.toFixed(2)} € (${res.hours} h × ${res.hourly_rate.toFixed(2)} €/h)`
                        : "Mise à disposition gratuite"}
                    </p>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Chip tone={tone}>{label}</Chip>
                    {res.status === "CONFIRMED" && <Chip tone={payTone}>{payLabel}</Chip>}
                    {data.is_manager && res.status === "PENDING" && (
                      <>
                        <Button size="sm" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                          data-testid={`reservation-confirm-${res.reservation_id}`}
                          onClick={() => review(res, "CONFIRM")}>
                          <Check className="mr-1.5 h-3.5 w-3.5" /> Confirmer
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-full"
                          data-testid={`reservation-refuse-${res.reservation_id}`}
                          onClick={() => review(res, "REFUSE")}>
                          <X className="mr-1.5 h-3.5 w-3.5" /> Refuser
                        </Button>
                      </>
                    )}
                    {data.is_manager && res.status === "CONFIRMED" && res.amount > 0
                      && res.payment_status !== "PAID" && (
                      <Button size="sm" variant="outline" className="rounded-full"
                        data-testid={`reservation-paid-${res.reservation_id}`} onClick={() => markPaid(res)}>
                        <Euro className="mr-1.5 h-3.5 w-3.5" /> Marquer encaissée
                      </Button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <Dialog open={terrainOpen} onOpenChange={setTerrainOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="terrain-dialog">
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le terrain" : "Nouveau terrain"}</DialogTitle>
            <DialogDescription>
              Décrivez le terrain et fixez les tarifs horaires par catégorie de réservation.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveTerrain} className="space-y-4">
            <div><Label>Nom</Label>
              <Input value={terrain.name} required data-testid="terrain-name-input"
                onChange={(e) => setTerrain({ ...terrain, name: e.target.value })} /></div>
            <div><Label>Localisation</Label>
              <Input value={terrain.location || ""} data-testid="terrain-location-input"
                onChange={(e) => setTerrain({ ...terrain, location: e.target.value })} /></div>
            <div><Label>Description</Label>
              <Textarea rows={3} value={terrain.description || ""} data-testid="terrain-description-input"
                onChange={(e) => setTerrain({ ...terrain, description: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><Label>Statut</Label>
                <Select value={terrain.status} onValueChange={(v) => setTerrain({ ...terrain, status: v })}>
                  <SelectTrigger data-testid="terrain-status-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TERRAIN_STATUS).filter(([k]) => k !== "ARCHIVE").map(([k, [label]]) =>
                      <SelectItem key={k} value={k}>{label}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div><Label>Surface</Label>
                <Input value={terrain.surface || ""} data-testid="terrain-surface-input"
                  onChange={(e) => setTerrain({ ...terrain, surface: e.target.value })} /></div>
              <div><Label>Capacité</Label>
                <Input type="number" value={terrain.capacity} data-testid="terrain-capacity-input"
                  onChange={(e) => setTerrain({ ...terrain, capacity: e.target.value })} /></div>
            </div>
            <div className="rounded-lg border bg-muted/40 p-3" data-testid="terrain-rates-editor">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Tarifs horaires par catégorie (€/h · 0 = gratuit)
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {categories.map((cat) => (
                  <div key={cat}>
                    <Label className="text-xs">{labels[cat] || cat}</Label>
                    <Input type="number" step="0.5" min="0" data-testid={`terrain-rate-${cat}`}
                      value={terrain.hourly_rates?.[cat] ?? ""}
                      onChange={(e) => setTerrain({ ...terrain,
                        hourly_rates: { ...terrain.hourly_rates, [cat]: e.target.value } })} />
                  </div>
                ))}
              </div>
            </div>
            <div><Label>Consignes d'accès (Bureau et pros)</Label>
              <Textarea rows={2} value={terrain.access_notes || ""} data-testid="terrain-access-input"
                onChange={(e) => setTerrain({ ...terrain, access_notes: e.target.value })} /></div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid="terrain-save-button">Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!request} onOpenChange={() => setRequest(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="terrain-request-dialog">
          <DialogHeader>
            <DialogTitle>Réserver — {request?.name}</DialogTitle>
            <DialogDescription>
              Le montant est calculé selon le tarif horaire de la catégorie choisie.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitRequest} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <div><Label>Date</Label>
                <Input type="date" value={form.date} required data-testid="request-date-input"
                  onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div><Label>De</Label>
                <Input type="time" value={form.start_time} data-testid="request-start-input"
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
              <div><Label>À</Label>
                <Input type="time" value={form.end_time} data-testid="request-end-input"
                  onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
            </div>
            <div><Label>Catégorie</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger data-testid="request-category-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c} value={c}>{labels[c] || c}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div><Label>Objet de la réservation</Label>
              <Textarea rows={2} value={form.purpose} required data-testid="request-purpose-input"
                onChange={(e) => setForm({ ...form, purpose: e.target.value })} /></div>
            <div><Label>Détails complémentaires</Label>
              <Textarea rows={2} value={form.description} data-testid="request-description-input"
                onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Matériel / ressource souhaitée</Label>
                <Input value={form.resource} data-testid="request-resource-input"
                  onChange={(e) => setForm({ ...form, resource: e.target.value })} /></div>
              <div><Label>Personnes attendues</Label>
                <Input type="number" value={form.expected_people} data-testid="request-people-input"
                  onChange={(e) => setForm({ ...form, expected_people: e.target.value })} /></div>
            </div>
            {data.is_manager && (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.is_free} data-testid="request-free-checkbox"
                  onCheckedChange={(v) => setForm({ ...form, is_free: !!v })} />
                Mise à disposition gratuite (aucune écriture financière)
              </label>
            )}
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-[#002060]"
              data-testid="request-estimate">
              Montant estimé : <strong>{estimated.toFixed(2)} €</strong>
              {" "}({hoursBetween(form.start_time, form.end_time)} h × {estimatedRate.toFixed(2)} €/h).
              Une écriture provisoire sera créée à la validation du Bureau, puis marquée encaissée
              après la séance.
            </p>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid="request-save-button">Envoyer la demande</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
