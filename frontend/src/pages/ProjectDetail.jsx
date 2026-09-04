import { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { RowMenu, confirmDialog } from "@/components/ConfirmDialog";
import { ArrowLeft, Plus, Send, CheckCircle2, MessageSquare, LifeBuoy, Trash2, UserPlus, History } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, EmptyState } from "@/components/Ui";
import { StatusBadge, DeadlineChip } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CommentSection } from "@/components/CommentSection";

const PROJECT_ROLES = ["COORDINATOR", "CONTRIBUTOR", "VOLUNTEER", "EXPERT", "REVIEWER"];

export default function ProjectDetail() {
  const { projectId } = useParams();
  const { user, can } = useAuth();
  const [data, setData] = useState(null);
  const [members, setMembers] = useState([]);
  const [history, setHistory] = useState({ taskId: null, items: [] });
  const [newTask, setNewTask] = useState({ title: "", deadline: "", assigned_user_id: "", is_volunteer_task: false, parent_task_id: "" });
  const [dialog, setDialog] = useState(null); // {type:'submit'|'validate'|'help'|'comment', task}
  const [text, setText] = useState("");
  const [proof, setProof] = useState("");
  const [teamForm, setTeamForm] = useState({ member_id: "", role_in_project: "CONTRIBUTOR" });
  const [stockItems, setStockItems] = useState([]);

  const isAdmin = user?.role === "ADMIN_BUREAU";

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/projects/${projectId}`);
      setData(data);
    } catch (e) {
      toast.error(apiError(e));
      setData(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/stock/linked", { params: { project_id: projectId } })
      .then((r) => setStockItems(r.data.items || [])).catch(() => {});
  }, [projectId]);
  useEffect(() => {
    if (can("members.view")) api.get("/members", { params: { status: "ACTIVE", limit: 100 } })
      .then((r) => setMembers(r.data.items)).catch(() => {});
  }, [can]);

  if (data === null) return <p className="text-muted-foreground">Chargement du projet…</p>;
  if (data === false) return <EmptyState testId="project-not-found" title="Projet indisponible" description="Ce projet n'existe pas ou ne vous est pas visible." />;

  const { project, tasks, team, my_team_role } = data;
  const canManage = isAdmin || project.owner_id === user.user_id || ["OWNER", "COORDINATOR"].includes(my_team_role);
  const roots = tasks.filter((t) => !t.parent_task_id);
  const childrenOf = (id) => tasks.filter((t) => t.parent_task_id === id);

  const act = async (fn, message) => {
    try {
      await fn();
      if (message) toast.success(message);
      setDialog(null);
      setText("");
      setProof("");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const createTask = (e) => {
    e.preventDefault();
    act(() => api.post("/tasks", {
      project_id: projectId, title: newTask.title,
      deadline: newTask.deadline || null,
      assigned_user_id: newTask.assigned_user_id || null,
      is_volunteer_task: newTask.is_volunteer_task,
      parent_task_id: newTask.parent_task_id || null,
    }), "Tâche créée").then(() => setNewTask({ title: "", deadline: "", assigned_user_id: "", is_volunteer_task: false, parent_task_id: "" }));
  };

  const openHistory = async (taskId) => {
    const { data } = await api.get(`/tasks/${taskId}/history`);
    setHistory({ taskId, items: data.items });
  };

  const taskRow = (t, depth = 0) => {
    const mine = t.assigned_user_id === user.user_id;
    return (
      <div key={t.task_id}>
        <div data-testid={`task-row-${t.task_id}`}
          className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          style={{ paddingLeft: `${16 + depth * 20}px` }}>
          <div className="min-w-0">
            <p className="font-semibold text-[var(--marine)]">
              {depth > 0 && <span className="mr-2 text-muted-foreground">↳</span>}{t.title}
              {t.needs_help && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">besoin d'aide</span>}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge status={t.status} testId={`task-status-${t.task_id}`} />
              <DeadlineChip deadline={t.deadline} />
              <span>{t.assignee_name || "Non attribuée"}</span>
              {t.is_volunteer_task && <span className="rounded-full bg-[var(--marine-a10)] px-2 py-0.5 font-semibold text-[var(--marine)]">bénévolat ouvert</span>}
              {t.blocked_by_title && <span className="text-red-600">Bloquée par : {t.blocked_by_title}</span>}
            </div>
            {t.rejection_reason && (
              <p className="mt-1 text-xs text-red-600" data-testid={`task-rejection-${t.task_id}`}>
                Modification demandée : {t.rejection_reason}
              </p>
            )}
            {t.proof && <p className="mt-1 text-xs text-muted-foreground">Preuve : {t.proof}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {t.is_volunteer_task && !t.assigned_user_id && can("tasks.submit") && (
              <Button size="sm" variant="outline" className="rounded-full" data-testid={`task-claim-${t.task_id}`}
                onClick={() => act(() => api.post(`/tasks/${t.task_id}/claim`), "Tâche prise en charge")}>
                Je m'en occupe
              </Button>
            )}
            {mine && ["TODO", "WAITING", "BLOCKED"].includes(t.status) && (
              <Button size="sm" variant="outline" className="rounded-full" data-testid={`task-start-${t.task_id}`}
                onClick={() => act(() => api.put(`/tasks/${t.task_id}`, { status: "IN_PROGRESS" }), "Tâche démarrée")}>
                Commencer
              </Button>
            )}
            {mine && !["COMPLETED", "PENDING_VALIDATION", "ARCHIVED"].includes(t.status) && (
              <Button size="sm" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                data-testid={`task-submit-${t.task_id}`} onClick={() => setDialog({ type: "submit", task: t })}>
                <Send className="mr-1 h-3.5 w-3.5" /> Terminer
              </Button>
            )}
            {can("tasks.validate") && t.status === "PENDING_VALIDATION" && (
              <Button size="sm" className="rounded-full bg-[var(--marine)] hover:bg-[#001740]"
                data-testid={`task-validate-${t.task_id}`} onClick={() => setDialog({ type: "validate", task: t })}>
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Valider
              </Button>
            )}
            <Button size="sm" variant="ghost" data-testid={`task-comment-${t.task_id}`}
              onClick={() => setDialog({ type: "comment", task: t })}>
              <MessageSquare className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" data-testid={`task-help-${t.task_id}`}
              onClick={() => setDialog({ type: "help", task: t })}>
              <LifeBuoy className="h-3.5 w-3.5" />
            </Button>
            <Button size="sm" variant="ghost" data-testid={`task-history-${t.task_id}`} onClick={() => openHistory(t.task_id)}>
              <History className="h-3.5 w-3.5" />
            </Button>
            {isAdmin && (
              <RowMenu testId={`task-menu-${t.task_id}`} items={[
                { label: "Supprimer la tâche", icon: Trash2, danger: true, testId: `task-delete-${t.task_id}`,
                  onSelect: async () => { if (!(await confirmDialog("Supprimer cette tâche ?"))) return;
                    act(() => api.delete(`/tasks/${t.task_id}`), "Tâche supprimée"); } }]} />
            )}
          </div>
        </div>
        {childrenOf(t.task_id).map((c) => taskRow(c, depth + 1))}
      </div>
    );
  };

  return (
    <div data-testid="project-detail-page">
      <Link to="/projects" data-testid="project-back-link"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-[var(--bordeaux)]">
        <ArrowLeft className="h-4 w-4" /> Retour aux projets
      </Link>
      <PageHeader breadcrumb={`Projets · ${project.category}`} title={project.title}
        subtitle={project.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={project.status} testId="project-status-badge" />
            <DeadlineChip deadline={project.deadline} testId="project-deadline" />
            {canManage && project.status !== "ARCHIVED" && can("projects.archive") && (
              <Button variant="outline" size="sm" className="rounded-full" data-testid="project-archive-button"
                onClick={() => act(() => api.post(`/projects/${projectId}/archive`), "Projet archivé")}>Archiver</Button>
            )}
            {!canManage && (
              <Button variant="outline" size="sm" className="rounded-full" data-testid="project-join-button"
                onClick={() => setDialog({ type: "join" })}>Demander à rejoindre</Button>
            )}
          </div>
        } />

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          <div className="rounded-xl border bg-card" data-testid="project-tasks">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">Tâches et sous-tâches</h2>
              <span className="text-xs text-muted-foreground">{project.completion_percentage} % avancé</span>
            </div>
            {roots.length === 0 ? (
              <EmptyState testId="project-tasks-empty" title="Aucune tâche"
                description="Ajoutez une première tâche : chaque petit progrès compte." />
            ) : roots.map((t) => taskRow(t))}
          </div>

          {canManage && (
            <form onSubmit={createTask} className="space-y-4 rounded-xl border bg-card p-5" data-testid="task-create-form">
              <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">Ajouter une tâche</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Titre *</Label>
                  <Input required value={newTask.title} data-testid="task-title-input"
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Échéance</Label>
                  <Input type="date" value={newTask.deadline} data-testid="task-deadline-input"
                    onChange={(e) => setNewTask({ ...newTask, deadline: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Attribuer à</Label>
                  <Select value={newTask.assigned_user_id || "NONE"}
                    onValueChange={(v) => setNewTask({ ...newTask, assigned_user_id: v === "NONE" ? "" : v })}>
                    <SelectTrigger data-testid="task-assignee-select"><SelectValue placeholder="Personne" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Non attribuée</SelectItem>
                      {team.map((m) => (
                        <SelectItem key={m.member_id} value={m.member_id} data-testid={`task-assignee-${m.member_id}`}>
                          {m.display_name} ({m.role_in_project})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Sous-tâche de</Label>
                  <Select value={newTask.parent_task_id || "NONE"}
                    onValueChange={(v) => setNewTask({ ...newTask, parent_task_id: v === "NONE" ? "" : v })}>
                    <SelectTrigger data-testid="task-parent-select"><SelectValue placeholder="Aucune" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Tâche principale</SelectItem>
                      {roots.map((t) => (
                        <SelectItem key={t.task_id} value={t.task_id} data-testid={`task-parent-${t.task_id}`}>{t.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={newTask.is_volunteer_task} data-testid="task-volunteer-checkbox"
                  onCheckedChange={(v) => setNewTask({ ...newTask, is_volunteer_task: !!v })} />
                Ouvrir cette tâche au bénévolat
              </label>
              <Button type="submit" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" data-testid="task-create-button">
                <Plus className="mr-2 h-4 w-4" /> Ajouter la tâche
              </Button>
            </form>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5" data-testid="project-stock-items">
            <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">
              Matériel d'inventaire lié
            </h2>
            {stockItems.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">
                Aucun article lié. Le lien se fait depuis la fiche de l'article dans Stocks.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {stockItems.map((i) => (
                  <li key={i.item_id} data-testid={`project-stock-${i.item_id}`}
                    className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span className="font-semibold text-[var(--marine)]">{i.name}</span>
                    <span className="text-xs text-muted-foreground">{i.quantity} {i.unit}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link to="/stock" className="mt-3 inline-block text-xs font-semibold text-[var(--bordeaux)] hover:underline">
              Gérer l'inventaire
            </Link>
          </div>

          <div className="rounded-xl border bg-card p-5" data-testid="project-team">
            <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">Équipe projet</h2>
            <div className="mt-4 space-y-2">
              {team.map((m) => (
                <div key={m.member_id} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm"
                  data-testid={`team-member-${m.member_id}`}>
                  <span>
                    <span className="font-semibold text-[var(--marine)]">{m.display_name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">{m.role_in_project}</span>
                  </span>
                  {canManage && m.role_in_project !== "OWNER" && (
                    <RowMenu testId={`team-menu-${m.member_id}`} items={[
                      { label: "Retirer de l'équipe", icon: Trash2, danger: true, testId: `team-remove-${m.member_id}`,
                        onSelect: async () => { if (!(await confirmDialog("Retirer ce membre de l'équipe ?"))) return;
                          act(() => api.delete(`/projects/${projectId}/team/${m.member_id}`), "Membre retiré"); } }]} />
                  )}
                </div>
              ))}
            </div>
            {canManage && members.length > 0 && (
              <div className="mt-4 space-y-3 border-t pt-4">
                <Select value={teamForm.member_id} onValueChange={(v) => setTeamForm({ ...teamForm, member_id: v })}>
                  <SelectTrigger data-testid="team-member-select"><SelectValue placeholder="Choisir un membre" /></SelectTrigger>
                  <SelectContent>
                    {members.filter((m) => !team.some((t) => t.member_id === m.user_id)).map((m) => (
                      <SelectItem key={m.user_id} value={m.user_id} data-testid={`team-option-${m.user_id}`}>
                        {m.profile?.display_name || m.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={teamForm.role_in_project} onValueChange={(v) => setTeamForm({ ...teamForm, role_in_project: v })}>
                  <SelectTrigger data-testid="team-role-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PROJECT_ROLES.map((r) => (
                      <SelectItem key={r} value={r} data-testid={`team-role-${r}`}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button size="sm" className="w-full rounded-full bg-[var(--marine)] hover:bg-[#001740]"
                  data-testid="team-add-button" disabled={!teamForm.member_id}
                  onClick={() => act(() => api.post(`/projects/${projectId}/team`, teamForm), "Membre ajouté")}>
                  <UserPlus className="mr-2 h-4 w-4" /> Ajouter à l'équipe
                </Button>
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">Informations</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Responsable</dt><dd>{project.owner_name}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Priorité</dt><dd>{project.priority}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Visibilité</dt><dd>{project.visibility}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Créé le</dt>
                <dd>{new Date(project.created_at).toLocaleDateString("fr-FR")}</dd></div>
            </dl>
          </div>

          {history.taskId && (
            <div className="rounded-xl border bg-card p-5" data-testid="task-history-panel">
              <h2 className="font-display text-base md:text-lg font-bold text-[var(--marine)]">Historique de la tâche</h2>
              <div className="mt-4 space-y-3">
                {history.items.map((h) => (
                  <div key={h.history_id} className="border-l-2 border-[var(--bordeaux-a40)] pl-3">
                    <p className="text-sm font-semibold text-[var(--marine)]">{h.action}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.user_name} — {new Date(h.timestamp).toLocaleString("fr-FR")}
                    </p>
                    {h.comment && <p className="text-xs">{h.comment}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent data-testid="task-action-dialog">
          <DialogHeader>
            <DialogTitle>
              {dialog?.type === "submit" && "Terminer et soumettre à validation"}
              {dialog?.type === "validate" && "Valider la tâche"}
              {dialog?.type === "help" && "J'ai besoin d'aide"}
              {dialog?.type === "comment" && "Commentaires"}
              {dialog?.type === "join" && "Demander à rejoindre le projet"}
            </DialogTitle>
          </DialogHeader>
          {dialog?.type === "submit" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Preuve (lien, référence, description)</Label>
                <Input value={proof} data-testid="task-proof-input" onChange={(e) => setProof(e.target.value)}
                  placeholder="https://… ou description de ce qui a été fait" />
              </div>
              <div className="space-y-2">
                <Label>Commentaire</Label>
                <Textarea rows={3} value={text} data-testid="task-submit-comment" onChange={(e) => setText(e.target.value)} />
              </div>
              <p className="text-xs text-muted-foreground">Le Bureau sera notifié et validera votre travail.</p>
            </div>
          )}
          {dialog?.type === "validate" && (
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/60 p-3 text-sm">
                <p className="font-semibold text-[var(--marine)]">{dialog.task.title}</p>
                <p className="text-xs text-muted-foreground">Preuve : {dialog.task.proof || "aucune"}</p>
              </div>
              <div className="space-y-2">
                <Label>Commentaire (obligatoire si modification demandée)</Label>
                <Textarea rows={3} value={text} data-testid="task-validate-comment" onChange={(e) => setText(e.target.value)} />
              </div>
            </div>
          )}
          {(dialog?.type === "help" || dialog?.type === "join") && (
            <div className="space-y-2">
              <Label>{dialog.type === "help" ? "Ce qui vous bloque (sans jugement)" : "Votre message"}</Label>
              <Textarea rows={4} value={text} data-testid="task-dialog-text" onChange={(e) => setText(e.target.value)} />
            </div>
          )}
          {dialog?.type === "comment" && (
            <CommentSection elementType="task" elementId={dialog.task.task_id} testId="task-comments" />
          )}
          <DialogFooter className="flex-wrap gap-2">
            {dialog?.type === "submit" && (
              <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" data-testid="task-submit-confirm"
                onClick={() => act(() => api.post(`/tasks/${dialog.task.task_id}/submit`, { proof, comment: text }),
                  "Tâche soumise au Bureau")}>Soumettre</Button>
            )}
            {dialog?.type === "validate" && (
              <>
                <Button variant="outline" className="rounded-full" data-testid="task-request-changes"
                  onClick={() => act(() => api.post(`/tasks/${dialog.task.task_id}/validate`,
                    { decision: "CHANGES", comment: text }), "Modification demandée")}>Demander une modification</Button>
                <Button className="rounded-full bg-[var(--marine)] hover:bg-[#001740]" data-testid="task-validate-confirm"
                  onClick={() => act(() => api.post(`/tasks/${dialog.task.task_id}/validate`,
                    { decision: "ACCEPT", comment: text }), "Tâche validée")}>Valider</Button>
              </>
            )}
            {dialog?.type === "help" && (
              <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" data-testid="task-help-confirm"
                onClick={() => act(() => api.post(`/tasks/${dialog.task.task_id}/help`, { comment: text }),
                  "Le Bureau est prévenu, quelqu'un va vous aider")}>Demander de l'aide</Button>
            )}
            {dialog?.type === "join" && (
              <Button className="rounded-full bg-[var(--marine)] hover:bg-[#001740]" data-testid="project-join-confirm"
                onClick={() => act(() => api.post(`/projects/${projectId}/join-request`, { comment: text }),
                  "Demande envoyée au Bureau")}>Envoyer ma demande</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
