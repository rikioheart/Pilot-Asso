import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, MapPin, Users, Star, Check, X, MessageSquare, FileText, RotateCcw } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, EmptyState } from "@/components/Ui";
import { StatusBadge } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACTIVITY_CATEGORY_LABELS, ACTIVITY_TYPE_LABELS, VISIBILITY_LABELS, label }
  from "@/lib/labels";
import { MapEmbed } from "@/components/MapEmbed";
import { WeatherWidget } from "@/components/WeatherWidget";
import { CommentSection } from "@/components/CommentSection";
import { ParticipationControl } from "@/components/ParticipationControl";
import { MentionPicker } from "@/components/MentionPicker";
import { FormWizard } from "@/components/FormWizard";
import { useAutoSaveDraft, loadDraft, clearDraft } from "@/lib/useDraft";
import { chime } from "@/lib/sound";

const DRAFT_KEY = "activity_new";
const EMPTY = {
  title: "", description: "", category: "BALADE", type: "COLLECTIVE", date: "", start_time: "",
  end_time: "", location: "", capacity: "", price_public: "", price_member: "",
  eligible_for_loyalty: false, loyalty_points: 1, visibility: "MEMBERS", event_id: "",
  google_maps_url: "", is_remote: false, visio_url: "", google_forms_url: "", mentions: [], form_id: "", form_notify_date: "",
};

