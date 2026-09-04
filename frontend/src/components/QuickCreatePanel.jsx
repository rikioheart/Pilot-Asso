import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { confirmDialog, RowMenu } from "@/components/ConfirmDialog";
import { Zap, Trash2, ArchiveRestore, Archive } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/Ui";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ACTIVITY_CATEGORIES = { BALADE: "Balade", ATELIER: "Atelier", CLASSE_LECTURE: "Classe de lecture",
  JOURNEE_THEME: "Journée à thème", SENSIBILISATION: "Sensibilisation", FORMATION: "Formation",
  RENCONTRE_PRO: "Rencontre professionnelle", PREVENTION: "Prévention", AUTRE: "Autre" };
const EVENT_TYPES = { ONE_OFF: "Ponctuel", RECURRING: "Récurrent", THEMED_DAY: "Journée à thème",
  TRAINING: "Formation", PRO_MEETING: "Réunion pro", VISIO: "Visioconférence", INTERVIEW: "Interview",
  LIVE: "Live", PARTNERSHIP_EVENT: "Événement partenaire", OTHER: "Autre" };
const VISIBILITIES = { MEMBERS: "Tous les membres", PROFESSIONALS: "Professionnels + Bureau",
  BUREAU: "Bureau seul", PUBLIC: "Public" };
const PARTNER_CATEGORIES = { MAIRIE: "Mairie", ASSOCIATION: "Association / refuge",
  COMMERCIAL: "Partenaire commercial" };
const ADVANTAGE_KINDS = { CODE_PROMO: "Code promo", ACTIVITE_OFFERTE: "Activité offerte",
  GOODIE: "Goodie", SEANCE_PRO: "Séance professionnelle", TARIF_REDUIT: "Tarif réduit" };
const RECORD_TYPES = { activities: "Activités", events: "Événements", partners: "Partenaires",
  advantages: "Avantages", terrains: "Terrains" };

const Field = ({ label, children }) => (
  <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>
);

