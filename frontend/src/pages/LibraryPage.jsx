import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Library as LibraryIcon, Plus, Download, ExternalLink, Eye, Lock } from "lucide-react";
import { api, apiError, fileUrl } from "@/lib/api";
import { PageHeader, EmptyState, Chip } from "@/components/Ui";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";

const KINDS = { PDF: "PDF", GUIDE: "Guide", FICHE_PRATIQUE: "Fiche pratique", MODELE: "Modèle",
  PRODUIT_NUMERIQUE: "Produit numérique", AUDIO: "Audio", VIDEO: "Vidéo / replay" };
const ACCESS = { MEMBERS: "Adhérents", PROFESSIONALS: "Professionnels", BUREAU: "Bureau", PUBLIC: "Public" };
const EMPTY = { title: "", description: "", kind: "PDF", content_type: "FILE", file_id: null,
  external_url: "", external_platform: "YOUTUBE", access_level: "MEMBERS",
  public_price: "", member_price: "", tags: "" };

export default function LibraryPage() {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [log, setLog] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/library");
    setData(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post("/library", {
        ...form,
        tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
        public_price: form.public_price ? Number(form.public_price) : null,
        member_price: form.member_price ? Number(form.member_price) : null,
        external_url: form.content_type === "EXTERNAL_LINK" ? form.external_url : null,
        file_id: form.content_type === "FILE" ? form.file_id : null,
      });
      toast.success("Ressource ajoutée");
      setOpen(false); setForm(EMPTY); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const openItem = async (item) => {
    try {
      const { data } = await api.post(`/library/${item.item_id}/download`);
      if (data.external_url) window.open(data.external_url, "_blank", "noopener");
      else if (data.file_id) window.open(fileUrl(data.file_id, true), "_blank", "noopener");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const showLog = async () => {
    const { data } = await api.get("/library/access-log");
    setLog(data.items);
  };

  if (!data) return <p className="text-muted-foreground" data-testid="library-loading">Chargement…</p>;

  return (
    <div data-testid="library-page">
      <PageHeader breadcrumb="Contenu exclusif" title="Bibliothèque des adhérents"
        subtitle="PDF, guides, fiches pratiques et replays réservés aux membres de l'association."
        actions={
          <div className="flex flex-wrap gap-2">
            {data.is_manager && (
              <Button variant="outline" className="rounded-full" data-testid="library-log-button" onClick={showLog}>
                <Eye className="mr-2 h-4 w-4" /> Consultations
              </Button>
            )}
            {can("library.upload") && (
              <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="library-create-button"
                onClick={() => setOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Ajouter une ressource
              </Button>
            )}
          </div>
        } />

      {data.items.length === 0 ? (
        <EmptyState testId="library-empty" icon={LibraryIcon} title="La bibliothèque est encore vide"
          description="Guides, fiches pratiques et replays seront déposés ici par le Bureau." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((item) => (
            <div key={item.item_id} data-testid={`library-card-${item.item_id}`}
              className="flex flex-col rounded-xl border bg-card p-5 transition-shadow hover:shadow-md">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone="bordeaux">{KINDS[item.kind] || item.kind}</Chip>
                <Chip tone="marine"><Lock className="h-3 w-3" /> {ACCESS[item.access_level]}</Chip>
                {item.status !== "ACTIVE" && <Chip tone="amber">{item.status === "PENDING_REVIEW" ? "À valider" : item.status}</Chip>}
              </div>
              <h3 className="mt-3 font-display text-base font-bold text-[#002060]">{item.title}</h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground line-clamp-3">{item.description}</p>
              {(item.member_price || item.public_price) && (
                <p className="mt-3 text-sm" data-testid={`library-price-${item.item_id}`}>
                  {item.member_price != null ? (
                    <>
                      <span className="font-display text-lg font-extrabold text-[#800020]">
                        {item.member_price.toFixed(2)} €
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground line-through">
                        {item.public_price?.toFixed(2)} €
                      </span>
                      <span className="ml-2 text-xs font-semibold text-emerald-700">tarif adhérent</span>
                    </>
                  ) : (
                    <span className="font-semibold text-[#002060]">{item.public_price.toFixed(2)} €</span>
                  )}
                </p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">{item.download_count || 0} consultation(s)</p>
              <Button size="sm" className="mt-4 rounded-full bg-[#002060] hover:bg-[#001740]"
                data-testid={`library-open-${item.item_id}`} onClick={() => openItem(item)}>
                {item.content_type === "EXTERNAL_LINK"
                  ? <><ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Ouvrir le contenu</>
                  : <><Download className="mr-1.5 h-3.5 w-3.5" /> Télécharger</>}
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto" data-testid="library-dialog">
          <DialogHeader><DialogTitle>Ajouter une ressource</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Titre</Label>
              <Input value={form.title} required data-testid="library-title-input"
                onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Description</Label>
              <Textarea rows={3} value={form.description} data-testid="library-description-input"
                onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Type</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger data-testid="library-kind-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(KINDS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div><Label>Accès</Label>
                <Select value={form.access_level} onValueChange={(v) => setForm({ ...form, access_level: v })}>
                  <SelectTrigger data-testid="library-access-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ACCESS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div><Label>Tarif public (€)</Label>
                <Input type="number" step="0.01" value={form.public_price} data-testid="library-public-price-input"
                  onChange={(e) => setForm({ ...form, public_price: e.target.value })} /></div>
              <div><Label>Tarif adhérent (€)</Label>
                <Input type="number" step="0.01" value={form.member_price} data-testid="library-member-price-input"
                  onChange={(e) => setForm({ ...form, member_price: e.target.value })} /></div>
            </div>
            <div><Label>Support</Label>
              <Select value={form.content_type} onValueChange={(v) => setForm({ ...form, content_type: v })}>
                <SelectTrigger data-testid="library-content-type-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FILE">Fichier hébergé (PDF, document)</SelectItem>
                  <SelectItem value="EXTERNAL_LINK">Lien externe (vidéo, visio, Drive)</SelectItem>
                </SelectContent>
              </Select></div>
            {form.content_type === "FILE" ? (
              <FileUpload usage="LIBRARY" testId="library-file-upload" value={form.file_id}
                label="Déposer le PDF ou le document"
                onChange={(id) => setForm({ ...form, file_id: id })} />
            ) : (
              <div><Label>Lien externe</Label>
                <Input value={form.external_url} placeholder="https://" data-testid="library-url-input"
                  onChange={(e) => setForm({ ...form, external_url: e.target.value })} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Aucune vidéo n'est stockée sur la plateforme : seul le lien est enregistré.
                </p>
              </div>
            )}
            <div><Label>Mots-clés (virgules)</Label>
              <Input value={form.tags} data-testid="library-tags-input"
                onChange={(e) => setForm({ ...form, tags: e.target.value })} /></div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid="library-save-button">Ajouter</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!log} onOpenChange={() => setLog(null)}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto" data-testid="library-log-dialog">
          <DialogHeader><DialogTitle>Journal des consultations</DialogTitle></DialogHeader>
          {log?.length === 0 ? <p className="text-sm text-muted-foreground">Aucune consultation enregistrée.</p> : (
            <ul className="space-y-2">
              {log?.map((entry) => (
                <li key={entry.download_id} className="rounded-lg border px-3 py-2 text-sm">
                  <p className="font-semibold text-[#002060]">{entry.user_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.item_title} — {new Date(entry.created_at).toLocaleString("fr-FR")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