export default function Activities() {
  const { user, can } = useAuth();
  const isAdmin = user?.role === "ADMIN_BUREAU";
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [events, setEvents] = useState([]);
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState({
    category: searchParams.get("category") || "", type: searchParams.get("type") || "",
    q: "", upcoming: false });
  const [revertOpen, setRevertOpen] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [forms, setForms] = useState([]);
  const [commentFor, setCommentFor] = useState(null);
  const [draftAvail, setDraftAvail] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  useAutoSaveDraft(DRAFT_KEY, form.title.trim() ? form : "");
  useEffect(() => { if (open) setDraftAvail(!!loadDraft(DRAFT_KEY)); }, [open]);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/activities", {
        params: { category: filters.category || undefined, q: filters.q || undefined,
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
    if (can("events.view")) api.get("/events").then((r) => setEvents(r.data.items)).catch(() => {});
    if (can("forms.view")) api.get("/forms").then((r) => setForms(r.data.items || [])).catch(() => {});
  }, [can]);

  const create = async () => {
    setSubmitting(true);
    try {
      await api.post("/activities", {
        ...form,
        capacity: form.capacity ? Number(form.capacity) : null,
        price_public: form.price_public ? Number(form.price_public) : null,
        price_member: form.price_member ? Number(form.price_member) : null,
        loyalty_points: Number(form.loyalty_points) || 1,
        date: form.date || null, event_id: form.event_id || null,
        google_maps_url: form.google_maps_url || null, visio_url: form.visio_url || null,
        google_forms_url: form.google_forms_url || null, mentions: form.mentions,
        form_id: form.form_id || null, form_notify_date: form.form_notify_date || null,
      });
      toast.success(isAdmin ? "Activité créée" : "Proposition envoyée au Bureau");
      chime("create");
      clearDraft(DRAFT_KEY);
      setForm(EMPTY);
      setOpen(false);
      load();
    } catch (err) {
      toast.error(apiError(err));
    } finally {
      setSubmitting(false);
    }
  };

  const act = async (fn, message) => {
    try {
      await fn();
      toast.success(message);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const review = async (id, decision) => {
    try {
      const body = decision === "REFUSE" ? { decision, comment: "Non retenue pour le moment" } : { decision };
      const { data } = await api.post(`/activities/${id}/review`, body);
      if (data.already_decided) {
        toast(data.message || "La décision a déjà été prise.");
      } else {
        toast.success(decision === "ACCEPT" ? "Activité acceptée" : "Activité refusée");
      }
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const canRevert = (a) => isAdmin && a.reviewer_role === "PRO_COORDINATEUR" && a.reviewed_at
    && (Date.now() - new Date(a.reviewed_at).getTime() < 48 * 3600 * 1000)
    && ["PLANNED", "REFUSED", "ACTIVE", "FULL"].includes(a.status);

  const shown = filters.type ? items.filter((a) => a.type === filters.type) : items;

  const steps = [
    {
      title: "L'essentiel",
      valid: !!form.title.trim(),
      hint: "Ajoutez un titre pour continuer.",
      content: (
        <>
          <div className="space-y-2">
            <Label>Titre *</Label>
            <Input value={form.title} data-testid="activity-title-input"
              onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea rows={3} value={form.description} data-testid="activity-description-input"
              onChange={(e) => set({ description: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Catégorie</Label>
              <Select value={form.category} onValueChange={(v) => set({ category: v })}>
                <SelectTrigger data-testid="activity-category-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(meta?.categories || []).map((c) => (
                    <SelectItem key={c} value={c} data-testid={`activity-category-${c}`}>
                      {label(ACTIVITY_CATEGORY_LABELS, c, meta?.custom_labels)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={form.type} onValueChange={(v) => set({ type: v })}>
                <SelectTrigger data-testid="activity-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(meta?.types || []).map((t) => (
                    <SelectItem key={t} value={t} data-testid={`activity-type-${t}`}>
                      {label(ACTIVITY_TYPE_LABELS, t, meta?.custom_labels)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      ),
    },
    {
      title: "Quand & où",
      content: (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={form.date} data-testid="activity-date-input"
              onChange={(e) => set({ date: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Lieu</Label>
            <Input value={form.location} data-testid="activity-location-input"
              onChange={(e) => set({ location: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Heure de début</Label>
            <Input type="time" value={form.start_time} data-testid="activity-start-input"
              onChange={(e) => set({ start_time: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Heure de fin</Label>
            <Input type="time" value={form.end_time} data-testid="activity-end-input"
              onChange={(e) => set({ end_time: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Places</Label>
            <Input type="number" min="1" value={form.capacity} data-testid="activity-capacity-input"
              onChange={(e) => set({ capacity: e.target.value })} />
          </div>
        </div>
      ),
    },
    {
      title: "Détails & options",
      content: (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tarif adhérent (€)</Label>
              <Input type="number" step="0.5" value={form.price_member} data-testid="activity-price-member-input"
                onChange={(e) => set({ price_member: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Tarif public (€)</Label>
              <Input type="number" step="0.5" value={form.price_public} data-testid="activity-price-public-input"
                onChange={(e) => set({ price_public: e.target.value })} />
            </div>
            {can("events.view") && (
              <div className="space-y-2">
                <Label>Rattacher à un événement</Label>
                <Select value={form.event_id || "NONE"}
                  onValueChange={(v) => set({ event_id: v === "NONE" ? "" : v })}>
                  <SelectTrigger data-testid="activity-event-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Aucun</SelectItem>
                    {events.map((ev) => (
                      <SelectItem key={ev.event_id} value={ev.event_id} data-testid={`activity-event-${ev.event_id}`}>
                        {ev.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          {can("loyalty.manage") && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={form.eligible_for_loyalty} data-testid="activity-loyalty-checkbox"
                onCheckedChange={(v) => set({ eligible_for_loyalty: !!v })} />
              Éligible à la carte d'engagement
            </label>
          )}
          <div className="space-y-2">
            <Label>Lien Google Maps</Label>
            <Input placeholder="https://maps.google.com/…" value={form.google_maps_url}
              data-testid="activity-maps-input" onChange={(e) => set({ google_maps_url: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Lien Google Forms</Label>
            <Input placeholder="https://forms.gle/…" value={form.google_forms_url}
              data-testid="activity-gforms-input" onChange={(e) => set({ google_forms_url: e.target.value })} />
          </div>
          <MentionPicker value={form.mentions} onChange={(m) => set({ mentions: m })} testId="activity-mentions" />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={form.is_remote} data-testid="activity-remote-checkbox"
              onCheckedChange={(v) => set({ is_remote: !!v })} />
            Activité à distance (visio)
          </label>
          {form.is_remote && (
            <div className="space-y-2">
              <Label>Lien de visioconférence</Label>
              <Input value={form.visio_url} data-testid="activity-visio-input"
                onChange={(e) => set({ visio_url: e.target.value })} />
            </div>
          )}
          {forms.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Formulaire associé</Label>
                <Select value={form.form_id || "NONE"}
                  onValueChange={(v) => set({ form_id: v === "NONE" ? "" : v })}>
                  <SelectTrigger data-testid="activity-form-select"><SelectValue /></SelectTrigger>
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
                <Input type="date" value={form.form_notify_date} data-testid="activity-form-notify-input"
                  onChange={(e) => set({ form_notify_date: e.target.value })} />
              </div>
            </div>
          )}
          {isAdmin && (
            <div className="space-y-2">
              <Label>Visibilité</Label>
              <Select value={form.visibility} onValueChange={(v) => set({ visibility: v })}>
                <SelectTrigger data-testid="activity-visibility-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(meta?.visibility_modes || []).map((v) => (
                    <SelectItem key={v} value={v} data-testid={`activity-visibility-${v}`}>
                      {label(VISIBILITY_LABELS, v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </>
      ),
    },
  ];

  return (
    <div data-testid="activities-page">
      <PageHeader breadcrumb="Vie associative" title="Activités"
        subtitle="Balades, ateliers, classes de lecture canine, sensibilisation — avec inscriptions."
        actions={can("activities.propose") && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" data-testid="activity-create-button">
                <Plus className="mr-2 h-4 w-4" /> {isAdmin ? "Nouvelle activité" : "Proposer une activité"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="activity-create-dialog">
              <DialogHeader><DialogTitle>{isAdmin ? "Nouvelle activité" : "Proposer une activité"}</DialogTitle></DialogHeader>
              {draftAvail && !form.title.trim() && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm"
                  data-testid="activity-draft-restore">
                  <span className="text-amber-800">Vous aviez commencé une activité — voulez-vous reprendre ?</span>
                  <span className="flex gap-3">
                    <button className="font-semibold text-[var(--marine)]" data-testid="activity-draft-resume"
                      onClick={() => { setForm(loadDraft(DRAFT_KEY) || EMPTY); setDraftAvail(false); }}>Reprendre</button>
                    <button className="text-muted-foreground" data-testid="activity-draft-dismiss"
                      onClick={() => { clearDraft(DRAFT_KEY); setDraftAvail(false); }}>Repartir de zéro</button>
                  </span>
                </div>
              )}
              <FormWizard steps={steps} onSubmit={create} submitting={submitting} testId="activity-wizard"
                submitLabel={isAdmin ? "Créer l'activité" : "Envoyer la proposition"} />
            </DialogContent>
          </Dialog>
        )} />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-64">
          <Label className="text-xs">Recherche</Label>
          <Input value={filters.q} data-testid="activities-search-input" placeholder="Titre"
            onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        </div>
        <div>
          <Label className="text-xs">Catégorie</Label>
          <Select value={filters.category || "ALL"}
            onValueChange={(v) => setFilters({ ...filters, category: v === "ALL" ? "" : v })}>
            <SelectTrigger className="w-52" data-testid="activities-category-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toutes</SelectItem>
              {(meta?.categories || []).map((c) => (
                <SelectItem key={c} value={c} data-testid={`activities-filter-${c}`}>
                  {label(ACTIVITY_CATEGORY_LABELS, c, meta?.custom_labels)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" variant={filters.upcoming ? "default" : "outline"} data-testid="activities-upcoming-filter"
          className={`rounded-full ${filters.upcoming ? "bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" : ""}`}
          onClick={() => setFilters({ ...filters, upcoming: !filters.upcoming })}>À venir</Button>
        {filters.type && (
          <button onClick={() => setFilters({ ...filters, type: "" })} data-testid="activities-type-clear"
            className="inline-flex items-center gap-1 rounded-full bg-[var(--marine-a8)] px-3 py-1.5 text-sm font-semibold text-[var(--marine)]">
            {label(ACTIVITY_TYPE_LABELS, filters.type)} <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {shown.length === 0 ? (
        <EmptyState testId="activities-empty" module="activities" title="Aucune activité"
          description="Les activités visibles pour votre profil apparaîtront ici." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="activities-list">
          {shown.map((a) => (
            <div key={a.activity_id} className="flex flex-col rounded-xl border bg-card p-5"
              data-testid={`activity-card-${a.activity_id}`}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-display font-bold text-[var(--marine)]">{a.title}</p>
                <StatusBadge status={a.status} testId={`activity-status-${a.activity_id}`} />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {label(ACTIVITY_CATEGORY_LABELS, a.category, meta?.custom_labels)} · {a.date ? new Date(a.date).toLocaleDateString("fr-FR") : "date à définir"}
                {a.start_time ? ` · ${a.start_time}` : ""}
              </p>
              {a.description && <p className="mt-3 line-clamp-3 text-sm text-muted-foreground">{a.description}</p>}
              <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                {a.location && <p className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {a.location}</p>}
                <p className="flex items-center gap-1">
                  <Users className="h-3 w-3" /> {a.registered_count} inscrit(s)
                  {a.capacity ? ` / ${a.capacity} places` : ""}
                </p>
                {(a.price_member != null || a.price_public != null) && (
                  <p>Adhérent : {a.price_member ?? 0} € · Public : {a.price_public ?? 0} €</p>
                )}
                {a.eligible_for_loyalty && (
                  <p className="inline-flex items-center gap-1 font-semibold text-[var(--bordeaux)]">
                    <Star className="h-3 w-3" /> +{a.loyalty_points || 1} tampon d'engagement
                  </p>
                )}
                {a.google_maps_url && (
                  <a href={a.google_maps_url} target="_blank" rel="noreferrer"
                    data-testid={`activity-maps-link-${a.activity_id}`}
                    className="inline-flex items-center gap-1 font-semibold text-[var(--marine)] hover:underline">
                    <MapPin className="h-3 w-3" /> Itinéraire Google Maps
                  </a>
                )}
                {a.is_remote && a.visio_url && (
                  <a href={a.visio_url} target="_blank" rel="noreferrer"
                    data-testid={`activity-visio-link-${a.activity_id}`}
                    className="block font-semibold text-[var(--marine)] hover:underline">
                    Rejoindre en visioconférence
                  </a>
                )}
                {a.google_forms_url && (
                  <a href={a.google_forms_url} target="_blank" rel="noreferrer"
                    data-testid={`activity-gforms-link-${a.activity_id}`}
                    className="inline-flex items-center gap-1 font-semibold text-[var(--bordeaux)] hover:underline">
                    <FileText className="h-3 w-3" /> Ouvrir le formulaire Google
                  </a>
                )}
              </div>
              {a.location && (
                <div className="mt-3 space-y-2" data-testid={`activity-logistics-${a.activity_id}`}>
                  <MapEmbed address={a.location} testId={`activity-map-${a.activity_id}`} />
                  <WeatherWidget location={a.location} testId={`activity-weather-${a.activity_id}`} />
                </div>
              )}
              <div className="mt-4"><ParticipationControl elementType="activity" elementId={a.activity_id} testId={`activity-rsvp-${a.activity_id}`} /></div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="ghost" className="rounded-full" data-testid={`activity-comments-${a.activity_id}`}
                  onClick={() => setCommentFor(a)}>
                  <MessageSquare className="mr-1 h-3.5 w-3.5" /> Discussion
                </Button>
                {a.is_registered ? (
                  <Button size="sm" variant="outline" className="rounded-full" data-testid={`activity-unregister-${a.activity_id}`}
                    onClick={() => act(() => api.delete(`/activities/${a.activity_id}/register`), "Inscription annulée")}>
                    <X className="mr-1 h-3.5 w-3.5" /> Me désinscrire
                  </Button>
                ) : (
                  <Button size="sm" className="rounded-full bg-[var(--marine)] hover:bg-[#001740]"
                    data-testid={`activity-register-${a.activity_id}`}
                    onClick={() => act(() => api.post(`/activities/${a.activity_id}/register`, { role: "PARTICIPANT" }),
                      "Inscription confirmée")}>
                    <Check className="mr-1 h-3.5 w-3.5" /> M'inscrire
                  </Button>
                )}
                {can("activities.validate") && a.status === "PROPOSED" && (
                  <>
                    <Button size="sm" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                      data-testid={`activity-accept-${a.activity_id}`}
                      onClick={() => review(a.activity_id, "ACCEPT")}>Accepter</Button>
                    <Button size="sm" variant="outline" className="rounded-full"
                      data-testid={`activity-refuse-${a.activity_id}`}
                      onClick={() => review(a.activity_id, "REFUSE")}>Refuser</Button>
                  </>
                )}
                {canRevert(a) && (
                  revertOpen === a.activity_id ? (
                    <>
                      <span className="self-center text-xs text-muted-foreground">Nouvelle décision :</span>
                      <Button size="sm" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                        data-testid={`activity-revert-accept-${a.activity_id}`}
                        onClick={() => { review(a.activity_id, "ACCEPT"); setRevertOpen(null); }}>Accepter</Button>
                      <Button size="sm" variant="outline" className="rounded-full"
                        data-testid={`activity-revert-refuse-${a.activity_id}`}
                        onClick={() => { review(a.activity_id, "REFUSE"); setRevertOpen(null); }}>Refuser</Button>
                      <Button size="sm" variant="ghost" className="rounded-full"
                        data-testid={`activity-revert-cancel-${a.activity_id}`}
                        onClick={() => setRevertOpen(null)}>Annuler</Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" className="rounded-full"
                      data-testid={`activity-revert-${a.activity_id}`} onClick={() => setRevertOpen(a.activity_id)}
                      title="Le Bureau peut revenir sur la décision d'un coordinateur sous 48 h">
                      <RotateCcw className="mr-1 h-3.5 w-3.5" /> Revenir sur la décision
                    </Button>
                  )
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!commentFor} onOpenChange={(o) => !o && setCommentFor(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="activity-comments-dialog">
          <DialogHeader><DialogTitle>Discussion — {commentFor?.title}</DialogTitle></DialogHeader>
          {commentFor && <CommentSection elementType="activity" elementId={commentFor.activity_id} testId="activity-comment" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
