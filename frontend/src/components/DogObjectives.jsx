import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Target, Plus, CheckCircle2, XCircle, Clock, MessageSquare, Send, NotebookPen } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { SectionCard, Chip } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS = {
  EN_COURS: { label: "En cours", icon: Clock, cls: "bg-amber-100 text-amber-800" },
  ATTEINT: { label: "Atteint", icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-800" },
  ABANDONNE: { label: "Abandonné", icon: XCircle, cls: "bg-muted text-muted-foreground" },
};
const fmt = (d) => (d ? new Date(d).toLocaleDateString("fr-FR") : "—");
const fmtDT = (d) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "");

const StatusChip = ({ status }) => {
  const s = STATUS[status] || STATUS.EN_COURS;
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`}
      data-testid={`objective-status-${status}`}>
      <Icon className="h-3 w-3" /> {s.label}
    </span>
  );
};

const Timeline = ({ history }) => (
  <ol className="mt-2 space-y-1 border-l-2 border-[var(--sable)] pl-3" data-testid="objective-timeline">
    {(history || []).map((h, i) => (
      <li key={i} className="text-xs text-muted-foreground">
        <span className="font-semibold text-[var(--marine)]">{STATUS[h.status]?.label || h.status}</span>
        {" · "}{fmtDT(h.at)}{h.by_name ? ` · ${h.by_name}` : ""}
      </li>
    ))}
  </ol>
);

const ObjectiveCard = ({ dogId, obj, canEditPro, isOwner, reload }) => {
  const [note, setNote] = useState("");
  const [session, setSession] = useState("");
  const [react, setReact] = useState({});

  const changeStatus = async (status) => {
    try { await api.put(`/dogs/${dogId}/objectives/${obj.objective_id}`, { status }); reload(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const addNote = async () => {
    if (!note.trim()) return;
    try { await api.post(`/dogs/${dogId}/objectives/${obj.objective_id}/notes`, { message: note }); setNote(""); reload(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const addSession = async () => {
    if (!session.trim()) return;
    try { await api.post(`/dogs/${dogId}/objectives/${obj.objective_id}/reports`, { text: session }); setSession(""); toast.success("Compte-rendu partagé"); reload(); }
    catch (e) { toast.error(apiError(e)); }
  };
  const addReaction = async (reportId) => {
    const msg = (react[reportId] || "").trim();
    if (!msg) return;
    try {
      await api.post(`/dogs/${dogId}/objectives/${obj.objective_id}/reports/${reportId}/react`, { message: msg });
      setReact({ ...react, [reportId]: "" }); reload();
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div className="rounded-xl border bg-card p-4" data-testid={`objective-card-${obj.objective_id}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display font-bold text-[var(--marine)]">{obj.title}</p>
          <p className="text-xs text-muted-foreground">
            Début {fmt(obj.start_date)}{obj.achieved_date ? ` · Atteint le ${fmt(obj.achieved_date)}` : ""}
          </p>
        </div>
        <StatusChip status={obj.status} />
      </div>

      {obj.notes && <p className="mt-2 text-sm">{obj.notes}</p>}

      {canEditPro && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Mettre à jour :</span>
          {Object.keys(STATUS).map((s) => (
            <Button key={s} size="sm" variant={obj.status === s ? "default" : "outline"} disabled={obj.status === s}
              data-testid={`objective-set-${s}-${obj.objective_id}`} className="h-7 rounded-full px-2 text-xs"
              onClick={() => changeStatus(s)}>{STATUS[s].label}</Button>
          ))}
        </div>
      )}

      <Timeline history={obj.status_history} />

      {/* Comptes-rendus de séance */}
      <div className="mt-4">
        <p className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-[var(--bordeaux)]">
          <NotebookPen className="h-3.5 w-3.5" /> Comptes-rendus de séance
        </p>
        <div className="mt-2 space-y-2">
          {(obj.session_reports || []).length === 0 && <p className="text-xs text-muted-foreground">Aucun compte-rendu pour l'instant.</p>}
          {(obj.session_reports || []).map((r) => (
            <div key={r.report_id} className="rounded-lg border bg-muted/30 p-2" data-testid={`objective-report-${r.report_id}`}>
              <p className="text-sm">{r.text}</p>
              <p className="text-xs text-muted-foreground">{r.author_name} · {fmt(r.date)}</p>
              {(r.comments || []).map((c) => (
                <p key={c.comment_id} className="mt-1 flex items-start gap-1 rounded-md bg-background px-2 py-1 text-xs"
                  data-testid={`objective-reaction-${c.comment_id}`}>
                  <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 text-[var(--bordeaux)]" />
                  <span><b>{c.author_name} :</b> {c.message}</span>
                </p>
              ))}
              <div className="mt-1 flex gap-2">
                <Input value={react[r.report_id] || ""} placeholder="Réagir en un mot…"
                  data-testid={`objective-react-input-${r.report_id}`} className="h-8 text-xs"
                  onChange={(e) => setReact({ ...react, [r.report_id]: e.target.value })} />
                <Button size="sm" variant="outline" className="h-8 rounded-full px-2"
                  data-testid={`objective-react-send-${r.report_id}`} onClick={() => addReaction(r.report_id)}>
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        {canEditPro && (
          <div className="mt-2 flex gap-2">
            <Textarea rows={1} value={session} placeholder="Note de séance à partager avec le propriétaire…"
              data-testid={`objective-session-input-${obj.objective_id}`}
              onChange={(e) => setSession(e.target.value)} />
            <Button size="sm" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
              data-testid={`objective-session-add-${obj.objective_id}`} onClick={addSession}>Publier</Button>
          </div>
        )}
      </div>

      {/* Notes du propriétaire */}
      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--marine)]">Mes notes (propriétaire)</p>
        <div className="mt-2 space-y-1">
          {(obj.owner_notes || []).map((n) => (
            <p key={n.note_id} className="rounded-md bg-muted/40 px-2 py-1 text-xs" data-testid={`objective-owner-note-${n.note_id}`}>
              {n.message} <span className="text-muted-foreground">· {fmt(n.created_at)}</span>
            </p>
          ))}
        </div>
        {isOwner && (
          <div className="mt-2 flex gap-2">
            <Input value={note} placeholder="Ajouter une observation de votre côté…"
              data-testid={`objective-owner-note-input-${obj.objective_id}`}
              onChange={(e) => setNote(e.target.value)} />
            <Button size="sm" variant="outline" className="rounded-full"
              data-testid={`objective-owner-note-add-${obj.objective_id}`} onClick={addNote}>Noter</Button>
          </div>
        )}
      </div>
    </div>
  );
};

