import { useState } from "react";
import { toast } from "sonner";
import { Link2, Plus, Trash2, ExternalLink } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { RowMenu, confirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Prompt 9 — Liens externes attachés à une tâche ou un projet. */
export const ExternalLinks = ({ kind, id, links = [], onChange, canEdit = true, testId = "links" }) => {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: "", url: "" });

  const add = async () => {
    if (!form.label.trim() || !form.url.trim()) { toast("Ajoutez un nom et un lien pour continuer."); return; }
    try {
      await api.post(`/${kind}/${id}/links`, { label: form.label, url: form.url });
      toast.success("Lien ajouté");
      setForm({ label: "", url: "" }); setAdding(false); onChange?.();
    } catch (e) { toast.error(apiError(e)); }
  };

  const remove = async (link) => {
    if (!(await confirmDialog(`Retirer le lien « ${link.label} » ?`))) return;
    try { await api.delete(`/${kind}/${id}/links/${link.link_id}`); toast.success("Lien retiré"); onChange?.(); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <div className="space-y-2" data-testid={testId}>
      {links.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {links.map((l) => (
            <div key={l.link_id} className="flex items-center gap-1 rounded-full border bg-card pl-1"
              data-testid={`${testId}-item-${l.link_id}`}>
              <a href={l.url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-[var(--marine)] transition-colors hover:bg-muted">
                <ExternalLink className="h-3 w-3 text-[var(--bordeaux)]" /> {l.label}
              </a>
              {canEdit && (
                <RowMenu testId={`${testId}-menu-${l.link_id}`} items={[
                  { label: "Retirer ce lien", icon: Trash2, danger: true,
                    testId: `${testId}-delete-${l.link_id}`, onSelect: () => remove(l) }]} />
              )}
            </div>
          ))}
        </div>
      )}
      {canEdit && (adding ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input placeholder="Nom (ex. Canva)" value={form.label} data-testid={`${testId}-label-input`}
            onChange={(e) => setForm({ ...form, label: e.target.value })} className="h-8 w-36" />
          <Input placeholder="https://…" value={form.url} data-testid={`${testId}-url-input`}
            onChange={(e) => setForm({ ...form, url: e.target.value })} className="h-8 w-52" />
          <Button size="sm" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
            data-testid={`${testId}-save`} onClick={add}>Ajouter</Button>
          <Button size="sm" variant="ghost" data-testid={`${testId}-cancel`} onClick={() => setAdding(false)}>Annuler</Button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} data-testid={`${testId}-add`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--bordeaux)] hover:underline">
          <Link2 className="h-3.5 w-3.5" /> Ajouter un lien externe
        </button>
      ))}
    </div>
  );
};

export default ExternalLinks;
