import { useState } from "react";
import { toast } from "sonner";
import { Link2, Trash2, ExternalLink, HardDrive } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { RowMenu, confirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Prompt 9/Drive — Liens externes ou Google Drive attachés à une tâche ou un projet. */
export const ExternalLinks = ({ kind, id, links = [], onChange, canEdit = true, testId = "links", variant = "external" }) => {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ label: "", url: "" });
  const isDrive = variant === "drive";
  const channel = isDrive ? "drive" : "external";
  const Icon = isDrive ? HardDrive : ExternalLink;

  const add = async () => {
    if (!form.label.trim() || !form.url.trim()) { toast("Ajoutez un nom et un lien pour continuer."); return; }
    try {
      await api.post(`/${kind}/${id}/links`, { label: form.label, url: form.url }, { params: { channel } });
      toast.success(isDrive ? "Lien Drive ajouté" : "Lien ajouté");
      setForm({ label: "", url: "" }); setAdding(false); onChange?.();
    } catch (e) { toast.error(apiError(e)); }
  };

  const remove = async (link) => {
    if (!(await confirmDialog(`Retirer le lien « ${link.label} » ?`))) return;
    try { await api.delete(`/${kind}/${id}/links/${link.link_id}`, { params: { channel } }); toast.success("Lien retiré"); onChange?.(); }
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
                title={isDrive ? "Ouvrir dans Drive" : l.url}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold text-[var(--marine)] transition-colors hover:bg-muted">
                <Icon className="h-3 w-3 text-[var(--bordeaux)]" /> {l.label}
                {isDrive && <span className="text-[10px] text-muted-foreground">· Ouvrir dans Drive</span>}
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
          <Input placeholder={isDrive ? "Nom (ex. Dossier photos)" : "Nom (ex. Canva)"} value={form.label}
            data-testid={`${testId}-label-input`} onChange={(e) => setForm({ ...form, label: e.target.value })}
            className="h-8 w-36" />
          <Input placeholder={isDrive ? "https://drive.google.com/…" : "https://…"} value={form.url}
            data-testid={`${testId}-url-input`} onChange={(e) => setForm({ ...form, url: e.target.value })}
            className="h-8 w-52" />
          <Button size="sm" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
            data-testid={`${testId}-save`} onClick={add}>Ajouter</Button>
          <Button size="sm" variant="ghost" data-testid={`${testId}-cancel`} onClick={() => setAdding(false)}>Annuler</Button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} data-testid={`${testId}-add`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--bordeaux)] hover:underline">
          {isDrive ? <HardDrive className="h-3.5 w-3.5" /> : <Link2 className="h-3.5 w-3.5" />}
          {isDrive ? "Ajouter un lien Drive" : "Ajouter un lien externe"}
        </button>
      ))}
    </div>
  );
};

export default ExternalLinks;
