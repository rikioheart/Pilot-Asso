import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Plus, ExternalLink } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState, Chip } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const USAGES = { RETOUR_ACTIVITE: "Retour d'activité", AJOUT_CHIEN: "Ajout d'un chien",
  CANDIDATURE_BENEVOLE: "Candidature bénévole", SONDAGE: "Sondage", AUTRE: "Autre" };
const ROLES = { ADMIN_BUREAU: "Bureau", PROFESSIONNEL: "Professionnels", PARTICULIER: "Particuliers" };
const EMPTY = { title: "", description: "", url: "", usage: "RETOUR_ACTIVITE",
  allowed_roles: ["ADMIN_BUREAU"] };

export default function Forms() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    const { data } = await api.get("/forms");
    setData(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post("/forms", form);
      toast.success("Formulaire ajouté");
      setOpen(false); setForm(EMPTY); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const openForm = async (item) => {
    try {
      const { data } = await api.post(`/forms/${item.form_id}/open`);
      window.open(data.url, "_blank", "noopener");
    } catch (e) { toast.error(apiError(e)); }
  };

  const toggleRole = (role) => setForm((f) => ({
    ...f, allowed_roles: f.allowed_roles.includes(role)
      ? f.allowed_roles.filter((r) => r !== role) : [...f.allowed_roles, role],
  }));

  if (!data) return <p className="text-muted-foreground" data-testid="forms-loading">Chargement…</p>;

  return (
    <div data-testid="forms-page">
      <PageHeader breadcrumb="Outils" title="Formulaires & questionnaires"
        subtitle="Retours d'activité, ajout d'un chien, candidatures : les formulaires restent hébergés à l'extérieur."
        actions={data.is_manager && (
          <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="form-create-button"
            onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nouveau formulaire
          </Button>
        )} />

      {data.items.length === 0 ? (
        <EmptyState testId="forms-empty" icon={ClipboardList} title="Aucun formulaire disponible"
          description="Le Bureau publiera ici les formulaires accessibles à votre profil." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((item) => (
            <div key={item.form_id} data-testid={`form-card-${item.form_id}`}
              className="flex flex-col rounded-xl border bg-card p-5 transition-shadow hover:shadow-md">
              <Chip tone="bordeaux">{USAGES[item.usage] || item.usage}</Chip>
              <h3 className="mt-3 font-display font-bold text-[#002060]">{item.title}</h3>
              <p className="mt-2 flex-1 text-sm text-muted-foreground">{item.description}</p>
              {item.activity_title && (
                <p className="mt-2 text-xs text-muted-foreground">Lié à : {item.activity_title}</p>
              )}
              {data.is_manager && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {(item.allowed_roles || []).map((role) => <Chip key={role} tone="muted">{ROLES[role] || role}</Chip>)}
                </div>
              )}
              <Button size="sm" className="mt-4 rounded-full bg-[#002060] hover:bg-[#001740]"
                data-testid={`form-open-${item.form_id}`} onClick={() => openForm(item)}>
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Ouvrir le formulaire
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="form-dialog">
          <DialogHeader><DialogTitle>Nouveau formulaire externe</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Titre</Label>
              <Input value={form.title} required data-testid="form-title-input"
                onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Description</Label>
              <Textarea rows={2} value={form.description} data-testid="form-description-input"
                onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Lien du formulaire</Label>
              <Input value={form.url} required placeholder="https://docs.google.com/forms/…"
                data-testid="form-url-input"
                onChange={(e) => setForm({ ...form, url: e.target.value })} /></div>
            <div><Label>Usage</Label>
              <Select value={form.usage} onValueChange={(v) => setForm({ ...form, usage: v })}>
                <SelectTrigger data-testid="form-usage-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(USAGES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div>
              <Label>Profils autorisés</Label>
              <div className="mt-2 space-y-2">
                {Object.entries(ROLES).map(([role, label]) => (
                  <label key={role} className="flex items-center gap-3 text-sm">
                    <Checkbox checked={form.allowed_roles.includes(role)}
                      onCheckedChange={() => toggleRole(role)} data-testid={`form-role-${role}`} />
                    <span className="text-muted-foreground">{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid="form-save-button">Ajouter</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
