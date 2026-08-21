import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Wallet, Receipt, Plus, Clock } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, KpiCard, SectionCard, EmptyState, Chip } from "@/components/Ui";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const STATUS = { PENDING: ["En attente", "amber"], APPROVED: ["Approuvé", "marine"],
  PAID: ["Réglé", "green"], REFUSED: ["Refusé", "red"] };

export default function MyShares() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ reason: "", amount: "", proof_file_id: null,
    request_date: new Date().toISOString().slice(0, 10) });

  const load = useCallback(async () => {
    const { data } = await api.get("/finance/my-shares");
    setData(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post("/finance/reimbursements", { ...form, amount: Number(form.amount) });
      toast.success("Demande envoyée au Bureau");
      setOpen(false); setForm({ ...form, reason: "", amount: "", proof_file_id: null }); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  if (!data) return <p className="text-muted-foreground" data-testid="my-shares-loading">Chargement…</p>;

  return (
    <div data-testid="my-shares-page">
      <PageHeader breadcrumb="Mon espace" title="Mes parts & mes frais"
        subtitle="Vos parts sur les activités encadrées et vos demandes de remboursement."
        actions={
          <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="my-reimbursement-button"
            onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Demander un remboursement
          </Button>
        } />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <KpiCard testId="shares-kpi-total" label="Total de mes parts"
          value={`${data.totals.total.toFixed(2)} €`} icon={Wallet} />
        <KpiCard testId="shares-kpi-paid" label="Déjà versé"
          value={`${data.totals.paid.toFixed(2)} €`} icon={Wallet} />
        <KpiCard testId="shares-kpi-pending" label="En attente de versement"
          value={`${data.totals.pending.toFixed(2)} €`} icon={Clock} tone="bordeaux" />
      </section>

      <SectionCard title="Détail de mes parts" icon={Wallet} testId="shares-list" className="mt-6">
        {data.items.length === 0 ? (
          <EmptyState testId="shares-empty" icon={Wallet} title="Aucune part enregistrée"
            description="Vos parts apparaîtront ici après chaque activité encadrée et répartie par le Bureau." />
        ) : (
          <ul className="space-y-2">
            {data.items.map((line) => (
              <li key={line.line_id} data-testid={`share-line-${line.line_id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm">
                <span>
                  <span className="font-semibold text-[#002060]">{line.label}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(line.date).toLocaleDateString("fr-FR")} ·
                    {line.mode === "PERCENT" ? ` ${line.value} %` : " montant fixe"}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-display font-bold text-[#800020]">{line.computed_amount.toFixed(2)} €</span>
                  <Chip tone={line.status === "PAID" ? "green" : "amber"}>
                    {line.status === "PAID" ? "Réglée" : "En attente"}
                  </Chip>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Mes remboursements" icon={Receipt} testId="my-reimbursements" className="mt-6">
        {data.reimbursements.length === 0 ? (
          <EmptyState testId="my-reimbursements-empty" icon={Receipt} title="Aucune demande"
            description="Vous avez avancé des frais pour l'association ? Demandez un remboursement." />
        ) : (
          <ul className="space-y-2">
            {data.reimbursements.map((item) => {
              const [label, tone] = STATUS[item.status] || ["—", "muted"];
              return (
                <li key={item.reimbursement_id} data-testid={`my-reimbursement-${item.reimbursement_id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm">
                  <span>
                    <span className="font-semibold text-[#002060]">{item.reason}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {new Date(item.request_date).toLocaleDateString("fr-FR")}
                    </span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-display font-bold text-[#800020]">{item.amount.toFixed(2)} €</span>
                    <Chip tone={tone}>{label}</Chip>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent data-testid="my-reimbursement-dialog">
          <DialogHeader><DialogTitle>Demande de remboursement</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Motif</Label>
              <Input value={form.reason} required data-testid="my-reimbursement-reason-input"
                onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Montant (€)</Label>
                <Input type="number" step="0.01" value={form.amount} required
                  data-testid="my-reimbursement-amount-input"
                  onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div><Label>Date</Label>
                <Input type="date" value={form.request_date} data-testid="my-reimbursement-date-input"
                  onChange={(e) => setForm({ ...form, request_date: e.target.value })} /></div>
            </div>
            <FileUpload usage="OTHER" testId="my-reimbursement-proof" value={form.proof_file_id}
              label="Joindre le justificatif" onChange={(id) => setForm({ ...form, proof_file_id: id })} />
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid="my-reimbursement-save">Envoyer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