export const QuickCreatePanel = ({ open, onOpenChange }) => {
  const [tab, setTab] = useState("activity");
  const [members, setMembers] = useState([]);
  const [activity, setActivity] = useState({ title: "", category: "BALADE", date: "", start_time: "10:00",
    location: "", google_maps_url: "", visibility: "MEMBERS", eligible_for_loyalty: false, description: "" });
  const [event, setEvent] = useState({ title: "", event_type: "ONE_OFF", start_date: "", location: "",
    google_maps_url: "", visio_url: "", visibility: "MEMBERS", description: "" });
  const [partner, setPartner] = useState({ name: "", category: "MAIRIE", contact_name: "",
    contact_email: "", website: "", social_links: "", partnership_nature: "" });
  const [advantage, setAdvantage] = useState({ title: "", kind: "CODE_PROMO", promo_code: "",
    partner_name: "", description: "", valid_until: "" });
  const [pro, setPro] = useState({ user_id: "", company_name: "", professional_category: "",
    description: "", website: "", social_links: "" });
  const [recordType, setRecordType] = useState("activities");
  const [records, setRecords] = useState({ items: [] });
  const [showArchived, setShowArchived] = useState(false);

  const loadMembers = useCallback(async () => {
    try {
      const { data } = await api.get("/members", { params: { status: "ACTIVE", limit: 100 } });
      setMembers(data.items || []);
    } catch (e) { /* silencieux */ }
  }, []);

  const loadRecords = useCallback(async () => {
    try {
      const { data } = await api.get(`/records/${recordType}`, { params: { archived: showArchived } });
      setRecords(data);
    } catch (e) { toast.error(apiError(e)); }
  }, [recordType, showArchived]);

  useEffect(() => { if (open) { loadMembers(); loadRecords(); } }, [open, loadMembers, loadRecords]);

  const socialObject = (value) => {
    const links = {};
    (value || "").split(",").map((s) => s.trim()).filter(Boolean).forEach((url, index) => {
      const key = /facebook/i.test(url) ? "facebook" : /instagram/i.test(url) ? "instagram"
        : /linkedin/i.test(url) ? "linkedin" : /youtube/i.test(url) ? "youtube" : `lien_${index + 1}`;
      links[key] = url;
    });
    return links;
  };

  const submit = async (kind, event_) => {
    event_.preventDefault();
    try {
      if (kind === "activity") {
        await api.post("/activities", { ...activity });
        toast.success("Activité créée");
        setActivity({ ...activity, title: "", description: "" });
      } else if (kind === "event") {
        await api.post("/events", { ...event });
        toast.success("Événement créé");
        setEvent({ ...event, title: "", description: "" });
      } else if (kind === "partner") {
        await api.post("/partners", { ...partner, social_links: socialObject(partner.social_links) });
        toast.success("Partenaire créé");
        setPartner({ ...partner, name: "", contact_name: "", contact_email: "" });
      } else if (kind === "advantage") {
        await api.post("/advantages", { ...advantage });
        toast.success("Avantage créé");
        setAdvantage({ ...advantage, title: "", promo_code: "", description: "" });
      } else if (kind === "pro") {
        if (!pro.user_id) return toast.error("Sélectionnez un membre à qualifier");
        await api.put(`/members/${pro.user_id}`, { role: "PROFESSIONNEL" });
        await api.put(`/professionals/${pro.user_id}`, {
          company_name: pro.company_name || null,
          professional_category: pro.professional_category || null,
          description: pro.description || null, website: pro.website || null,
          social_links: socialObject(pro.social_links) });
        toast.success("Professionnel qualifié et publié dans l'annuaire");
        setPro({ user_id: "", company_name: "", professional_category: "", description: "",
          website: "", social_links: "" });
      }
      loadRecords();
    } catch (e) { toast.error(apiError(e)); }
  };

  const archive = async (item) => {
    const reason = window.prompt("Motif de l'archivage (tracé dans l'historique)");
    if (!reason || reason.trim().length < 3) return;
    try {
      const { data } = await api.post(`/records/${recordType}/${item.id}/archive`, { reason });
      toast.success(data.message); loadRecords();
    } catch (e) { toast.error(apiError(e)); }
  };

  const restore = async (item) => {
    try {
      const { data } = await api.post(`/records/${recordType}/${item.id}/restore`);
      toast.success(data.message); loadRecords();
    } catch (e) { toast.error(apiError(e)); }
  };

  const destroy = async (item) => {
    const reason = window.prompt(
      `Suppression DÉFINITIVE de « ${item.title} ». Motif obligatoire (tracé) :`);
    if (!reason || reason.trim().length < 3) return;
    if (!await confirmDialog("Confirmez-vous la suppression définitive ? Cette action est irréversible.")) return;
    try {
      const { data } = await api.delete(`/records/${recordType}/${item.id}`, { params: { reason } });
      toast.success(data.message); loadRecords();
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" data-testid="quick-create-panel"
        className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle className="font-display text-[var(--marine)]">Création rapide</SheetTitle>
          <SheetDescription>
            Créez une activité, un événement, un partenaire, un avantage ou qualifiez un professionnel
            sans quitter votre page.
          </SheetDescription>
        </SheetHeader>

        <Tabs value={tab} onValueChange={setTab} className="mt-5 space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-3 gap-1 sm:grid-cols-6">
            <TabsTrigger value="activity" data-testid="quick-tab-activity">Activité</TabsTrigger>
            <TabsTrigger value="event" data-testid="quick-tab-event">Événement</TabsTrigger>
            <TabsTrigger value="partner" data-testid="quick-tab-partner">Partenaire</TabsTrigger>
            <TabsTrigger value="advantage" data-testid="quick-tab-advantage">Avantage</TabsTrigger>
            <TabsTrigger value="pro" data-testid="quick-tab-pro">Professionnel</TabsTrigger>
            <TabsTrigger value="manage" data-testid="quick-tab-manage">Archiver</TabsTrigger>
          </TabsList>

          <TabsContent value="activity">
            <form onSubmit={(e) => submit("activity", e)} className="space-y-3" data-testid="quick-activity-form">
              <Field label="Titre">
                <Input required value={activity.title} data-testid="quick-activity-title"
                  onChange={(e) => setActivity({ ...activity, title: e.target.value })} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Catégorie">
                  <Select value={activity.category}
                    onValueChange={(v) => setActivity({ ...activity, category: v })}>
                    <SelectTrigger data-testid="quick-activity-category"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(ACTIVITY_CATEGORIES).map(([k, v]) =>
                      <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select></Field>
                <Field label="Visibilité">
                  <Select value={activity.visibility}
                    onValueChange={(v) => setActivity({ ...activity, visibility: v })}>
                    <SelectTrigger data-testid="quick-activity-visibility"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(VISIBILITIES).map(([k, v]) =>
                      <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select></Field>
                <Field label="Date">
                  <Input type="date" value={activity.date} data-testid="quick-activity-date"
                    onChange={(e) => setActivity({ ...activity, date: e.target.value })} /></Field>
                <Field label="Heure">
                  <Input type="time" value={activity.start_time} data-testid="quick-activity-time"
                    onChange={(e) => setActivity({ ...activity, start_time: e.target.value })} /></Field>
              </div>
              <Field label="Lieu">
                <Input value={activity.location} data-testid="quick-activity-location"
                  onChange={(e) => setActivity({ ...activity, location: e.target.value })} /></Field>
              <Field label="Lien Google Maps">
                <Input placeholder="https://maps.google.com/…" value={activity.google_maps_url}
                  data-testid="quick-activity-maps"
                  onChange={(e) => setActivity({ ...activity, google_maps_url: e.target.value })} /></Field>
              <Field label="Description">
                <Textarea rows={3} value={activity.description} data-testid="quick-activity-description"
                  onChange={(e) => setActivity({ ...activity, description: e.target.value })} /></Field>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={activity.eligible_for_loyalty} data-testid="quick-activity-loyalty"
                  onCheckedChange={(v) => setActivity({ ...activity, eligible_for_loyalty: !!v })} />
                Éligible à la carte d'engagement
              </label>
              <Button type="submit" className="w-full rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                data-testid="quick-activity-submit">Créer l'activité</Button>
            </form>
          </TabsContent>

          <TabsContent value="event">
            <form onSubmit={(e) => submit("event", e)} className="space-y-3" data-testid="quick-event-form">
              <Field label="Titre">
                <Input required value={event.title} data-testid="quick-event-title"
                  onChange={(e) => setEvent({ ...event, title: e.target.value })} /></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Type">
                  <Select value={event.event_type} onValueChange={(v) => setEvent({ ...event, event_type: v })}>
                    <SelectTrigger data-testid="quick-event-type"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(EVENT_TYPES).map(([k, v]) =>
                      <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select></Field>
                <Field label="Visibilité">
                  <Select value={event.visibility} onValueChange={(v) => setEvent({ ...event, visibility: v })}>
                    <SelectTrigger data-testid="quick-event-visibility"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(VISIBILITIES).map(([k, v]) =>
                      <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select></Field>
              </div>
              <Field label="Date de début">
                <Input type="date" required value={event.start_date} data-testid="quick-event-date"
                  onChange={(e) => setEvent({ ...event, start_date: e.target.value })} /></Field>
              <Field label="Lieu">
                <Input value={event.location} data-testid="quick-event-location"
                  onChange={(e) => setEvent({ ...event, location: e.target.value })} /></Field>
              <Field label="Lien Google Maps">
                <Input value={event.google_maps_url} data-testid="quick-event-maps"
                  onChange={(e) => setEvent({ ...event, google_maps_url: e.target.value })} /></Field>
              <Field label="Lien visio (si distanciel)">
                <Input value={event.visio_url} data-testid="quick-event-visio"
                  onChange={(e) => setEvent({ ...event, visio_url: e.target.value })} /></Field>
              <Field label="Description">
                <Textarea rows={3} value={event.description} data-testid="quick-event-description"
                  onChange={(e) => setEvent({ ...event, description: e.target.value })} /></Field>
              <Button type="submit" className="w-full rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                data-testid="quick-event-submit">Créer l'événement</Button>
            </form>
          </TabsContent>

          <TabsContent value="partner">
            <form onSubmit={(e) => submit("partner", e)} className="space-y-3" data-testid="quick-partner-form">
              <Field label="Nom">
                <Input required value={partner.name} data-testid="quick-partner-name"
                  onChange={(e) => setPartner({ ...partner, name: e.target.value })} /></Field>
              <Field label="Catégorie">
                <Select value={partner.category} onValueChange={(v) => setPartner({ ...partner, category: v })}>
                  <SelectTrigger data-testid="quick-partner-category"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(PARTNER_CATEGORIES).map(([k, v]) =>
                    <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Contact">
                  <Input value={partner.contact_name} data-testid="quick-partner-contact"
                    onChange={(e) => setPartner({ ...partner, contact_name: e.target.value })} /></Field>
                <Field label="E-mail du contact">
                  <Input type="email" value={partner.contact_email} data-testid="quick-partner-email"
                    onChange={(e) => setPartner({ ...partner, contact_email: e.target.value })} /></Field>
              </div>
              <Field label="Site internet">
                <Input value={partner.website} data-testid="quick-partner-website"
                  onChange={(e) => setPartner({ ...partner, website: e.target.value })} /></Field>
              <Field label="Réseaux sociaux (liens séparés par une virgule)">
                <Input value={partner.social_links} data-testid="quick-partner-social"
                  onChange={(e) => setPartner({ ...partner, social_links: e.target.value })} /></Field>
              <Field label="Nature du partenariat (courte description)">
                <Textarea rows={2} value={partner.partnership_nature} data-testid="quick-partner-nature"
                  onChange={(e) => setPartner({ ...partner, partnership_nature: e.target.value })} /></Field>
              <Button type="submit" className="w-full rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                data-testid="quick-partner-submit">Créer le partenaire</Button>
            </form>
          </TabsContent>

          <TabsContent value="advantage">
            <form onSubmit={(e) => submit("advantage", e)} className="space-y-3" data-testid="quick-advantage-form">
              <Field label="Titre">
                <Input required value={advantage.title} data-testid="quick-advantage-title"
                  onChange={(e) => setAdvantage({ ...advantage, title: e.target.value })} /></Field>
              <Field label="Type">
                <Select value={advantage.kind} onValueChange={(v) => setAdvantage({ ...advantage, kind: v })}>
                  <SelectTrigger data-testid="quick-advantage-kind"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(ADVANTAGE_KINDS).map(([k, v]) =>
                    <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Code promo">
                  <Input value={advantage.promo_code} data-testid="quick-advantage-code"
                    onChange={(e) => setAdvantage({ ...advantage, promo_code: e.target.value })} /></Field>
                <Field label="Valable jusqu'au">
                  <Input type="date" value={advantage.valid_until} data-testid="quick-advantage-until"
                    onChange={(e) => setAdvantage({ ...advantage, valid_until: e.target.value })} /></Field>
              </div>
              <Field label="Partenaire ou professionnel">
                <Input value={advantage.partner_name} data-testid="quick-advantage-partner"
                  onChange={(e) => setAdvantage({ ...advantage, partner_name: e.target.value })} /></Field>
              <Field label="Description">
                <Textarea rows={3} value={advantage.description} data-testid="quick-advantage-description"
                  onChange={(e) => setAdvantage({ ...advantage, description: e.target.value })} /></Field>
              <Button type="submit" className="w-full rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                data-testid="quick-advantage-submit">Créer l'avantage</Button>
            </form>
          </TabsContent>

          <TabsContent value="pro">
            <form onSubmit={(e) => submit("pro", e)} className="space-y-3" data-testid="quick-pro-form">
              <Field label="Membre à qualifier professionnel">
                <Select value={pro.user_id} onValueChange={(v) => setPro({ ...pro, user_id: v })}>
                  <SelectTrigger data-testid="quick-pro-member"><SelectValue placeholder="Choisir un membre" /></SelectTrigger>
                  <SelectContent>
                    {members.map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id}>
                        {m.profile?.display_name || m.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select></Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nom d'entreprise">
                  <Input value={pro.company_name} data-testid="quick-pro-company"
                    onChange={(e) => setPro({ ...pro, company_name: e.target.value })} /></Field>
                <Field label="Métier / catégorie">
                  <Input value={pro.professional_category} data-testid="quick-pro-category"
                    onChange={(e) => setPro({ ...pro, professional_category: e.target.value })} /></Field>
              </div>
              <Field label="Courte description">
                <Textarea rows={3} value={pro.description} data-testid="quick-pro-description"
                  onChange={(e) => setPro({ ...pro, description: e.target.value })} /></Field>
              <Field label="Site internet">
                <Input value={pro.website} data-testid="quick-pro-website"
                  onChange={(e) => setPro({ ...pro, website: e.target.value })} /></Field>
              <Field label="Réseaux sociaux (liens séparés par une virgule)">
                <Input value={pro.social_links} data-testid="quick-pro-social"
                  onChange={(e) => setPro({ ...pro, social_links: e.target.value })} /></Field>
              <Button type="submit" className="w-full rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                data-testid="quick-pro-submit">Qualifier le professionnel</Button>
            </form>
          </TabsContent>

          <TabsContent value="manage">
            <div className="space-y-3" data-testid="quick-manage-panel">
              <div className="flex flex-wrap items-end gap-3">
                <div className="flex-1">
                  <Label className="text-xs">Type d'élément</Label>
                  <Select value={recordType} onValueChange={setRecordType}>
                    <SelectTrigger data-testid="quick-record-type"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(RECORD_TYPES).map(([k, v]) =>
                      <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <Button variant="outline" className="rounded-full" data-testid="quick-toggle-archived"
                  onClick={() => setShowArchived(!showArchived)}>
                  {showArchived ? "Voir les actifs" : "Voir les archivés"}
                </Button>
              </div>
              {records.items.length === 0 ? (
                <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                  Aucun élément {showArchived ? "archivé" : "actif"}.
                </p>
              ) : (
                <ul className="space-y-2">
                  {records.items.map((item) => (
                    <li key={item.id} data-testid={`quick-record-${item.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-[var(--marine)]">{item.title}</span>
                        {item.archive_reason && (
                          <span className="text-xs text-muted-foreground">Motif : {item.archive_reason}</span>
                        )}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Chip tone="muted">{item.status}</Chip>
                        {showArchived ? (
                          <Button size="sm" variant="outline" className="rounded-full"
                            data-testid={`quick-restore-${item.id}`} onClick={() => restore(item)}>
                            <ArchiveRestore className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="rounded-full"
                            data-testid={`quick-archive-${item.id}`} onClick={() => archive(item)}>
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <RowMenu testId={`quick-menu-${item.id}`} items={[
                          { label: "Supprimer définitivement", icon: Trash2, danger: true,
                            testId: `quick-delete-${item.id}`, onSelect: () => destroy(item) }]} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
};

export const QuickCreateButton = () => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" data-testid="quick-create-button"
        onClick={() => setOpen(true)}>
        <Zap className="mr-2 h-4 w-4" /> <span className="hidden sm:inline">Création rapide</span>
      </Button>
      <QuickCreatePanel open={open} onOpenChange={setOpen} />
    </>
  );
};
