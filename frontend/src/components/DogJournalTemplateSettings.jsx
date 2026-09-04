import { useEffect, useState } from "react";
import { toast } from "sonner";
import { NotebookPen, Plus, Trash2, GripVertical } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { SectionCard } from "@/components/Ui";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const KIND_LABELS = { TEXT: "Notes (texte)", OBJECTIVES: "Objectifs (jauges)", PHOTOS: "Photos" };

export function DogJournalTemplateSettings() {
  const [sections, setSections] = useState([]);
  const [draft, setDraft] = useState({ label: "", kind: "TEXT" });

  const load = () => api.get("/settings/dog-journal-template")
    .then((r) => setSections(r.data.sections || [])).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async (next) => {
    try {
      const { data } = await api.put("/settings/dog-journal-template", { sections: next });
      setSections(data.sections);
      toast.success("Modèle du carnet enregistré");
    } catch (e) { toast.error(apiError(e)); }
  };
  const rename = (i, label) => setSections(sections.map((s, idx) => idx === i ? { ...s, label } : s));
  const add = () => {
    if (!draft.label.trim()) return toast.error("Nom de section requis");
    save([...sections, { label: draft.label.trim(), kind: draft.kind }]);
    setDraft({ label: "", kind: "TEXT" });
  };
  const remove = async (i) => {
    if (!(await confirmDialog("Supprimer cette section du modèle ? Les entrées associées ne seront plus affichées."))) return;
    save(sections.filter((_, idx) => idx !== i));
  };

  return (
    <SectionCard title="Carnet de suivi du chien (modèle)" icon={NotebookPen} testId="dog-journal-template-card"
      className="mb-6" subtitle="Sections appliquées à tous les carnets. Ajoutez, renommez ou supprimez selon vos besoins.">
      <div className="space-y-2" data-testid="journal-template-list">
        {sections.map((s, i) => (
          <div key={s.section_id || i} className="flex flex-wrap items-center gap-2 rounded-lg border p-2"
            data-testid={`journal-template-row-${i}`}>
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <Input className="w-56" value={s.label} data-testid={`journal-template-label-${i}`}
              onChange={(e) => rename(i, e.target.value)} onBlur={() => save(sections)} />
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{KIND_LABELS[s.kind]}</span>
            <button onClick={() => remove(i)} data-testid={`journal-template-delete-${i}`}
              className="ml-auto text-muted-foreground hover:text-[var(--bordeaux)]"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2 rounded-lg border border-dashed p-3" data-testid="journal-template-add">
        <div>
          <Input className="w-56" placeholder="Nouvelle section" value={draft.label}
            data-testid="journal-template-new-label" onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
        </div>
        <Select value={draft.kind} onValueChange={(v) => setDraft({ ...draft, kind: v })}>
          <SelectTrigger className="w-48" data-testid="journal-template-new-kind"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(KIND_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k} data-testid={`journal-template-kind-${k}`}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
          data-testid="journal-template-add-button" onClick={add}><Plus className="mr-1 h-4 w-4" /> Ajouter</Button>
      </div>
    </SectionCard>
  );
}
