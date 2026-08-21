import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Gift, Plus, Copy, Check, Ticket, Percent, ShoppingBag, HeartHandshake } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState, Chip } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const KINDS = { CODE_PROMO: ["Code promo", Percent], ACTIVITE_OFFERTE: ["Activité offerte", Ticket],
  GOODIE: ["Goodie", ShoppingBag], SEANCE_PRO: ["Séance pro", HeartHandshake],
  TARIF_REDUIT: ["Tarif réduit", Percent] };
const EMPTY = { title: "", description: "", kind: "CODE_PROMO", promo_code: "", partner_name: "",
  conditions: "", valid_from: "", valid_until: "", quantity: "" };

export default function Advantages() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [claimed, setClaimed] = useState(null);
  const [proposeOpen, setProposeOpen] = useState(false);
  const [proposal, setProposal] = useState({ title: "", description: "", kind: "SEANCE_PRO",
    conditions: "", valid_until: "", quantity: "" });

  const load = useCallback(async () => {
    const { data } = await api.get("/advantages");
    setData(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post("/advantages", { ...form, quantity: form.quantity ? Number(form.quantity) : null });
      toast.success("Avantage publié");
      setOpen(false); setForm(EMPTY); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const claim = async (advantage) => {
    try {
      const { data } = await api.post(`/advantages/${advantage.advantage_id}/claim`, {});
      setClaimed({ advantage, code: data.promo_code });
      toast.success("C'est réservé ! Le Bureau est prévenu.");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const propose = async (event) => {
    event.preventDefault();
    try {
      await api.post("/partner-proposals", { ...proposal,
        quantity: proposal.quantity ? Number(proposal.quantity) : null });
      toast.success("Proposition envoyée au Bureau");
      setProposeOpen(false);
    } catch (e) { toast.error(apiError(e)); }
  };

  if (!data) return <p className="text-muted-foreground" data-testid="advantages-loading">Chargement…</p>;

  return (
    <div data-testid="advantages-page">
      <PageHeader breadcrumb="Mes avantages" title="Avantages adhérents"
        subtitle="Codes promo partenaires, activités offertes, goodies et séances proposées par les professionnels."
        actions={
          <div className="flex flex-wrap gap-2">
            {!data.is_manager && (
              <Button variant="outline" className="rounded-full" data-testid="advantage-propose-button"
                onClick={() => setProposeOpen(true)}>Proposer un avantage</Button>
            )}
            {data.is_manager && (
              <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="advantage-create-button"
                onClick={() => setOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Nouvel avantage
              </Button>
            )}
          </div>
        } />

      {data.items.length === 0 ? (
        <EmptyState testId="advantages-empty" icon={Gift} title="Aucun avantage disponible"
          description="Vos avantages d'adhérent apparaîtront ici dès que le Bureau en publiera." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((advantage) => {
            const [kindLabel, KindIcon] = KINDS[advantage.kind] || ["Avantage", Gift];
            const available = advantage.state === "ACTIVE";
            return (
              <div key={advantage.advantage_id} data-testid={`advantage-card-${advantage.advantage_id}`}
                className="flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md">
                <div className="flex items-center gap-3 border-b bg-[#002060]/5 px-5 py-4">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#800020]/10">
                    <KindIcon className="h-5 w-5 text-[#800020]" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{kindLabel}</p>
                    <p className="truncate font-display font-bold text-[#002060]">{advantage.title}</p>
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <p className="text-sm text-muted-foreground">{advantage.description}</p>
                  {advantage.partner_name && (
                    <p className="mt-2 text-sm font-semibold text-[#002060]">Partenaire : {advantage.partner_name}</p>
                  )}
                  {advantage.conditions && (
                    <p className="mt-2 text-xs text-muted-foreground">Conditions : {advantage.conditions}</p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Chip tone={available ? "green" : "amber"}>
                      {available ? "Disponible" : advantage.state === "SOLD_OUT" ? "Épuisé" : "Expiré"}
                    </Chip>
                    {advantage.valid_until && (
                      <Chip tone="muted">jusqu'au {new Date(advantage.valid_until).toLocaleDateString("fr-FR")}</Chip>
                    )}
                    {advantage.remaining != null && <Chip tone="marine">{advantage.remaining} restant(s)</Chip>}
                  </div>
                  <div className="mt-auto pt-4">
                    {advantage.is_claimed ? (
                      <div className="space-y-2">
                        <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700">
                          <Check className="h-4 w-4" /> Réservé
                        </p>
                        {advantage.promo_code && (
                          <Button size="sm" variant="outline" className="w-full rounded-full"
                            data-testid={`advantage-copy-${advantage.advantage_id}`}
                            onClick={() => { navigator.clipboard.writeText(advantage.promo_code);
                              toast.success("Code copié"); }}>
                            <Copy className="mr-2 h-4 w-4" /> {advantage.promo_code}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Button size="sm" disabled={!available} className="w-full rounded-full bg-[#800020] hover:bg-[#63001a]"
                        data-testid={`advantage-claim-${advantage.advantage_id}`} onClick={() => claim(advantage)}>
                        {advantage.kind === "CODE_PROMO" ? "Obtenir mon code" : "Je réserve"}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto" data-testid="advantage-dialog">
          <DialogHeader><DialogTitle>Nouvel avantage adhérent</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Titre</Label>
              <Input value={form.title} required data-testid="advantage-title-input"
                onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Description</Label>
              <Textarea rows={3} value={form.description} data-testid="advantage-description-input"
                onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Type</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger data-testid="advantage-kind-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(KINDS).map(([k, [label]]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div><Label>Code promo</Label>
                <Input value={form.promo_code} data-testid="advantage-code-input"
                  onChange={(e) => setForm({ ...form, promo_code: e.target.value })} /></div>
              <div><Label>Partenaire</Label>
                <Input value={form.partner_name} data-testid="advantage-partner-input"
                  onChange={(e) => setForm({ ...form, partner_name: e.target.value })} /></div>
              <div><Label>Quantité disponible</Label>
                <Input type="number" value={form.quantity} data-testid="advantage-quantity-input"
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })} /></div>
              <div><Label>Valable du</Label>
                <Input type="date" value={form.valid_from} data-testid="advantage-from-input"
                  onChange={(e) => setForm({ ...form, valid_from: e.target.value })} /></div>
              <div><Label>Jusqu'au</Label>
                <Input type="date" value={form.valid_until} data-testid="advantage-until-input"
                  onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></div>
            </div>
            <div><Label>Conditions</Label>
              <Textarea rows={2} value={form.conditions} data-testid="advantage-conditions-input"
                onChange={(e) => setForm({ ...form, conditions: e.target.value })} /></div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid="advantage-save-button">Publier</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={proposeOpen} onOpenChange={setProposeOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="advantage-propose-dialog">
          <DialogHeader><DialogTitle>Proposer un avantage aux adhérents</DialogTitle></DialogHeader>
          <form onSubmit={propose} className="space-y-4">
            <div><Label>Titre</Label>
              <Input value={proposal.title} required data-testid="proposal-title-input"
                onChange={(e) => setProposal({ ...proposal, title: e.target.value })} /></div>
            <div><Label>Description</Label>
              <Textarea rows={3} value={proposal.description} data-testid="proposal-description-input"
                onChange={(e) => setProposal({ ...proposal, description: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Type</Label>
                <Select value={proposal.kind} onValueChange={(v) => setProposal({ ...proposal, kind: v })}>
                  <SelectTrigger data-testid="proposal-kind-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(KINDS).map(([k, [label]]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div><Label>Quantité</Label>
                <Input type="number" value={proposal.quantity} data-testid="proposal-quantity-input"
                  onChange={(e) => setProposal({ ...proposal, quantity: e.target.value })} /></div>
            </div>
            <div><Label>Conditions</Label>
              <Textarea rows={2} value={proposal.conditions} data-testid="proposal-conditions-input"
                onChange={(e) => setProposal({ ...proposal, conditions: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground">
              Votre proposition sera publiée après validation du Bureau.
            </p>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid="proposal-save-button">Envoyer au Bureau</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!claimed} onOpenChange={() => setClaimed(null)}>
        <DialogContent data-testid="advantage-claimed-dialog">
          <DialogHeader><DialogTitle>{claimed?.advantage.title}</DialogTitle></DialogHeader>
          {claimed?.code ? (
            <>
              <p className="text-sm text-muted-foreground">Voici votre code à présenter chez le partenaire :</p>
              <p className="rounded-xl bg-[#800020]/8 py-5 text-center font-display text-2xl font-extrabold tracking-[0.2em] text-[#800020]"
                data-testid="advantage-claimed-code">{claimed.code}</p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Votre réservation est enregistrée. Le Bureau vous recontacte pour organiser la suite.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
