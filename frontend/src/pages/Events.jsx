import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Plus, MapPin, Users, HandHeart, Check, X } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, EmptyState } from "@/components/Ui";
import { StatusBadge } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { EVENT_TYPE_LABELS, VISIBILITY_LABELS, STATUS_LABELS, label } from "@/lib/labels";

export default function Events() {
  const { user, can } = useAuth();
  const isAdmin = user?.role === "ADMIN_BUREAU";
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [filters, setFilters] = useState({ event_type: "", q: "", upcoming: false });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", event_type: "ONE_OFF", start_date: "", end_date: "",
    location: "", capacity: "", status: "PLANNED", visibility: "MEMBERS",
    google_maps_url: "", is_remote: false, visio_url: "", form_id: "", form_notify_date: "",
    eligible_for_loyalty: false, loyalty_points: 1,
  });
  const [forms, setForms] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/events", {
        params: { event_type: filters.event_type || undefined, q: filters.q || undefined,
          upcoming: filters.upcoming || undefined },
      });
      setItems(data.items);
    } catch (e) {
      toast.error(apiError(e));
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/activities/meta").then((r) => setMeta(r.data)).catch(() => {});
    if (can("forms.view")) api.get("/forms").then((r) => setForms(r.data.items || [])).catch(() => {});
  }, [can]);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post("/events", {
        ...form, capacity: form.capacity ? Number(form.capacity) : null,
        end_date: form.end_date || null,
        google_maps_url: form.google_maps_url || null, visio_url: form.visio_url || null,
        form_id: form.form_id || null, form_notify_date: form.form_notify_date || null,
      });
      toast.success("Événement créé");
      setOpen(false);
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const register = async (eventId, role) => {
    try {
      await api.post(`/events/${eventId}/register`, { role });
      toast.success(role === "VOLUNTEER" ? "Merci ! Votre proposition de bénévolat est enregistrée." : "Inscription confirmée");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div data-testid="events-page">
      <PageHeader breadcrumb="Vie associative" title="Événements"
        subtitle="Journées à thème, rencontres pros, lives et formations, avec inscriptions et bénévoles."
        actions={can("events.create") && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="event-create-button">
                <Plus className="mr-2 h-4 w-4" /> Nouvel événement
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="event-create-dialog">
              <DialogHeader><DialogTitle>Nouvel événement</DialogTitle></DialogHeader>
              <form onSubmit={create} className="space-y-4">
                <div className="space-y-2">
                  <Label>Titre *</Label>
                  <Input required value={form.title} data-testid="event-title-input"
                    onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Textarea rows={3} value={form.description} data-testid="event-description-input"
                    onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={form.event_type} onValueChange={(v) => setForm({ ...form, event_type: v })}>
                      <SelectTrigger data-testid="event-type-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(meta?.event_types || []).map((t) => (
                          <SelectItem key={t} value={t} data-testid={`event-type-${t}`}>
                            {label(EVENT_TYPE_LABELS, t, meta?.custom_labels)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Statut</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger data-testid="event-status-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(meta?.event_statuses || []).map((s) => (
                          <SelectItem key={s} value={s} data-testid={`event-status-${s}`}>
                            {label(STATUS_LABELS, s)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Date de début *</Label>
                    <Input type="date" required value={form.start_date} data-testid="event-start-input"
                      onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Date de fin</Label>
                    <Input type="date" value={form.end_date} data-testid="event-end-input"
                      onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Lieu</Label>
                    <Input value={form.location} data-testid="event-location-input"
                      onChange={(e) => setForm({ ...form, location: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Capacité</Label>
                    <Input type="number" min="1" value={form.capacity} data-testid="event-capacity-input"
                      onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
                  </div>
                </div>
                {isAdmin && (
                  <div className="space-y-2">
                    <Label>Visibilité</Label>
                    <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v })}>
                      <SelectTrigger data-testid="event-visibility-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {(meta?.visibility_modes || []).map((v) => (
                          <SelectItem key={v} value={v} data-testid={`event-visibility-${v}`}>
                            {label(VISIBILITY_LABELS, v)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Lien Google Maps</Label>
                  <Input placeholder="https://maps.google.com/…" value={form.google_maps_url}
                    data-testid="event-maps-input"
                    onChange={(e) => setForm({ ...form, google_maps_url: e.target.value })} />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={form.is_remote} data-testid="event-remote-checkbox"
                    onCheckedChange={(v) => setForm({ ...form, is_remote: !!v })} />
                  Événement à distance (visio)
                </label>
                {form.is_remote && (
                  <div className="space-y-2">
                    <Label>Lien de visioconférence</Label>
                    <Input value={form.visio_url} data-testid="event-visio-input"
                      onChange={(e) => setForm({ ...form, visio_url: e.target.value })} />
                  </div>
                )}
                {isAdmin && (
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={form.eligible_for_loyalty} data-testid="event-loyalty-checkbox"
                      onCheckedChange={(v) => setForm({ ...form, eligible_for_loyalty: !!v })} />
                    Éligible à la carte d'engagement
                  </label>
                )}
                {forms.length > 0 && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Formulaire associé</Label>
                      <Select value={form.form_id || "NONE"}
                        onValueChange={(v) => setForm({ ...form, form_id: v === "NONE" ? "" : v })}>
                        <SelectTrigger data-testid="event-form-select"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">Aucun</SelectItem>
                          {forms.map((f) => (
                            <SelectItem key={f.form_id} value={f.form_id}>{f.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Notification programmée le</Label>
                      <Input type="date" value={form.form_notify_date} data-testid="event-form-notify-input"
                        onChange={(e) => setForm({ ...form, form_notify_date: e.target.value })} />
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                    data-testid="event-save-button">Créer l'événement</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )} />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-64">
          <Label className="text-xs">Recherche</Label>
          <Input value={filters.q} data-testid="events-search-input" placeholder="Titre"
            onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={filters.event_type || "ALL"}
            onValueChange={(v) => setFilters({ ...filters, event_type: v === "ALL" ? "" : v })}>
            <SelectTrigger className="w-52" data-testid="events-type-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous</SelectItem>
              {(meta?.event_types || []).map((t) => (
                <SelectItem key={t} value={t} data-testid={`events-filter-${t}`}>
                  {label(EVENT_TYPE_LABELS, t, meta?.custom_labels)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant={filters.upcoming ? "default" : "outline"} data-testid="events-upcoming-filter"
          className={`rounded-full ${filters.upcoming ? "bg-[#800020] hover:bg-[#63001a]" : ""}`}
          onClick={() => setFilters({ ...filters, upcoming: !filters.upcoming })}>À venir</Button>
      </div>

      {items.length === 0 ? (
        <EmptyState testId="events-empty" title="Aucun événement"
          description="Les événements visibles pour votre profil apparaîtront ici." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="events-list">
          {items.map((e) => (
            <div key={e.event_id} className="flex flex-col rounded-xl border bg-card p-5"
              data-testid={`event-card-${e.event_id}`}>
              <div className="flex items-start justify-between gap-2">
                <Link to={`/events/${e.event_id}`} className="font-display font-bold text-[#002060] hover:text-[#800020]"
                  data-testid={`event-link-${e.event_id}`}>{e.title}</Link>
                <StatusBadge status={e.status} testId={`event-status-${e.event_id}`} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {label(EVENT_TYPE_LABELS, e.event_type, meta?.custom_labels)} · {new Date(e.start_date).toLocaleDateString("fr-FR")}
              </p>
              {e.description && <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{e.description}</p>}
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {e.location && <p className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {e.location}</p>}
                <p className="flex items-center gap-1">
                  <Users className="h-3 w-3" /> {e.registered_count} inscrit(s){e.capacity ? ` / ${e.capacity}` : ""}
                  {e.activities_count > 0 && ` · ${e.activities_count} activité(s)`}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {e.is_registered ? (
                  <Button size="sm" variant="outline" className="rounded-full" data-testid={`event-unregister-${e.event_id}`}
                    onClick={async () => {
                      try {
                        await api.delete(`/events/${e.event_id}/register`);
                        toast.success("Inscription annulée");
                        load();
                      } catch (err) { toast.error(apiError(err)); }
                    }}>
                    <X className="mr-1 h-3.5 w-3.5" /> Me désinscrire
                  </Button>
                ) : (
                  <>
                    <Button size="sm" className="rounded-full bg-[#002060] hover:bg-[#001740]"
                      data-testid={`event-register-${e.event_id}`} onClick={() => register(e.event_id, "PARTICIPANT")}>
                      <Check className="mr-1 h-3.5 w-3.5" /> M'inscrire
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-full"
                      data-testid={`event-volunteer-${e.event_id}`} onClick={() => register(e.event_id, "VOLUNTEER")}>
                      <HandHeart className="mr-1 h-3.5 w-3.5" /> Aider
                    </Button>
                  </>
                )}
                <Link to={`/events/${e.event_id}`} data-testid={`event-detail-${e.event_id}`}
                  className="rounded-full border px-4 py-1.5 text-sm font-semibold text-[#002060] transition-colors hover:bg-muted">
                  Détails
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
