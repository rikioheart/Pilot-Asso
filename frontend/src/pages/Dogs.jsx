import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Dog as DogIcon, Plus, Eye, EyeOff, MessageSquare, Target, NotebookPen, UserCheck } from "lucide-react";
import { api, apiError, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, EmptyState, Chip, SectionCard, ProgressBar } from "@/components/Ui";
import { FileUpload } from "@/components/FileUpload";
import { DogJournal } from "@/components/DogJournal";
import { DogStatusBadge } from "@/components/DogStatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TYPES = { EDUCATION: "Éducation", COMPORTEMENT: "Comportement", VETERINAIRE: "Vétérinaire",
  OSTEOPATHIE: "Ostéopathie", TOILETTAGE: "Toilettage", SPORT: "Sport canin",
  BALADE: "Balade", ATELIER: "Atelier", AUTRE: "Autre" };
const CATEGORIES = { SOCIABILISATION: "Sociabilisation", REACTIVITE: "Réactivité", PEUR: "Peur",
  MARCHE_EN_LAISSE: "Marche en laisse", RAPPEL: "Rappel", PROPRETE: "Propreté",
  SEPARATION: "Séparation", AUTRE: "Autre" };
const NEW_DOG = { name: "", breed: "", age: "", sex: "MALE", behavior_context: "",
  behavior_category: "AUTRE", history: "", photo_file_id: null, owner_id: "" };

const InfoBlock = ({ label, value }) => (
  <div className="rounded-xl border bg-muted/30 p-3" data-testid={`dog-info-${label.toLowerCase()}`}>
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-1 font-semibold text-[var(--marine)]">{value}</p>
  </div>
);

