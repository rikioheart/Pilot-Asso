import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Wallet, Trash2, Pencil } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { confirmDialog } from "@/components/ConfirmDialog";
import { PageHeader, EmptyState } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const PAYMENT_TYPE_LABELS = { COTISATION: "Cotisation", ACTIVITE: "Activité", AUTRE: "Autre" };
export const PAYMENT_STATUS_LABELS = { PAYE: "Payé", EN_ATTENTE: "En attente", EN_RETARD: "En retard" };
export const PAYMENT_METHOD_LABELS = { ESPECES: "Espèces", CHEQUE: "Chèque", VIREMENT: "Virement", AUTRE: "Autre" };

const STATUS_TONE = {
  PAYE: "bg-[var(--status-ok-a10,#e6f4ec)] text-[var(--status-ok,#1e7f4f)]",
  EN_ATTENTE: "bg-amber-50 text-amber-700",
  EN_RETARD: "bg-orange-100 text-orange-800",
};

function StatusPill({ status, testId }) {
  return (
    <span data-testid={testId}
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[status] || "bg-muted"}`}>
      {PAYMENT_STATUS_LABELS[status] || status}
    </span>
  );
}

const EMPTY = { user_id: "", type: "COTISATION", amount: "", status: "EN_ATTENTE", label: "", method: "ESPECES", date: "", note: "" };

export default function Payments() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN_BUREAU";
  return isAdmin ? <BureauPayments /> : <MyPayments />;
}

function MyPayments() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get("/payments/me").then((r) => setItems(r.data.items || [])).catch((e) => toast.error(apiError(e)));
  }, []);
  return (
    <div data-testid="my-payments-page">
      <PageHeader breadcrumb="Mon espace" title="Mes paiements"
        subtitle="Historique des cotisations et paiements enregistrés par le Bureau (suivi manuel)." />
      {items.length === 0 ? (
        <EmptyState testId="my-payments-empty" title="Aucun paiement" description="Aucun paiement n'a encore été enregistré vous concernant." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card" data-testid="my-payments-table">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2">Date</th><th className="px-3 py-2">Objet</th><th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Montant</th><th className="px-3 py-2">Statut</th></tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.payment_id} className="border-b last:border-0" data-testid={`my-payment-${p.payment_id}`}>
                  <td className="px-3 py-2">{new Date(p.date).toLocaleDateString("fr-FR")}</td>
                  <td className="px-3 py-2">{p.label || "—"}</td>
                  <td className="px-3 py-2">{PAYMENT_TYPE_LABELS[p.type]}</td>
                  <td className="px-3 py-2 font-semibold">{Number(p.amount).toFixed(2)} €</td>
                  <td className="px-3 py-2"><StatusPill status={p.status} testId={`my-payment-status-${p.payment_id}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function BureauPayments() {
  const [data, setData] = useState({ items: [], summary: null });
  const [members, setMembers] = useState([]);
  const [filters, setFilters] = useState({ status: "", type: "" });
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/payments", { params: { status: filters.status || undefined, type: filters.type || undefined } });
      setData(data);
    } catch (e) { toast.error(apiError(e)); }
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.get("/members", { params: { status: "ACTIVE", limit: 300 } })
      .then((r) => setMembers(r.data.items || [])).catch(() => {});
  }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (p) => {
    setEditing(p);
    setForm({ user_id: p.user_id, type: p.type, amount: String(p.amount), status: p.status,
      label: p.label || "", method: p.method || "ESPECES", date: (p.date || "").slice(0, 10), note: p.note || "" });
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const payload = { ...form, amount: Number(form.amount) || 0, date: form.date || null };
    try {
      if (editing) {
        const { user_id, ...rest } = payload;
        await api.put(`/payments/${editing.payment_id}`, rest);
        toast.success("Paiement mis à jour");
      } else {
        if (!form.user_id) return toast.error("Choisissez un membre");
        await api.post("/payments", payload);
        toast.success("Paiement enregistré");
      }
      setOpen(false); load();
    } catch (err) { toast.error(apiError(err)); }
  };

  const remove = async (p) => {
    if (!(await confirmDialog("Supprimer ce paiement ?"))) return;
    try { await api.delete(`/payments/${p.payment_id}`); toast.success("Paiement supprimé"); load(); }
    catch (e) { toast.error(apiError(e)); }
  };

  const s = data.summary;

  return (
    <div data-testid="payments-page">
      <PageHeader breadcrumb="Gestion" title="Paiements"
        subtitle="Suivi manuel des paiements (cotisations, activités, autres). Aucun paiement en ligne — saisie par le Bureau."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                data-testid="payment-create-button" onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" /> Nouveau paiement
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="payment-dialog">
              <DialogHeader><DialogTitle>{editing ? "Modifier le paiement" : "Nouveau paiement"}</DialogTitle></DialogHeader>
              <form onSubmit={submit} className="space-y-4">
                {!editing && (
                  <div className="space-y-2">
                    <Label>Membre *</Label>
                    <Select value={form.user_id} onValueChange={(v) => setForm({ ...form, user_id: v })}>
                      <SelectTrigger data-testid="payment-member-select"><SelectValue placeholder="Choisir un membre" /></SelectTrigger>
                      <SelectContent>
                        {members.map((m) => (
                          <SelectItem key={m.user_id} value={m.user_id}>{m.profile?.display_name || m.email}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                      <SelectTrigger data-testid="payment-type-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PAYMENT_TYPE_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k} data-testid={`payment-type-${k}`}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Montant (€) *</Label>
                    <Input type="number" step="0.01" min="0" required value={form.amount} data-testid="payment-amount-input"
                      onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Statut</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                      <SelectTrigger data-testid="payment-status-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k} data-testid={`payment-status-${k}`}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Mode de règlement</Label>
                    <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                      <SelectTrigger data-testid="payment-method-select"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Objet</Label>
                    <Input value={form.label} placeholder="Ex. Cotisation 2026" data-testid="payment-label-input"
                      onChange={(e) => setForm({ ...form, label: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" value={form.date} data-testid="payment-date-input"
                      onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Note</Label>
                  <Textarea rows={2} value={form.note} data-testid="payment-note-input"
                    onChange={(e) => setForm({ ...form, note: e.target.value })} />
                </div>
                {!editing && (
                  <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                    Un paiement « en attente » bascule automatiquement en « en retard » après 3 semaines (21 jours).
                  </p>
                )}
                <DialogFooter>
                  <Button type="submit" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                    data-testid="payment-save-button">{editing ? "Enregistrer" : "Créer"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        } />

      {s && (
        <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="payments-summary">
          <SummaryCard label="Encaissé" value={`${s.collected.toFixed(2)} €`} tone="ok" testId="summary-collected" />
          <SummaryCard label="En attente" value={`${s.by_status.EN_ATTENTE.amount.toFixed(2)} €`} sub={`${s.by_status.EN_ATTENTE.count}`} tone="warn" testId="summary-pending" />
          <SummaryCard label="En retard" value={`${s.by_status.EN_RETARD.amount.toFixed(2)} €`} sub={`${s.by_status.EN_RETARD.count}`} tone="error" testId="summary-late" />
          <SummaryCard label="Total suivi" value={`${s.total_amount.toFixed(2)} €`} testId="summary-total" />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <Label className="text-xs">Statut</Label>
          <Select value={filters.status || "ALL"} onValueChange={(v) => setFilters({ ...filters, status: v === "ALL" ? "" : v })}>
            <SelectTrigger className="w-44" data-testid="payments-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les statuts</SelectItem>
              {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k} data-testid={`payments-filter-${k}`}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <Select value={filters.type || "ALL"} onValueChange={(v) => setFilters({ ...filters, type: v === "ALL" ? "" : v })}>
            <SelectTrigger className="w-44" data-testid="payments-type-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les types</SelectItem>
              {Object.entries(PAYMENT_TYPE_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {data.items.length === 0 ? (
        <EmptyState testId="payments-empty" title="Aucun paiement" description="Enregistrez un premier paiement avec le bouton ci-dessus." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-card" data-testid="payments-table">
          <table className="w-full min-w-[820px] text-sm">
            <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2">Date</th><th className="px-3 py-2">Membre</th><th className="px-3 py-2">Objet</th>
              <th className="px-3 py-2">Type</th><th className="px-3 py-2">Mode</th><th className="px-3 py-2">Montant</th>
              <th className="px-3 py-2">Statut</th><th className="px-3 py-2"></th></tr></thead>
            <tbody>
              {data.items.map((p) => (
                <tr key={p.payment_id} className="border-b last:border-0 hover:bg-muted/40" data-testid={`payment-row-${p.payment_id}`}>
                  <td className="px-3 py-2">{new Date(p.date).toLocaleDateString("fr-FR")}</td>
                  <td className="px-3 py-2 font-semibold text-[var(--marine)]">{p.member_name}</td>
                  <td className="px-3 py-2">{p.label || "—"}</td>
                  <td className="px-3 py-2">{PAYMENT_TYPE_LABELS[p.type]}</td>
                  <td className="px-3 py-2 text-muted-foreground">{PAYMENT_METHOD_LABELS[p.method] || "—"}</td>
                  <td className="px-3 py-2 font-semibold">{Number(p.amount).toFixed(2)} €</td>
                  <td className="px-3 py-2"><StatusPill status={p.status} testId={`payment-status-${p.payment_id}`} /></td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(p)} data-testid={`payment-edit-${p.payment_id}`}
                        className="text-muted-foreground hover:text-[var(--marine)]"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => remove(p)} data-testid={`payment-delete-${p.payment_id}`}
                        className="text-muted-foreground hover:text-[var(--bordeaux)]"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, tone, testId }) {
  const color = tone === "ok" ? "text-[var(--status-ok,#1e7f4f)]" : tone === "warn" ? "text-amber-600"
    : tone === "error" ? "text-red-600" : "text-[var(--marine)]";
  return (
    <div className="rounded-xl border bg-card p-4" data-testid={testId}>
      <p className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-muted-foreground"><Wallet className="h-3 w-3" /> {label}</p>
      <p className={`mt-1 font-display text-2xl font-extrabold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub} paiement(s)</p>}
    </div>
  );
}
