import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Receipt, Plus, Check, X, Clock } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState, Chip, KpiCard } from "@/components/Ui";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const STATUS = { PENDING: ["En attente", "amber"], APPROVED: ["Approuvé", "marine"],
  PAID: ["Effectué", "green"], REFUSED: ["Refusé", "red"] };

export default function Reimbursements() {
  const [data, setData] = useState(null);
  const [members, setMembers] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ beneficiary_id: "", reason: "", amount: "",
    request_date: new Date().toISOString().slice(0, 10), proof_file_id: null, notes: "" });

  const load = useCallback(async () => {
    const { data } = await api.get("/finance/reimbursements");
    setData(data);
  }, []);

  useEffect(() => {
    load();
    api.get("/members").then((r) => setMembers(r.data.items || [])).catch(() => {});
  }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post("/finance/reimbursements", { ...form, amount: Number(form.amount),
        beneficiary_id: form.beneficiary_id || null });
      toast.success("Demande enregistrée");
      setOpen(false); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const setStatus = async (item, status) => {
    try {
      await api.put(`/finance/reimbursements/${item.reimbursement_id}`, { status });
      toast.success("Remboursement mis à jour");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  if (!data) return <p className="text-muted-foreground" data-testid="reimbursements-loading">Chargement…</p>;

  return (
    <div data-testid="reimbursements-page">
      <PageHeader breadcrumb="Gestion" title="Remboursements"
        subtitle="Les frais avancés par les bénévoles et professionnels, validés puis réglés par le Bureau."
        actions={
          <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" data-testid="reimbursement-create-button"
            onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nouvelle demande
          </Button>
        } />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard testId="reimbursement-kpi-total" label="Demandes" value={data.total} icon={Receipt} />
        <KpiCard testId="reimbursement-kpi-pending" label="À régler"
          value={`${data.pending_amount.toFixed(2)} €`} icon={Clock} tone="bordeaux" />
      </section>

      <div className="mt-6 space-y-3">
        {data.items.length === 0 ? (
          <EmptyState testId="reimbursements-empty" icon={Receipt} title="Aucune demande"
            description="Les frais avancés pour l'association apparaîtront ici avec leur justificatif." />
        ) : data.items.map((item) => {
          const [label, tone] = STATUS[item.status] || ["—", "muted"];
          return (
            <div key={item.reimbursement_id} data-testid={`reimbursement-${item.reimbursement_id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-5 py-4">
              <div className="min-w-0">
                <p className="font-semibold text-[var(--marine)]">{item.beneficiary_name}</p>
                <p className="text-sm text-muted-foreground">{item.reason}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Demandé le {new Date(item.request_date).toLocaleDateString("fr-FR")}
                  {item.paid_date ? ` · réglé le ${new Date(item.paid_date).toLocaleDateString("fr-FR")}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg font-extrabold text-[var(--bordeaux)]">
                  {item.amount.toFixed(2)} €
                </span>
                <Chip tone={tone}>{label}</Chip>
                {item.status === "PENDING" && (
                  <>
                    <Button size="sm" variant="outline" className="rounded-full"
                      data-testid={`reimbursement-approve-${item.reimbursement_id}`}
                      onClick={() => setStatus(item, "APPROVED")}>
                      <Check className="mr-1.5 h-3.5 w-3.5" /> Approuver
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-full"
                      data-testid={`reimbursement-refuse-${item.reimbursement_id}`}
                      onClick={() => setStatus(item, "REFUSED")}>
                      <X className="mr-1.5 h-3.5 w-3.5" /> Refuser
                    </Button>
                  </>
                )}
                {["PENDING", "APPROVED"].includes(item.status) && (
                  <Button size="sm" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                    data-testid={`reimbursement-pay-${item.reimbursement_id}`}
                    onClick={() => setStatus(item, "PAID")}>Marquer réglé</Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="reimbursement-dialog">
          <DialogHeader><DialogTitle>Nouvelle demande de remboursement</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Bénéficiaire</Label>
              <Select value={form.beneficiary_id} onValueChange={(v) => setForm({ ...form, beneficiary_id: v })}>
                <SelectTrigger data-testid="reimbursement-beneficiary-select">
                  <SelectValue placeholder="Choisir un membre" />
                </SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.profile?.display_name || m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select></div>
            <div><Label>Motif</Label>
              <Input value={form.reason} required data-testid="reimbursement-reason-input"
                onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Montant (€)</Label>
                <Input type="number" step="0.01" value={form.amount} required data-testid="reimbursement-amount-input"
                  onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div><Label>Date de la dépense</Label>
                <Input type="date" value={form.request_date} data-testid="reimbursement-date-input"
                  onChange={(e) => setForm({ ...form, request_date: e.target.value })} /></div>
            </div>
            <div><Label>Justificatif</Label>
              <FileUpload usage="OTHER" testId="reimbursement-proof-upload" value={form.proof_file_id}
                label="Joindre le justificatif"
                onChange={(id) => setForm({ ...form, proof_file_id: id })} /></div>
            <div><Label>Commentaire</Label>
              <Textarea rows={2} value={form.notes} data-testid="reimbursement-notes-input"
                onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                data-testid="reimbursement-save-button">Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
