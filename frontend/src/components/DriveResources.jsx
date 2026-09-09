import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { HardDrive, Plus, Trash2, Folder, FileText } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { SectionCard } from "@/components/Ui";
import { RowMenu, confirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

/** Connexion Google Drive — dossiers/documents de l'association liés par le Bureau, accessibles à tous. */
export const DriveResources = ({ compact = false }) => {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN_BUREAU";
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ label: "", url: "", kind: "folder" });

  const load = useCallback(() => api.get("/drive/resources")
    .then((r) => setItems(r.data.items || [])).catch(() => {}), []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.label.trim() || !form.url.trim()) { toast("Renseignez un nom et un lien Drive pour continuer."); return; }
    try {
      await api.post("/drive/resources", form);
      toast.success("Dossier Drive lié");
      setForm({ label: "", url: "", kind: "folder" }); setOpen(false); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const remove = async (r) => {
    if (!(await confirmDialog(`Délier « ${r.label} » de l'association ?`))) return;
    try { await api.delete(`/drive/resources/${r.resource_id}`); toast.success("Ressource déliée"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  if (items.length === 0 && !isAdmin) return null;

  return (
    <SectionCard title="Ressources Google Drive" icon={HardDrive} testId="drive-resources"
      className={compact ? "" : "mt-6"}
      subtitle="Dossiers et documents partagés de l'association, accessibles en lecture selon vos droits Drive."
      actions={isAdmin && (
        <Button size="sm" variant="ghost" className="rounded-full text-[var(--bordeaux)]"
          data-testid="drive-resource-add" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" /> Lier un dossier
        </Button>
      )}>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="drive-resources-empty">
          Aucune ressource Drive liée. {isAdmin ? "Ajoutez un dossier ou un document partagé." : ""}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2" data-testid="drive-resources-list">
          {items.map((r) => (
            <div key={r.resource_id} className="flex items-center gap-1 rounded-full border bg-card pl-1"
              data-testid={`drive-resource-${r.resource_id}`}>
              <a href={r.url} target="_blank" rel="noreferrer" data-testid={`drive-resource-open-${r.resource_id}`}
                className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold text-[var(--marine)] transition-colors hover:bg-muted">
                {r.kind === "document" ? <FileText className="h-3.5 w-3.5 text-[var(--bordeaux)]" />
                  : <Folder className="h-3.5 w-3.5 text-[var(--bordeaux)]" />}
                {r.label} <span className="text-[10px] text-muted-foreground">· Ouvrir dans Drive</span>
              </a>
              {isAdmin && (
                <RowMenu testId={`drive-resource-menu-${r.resource_id}`} items={[
                  { label: "Délier", icon: Trash2, danger: true,
                    testId: `drive-resource-delete-${r.resource_id}`, onSelect: () => remove(r) }]} />
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="drive-resource-dialog">
          <DialogHeader><DialogTitle>Lier un dossier ou document Drive</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Nom (ex. Photos 2026)" value={form.label} data-testid="drive-resource-label-input"
              onChange={(e) => setForm({ ...form, label: e.target.value })} />
            <Input placeholder="https://drive.google.com/…" value={form.url} data-testid="drive-resource-url-input"
              onChange={(e) => setForm({ ...form, url: e.target.value })} />
            <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
              <SelectTrigger data-testid="drive-resource-kind-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="folder">Dossier</SelectItem>
                <SelectItem value="document">Document</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} data-testid="drive-resource-cancel">Annuler</Button>
            <Button onClick={add} data-testid="drive-resource-save"
              className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]">Lier</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
};

export default DriveResources;
