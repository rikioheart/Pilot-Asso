import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Newspaper, Plus, Trash2, Pin } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { SectionCard } from "@/components/Ui";
import { FileUpload } from "@/components/FileUpload";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CAT = { ANNONCE: "Annonce", ACTIVITE: "Activité", MEMBRE: "Nouveau membre",
  EVENEMENT: "Événement", RESULTAT: "Résultat" };
const HL = { CHIEN_SEMAINE: "Chien de la semaine", REUSSITE: "Réussite" };
const EMPTY = { title: "", body: "", category: "ANNONCE", publish_at: "", pinned: false,
  highlight_type: "CHIEN_SEMAINE", photo_file_id: null };

export function NewsManager() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(EMPTY);

  const load = () => api.get("/news/all").then((r) => setItems(r.data.items || [])).catch(() => {});
  useEffect(() => { load(); }, []);
  const refreshFeed = () => window.dispatchEvent(new Event("news:updated"));

  const create = async () => {
    if (form.title.trim().length < 2) return toast.error("Titre requis");
    try {
      await api.post("/news", {
        ...form, publish_at: form.publish_at ? new Date(form.publish_at).toISOString() : null,
        highlight_type: form.pinned ? form.highlight_type : null,
      });
      toast.success(form.publish_at && new Date(form.publish_at) > new Date() ? "Actualité programmée" : "Actualité publiée");
      setForm(EMPTY); load(); refreshFeed();
    } catch (e) { toast.error(apiError(e)); }
  };
  const pin = async (n) => {
    try {
      await api.put(`/news/${n.news_id}`, { pinned: !n.pinned, highlight_type: n.highlight_type || "CHIEN_SEMAINE" });
      load(); refreshFeed();
    } catch (e) { toast.error(apiError(e)); }
  };
  const remove = async (n) => {
    if (!(await confirmDialog("Supprimer cette actualité ?"))) return;
    try { await api.delete(`/news/${n.news_id}`); toast.success("Supprimée"); load(); refreshFeed(); }
    catch (e) { toast.error(apiError(e)); }
  };

  return (
    <SectionCard title="Fil d'actualité" icon={Newspaper} testId="news-manager" className="mb-6"
      subtitle="Publiez de courtes actualités (non commentables). Épinglez une mise en avant « Chien de la semaine » ou « Réussite ».">
      <div className="space-y-3 rounded-lg border border-dashed p-4" data-testid="news-form">
        <Input placeholder="Titre" value={form.title} data-testid="news-title-input"
          onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Textarea rows={2} placeholder="Message court (facultatif)" value={form.body} data-testid="news-body-input"
          onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label className="text-xs">Catégorie</Label>
            <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
              <SelectTrigger data-testid="news-category-select"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CAT).map(([k, v]) => <SelectItem key={k} value={k} data-testid={`news-cat-${k}`}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Programmer le (facultatif)</Label>
            <Input type="datetime-local" value={form.publish_at} data-testid="news-publish-input"
              onChange={(e) => setForm({ ...form, publish_at: e.target.value })} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={form.pinned} data-testid="news-pin-checkbox"
            onCheckedChange={(v) => setForm({ ...form, pinned: !!v })} />
          Épingler comme mise en avant
        </label>
        {form.pinned && (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">Type de mise en avant</Label>
              <Select value={form.highlight_type} onValueChange={(v) => setForm({ ...form, highlight_type: v })}>
                <SelectTrigger className="w-52" data-testid="news-highlight-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(HL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <FileUpload usage="OTHER" accept="image/*" compress preview label="Photo de mise en avant"
              testId="news-photo-upload" value={form.photo_file_id}
              onChange={(id) => setForm({ ...form, photo_file_id: id })} />
          </div>
        )}
        <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
          data-testid="news-create-button" onClick={create}><Plus className="mr-1 h-4 w-4" /> Publier</Button>
      </div>

      <div className="mt-4 space-y-2" data-testid="news-manager-list">
        {items.map((n) => (
          <div key={n.news_id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-sm"
            data-testid={`news-manage-${n.news_id}`}>
            <div>
              <span className="font-semibold text-[var(--marine)]">{n.title}</span>
              <span className="ml-2 text-xs text-muted-foreground">{CAT[n.category]} · {new Date(n.publish_at).toLocaleDateString("fr-FR")}</span>
              {n.scheduled && <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700">programmée</span>}
              {n.pinned && n.highlight_type && <span className="ml-2 rounded-full bg-[var(--bordeaux-a10)] px-2 py-0.5 text-xs text-[var(--bordeaux)]">{HL[n.highlight_type]}</span>}
            </div>
            <div className="flex gap-1">
              <button onClick={() => pin(n)} data-testid={`news-pin-${n.news_id}`} title="Épingler"
                className={`rounded p-1 ${n.pinned ? "text-[var(--bordeaux)]" : "text-muted-foreground hover:text-[var(--marine)]"}`}><Pin className="h-4 w-4" /></button>
              <button onClick={() => remove(n)} data-testid={`news-delete-${n.news_id}`}
                className="rounded p-1 text-muted-foreground hover:text-[var(--bordeaux)]"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