export default function Dogs() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const [members, setMembers] = useState([]);
  const [pros, setPros] = useState([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(NEW_DOG);
  const [note, setNote] = useState("");
  const [report, setReport] = useState({ intervention_type: "EDUCATION", observations: "",
    progress_step: "", progress: "", visible_to_owner: false });
  const [comment, setComment] = useState({ message: "", visible_to_owner: false, reportId: null });

  const load = useCallback(async () => {
    const { data } = await api.get("/dogs");
    setData(data);
  }, []);

  useEffect(() => {
    load();
    api.get("/members").then((r) => {
      setMembers(r.data.items || []);
      setPros((r.data.items || []).filter((m) => m.role === "PROFESSIONNEL"));
    }).catch(() => {});
  }, [load]);

  const openDetail = async (dogId) => {
    const { data } = await api.get(`/dogs/${dogId}`);
    setDetail(data);
  };

  const openEdit = (dog) => {
    setForm({ name: dog.name || "", breed: dog.breed || "", age: dog.age || "",
      sex: dog.sex || "MALE", behavior_context: dog.behavior_context || "",
      behavior_category: dog.behavior_category || "AUTRE", history: dog.history || "",
      photo_file_id: dog.photo_file_id || null, owner_id: dog.owner_id || "" });
    setEditId(dog.dog_id);
    setDetail(null);
    setOpen(true);
  };

  const submit = async (event) => {
    event.preventDefault();
    try {
      if (editId) {
        await api.put(`/dogs/${editId}`, { ...form });
        toast.success("Fiche mise à jour");
      } else {
        await api.post("/dogs", { ...form, owner_id: form.owner_id || null });
        toast.success("Fiche chien créée");
      }
      setOpen(false); setForm(NEW_DOG); setEditId(null); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const setReferent = async (proId) => {
    try {
      await api.put(`/dogs/${detail.dog.dog_id}`, { referent_pro_id: proId });
      toast.success("Professionnel référent enregistré");
      openDetail(detail.dog.dog_id); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const addNote = async () => {
    try {
      await api.post(`/dogs/${detail.dog.dog_id}/owner-notes`, { message: note });
      toast.success("Observation enregistrée");
      setNote(""); openDetail(detail.dog.dog_id);
    } catch (e) { toast.error(apiError(e)); }
  };

  const addReport = async () => {
    try {
      await api.post(`/dogs/${detail.dog.dog_id}/reports`, { ...report,
        progress: report.progress ? Number(report.progress) : null });
      toast.success("Compte-rendu enregistré");
      setReport({ intervention_type: "EDUCATION", observations: "", progress_step: "",
        progress: "", visible_to_owner: false });
      openDetail(detail.dog.dog_id);
    } catch (e) { toast.error(apiError(e)); }
  };

  const addComment = async (reportId) => {
    try {
      await api.post(`/dogs/${detail.dog.dog_id}/reports/${reportId}/comments`,
        { message: comment.message, visible_to_owner: comment.visible_to_owner });
      toast.success("Commentaire ajouté");
      setComment({ message: "", visible_to_owner: false, reportId: null });
      openDetail(detail.dog.dog_id);
    } catch (e) { toast.error(apiError(e)); }
  };

  const toggleVisibility = async (reportItem) => {
    try {
      await api.put(`/dogs/${detail.dog.dog_id}/reports/${reportItem.report_id}`,
        { visible_to_owner: !reportItem.visible_to_owner });
      openDetail(detail.dog.dog_id);
    } catch (e) { toast.error(apiError(e)); }
  };

  if (!data) return <p className="text-muted-foreground" data-testid="dogs-loading">Chargement…</p>;

  return (
    <div data-testid="dogs-page">
      <PageHeader breadcrumb="Suivi des chiens" title="Chiens suivis"
        subtitle="Fiches, professionnel référent, suivi de cas et coopération entre métiers."
        actions={data.can_create && (
          <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" data-testid="dog-create-button"
            onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nouvelle fiche
          </Button>
        )} />

      {data.items.length === 0 ? (
        <EmptyState testId="dogs-empty" module="dogs" icon={DogIcon} title="Aucun chien suivi pour l'instant"
          description="Créez la fiche de votre chien : elle rassemble son histoire, ses progrès et les retours des professionnels." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((dog) => (
            <button key={dog.dog_id} type="button" onClick={() => openDetail(dog.dog_id)}
              data-testid={`dog-card-${dog.dog_id}`}
              className="overflow-hidden rounded-xl border bg-card text-left transition-all hover:-translate-y-0.5 hover:shadow-md">
              <div className="h-32 bg-[var(--marine-a8)]">
                {dog.photo_file_id
                  ? <img src={fileUrl(dog.photo_file_id)} alt="" className="h-full w-full object-cover" />
                  : <div className="grid h-full place-items-center"><DogIcon className="h-8 w-8 text-[var(--marine-a25)]" /></div>}
              </div>
              <div className="p-5">
                <p className="font-display font-bold text-[var(--marine)]">
                  {dog.name} <span className="text-sm font-normal text-muted-foreground">
                    · {dog.owner_name}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {dog.breed || "Race non précisée"}{dog.age ? ` · ${dog.age}` : ""}
                </p>
                <div className="mt-1.5"><DogStatusBadge status={dog.status} testId={`dog-status-${dog.dog_id}`} /></div>
                {dog.referent_name && (
                  <Chip tone="marine" testId={`dog-referent-${dog.dog_id}`}>
                    <UserCheck className="h-3 w-3" /> {dog.referent_name}
                  </Chip>
                )}
                {dog.problem && <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{dog.problem}</p>}
                <div className="mt-3">
                  <ProgressBar value={dog.progress || 0} label="Progression" testId={`dog-progress-${dog.dog_id}`} />
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setForm(NEW_DOG); setEditId(null); } }}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto" data-testid="dog-dialog">
          <DialogHeader><DialogTitle>{editId ? "Modifier la fiche chien" : "Nouvelle fiche chien"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Nom du chien</Label>
                <Input value={form.name} required data-testid="dog-name-input"
                  onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Race</Label>
                <Input value={form.breed} data-testid="dog-breed-input"
                  onChange={(e) => setForm({ ...form, breed: e.target.value })} /></div>
              <div><Label>Âge</Label>
                <Input value={form.age} placeholder="Ex. 3 ans" data-testid="dog-age-input"
                  onChange={(e) => setForm({ ...form, age: e.target.value })} /></div>
              <div><Label>Sexe</Label>
                <Select value={form.sex} onValueChange={(v) => setForm({ ...form, sex: v })}>
                  <SelectTrigger data-testid="dog-sex-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Mâle</SelectItem>
                    <SelectItem value="FEMELLE">Femelle</SelectItem>
                  </SelectContent>
                </Select></div>
            </div>
            {data.is_manager && (
              <div><Label>Propriétaire</Label>
                <Select value={form.owner_id} onValueChange={(v) => setForm({ ...form, owner_id: v })}>
                  <SelectTrigger data-testid="dog-owner-select">
                    <SelectValue placeholder="Choisir le propriétaire" />
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
            <div><Label>Catégorie comportementale</Label>
              <Select value={form.behavior_category}
                onValueChange={(v) => setForm({ ...form, behavior_category: v })}>
                <SelectTrigger data-testid="dog-category-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div><Label>Contexte comportemental</Label>
              <Textarea rows={3} value={form.behavior_context} data-testid="dog-context-input"
                onChange={(e) => setForm({ ...form, behavior_context: e.target.value })} /></div>
            <div><Label>Historique simplifié</Label>
              <Textarea rows={2} value={form.history} data-testid="dog-history-input"
                onChange={(e) => setForm({ ...form, history: e.target.value })} /></div>
            <div><Label>Photo</Label>
              <FileUpload usage="AVATAR" accept="image/*" preview testId="dog-photo-upload"
                value={form.photo_file_id} label="Ajouter une photo"
                onChange={(id) => setForm({ ...form, photo_file_id: id })} /></div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                data-testid="dog-save-button">{editId ? "Enregistrer les modifications" : "Créer la fiche"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto" data-testid="dog-detail-dialog">
          {detail && (
            <>
              <div className="overflow-hidden rounded-2xl border" data-testid="dog-hero">
                {detail.dog.photo_file_id
                  ? <img src={fileUrl(detail.dog.photo_file_id)} alt={detail.dog.name}
                      className="h-56 w-full object-cover sm:h-72" />
                  : <div className="flex h-40 w-full items-center justify-center bg-muted text-sm text-muted-foreground">Pas encore de photo</div>}
              </div>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl text-[var(--marine)] md:text-3xl">{detail.dog.name}</DialogTitle>
                <p className="text-sm text-muted-foreground">Propriétaire : {detail.dog.owner_name}</p>
              </DialogHeader>
              <div className="space-y-6">
                {(detail.is_owner || detail.is_manager) && (
                  <div>
                    <Button variant="outline" size="sm" className="rounded-full" data-testid="dog-edit-button"
                      onClick={() => openEdit(detail.dog)}>Modifier la fiche</Button>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="dog-info-blocks">
                  <InfoBlock label="Race" value={detail.dog.breed || "—"} />
                  <InfoBlock label="Âge" value={detail.dog.age || "—"} />
                  <InfoBlock label="Sexe" value={detail.dog.sex === "MALE" ? "Mâle" : detail.dog.sex === "FEMALE" ? "Femelle" : "—"} />
                  <InfoBlock label="Profil" value={CATEGORIES[detail.dog.behavior_category] || "—"} />
                </div>
                {detail.dog.behavior_context && (
                  <p className="text-sm text-muted-foreground">{detail.dog.behavior_context}</p>
                )}

                <SectionCard title="Professionnel référent" icon={UserCheck} testId="dog-referent-card">
                  <p className="text-sm text-muted-foreground">
                    {detail.dog.referent_name || "Aucun référent désigné pour le moment."}
                  </p>
                  {(detail.is_owner || detail.is_manager) && (
                    <div className="mt-3 max-w-sm">
                      <Select value={detail.dog.referent_pro_id || ""} onValueChange={setReferent}>
                        <SelectTrigger data-testid="dog-referent-select">
                          <SelectValue placeholder="Désigner un professionnel" />
                        </SelectTrigger>
                        <SelectContent>
                          {pros.map((p) => (
                            <SelectItem key={p.user_id} value={p.user_id}>
                              {p.profile?.display_name || p.email}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="Suivi de cas & progression" icon={Target} testId="dog-cases-card">
                  {detail.cases.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun suivi ouvert pour l'instant.</p>
                  ) : detail.cases.map((c) => (
                    <div key={c.case_id} className="mb-4" data-testid={`dog-case-${c.case_id}`}>
                      <p className="font-semibold text-[var(--marine)]">{c.problem}</p>
                      {c.objectives?.length > 0 && (
                        <ul className="mt-1 text-xs text-muted-foreground">
                          {c.objectives.map((o) => <li key={o}>• {o}</li>)}
                        </ul>
                      )}
                      <div className="mt-2"><ProgressBar value={c.progress || 0} label="Progression" /></div>
                      <ul className="mt-3 space-y-1.5">
                        {(c.steps || []).map((s) => (
                          <li key={s.step_id} className="border-l-2 border-[var(--bordeaux-a40)] pl-3 text-sm">
                            <span className="font-medium text-[var(--marine)]">{s.label}</span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {s.progress} % · {s.author_name} · {s.date}
                            </span>
                            {!s.visible_to_owner && detail.can_write_pro && (
                              <Chip tone="amber"><EyeOff className="h-3 w-3" /> interne</Chip>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </SectionCard>

                <SectionCard title="Comptes-rendus de séances" icon={MessageSquare} testId="dog-reports-card">
                  {detail.reports.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun compte-rendu partagé.</p>
                  ) : (
                    <ul className="space-y-4">
                      {detail.reports.map((r) => (
                        <li key={r.report_id} className="rounded-lg border p-4"
                          data-testid={`dog-report-${r.report_id}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="flex flex-wrap items-center gap-2">
                              <Chip tone="marine">{TYPES[r.intervention_type]}</Chip>
                              <span className="text-xs text-muted-foreground">
                                {r.date} · {r.author_name}
                              </span>
                            </span>
                            {detail.can_write_pro && (
                              <Button size="sm" variant="outline" className="h-7 rounded-full px-2 text-xs"
                                data-testid={`dog-report-visibility-${r.report_id}`}
                                onClick={() => toggleVisibility(r)}>
                                {r.visible_to_owner
                                  ? <><Eye className="mr-1 h-3 w-3" /> Visible du propriétaire</>
                                  : <><EyeOff className="mr-1 h-3 w-3" /> Interne aux pros</>}
                              </Button>
                            )}
                          </div>
                          <p className="mt-2 text-sm text-muted-foreground">{r.observations}</p>
                          {(r.comments || []).length > 0 && (
                            <ul className="mt-3 space-y-1.5 border-l-2 border-[var(--marine-a20)] pl-3">
                              {r.comments.map((c) => (
                                <li key={c.comment_id} className="text-xs">
                                  <span className="font-semibold text-[var(--marine)]">{c.author_name} : </span>
                                  <span className="text-muted-foreground">{c.message}</span>
                                  {!c.visible_to_owner && detail.can_write_pro && (
                                    <Chip tone="amber">interne</Chip>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                          {detail.can_write_pro && (
                            comment.reportId === r.report_id ? (
                              <div className="mt-3 space-y-2">
                                <Textarea rows={2} value={comment.message}
                                  data-testid={`dog-comment-input-${r.report_id}`}
                                  onChange={(e) => setComment({ ...comment, message: e.target.value })} />
                                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <Checkbox checked={comment.visible_to_owner}
                                    data-testid={`dog-comment-visible-${r.report_id}`}
                                    onCheckedChange={(v) => setComment({ ...comment, visible_to_owner: !!v })} />
                                  Rendre ce commentaire visible par le propriétaire
                                </label>
                                <Button size="sm" className="rounded-full bg-[var(--marine)] hover:bg-[#001740]"
                                  data-testid={`dog-comment-send-${r.report_id}`}
                                  onClick={() => addComment(r.report_id)}>Publier</Button>
                              </div>
                            ) : (
                              <Button size="sm" variant="ghost" className="mt-2 h-7 px-2 text-xs"
                                data-testid={`dog-comment-open-${r.report_id}`}
                                onClick={() => setComment({ message: "", visible_to_owner: false,
                                  reportId: r.report_id })}>
                                <MessageSquare className="mr-1 h-3 w-3" /> Commenter
                              </Button>
                            )
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {detail.can_write_pro && (
                    <div className="mt-5 space-y-3 rounded-lg border border-dashed p-4">
                      <p className="text-sm font-semibold text-[var(--marine)]">Nouveau compte-rendu</p>
                      <Select value={report.intervention_type}
                        onValueChange={(v) => setReport({ ...report, intervention_type: v })}>
                        <SelectTrigger data-testid="dog-report-type-select"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Textarea rows={3} value={report.observations} placeholder="Observations de la séance"
                        data-testid="dog-report-observations-input"
                        onChange={(e) => setReport({ ...report, observations: e.target.value })} />
                      <Input value={report.progress_step} placeholder="Étape de progression"
                        data-testid="dog-report-step-input"
                        onChange={(e) => setReport({ ...report, progress_step: e.target.value })} />
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Checkbox checked={report.visible_to_owner} data-testid="dog-report-visible-checkbox"
                          onCheckedChange={(v) => setReport({ ...report, visible_to_owner: !!v })} />
                        Partager ce compte-rendu avec le propriétaire
                      </label>
                      <Button size="sm" disabled={report.observations.trim().length < 3}
                        className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                        data-testid="dog-report-save-button" onClick={addReport}>Enregistrer</Button>
                    </div>
                  )}
                </SectionCard>

                <SectionCard title="Mes observations personnelles" icon={NotebookPen} testId="dog-owner-notes">
                  {detail.owner_notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune note pour l'instant.</p>
                  ) : (
                    <ul className="space-y-2">
                      {detail.owner_notes.map((n) => (
                        <li key={n.note_id} className="rounded-lg bg-muted/50 px-3 py-2 text-sm">
                          <p className="text-muted-foreground">{n.message}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {n.author_name} · {new Date(n.created_at).toLocaleDateString("fr-FR")}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                  {(detail.is_owner || detail.is_manager) && (
                    <div className="mt-4 space-y-2">
                      <Textarea rows={2} value={note} data-testid="dog-note-input"
                        placeholder="Comportement à la maison, évolution constatée, ressentis…"
                        onChange={(e) => setNote(e.target.value)} />
                      <Button size="sm" disabled={note.trim().length < 2} data-testid="dog-note-save-button"
                        className="rounded-full bg-[var(--marine)] hover:bg-[#001740]" onClick={addNote}>
                        Ajouter mon observation
                      </Button>
                    </div>
                  )}
                </SectionCard>

                <DogJournal dogId={detail.dog.dog_id} dogName={detail.dog.name} />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
