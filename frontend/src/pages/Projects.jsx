import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Plus, AlertTriangle, Users } from "lucide-react";
import { ViewModeSwitch, useViewMode } from "@/components/ViewMode";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, EmptyState } from "@/components/Ui";
import { StatusBadge, DeadlineChip } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const KANBAN = ["IDEA", "TO_REVIEW", "PLANNED", "IN_PROGRESS", "WAITING", "BLOCKED", "PENDING_VALIDATION", "COMPLETED"];

export default function Projects() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [view, setView] = useViewMode("projects", "kanban");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", category: "AUTRE", status: "IDEA",
    priority: "NORMALE", deadline: "", visibility: "MEMBERS", template: "" });
  const category = params.get("category") || "";
  const overdue = params.get("overdue") === "1";

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/projects", {
        params: { q: q || undefined, category: category || undefined, overdue: overdue || undefined },
      });
      setItems(data.items);
    } catch (e) {
      toast.error(apiError(e));
    }
  }, [q, category, overdue]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/projects/meta/templates").then((r) => setMeta(r.data)).catch(() => {}); }, []);

  const grouped = useMemo(() => {
    const map = {};
    KANBAN.forEach((s) => (map[s] = []));
    items.forEach((p) => (map[p.status] ? map[p.status].push(p) : null));
    return map;
  }, [items]);

  const create = async (e) => {
    e.preventDefault();
    try {
      const payload = { ...form, deadline: form.deadline || null, template: form.template || null };
      const { data } = await api.post("/projects", payload);
      toast.success("Projet créé");
      setOpen(false);
      setForm({ ...form, title: "", description: "", template: "" });
      load();
      return data;
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const moveProject = async (projectId, status) => {
    try {
      await api.put(`/projects/${projectId}`, { status });
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const card = (p) => (
    <div key={p.project_id} draggable onDragStart={(e) => e.dataTransfer.setData("pid", p.project_id)}
      data-testid={`project-card-${p.project_id}`}
      className="rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:shadow-md">
      <Link to={`/projects/${p.project_id}`} className="block">
        <p className="font-display text-sm font-bold text-[var(--marine)]">{p.title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{p.category} · {p.owner_name || "—"}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusBadge status={p.status} />
          <DeadlineChip deadline={p.deadline} />
          {p.needs_help && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
              <AlertTriangle className="h-3 w-3" /> aide
            </span>
          )}
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-[var(--bordeaux)] transition-all"
            style={{ width: `${p.completion_percentage || 0}%` }} />
        </div>
        <p className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>{p.completion_percentage || 0} % avancé</span>
          <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {p.open_tasks} tâche(s)</span>
        </p>
      </Link>
    </div>
  );

  return (
    <div data-testid="projects-page">
      <PageHeader breadcrumb="Pilotage" title="Projets"
        subtitle="Vue Kanban ou liste. Faites glisser une carte pour changer son statut."
        actions={
          <div className="flex items-center gap-2">
            <ViewModeSwitch value={view} onChange={setView} testId="projects-view" />
            {can("projects.create") && (
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" data-testid="project-create-button">
                    <Plus className="mr-2 h-4 w-4" /> Nouveau projet
                  </Button>
                </DialogTrigger>
                <DialogContent data-testid="project-create-dialog" className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Nouveau projet</DialogTitle></DialogHeader>
                  <form onSubmit={create} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Titre *</Label>
                      <Input required value={form.title} data-testid="project-title-input"
                        onChange={(e) => setForm({ ...form, title: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Description</Label>
                      <Textarea rows={3} value={form.description} data-testid="project-description-input"
                        onChange={(e) => setForm({ ...form, description: e.target.value })} />
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>Catégorie</Label>
                        <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                          <SelectTrigger data-testid="project-category-select"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(meta?.categories || []).map((c) => (
                              <SelectItem key={c} value={c} data-testid={`project-category-${c}`}>{c}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Statut</Label>
                        <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                          <SelectTrigger data-testid="project-status-select"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(meta?.statuses || []).map((s) => (
                              <SelectItem key={s} value={s} data-testid={`project-status-${s}`}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Échéance</Label>
                        <Input type="date" value={form.deadline} data-testid="project-deadline-input"
                          onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Visibilité</Label>
                        <Select value={form.visibility} onValueChange={(v) => setForm({ ...form, visibility: v })}>
                          <SelectTrigger data-testid="project-visibility-select"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(meta?.visibility_modes || []).map((v) => (
                              <SelectItem key={v} value={v} data-testid={`project-visibility-${v}`}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Modèle de projet (crée les tâches types)</Label>
                      <Select value={form.template || "NONE"}
                        onValueChange={(v) => setForm({ ...form, template: v === "NONE" ? "" : v })}>
                        <SelectTrigger data-testid="project-template-select"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE" data-testid="project-template-none">Aucun modèle</SelectItem>
                          {(meta?.templates || []).map((t) => (
                            <SelectItem key={t.key} value={t.key} data-testid={`project-template-${t.key}`}>
                              {t.label} ({t.tasks.length} tâches)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <DialogFooter>
                      <Button type="submit" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                        data-testid="project-save-button">Créer le projet</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
          </div>
        } />

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-64">
          <Label className="text-xs">Recherche</Label>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Titre du projet"
            data-testid="projects-search-input" />
        </div>
        <div>
          <Label className="text-xs">Catégorie</Label>
          <Select value={category || "ALL"} onValueChange={(v) => {
            const next = new URLSearchParams(params);
            v === "ALL" ? next.delete("category") : next.set("category", v);
            setParams(next);
          }}>
            <SelectTrigger className="w-48" data-testid="projects-category-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toutes</SelectItem>
              {(meta?.categories || []).map((c) => (
                <SelectItem key={c} value={c} data-testid={`projects-filter-category-${c}`}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant={overdue ? "default" : "outline"} size="sm" data-testid="projects-overdue-filter"
          className={`rounded-full ${overdue ? "bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" : ""}`}
          onClick={() => {
            const next = new URLSearchParams(params);
            overdue ? next.delete("overdue") : next.set("overdue", "1");
            setParams(next);
          }}>En retard</Button>
      </div>

      {items.length === 0 ? (
        <EmptyState testId="projects-empty" module="projects" title="Aucun projet"
          description="Créez un premier projet, éventuellement depuis un modèle (journée thématique, article, formation)." />
      ) : view === "kanban" ? (
        <div className="flex gap-4 overflow-x-auto pb-4" data-testid="projects-kanban">
          {KANBAN.map((status) => (
            <div key={status} className="w-72 shrink-0" data-testid={`kanban-column-${status}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const pid = e.dataTransfer.getData("pid");
                if (pid) moveProject(pid, status);
              }}>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{status}</p>
                <span className="rounded-full bg-muted px-2 text-xs">{grouped[status].length}</span>
              </div>
              <div className="space-y-3">{grouped[status].map(card)}</div>
            </div>
          ))}
        </div>
      ) : view === "list" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="projects-list">
          {items.map(card)}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card" data-testid="projects-table">
          <table className="w-full min-w-[640px] text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2">Projet</th><th className="px-3 py-2">Statut</th>
              <th className="px-3 py-2">Avancement</th><th className="px-3 py-2">Équipe</th></tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.project_id} className="border-b last:border-0 hover:bg-muted/50" data-testid={`projects-row-${p.project_id}`}>
                  <td className="px-3 py-2 font-semibold text-[var(--marine)]"><Link to={`/projects/${p.project_id}`}>{p.title}</Link></td>
                  <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                  <td className="px-3 py-2">{p.completion_percentage ?? p.progress ?? 0} %</td>
                  <td className="px-3 py-2">{p.team_count ?? p.team_size ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
