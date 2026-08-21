import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Send, Plus, ListChecks, Copy, CalendarClock } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState, Chip } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useAuth } from "@/context/AuthContext";

const NETWORKS = ["FACEBOOK", "INSTAGRAM", "TIKTOK", "YOUTUBE", "LINKEDIN", "X", "NEWSLETTER"];
const COLUMNS = [
  ["DRAFT", "Brouillons"], ["TO_VALIDATE", "À valider"], ["SCHEDULED", "Programmées"], ["PUBLISHED", "Publiées"],
];
const EMPTY = { title: "", content: "", networks: [], hashtags: "", scheduled_date: "",
  scheduled_time: "10:00", notes: "" };

export default function SocialPlanner() {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [projects, setProjects] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    const { data } = await api.get("/social/posts");
    setData(data);
  }, []);

  useEffect(() => {
    load();
    if (can("projects.view")) api.get("/projects").then((r) => setProjects(r.data.items || [])).catch(() => {});
  }, [load, can]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post("/social/posts", {
        ...form,
        hashtags: form.hashtags ? form.hashtags.split(/[\s,]+/).filter(Boolean) : [],
        scheduled_date: form.scheduled_date || null,
      });
      toast.success("Publication planifiée");
      setOpen(false); setForm(EMPTY); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const move = async (post, status) => {
    try {
      await api.put(`/social/posts/${post.post_id}`, { status });
      toast.success("Statut mis à jour");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const createTask = async (post) => {
    if (projects.length === 0) return toast.error("Créez d'abord un projet pour y rattacher la tâche.");
    const choice = window.prompt(
      `Projet à rattacher :\n${projects.map((p, i) => `${i + 1}. ${p.title}`).join("\n")}`, "1");
    const project = projects[Number(choice) - 1];
    if (!project) return;
    try {
      await api.post(`/social/posts/${post.post_id}/task`, { project_id: project.project_id });
      toast.success("Tâche créée dans le projet");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const copy = async (post) => {
    const text = `${post.content}\n\n${(post.hashtags || []).join(" ")}`;
    await navigator.clipboard.writeText(text);
    toast.success("Texte copié, prêt à coller sur le réseau");
  };

  const toggleNetwork = (network) => setForm((f) => ({
    ...f, networks: f.networks.includes(network)
      ? f.networks.filter((n) => n !== network) : [...f.networks, network],
  }));

  if (!data) return <p className="text-muted-foreground" data-testid="social-loading">Chargement…</p>;

  return (
    <div data-testid="social-page">
      <PageHeader breadcrumb="Communication" title="Planificateur réseaux sociaux"
        subtitle="Préparer, faire valider et programmer les publications. La publication reste manuelle sur chaque réseau."
        actions={can("social.manage") && (
          <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="social-create-button"
            onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nouvelle publication
          </Button>
        )} />

      {data.items.length === 0 ? (
        <EmptyState testId="social-empty" icon={Send} title="Aucune publication planifiée"
          description="Préparez vos annonces à l'avance : elles remonteront en rappel deux jours avant la date prévue." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-4">
          {COLUMNS.map(([status, label]) => {
            const items = data.items.filter((p) => p.status === status);
            return (
              <div key={status} className="rounded-xl border bg-muted/30 p-3" data-testid={`social-column-${status}`}>
                <div className="mb-3 flex items-center justify-between px-1">
                  <h2 className="font-display text-sm font-bold uppercase tracking-wide text-[#002060]">{label}</h2>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-[#800020]">{items.length}</span>
                </div>
                <div className="space-y-3">
                  {items.length === 0 && <p className="px-1 text-xs text-muted-foreground">Rien ici pour l'instant.</p>}
                  {items.map((post) => (
                    <div key={post.post_id} data-testid={`social-card-${post.post_id}`}
                      className="rounded-lg border bg-card p-3 shadow-sm transition-shadow hover:shadow-md">
                      <p className="text-sm font-semibold text-[#002060]">{post.title}</p>
                      <p className="mt-1.5 text-xs text-muted-foreground line-clamp-3">{post.content}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {(post.networks || []).map((n) => <Chip key={n} tone="marine">{n}</Chip>)}
                      </div>
                      {post.scheduled_date && (
                        <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#800020]">
                          <CalendarClock className="h-3 w-3" />
                          {new Date(post.scheduled_date).toLocaleDateString("fr-FR")} · {post.scheduled_time || ""}
                        </p>
                      )}
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <Button size="sm" variant="outline" className="h-7 rounded-full px-2 text-xs"
                          data-testid={`social-copy-${post.post_id}`} onClick={() => copy(post)}>
                          <Copy className="mr-1 h-3 w-3" /> Copier
                        </Button>
                        {can("social.manage") && (
                          <>
                            {status === "DRAFT" && (
                              <Button size="sm" variant="outline" className="h-7 rounded-full px-2 text-xs"
                                data-testid={`social-validate-${post.post_id}`}
                                onClick={() => move(post, "TO_VALIDATE")}>Faire valider</Button>
                            )}
                            {status === "TO_VALIDATE" && (
                              <Button size="sm" className="h-7 rounded-full bg-[#002060] px-2 text-xs hover:bg-[#001740]"
                                data-testid={`social-schedule-${post.post_id}`}
                                onClick={() => move(post, "SCHEDULED")}>Programmer</Button>
                            )}
                            {status === "SCHEDULED" && (
                              <Button size="sm" className="h-7 rounded-full bg-[#800020] px-2 text-xs hover:bg-[#63001a]"
                                data-testid={`social-published-${post.post_id}`}
                                onClick={() => move(post, "PUBLISHED")}>Marquer publiée</Button>
                            )}
                            {!post.task_id && (
                              <Button size="sm" variant="outline" className="h-7 rounded-full px-2 text-xs"
                                data-testid={`social-task-${post.post_id}`} onClick={() => createTask(post)}>
                                <ListChecks className="mr-1 h-3 w-3" /> Créer la tâche
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto" data-testid="social-dialog">
          <DialogHeader><DialogTitle>Nouvelle publication</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Titre interne</Label>
              <Input value={form.title} required data-testid="social-title-input"
                onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Texte de la publication</Label>
              <Textarea rows={5} value={form.content} data-testid="social-content-input"
                onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
            <div>
              <Label>Réseaux</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {NETWORKS.map((network) => (
                  <button key={network} type="button" onClick={() => toggleNetwork(network)}
                    data-testid={`social-network-${network}`}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      form.networks.includes(network)
                        ? "bg-[#800020] text-white" : "bg-muted text-[#002060] hover:bg-muted/70"}`}>
                    {network}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Date prévue</Label>
                <Input type="date" value={form.scheduled_date} data-testid="social-date-input"
                  onChange={(e) => setForm({ ...form, scheduled_date: e.target.value })} /></div>
              <div><Label>Heure</Label>
                <Input type="time" value={form.scheduled_time} data-testid="social-time-input"
                  onChange={(e) => setForm({ ...form, scheduled_time: e.target.value })} /></div>
            </div>
            <div><Label>Hashtags</Label>
              <Input value={form.hashtags} placeholder="#LaVoixDuChien #EducationPositive"
                data-testid="social-hashtags-input"
                onChange={(e) => setForm({ ...form, hashtags: e.target.value })} /></div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid="social-save-button">Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
