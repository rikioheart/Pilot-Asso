import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { GraduationCap, Plus, Radio, Video, Users, Link2 } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState, Chip, SectionCard } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";

const FORMATS = { FORMATION: "Formation", LIVE: "Live", INTERVIEW: "Interview",
  WEBINAIRE: "Webinaire", ATELIER_EN_LIGNE: "Atelier en ligne" };
const STATUS = { DRAFT: ["Brouillon", "muted"], PLANNED: ["Programmée", "marine"], LIVE: ["En direct", "red"],
  DONE: ["Terminée", "green"], CANCELLED: ["Annulée", "muted"], ARCHIVED: ["Archivée", "muted"] };
const EMPTY = { title: "", description: "", format: "FORMATION", speaker_name: "", date: "",
  start_time: "18:30", duration_minutes: 60, location: "Visioconférence", live_link: "", capacity: 30 };

export default function Formations() {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [registrations, setRegistrations] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/formations");
    setData(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post("/formations", { ...form, capacity: Number(form.capacity) || null,
        duration_minutes: Number(form.duration_minutes) || null });
      toast.success("Session créée");
      setOpen(false); setForm(EMPTY); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const toggle = async (formation) => {
    try {
      if (formation.is_registered) {
        await api.delete(`/formations/${formation.formation_id}/register`);
        toast.success("Inscription annulée");
      } else {
        await api.post(`/formations/${formation.formation_id}/register`);
        toast.success("Inscription confirmée");
      }
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const publish = async (formation, status) => {
    try {
      await api.put(`/formations/${formation.formation_id}`, { status });
      toast.success("Statut mis à jour");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const addReplay = async (formation) => {
    const url = window.prompt("Lien du replay (YouTube privé, Vimeo, Drive…)");
    if (!url) return;
    try {
      await api.put(`/formations/${formation.formation_id}`, { replay_url: url, status: "DONE" });
      toast.success("Replay ajouté, les inscrits sont prévenus");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const showRegistrations = async (formation) => {
    const { data } = await api.get(`/formations/${formation.formation_id}/registrations`);
    setRegistrations({ formation, items: data.items });
  };

  if (!data) return <p className="text-muted-foreground" data-testid="formations-loading">Chargement…</p>;

  return (
    <div data-testid="formations-page">
      <PageHeader breadcrumb="Communication" title="Formations & lives"
        subtitle="Sessions en ligne, interviews et replays accessibles aux adhérents."
        actions={can("formations.create") && (
          <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="formation-create-button"
            onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nouvelle session
          </Button>
        )} />

      {data.items.length === 0 ? (
        <EmptyState testId="formations-empty" icon={GraduationCap} title="Aucune session pour le moment"
          description="Les formations, lives et interviews programmés par le Bureau s'afficheront ici." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {data.items.map((formation) => {
            const [label, tone] = STATUS[formation.status] || ["—", "muted"];
            return (
              <div key={formation.formation_id} data-testid={`formation-card-${formation.formation_id}`}
                className="rounded-xl border bg-card p-5 transition-shadow hover:shadow-md">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone="bordeaux">
                    {formation.format === "LIVE" ? <Radio className="h-3 w-3" /> : <Video className="h-3 w-3" />}
                    {FORMATS[formation.format]}
                  </Chip>
                  <Chip tone={tone}>{label}</Chip>
                  {formation.replay_url && <Chip tone="green">Replay disponible</Chip>}
                </div>
                <h3 className="mt-3 font-display text-base md:text-lg font-bold text-[#002060]">{formation.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{formation.description}</p>
                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div><dt className="text-xs text-muted-foreground">Date</dt>
                    <dd className="font-semibold text-[#002060]">
                      {formation.date ? new Date(formation.date).toLocaleDateString("fr-FR") : "À définir"}
                      {formation.start_time ? ` · ${formation.start_time}` : ""}
                    </dd></div>
                  <div><dt className="text-xs text-muted-foreground">Intervenant</dt>
                    <dd className="font-semibold text-[#002060]">{formation.speaker_name || "À confirmer"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Durée</dt>
                    <dd className="font-semibold text-[#002060]">{formation.duration_minutes || "—"} min</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Inscrits</dt>
                    <dd className="font-semibold text-[#002060]">
                      {formation.registered_count}{formation.capacity ? ` / ${formation.capacity}` : ""}
                    </dd></div>
                </dl>
                <div className="mt-4 flex flex-wrap gap-2">
                  {["PLANNED", "LIVE"].includes(formation.status) && (
                    <Button size="sm" onClick={() => toggle(formation)}
                      data-testid={`formation-register-${formation.formation_id}`}
                      className={`rounded-full ${formation.is_registered
                        ? "bg-muted text-[#002060] hover:bg-muted/70" : "bg-[#800020] hover:bg-[#63001a]"}`}>
                      {formation.is_registered ? "Annuler mon inscription" : "Je m'inscris"}
                    </Button>
                  )}
                  {formation.is_registered && formation.live_link && formation.status !== "DONE" && (
                    <a href={formation.live_link} target="_blank" rel="noreferrer"
                      data-testid={`formation-live-link-${formation.formation_id}`}
                      className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold text-[#002060] hover:bg-muted">
                      <Link2 className="h-3.5 w-3.5" /> Rejoindre
                    </a>
                  )}
                  {formation.replay_url && (
                    <a href={formation.replay_url} target="_blank" rel="noreferrer"
                      data-testid={`formation-replay-${formation.formation_id}`}
                      className="inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold text-[#002060] hover:bg-muted">
                      <Video className="h-3.5 w-3.5" /> Voir le replay
                    </a>
                  )}
                  {data.is_manager && (
                    <>
                      <Button size="sm" variant="outline" className="rounded-full"
                        data-testid={`formation-registrations-${formation.formation_id}`}
                        onClick={() => showRegistrations(formation)}>
                        <Users className="mr-1.5 h-3.5 w-3.5" /> Inscrits
                      </Button>
                      {formation.status === "DRAFT" && (
                        <Button size="sm" variant="outline" className="rounded-full"
                          data-testid={`formation-publish-${formation.formation_id}`}
                          onClick={() => publish(formation, "PLANNED")}>Programmer</Button>
                      )}
                      {formation.status !== "DONE" && (
                        <Button size="sm" variant="outline" className="rounded-full"
                          data-testid={`formation-add-replay-${formation.formation_id}`}
                          onClick={() => addReplay(formation)}>Ajouter le replay</Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto" data-testid="formation-dialog">
          <DialogHeader><DialogTitle>Nouvelle session</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Titre</Label>
              <Input value={form.title} required data-testid="formation-title-input"
                onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Description</Label>
              <Textarea rows={3} value={form.description} data-testid="formation-description-input"
                onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Format</Label>
                <Select value={form.format} onValueChange={(v) => setForm({ ...form, format: v })}>
                  <SelectTrigger data-testid="formation-format-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FORMATS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div><Label>Intervenant</Label>
                <Input value={form.speaker_name} data-testid="formation-speaker-input"
                  onChange={(e) => setForm({ ...form, speaker_name: e.target.value })} /></div>
              <div><Label>Date</Label>
                <Input type="date" value={form.date} required data-testid="formation-date-input"
                  onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div><Label>Heure</Label>
                <Input type="time" value={form.start_time} data-testid="formation-time-input"
                  onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
              <div><Label>Durée (minutes)</Label>
                <Input type="number" value={form.duration_minutes} data-testid="formation-duration-input"
                  onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} /></div>
              <div><Label>Places</Label>
                <Input type="number" value={form.capacity} data-testid="formation-capacity-input"
                  onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></div>
            </div>
            <div><Label>Lien de connexion (Zoom, Meet, YouTube privé…)</Label>
              <Input value={form.live_link} placeholder="https://" data-testid="formation-link-input"
                onChange={(e) => setForm({ ...form, live_link: e.target.value })} /></div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid="formation-save-button">Créer la session</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!registrations} onOpenChange={() => setRegistrations(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto" data-testid="formation-registrations-dialog">
          <DialogHeader><DialogTitle>Inscrits — {registrations?.formation.title}</DialogTitle></DialogHeader>
          {registrations?.items.length === 0
            ? <p className="text-sm text-muted-foreground">Aucun inscrit pour le moment.</p>
            : (
              <SectionCard title="Liste" testId="formation-registrations-list">
                <ul className="space-y-2">
                  {registrations?.items.map((r) => (
                    <li key={r.registration_id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                      <span className="font-semibold text-[#002060]">{r.user_name}</span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.registered_at).toLocaleDateString("fr-FR")}
                      </span>
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