export const DogObjectives = ({ dogId }) => {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ title: "", notes: "", start_date: "" });

  const load = useCallback(async () => {
    try { const { data } = await api.get(`/dogs/${dogId}/objectives`); setData(data); }
    catch (e) { toast.error(apiError(e)); }
  }, [dogId]);
  useEffect(() => { load(); }, [load]);
  if (!data) return null;

  const create = async () => {
    if (!form.title.trim()) return;
    try {
      await api.post(`/dogs/${dogId}/objectives`, form);
      setForm({ title: "", notes: "", start_date: "" }); toast.success("Objectif ajouté"); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <SectionCard title="Objectifs et progression" icon={Target} testId="dog-objectives-card"
      subtitle="Suivez l'évolution du travail, séance après séance.">
      {data.can_edit_pro && (
        <div className="mb-4 space-y-2 rounded-xl border bg-muted/20 p-3">
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="sm:col-span-2 space-y-1">
              <Label>Nouvel objectif</Label>
              <Input value={form.title} placeholder="Ex. : rappel acquis, marche en laisse…"
                data-testid="objective-title-input" onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>Date de début</Label>
              <Input type="date" value={form.start_date} data-testid="objective-start-input"
                onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
          </div>
          <Textarea rows={2} value={form.notes} placeholder="Notes (facultatif)"
            data-testid="objective-notes-input" onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          <Button size="sm" className="rounded-full bg-[var(--marine)] hover:bg-[#001740]"
            data-testid="objective-create-button" onClick={create}>
            <Plus className="mr-2 h-4 w-4" /> Ajouter l'objectif
          </Button>
        </div>
      )}

      {data.objectives.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="objectives-empty">
          Aucun objectif défini pour l'instant.
        </p>
      ) : (
        <div className="space-y-3">
          {data.objectives.map((o) => (
            <ObjectiveCard key={o.objective_id} dogId={dogId} obj={o}
              canEditPro={data.can_edit_pro} isOwner={data.is_owner} reload={load} />
          ))}
        </div>
      )}
    </SectionCard>
  );
};

export default DogObjectives;
