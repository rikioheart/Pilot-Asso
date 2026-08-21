import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { FileText, Plus, AlertTriangle, Download } from "lucide-react";
import { api, apiError, fileUrl } from "@/lib/api";
import { PageHeader, EmptyState, Chip, KpiCard } from "@/components/Ui";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORIES = { CONTRAT: "Contrat", CONVENTION: "Convention", STATUTS: "Statuts",
  ASSURANCE: "Assurance", ADMINISTRATIF: "Administratif", PROCES_VERBAL: "Procès-verbal",
  SUBVENTION: "Subvention", AUTRE: "Autre" };
const STATUS = { EN_COURS: ["En cours", "amber"], SIGNE: ["Signé", "green"],
  EXPIRE: ["Expiré", "red"], A_RENOUVELER: ["À renouveler", "bordeaux"], ARCHIVE: ["Archivé", "muted"] };
const EMPTY = { title: "", category: "CONTRAT", date: new Date().toISOString().slice(0, 10),
  status: "EN_COURS", expiry_date: "", file_id: null, notes: "" };

export default function Documents() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    const { data } = await api.get("/documents");
    setData(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post("/documents", { ...form, expiry_date: form.expiry_date || null });
      toast.success("Document enregistré");
      setOpen(false); setForm(EMPTY); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const setStatus = async (item, status) => {
    try {
      await api.put(`/documents/${item.document_id}`, { status });
      toast.success("Statut mis à jour");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  if (!data) return <p className="text-muted-foreground" data-testid="documents-loading">Chargement…</p>;

  return (
    <div data-testid="documents-page">
      <PageHeader breadcrumb="Gestion" title="Contrats & documents"
        subtitle="Statuts, assurances, conventions et contrats, avec rappel automatique 30 jours avant échéance."
        actions={data.is_manager && (
          <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="document-create-button"
            onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nouveau document
          </Button>
        )} />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <KpiCard testId="documents-kpi-total" label="Documents" value={data.total} icon={FileText} />
        <KpiCard testId="documents-kpi-expiring" label="À renouveler sous 30 jours"
          value={data.expiring_count} icon={AlertTriangle} tone="bordeaux" />
        <KpiCard testId="documents-kpi-expired" label="Expirés" value={data.expired_count}
          icon={AlertTriangle} tone="bordeaux" />
      </section>

      <div className="mt-6 space-y-3">
        {data.items.length === 0 ? (
          <EmptyState testId="documents-empty" icon={FileText} title="Aucun document"
            description="Déposez les statuts, assurances et contrats de l'association (PDF ou texte)." />
        ) : data.items.map((item) => {
          const [label, tone] = STATUS[item.status] || ["—", "muted"];
          return (
            <div key={item.document_id} data-testid={`document-${item.document_id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-5 py-4">
              <div className="min-w-0">
                <p className="font-semibold text-[#002060]">{item.title}</p>
                <p className="text-xs text-muted-foreground">
                  {CATEGORIES[item.category]} · {new Date(item.date).toLocaleDateString("fr-FR")}
                  {item.expiry_date ? ` · expire le ${new Date(item.expiry_date).toLocaleDateString("fr-FR")}` : ""}
                </p>
                {item.notes && <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={tone}>{label}</Chip>
                {item.file_id && (
                  <a href={fileUrl(item.file_id, true)} target="_blank" rel="noreferrer"
                    data-testid={`document-download-${item.document_id}`}
                    className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold text-[#002060] hover:bg-muted">
                    <Download className="h-3.5 w-3.5" /> Ouvrir
                  </a>
                )}
                {data.is_manager && item.status !== "SIGNE" && (
                  <Button size="sm" variant="outline" className="rounded-full"
                    data-testid={`document-sign-${item.document_id}`}
                    onClick={() => setStatus(item, "SIGNE")}>Marquer signé</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="document-dialog">
          <DialogHeader><DialogTitle>Nouveau document</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Titre</Label>
              <Input value={form.title} required data-testid="document-title-input"
                onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Catégorie</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger data-testid="document-category-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div><Label>Statut</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger data-testid="document-status-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS).filter(([k]) => k !== "ARCHIVE").map(([k, [label]]) =>
                      <SelectItem key={k} value={k}>{label}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div><Label>Date du document</Label>
                <Input type="date" value={form.date} data-testid="document-date-input"
                  onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div><Label>Date d'expiration</Label>
                <Input type="date" value={form.expiry_date} data-testid="document-expiry-input"
                  onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></div>
            </div>
            <div><Label>Fichier (PDF ou texte uniquement)</Label>
              <FileUpload usage="OTHER" accept=".pdf,.txt,.csv" testId="document-file-upload"
                value={form.file_id} label="Déposer le document"
                onChange={(id) => setForm({ ...form, file_id: id })} /></div>
            <div><Label>Notes</Label>
              <Textarea rows={2} value={form.notes} data-testid="document-notes-input"
                onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid="document-save-button">Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
