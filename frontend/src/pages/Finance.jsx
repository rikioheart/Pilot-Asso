import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Wallet, Plus, Download, TrendingUp, TrendingDown, PiggyBank, Users } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, KpiCard, SectionCard, EmptyState, Chip } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORIES = ["COTISATION", "ACTIVITE", "EVENEMENT", "PARTENARIAT", "ACHAT", "DON",
  "PRODUIT_NUMERIQUE", "REMBOURSEMENT", "SUBVENTION", "AUTRE"];
const EMPTY = { direction: "IN", date: new Date().toISOString().slice(0, 10), amount: "",
  category: "COTISATION", description: "", payment_method: "VIREMENT" };
const SHARE_EMPTY = { label: "", date: new Date().toISOString().slice(0, 10), total_amount: "",
  scope: "EVENT", lines: [] };

export default function Finance() {
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [distributions, setDistributions] = useState([]);
  const [pros, setPros] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [shareOpen, setShareOpen] = useState(false);
  const [share, setShare] = useState(SHARE_EMPTY);

  const load = useCallback(async () => {
    const [s, t, d] = await Promise.all([
      api.get("/finance/summary"), api.get("/finance/transactions"), api.get("/finance/distributions"),
    ]);
    setSummary(s.data); setTransactions(t.data); setDistributions(d.data.items);
  }, []);

  useEffect(() => {
    load();
    api.get("/members?role=PROFESSIONNEL").then((r) => setPros(r.data.items || [])).catch(() => {});
  }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post("/finance/transactions", { ...form, amount: Number(form.amount) });
      toast.success("Écriture enregistrée");
      setOpen(false); setForm(EMPTY); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const submitShare = async (event) => {
    event.preventDefault();
    const lines = share.lines.filter((l) => l.professional_id && l.value);
    if (lines.length === 0) return toast.error("Ajoutez au moins un professionnel avec sa part.");
    try {
      await api.post("/finance/distributions", {
        ...share, total_amount: Number(share.total_amount),
        lines: lines.map((l) => ({ ...l, value: Number(l.value) })),
      });
      toast.success("Répartition calculée et professionnels prévenus");
      setShareOpen(false); setShare(SHARE_EMPTY); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const exportCsv = async () => {
    try {
      const { data } = await api.get(`/finance/export?year=${summary.year}`, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `finances-lavoixduchien-${summary.year}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error(apiError(e)); }
  };

  const payLine = async (line) => {
    try {
      await api.post(`/finance/distribution-lines/${line.line_id}/pay`);
      toast.success("Part marquée comme réglée");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  if (!summary || !transactions) return <p className="text-muted-foreground" data-testid="finance-loading">Chargement…</p>;

  return (
    <div data-testid="finance-page">
      <PageHeader breadcrumb="Gestion" title="Finances opérationnelles"
        subtitle="Recettes, dépenses et parts professionnels. Suivi manuel, aucun paiement en ligne."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" data-testid="finance-export-link"
              onClick={exportCsv}>
              <Download className="mr-2 h-4 w-4" /> Exporter (CSV)
            </Button>
            <Button variant="outline" className="rounded-full" data-testid="finance-share-button"
              onClick={() => setShareOpen(true)}>
              <Users className="mr-2 h-4 w-4" /> Répartir des recettes
            </Button>
            <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="finance-create-button"
              onClick={() => setOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Nouvelle écriture
            </Button>
          </div>
        } />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <KpiCard testId="finance-kpi-in" label="Recettes" value={`${summary.totals.in.toFixed(2)} €`} icon={TrendingUp} />
        <KpiCard testId="finance-kpi-out" label="Dépenses" value={`${summary.totals.out.toFixed(2)} €`}
          icon={TrendingDown} tone="bordeaux" />
        <KpiCard testId="finance-kpi-net" label="Résultat net" value={`${summary.totals.net.toFixed(2)} €`}
          icon={PiggyBank} />
        <KpiCard testId="finance-kpi-shares" label="Parts à verser"
          value={`${summary.pending_shares.total.toFixed(2)} €`} icon={Users} tone="bordeaux"
          hint={`${summary.pending_shares.count} part(s)`} />
        <KpiCard testId="finance-kpi-reimb" label="Remboursements en attente"
          value={`${summary.pending_reimbursements.total.toFixed(2)} €`} icon={Wallet} tone="bordeaux"
          hint={`${summary.pending_reimbursements.count} demande(s)`} />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <SectionCard title={`Recettes et dépenses ${summary.year}`} icon={BarChartIcon} testId="finance-chart">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary.by_month}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${v} €`} />
                <Bar dataKey="in" name="Recettes" fill="#002060" radius={[4, 4, 0, 0]} />
                <Bar dataKey="out" name="Dépenses" fill="#800020" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {summary.by_quarter.map((q) => (
              <div key={q.quarter} className="rounded-lg bg-muted/60 p-3" data-testid={`finance-quarter-${q.quarter}`}>
                <p className="text-xs font-semibold uppercase text-muted-foreground">{q.quarter}</p>
                <p className="mt-1 font-display text-lg font-extrabold text-[#002060]">{q.net.toFixed(2)} €</p>
                <p className="text-xs text-muted-foreground">{q.in.toFixed(0)} € / -{q.out.toFixed(0)} €</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Par catégorie" testId="finance-categories">
          {summary.by_category.length === 0
            ? <p className="text-sm text-muted-foreground">Aucune écriture cette année.</p>
            : (
              <ul className="space-y-2">
                {summary.by_category.map((c) => (
                  <li key={c.category} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                    <span className="font-semibold text-[#002060]">{c.label}</span>
                    <span className="text-xs">
                      <span className="text-emerald-700">+{c.in.toFixed(0)} €</span>{" "}
                      <span className="text-[#800020]">-{c.out.toFixed(0)} €</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
        </SectionCard>
      </div>

      <SectionCard title="Dernières écritures" testId="finance-transactions" className="mt-6">
        {transactions.items.length === 0 ? (
          <EmptyState testId="finance-empty" icon={Wallet} title="Aucune écriture"
            description="Saisissez vos recettes et dépenses pour suivre la santé de l'association." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-4">Date</th><th className="pr-4">Description</th>
                <th className="pr-4">Catégorie</th><th className="pr-4 text-right">Montant</th>
              </tr></thead>
              <tbody>
                {transactions.items.slice(0, 25).map((t) => (
                  <tr key={t.transaction_id} className="border-b last:border-0"
                    data-testid={`finance-row-${t.transaction_id}`}>
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {new Date(t.date).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="pr-4 font-medium text-[#002060]">{t.description}</td>
                    <td className="pr-4"><Chip tone="muted">{t.category}</Chip></td>
                    <td className={`pr-4 text-right font-display font-bold ${
                      t.direction === "IN" ? "text-emerald-700" : "text-[#800020]"}`}>
                      {t.direction === "IN" ? "+" : "-"}{t.amount.toFixed(2)} €
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Parts professionnels" icon={Users} testId="finance-distributions" className="mt-6">
        {distributions.length === 0 ? (
          <EmptyState testId="finance-distributions-empty" icon={Users} title="Aucune répartition"
            description="Saisissez le montant encaissé d'une activité et répartissez-le entre les professionnels." />
        ) : (
          <div className="space-y-4">
            {distributions.map((d) => (
              <div key={d.distribution_id} className="rounded-lg border p-4"
                data-testid={`distribution-${d.distribution_id}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-[#002060]">{d.label}</p>
                  <p className="text-sm text-muted-foreground">
                    Encaissé {d.total_amount.toFixed(2)} € · part association {d.association_amount.toFixed(2)} €
                  </p>
                </div>
                <ul className="mt-3 space-y-2">
                  {(d.lines || []).map((line) => (
                    <li key={line.line_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                      <span className="font-medium text-[#002060]">
                        {line.professional_name}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {line.mode === "PERCENT" ? `${line.value} %` : "montant fixe"}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="font-display font-bold text-[#800020]">
                          {line.computed_amount.toFixed(2)} €
                        </span>
                        {line.status === "PAID"
                          ? <Chip tone="green">Réglée</Chip>
                          : <Button size="sm" variant="outline" className="h-7 rounded-full px-3 text-xs"
                              data-testid={`distribution-pay-${line.line_id}`} onClick={() => payLine(line)}>
                              Marquer réglée
                            </Button>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="finance-dialog">
          <DialogHeader><DialogTitle>Nouvelle écriture</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Sens</Label>
                <Select value={form.direction} onValueChange={(v) => setForm({ ...form, direction: v })}>
                  <SelectTrigger data-testid="finance-direction-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IN">Recette</SelectItem>
                    <SelectItem value="OUT">Dépense</SelectItem>
                  </SelectContent>
                </Select></div>
              <div><Label>Date</Label>
                <Input type="date" value={form.date} required data-testid="finance-date-input"
                  onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div><Label>Montant (€)</Label>
                <Input type="number" step="0.01" value={form.amount} required data-testid="finance-amount-input"
                  onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div><Label>Catégorie</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger data-testid="finance-category-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div><Label>Moyen</Label>
                <Select value={form.payment_method} onValueChange={(v) => setForm({ ...form, payment_method: v })}>
                  <SelectTrigger data-testid="finance-method-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["ESPECES", "CHEQUE", "VIREMENT", "AUTRE"].map((m) =>
                      <SelectItem key={m} value={m}>{m}</SelectItem>)}
                  </SelectContent>
                </Select></div>
            </div>
            <div><Label>Description</Label>
              <Input value={form.description} required data-testid="finance-description-input"
                onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid="finance-save-button">Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto" data-testid="finance-share-dialog">
          <DialogHeader><DialogTitle>Répartir des recettes entre professionnels</DialogTitle></DialogHeader>
          <form onSubmit={submitShare} className="space-y-4">
            <div><Label>Intitulé (activité ou événement)</Label>
              <Input value={share.label} required data-testid="share-label-input"
                onChange={(e) => setShare({ ...share, label: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Date</Label>
                <Input type="date" value={share.date} data-testid="share-date-input"
                  onChange={(e) => setShare({ ...share, date: e.target.value })} /></div>
              <div><Label>Montant total encaissé (€)</Label>
                <Input type="number" step="0.01" value={share.total_amount} required data-testid="share-total-input"
                  onChange={(e) => setShare({ ...share, total_amount: e.target.value })} /></div>
            </div>
            <div className="space-y-3">
              <Label>Répartition</Label>
              {share.lines.map((line, index) => (
                <div key={index} className="grid grid-cols-[1fr_auto_5rem] items-end gap-2">
                  <Select value={line.professional_id}
                    onValueChange={(v) => setShare({ ...share,
                      lines: share.lines.map((l, i) => i === index ? { ...l, professional_id: v } : l) })}>
                    <SelectTrigger data-testid={`share-pro-select-${index}`}>
                      <SelectValue placeholder="Professionnel" />
                    </SelectTrigger>
                    <SelectContent>
                      {pros.map((p) => (
                        <SelectItem key={p.user_id} value={p.user_id}>
                          {p.profile?.display_name || p.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={line.mode}
                    onValueChange={(v) => setShare({ ...share,
                      lines: share.lines.map((l, i) => i === index ? { ...l, mode: v } : l) })}>
                    <SelectTrigger className="w-24" data-testid={`share-mode-select-${index}`}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PERCENT">%</SelectItem>
                      <SelectItem value="FIXED">€</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input type="number" step="0.01" value={line.value} data-testid={`share-value-input-${index}`}
                    onChange={(e) => setShare({ ...share,
                      lines: share.lines.map((l, i) => i === index ? { ...l, value: e.target.value } : l) })} />
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="rounded-full"
                data-testid="share-add-line"
                onClick={() => setShare({ ...share,
                  lines: [...share.lines, { professional_id: "", mode: "PERCENT", value: "" }] })}>
                <Plus className="mr-2 h-4 w-4" /> Ajouter un professionnel
              </Button>
              <p className="text-xs text-muted-foreground">
                Le reste après répartition revient automatiquement à l'association.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid="share-save-button">Calculer et notifier</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BarChartIcon(props) { return <Wallet {...props} />; }
