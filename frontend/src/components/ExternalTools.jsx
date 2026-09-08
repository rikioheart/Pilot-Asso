import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Wrench, Plus, Trash2, ExternalLink } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { SectionCard } from "@/components/Ui";
import { RowMenu, confirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

/** Prompt 9 — Accès rapide aux outils externes récurrents (configurés par le Bureau, visibles par tous). */
export const ExternalTools = ({ compact = false }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN_BUREAU";
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: "", url: "" });

  const load = useCallback(() => api.get("/external-tools")
    .then((r) => setItems(r.data.items || [])).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.label.trim() || !form.url.trim()) { toast("Renseignez un nom et un lien pour ajouter l'outil."); return; }
    try {
      await api.post("/external-tools", { label: form.label, url: form.url });
      toast.success("Outil ajouté");
      setForm({ label: "", url: "" }); setOpen(false); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const remove = async (tool) => {
    if (!(await confirmDialog(`Retirer « ${tool.label} » des outils de l'association ?`))) return;
    try { await api.delete(`/external-tools/${tool.tool_id}`); toast.success("Outil retiré"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  if (items.length === 0 && !isAdmin) return null;

  return (
    <div id="outils" className="scroll-mt-24">
    <SectionCard title="Outils externes" icon={Wrench} testId="external-tools" className={compact ? "" : "mt-6"}
      subtitle="Les outils récurrents de l'association, à portée de clic."
      actions={isAdmin && (
        <Button size="sm" variant="ghost" className="rounded-full text-[var(--bordeaux)]"
          data-testid="external-tools-add" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Ajouter
        </Button>
      )}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="external-tools-empty">
          Aucun outil pour l'instant. {isAdmin ? "Ajoutez Google Drive, Canva, Rintintin Pro…" : ""}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2" data-testid="external-tools-list">
          {items.map((t) => (
            <div key={t.tool_id} className="flex items-center gap-1 rounded-full border bg-card pl-1"
              data-testid={`external-tool-${t.tool_id}`}>
              <a href={t.url} target="_blank" rel="noreferrer" data-testid={`external-tool-link-${t.tool_id}`}
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--marine)] transition-colors hover:bg-muted">
                <ExternalLink className="h-3.5 w-3.5 text-[var(--bordeaux)]" /> {t.label}
              </a>
              {isAdmin && (
                <RowMenu testId={`external-tool-menu-${t.tool_id}`} items={[
                  { label: "Retirer l'outil", icon: Trash2, danger: true,
                    testId: `external-tool-delete-${t.tool_id}`, onSelect: () => remove(t) }]} />
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="external-tool-dialog">
          <DialogHeader><DialogTitle>Ajouter un outil externe</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nom (ex. Google Drive)" value={form.label} data-testid="external-tool-label-input"
              onChange={(e) => setForm({ ...form, label: e.target.value })} />
            <Input placeholder="https://…" value={form.url} data-testid="external-tool-url-input"
              onChange={(e) => setForm({ ...form, url: e.target.value })} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} data-testid="external-tool-cancel">Annuler</Button>
            <Button onClick={add} data-testid="external-tool-save"
              className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]">Ajouter</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
    </div>
  );
};

export default ExternalTools;
