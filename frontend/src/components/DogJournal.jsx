import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { NotebookPen, Plus, Trash2, Target, ImagePlus, CheckCircle2, Lock } from "lucide-react";
import { api, apiError, fileUrl } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { SectionCard, ProgressBar } from "@/components/Ui";
import { FileUpload } from "@/components/FileUpload";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export function DogJournal({ dogId, dogName }) {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [obj, setObj] = useState({ label: "", target: 5 });

  const load = useCallback(async () => {
    try { const { data } = await api.get(`/dogs/${dogId}/journal`); setData(data); }
    catch (e) { toast.error(apiError(e)); }
  }, [dogId]);
  useEffect(() => { load(); }, [load]);

  if (!data) return null;
  const { template, journal, can_write_all, is_owner, is_manager } = data;
  const canWrite = (sid) => can_write_all || (is_owner && (journal.owner_write_sections || []).includes(sid));

  const act = async (fn, msg) => {
    try { await fn(); if (msg) toast.success(msg); load(); } catch (e) { toast.error(apiError(e)); }
  };
  const toggleEnable = (enabled) => act(() => api.put(`/dogs/${dogId}/journal/enable`, { enabled }),
    enabled ? "Carnet activé" : "Carnet désactivé");
  const setOwnerSection = (sid, on) => {
    const cur = new Set(journal.owner_write_sections || []);
    on ? cur.add(sid) : cur.delete(sid);
    act(() => api.put(`/dogs/${dogId}/journal/owner-sections`, { owner_write_sections: [...cur] }), "Accès mis à jour");
  };
  const addText = (sid) => {
    const text = (drafts[sid] || "").trim();
    if (!text) return;
    act(() => api.post(`/dogs/${dogId}/journal/sections/${sid}/entries`, { text }), "Entrée ajoutée");
    setDrafts({ ...drafts, [sid]: "" });
  };
  const addObjective = (sid) => {
    if (!obj.label.trim()) return toast.error("Nom de l'objectif requis");
    act(() => api.post(`/dogs/${dogId}/journal/sections/${sid}/entries`,
      { label: obj.label, target: Number(obj.target) || 1 }), "Objectif ajouté");
    setObj({ label: "", target: 5 });
  };
  const bumpObjective = (sid, e, delta) =>
    act(() => api.put(`/dogs/${dogId}/journal/sections/${sid}/objectives/${e.entry_id}/progress`, { delta }));
  const addPhoto = (sid, fileId) =>
    fileId && act(() => api.post(`/dogs/${dogId}/journal/sections/${sid}/entries`, { file_id: fileId }), "Photo ajoutée");
  const del = async (sid, e) => {
    if (!(await confirmDialog("Supprimer cette entrée ?"))) return;
    act(() => api.delete(`/dogs/${dogId}/journal/sections/${sid}/entries/${e.entry_id}`), "Supprimé");
  };

  const enableRow = (
    <div className="flex flex-wrap items-center gap-4 text-sm" data-testid="journal-enable-row">
      <label className="flex items-center gap-2">
        <Checkbox checked={journal.enabled_by_owner} disabled={!is_owner && !is_manager ? true : !is_owner}
          data-testid="journal-enable-owner" onCheckedChange={(v) => is_owner && toggleEnable(!!v)} />
        Activé par le propriétaire
      </label>
      <label className="flex items-center gap-2">
        <Checkbox checked={journal.enabled_by_bureau} disabled={!is_manager}
          data-testid="journal-enable-bureau" onCheckedChange={(v) => is_manager && toggleEnable(!!v)} />
        Activé par le Bureau
      </label>
    </div>
  );

  return (
    <SectionCard title="Carnet de suivi" icon={NotebookPen} testId="dog-journal-card"
      subtitle="Objectifs, progression, séances, notes et photos — modèle défini par le Bureau.">
      {enableRow}
      {!journal.enabled_by_bureau ? (
        <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground" data-testid="journal-inactive">
          Le carnet est prêt : le Bureau doit l'activer pour commencer à le remplir. Le propriétaire peut aussi
          l'activer de son côté pour écrire dans les sections qui lui sont ouvertes.
        </p>
      ) : (
        <div className="mt-4 space-y-6" data-testid="journal-active">
          {template.sections.map((s) => {
            const items = (journal.entries || {})[s.section_id] || [];
            const writable = canWrite(s.section_id);
            return (
              <div key={s.section_id} data-testid={`journal-section-${s.section_id}`}>
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-[var(--marine)]">{s.label}</p>
                  {is_manager && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Checkbox checked={(journal.owner_write_sections || []).includes(s.section_id)}
                        data-testid={`journal-owner-write-${s.section_id}`}
                        onCheckedChange={(v) => setOwnerSection(s.section_id, !!v)} />
                      Ouvrir au propriétaire
                    </label>
                  )}
                </div>

                {s.kind === "OBJECTIVES" && (
                  <div className="mt-2 space-y-2">
                    {items.length === 0 && <p className="text-xs text-muted-foreground">Aucun objectif.</p>}
                    {items.map((e) => (
                      <div key={e.entry_id} className="rounded-lg border p-3" data-testid={`journal-objective-${e.entry_id}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-[var(--marine)]">{e.label}</span>
                          <span className="text-xs font-semibold text-[var(--bordeaux)]">{e.done}/{e.target} séances</span>
                        </div>
                        <div className="mt-1"><ProgressBar value={Math.round((e.done / e.target) * 100)} /></div>
                        {can_write_all && (
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" variant="outline" className="h-7 rounded-full px-2 text-xs"
                              data-testid={`journal-objective-inc-${e.entry_id}`} onClick={() => bumpObjective(s.section_id, e, 1)}>
                              <CheckCircle2 className="mr-1 h-3 w-3" /> +1 séance
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 rounded-full px-2 text-xs"
                              onClick={() => bumpObjective(s.section_id, e, -1)}>−1</Button>
                            <button onClick={() => del(s.section_id, e)} data-testid={`journal-del-${e.entry_id}`}
                              className="ml-auto text-muted-foreground hover:text-[var(--bordeaux)]"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        )}
                      </div>
                    ))}
                    {writable && (
                      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-2">
                        <Input className="w-48" placeholder="Nouvel objectif (ex. Rappel)" value={obj.label}
                          data-testid={`journal-objective-label-${s.section_id}`}
                          onChange={(ev) => setObj({ ...obj, label: ev.target.value })} />
                        <Input type="number" min="1" className="w-20" value={obj.target}
                          data-testid={`journal-objective-target-${s.section_id}`}
                          onChange={(ev) => setObj({ ...obj, target: ev.target.value })} />
                        <Button size="sm" className="rounded-full bg-[var(--marine)] hover:bg-[#001740]"
                          data-testid={`journal-objective-add-${s.section_id}`} onClick={() => addObjective(s.section_id)}>
                          <Target className="mr-1 h-3.5 w-3.5" /> Ajouter
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {s.kind === "TEXT" && (
                  <div className="mt-2 space-y-2">
                    {items.length === 0 && <p className="text-xs text-muted-foreground">Aucune note.</p>}
                    {items.map((e) => (
                      <div key={e.entry_id} className="rounded-lg bg-muted/40 px-3 py-2 text-sm" data-testid={`journal-text-${e.entry_id}`}>
                        <p className="whitespace-pre-wrap text-foreground/90">{e.text}</p>
                        <p className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                          <span>{e.author_name} · {new Date(e.created_at).toLocaleDateString("fr-FR")}</span>
                          {(can_write_all || (is_owner && e.by_owner)) && (
                            <button onClick={() => del(s.section_id, e)} data-testid={`journal-del-${e.entry_id}`}
                              className="hover:text-[var(--bordeaux)]"><Trash2 className="h-3.5 w-3.5" /></button>
                          )}
                        </p>
                      </div>
                    ))}
                    {writable && (
                      <div className="space-y-2">
                        <Textarea rows={2} value={drafts[s.section_id] || ""} placeholder="Ajouter une note…"
                          data-testid={`journal-text-input-${s.section_id}`}
                          onChange={(ev) => setDrafts({ ...drafts, [s.section_id]: ev.target.value })} />
                        <Button size="sm" className="rounded-full bg-[var(--marine)] hover:bg-[#001740]"
                          data-testid={`journal-text-add-${s.section_id}`} onClick={() => addText(s.section_id)}>
                          <Plus className="mr-1 h-3.5 w-3.5" /> Ajouter
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {s.kind === "PHOTOS" && (
                  <div className="mt-2 space-y-2">
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {items.map((e) => (
                        <div key={e.entry_id} className="group relative" data-testid={`journal-photo-${e.entry_id}`}>
                          <img src={fileUrl(e.file_id)} alt={e.caption || ""} className="h-24 w-full rounded-lg border object-cover" />
                          {(can_write_all || (is_owner && e.by_owner)) && (
                            <button onClick={() => del(s.section_id, e)} data-testid={`journal-del-${e.entry_id}`}
                              className="absolute right-1 top-1 rounded-full bg-black/50 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100">
                              <Trash2 className="h-3 w-3" /></button>
                          )}
                        </div>
                      ))}
                    </div>
                    {items.length === 0 && <p className="text-xs text-muted-foreground">Aucune photo.</p>}
                    {writable && (
                      <FileUpload usage="OTHER" accept="image/*" compress label="Ajouter une photo"
                        testId={`journal-photo-upload-${s.section_id}`}
                        onChange={(id) => addPhoto(s.section_id, id)} />
                    )}
                    <p className="inline-flex items-center gap-1 text-xs text-muted-foreground"><ImagePlus className="h-3 w-3" /> Compression automatique à l'envoi.</p>
                  </div>
                )}

                {!writable && s.kind !== "PHOTOS" && (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid={`journal-readonly-${s.section_id}`}><Lock className="h-3 w-3" /> Lecture seule</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
