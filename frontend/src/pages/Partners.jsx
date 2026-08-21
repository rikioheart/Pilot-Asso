import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Handshake, Plus, Building2, Landmark, Store, MessageSquarePlus, Check, X } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState, Chip, SectionCard } from "@/components/Ui";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CATEGORIES = { MAIRIE: ["Mairies & collectivités", Landmark], ASSOCIATION: ["Associations & refuges", Handshake],
  COMMERCIAL: ["Partenaires commerciaux", Store] };
const STATUS = { ACTIF: ["Actif", "green"], DISCUSSION: ["En discussion", "amber"],
  INACTIF: ["Inactif", "muted"], ARCHIVE: ["Archivé", "muted"] };
const EMPTY = { name: "", category: "MAIRIE", partner_type: "", contact_name: "", contact_role: "",
  contact_email: "", contact_phone: "", geographic_zone: "", partnership_nature: "", status: "DISCUSSION",
  company_name: "", siret: "", clauses: "", contract_file_ids: [] };

export default function Partners() {
  const [data, setData] = useState(null);
  const [proposals, setProposals] = useState([]);
  const [tab, setTab] = useState("ALL");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [detail, setDetail] = useState(null);
  const [exchange, setExchange] = useState({ summary: "", channel: "EMAIL", next_step: "" });

  const load = useCallback(async () => {
    const [p, pr] = await Promise.all([api.get("/partners"), api.get("/partner-proposals")]);
    setData(p.data); setProposals(pr.data.items || []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post("/partners", form);
      toast.success("Partenaire enregistré");
      setOpen(false); setForm(EMPTY); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const openDetail = async (partner) => {
    const { data } = await api.get(`/partners/${partner.partner_id}`);
    setDetail(data);
  };

  const addExchange = async (event) => {
    event.preventDefault();
    try {
      await api.post(`/partners/${detail.partner.partner_id}/exchanges`, exchange);
      toast.success("Échange consigné");
      setExchange({ summary: "", channel: "EMAIL", next_step: "" });
      openDetail(detail.partner);
    } catch (e) { toast.error(apiError(e)); }
  };

  const reviewProposal = async (proposal, decision) => {
    try {
      await api.post(`/partner-proposals/${proposal.proposal_id}/review`, { decision });
      toast.success(decision === "ACCEPT" ? "Avantage publié" : "Proposition refusée");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  if (!data) return <p className="text-muted-foreground" data-testid="partners-loading">Chargement…</p>;
  const items = tab === "ALL" ? data.items : data.items.filter((p) => p.category === tab);
  const pending = proposals.filter((p) => p.status === "PENDING");

  return (
    <div data-testid="partners-page">
      <PageHeader breadcrumb="Réseau externe" title="Partenariats"
        subtitle="Mairies, associations et commerces qui soutiennent l'association."
        actions={data.is_manager && (
          <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="partner-create-button"
            onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nouveau partenaire
          </Button>
        )} />

      {data.is_manager && pending.length > 0 && (
        <SectionCard title="Avantages proposés par les professionnels" icon={MessageSquarePlus}
          testId="partner-proposals" className="mb-6">
          <ul className="space-y-2">
            {pending.map((proposal) => (
              <li key={proposal.proposal_id} data-testid={`proposal-${proposal.proposal_id}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm">
                <span>
                  <span className="font-semibold text-[#002060]">{proposal.title}</span>
                  <span className="ml-2 text-xs text-muted-foreground">par {proposal.proposed_by_name}</span>
                </span>
                <span className="flex gap-2">
                  <Button size="sm" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                    data-testid={`proposal-accept-${proposal.proposal_id}`}
                    onClick={() => reviewProposal(proposal, "ACCEPT")}>
                    <Check className="mr-1.5 h-3.5 w-3.5" /> Publier
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-full"
                    data-testid={`proposal-refuse-${proposal.proposal_id}`}
                    onClick={() => reviewProposal(proposal, "REFUSE")}>
                    <X className="mr-1.5 h-3.5 w-3.5" /> Refuser
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <div className="mb-6 flex flex-wrap gap-2" data-testid="partner-tabs">
        {[["ALL", "Tous"], ...Object.entries(CATEGORIES).map(([k, [label]]) => [k, label])].map(([value, label]) => (
          <button key={value} onClick={() => setTab(value)} data-testid={`partner-tab-${value}`}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              tab === value ? "bg-[#002060] text-white" : "bg-muted text-[#002060] hover:bg-muted/70"}`}>
            {label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState testId="partners-empty" icon={Handshake} title="Aucun partenaire dans cette catégorie"
          description="Mairies, refuges et commerces partenaires seront répertoriés ici." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((partner) => {
            const [categoryLabel, CategoryIcon] = CATEGORIES[partner.category] || ["Partenaire", Building2];
            const [label, tone] = STATUS[partner.status] || ["—", "muted"];
            return (
              <button key={partner.partner_id} type="button" onClick={() => openDetail(partner)}
                data-testid={`partner-card-${partner.partner_id}`}
                className="rounded-xl border bg-card p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#002060]/8">
                    <CategoryIcon className="h-5 w-5 text-[#002060]" />
                  </span>
                  <Chip tone={tone}>{label}</Chip>
                </div>
                <h3 className="mt-3 font-display font-bold text-[#002060]">{partner.name}</h3>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{categoryLabel}</p>
                <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{partner.partnership_nature}</p>
                <p className="mt-3 text-xs text-muted-foreground">{partner.geographic_zone}</p>
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto" data-testid="partner-dialog">
          <DialogHeader><DialogTitle>Nouveau partenaire</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Nom</Label>
                <Input value={form.name} required data-testid="partner-name-input"
                  onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Catégorie</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger data-testid="partner-category-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIES).map(([k, [label]]) => <SelectItem key={k} value={k}>{label}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div><Label>Type</Label>
                <Input value={form.partner_type} data-testid="partner-type-input"
                  onChange={(e) => setForm({ ...form, partner_type: e.target.value })} /></div>
              <div><Label>Statut</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger data-testid="partner-status-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(STATUS).filter(([k]) => k !== "ARCHIVE").map(([k, [label]]) =>
                      <SelectItem key={k} value={k}>{label}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div><Label>Contact référent</Label>
                <Input value={form.contact_name} data-testid="partner-contact-input"
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
              <div><Label>Zone géographique</Label>
                <Input value={form.geographic_zone} data-testid="partner-zone-input"
                  onChange={(e) => setForm({ ...form, geographic_zone: e.target.value })} /></div>
              <div><Label>E-mail</Label>
                <Input value={form.contact_email} data-testid="partner-email-input"
                  onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></div>
              <div><Label>Téléphone</Label>
                <Input value={form.contact_phone} data-testid="partner-phone-input"
                  onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} /></div>
            </div>
            <div><Label>Nature du partenariat</Label>
              <Textarea rows={2} value={form.partnership_nature} data-testid="partner-nature-input"
                onChange={(e) => setForm({ ...form, partnership_nature: e.target.value })} /></div>
            {form.category === "COMMERCIAL" && (
              <div className="space-y-4 rounded-lg border border-dashed p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div><Label>Raison sociale</Label>
                    <Input value={form.company_name} data-testid="partner-company-input"
                      onChange={(e) => setForm({ ...form, company_name: e.target.value })} /></div>
                  <div><Label>SIRET (facultatif)</Label>
                    <Input value={form.siret} data-testid="partner-siret-input"
                      onChange={(e) => setForm({ ...form, siret: e.target.value })} /></div>
                </div>
                <div><Label>Clauses spécifiques</Label>
                  <Textarea rows={2} value={form.clauses} data-testid="partner-clauses-input"
                    onChange={(e) => setForm({ ...form, clauses: e.target.value })} /></div>
                <div><Label>Contrat (PDF)</Label>
                  <FileUpload usage="OTHER" testId="partner-contract-upload"
                    value={form.contract_file_ids[0]} label="Joindre le contrat"
                    onChange={(id) => setForm({ ...form, contract_file_ids: id ? [id] : [] })} /></div>
              </div>
            )}
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid="partner-save-button">Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={() => setDetail(null)}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto" data-testid="partner-detail-dialog">
          {detail && (
            <>
              <DialogHeader><DialogTitle>{detail.partner.name}</DialogTitle></DialogHeader>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                {[["Contact", detail.partner.contact_name], ["Zone", detail.partner.geographic_zone],
                  ["Nature", detail.partner.partnership_nature], ["Statut", detail.partner.status],
                  ["E-mail", detail.partner.contact_email], ["Téléphone", detail.partner.contact_phone],
                  ["Raison sociale", detail.partner.company_name], ["SIRET", detail.partner.siret],
                ].filter(([, v]) => v).map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="font-semibold text-[#002060]">{value}</dd>
                  </div>
                ))}
              </dl>
              {detail.advantages?.length > 0 && (
                <SectionCard title="Avantages liés" testId="partner-advantages">
                  <ul className="space-y-1 text-sm">
                    {detail.advantages.map((a) => (
                      <li key={a.advantage_id} className="text-muted-foreground">• {a.title}</li>
                    ))}
                  </ul>
                </SectionCard>
              )}
              {detail.is_manager && (
                <SectionCard title="Historique des échanges" testId="partner-exchanges">
                  {detail.exchanges.length === 0
                    ? <p className="text-sm text-muted-foreground">Aucun échange consigné.</p>
                    : (
                      <ul className="mb-4 space-y-2">
                        {detail.exchanges.map((ex) => (
                          <li key={ex.exchange_id} className="border-l-2 border-[#800020]/40 pl-3 text-sm">
                            <p className="font-semibold text-[#002060]">
                              {new Date(ex.date).toLocaleDateString("fr-FR")} · {ex.channel}
                            </p>
                            <p className="text-muted-foreground">{ex.summary}</p>
                            {ex.next_step && <p className="text-xs text-[#800020]">Prochaine étape : {ex.next_step}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  <form onSubmit={addExchange} className="space-y-3">
                    <Textarea rows={2} value={exchange.summary} placeholder="Résumé de l'échange"
                      data-testid="partner-exchange-input"
                      onChange={(e) => setExchange({ ...exchange, summary: e.target.value })} />
                    <Input value={exchange.next_step} placeholder="Prochaine étape (facultatif)"
                      data-testid="partner-next-step-input"
                      onChange={(e) => setExchange({ ...exchange, next_step: e.target.value })} />
                    <Button type="submit" size="sm" className="rounded-full bg-[#002060] hover:bg-[#001740]"
                      data-testid="partner-exchange-save">Consigner l'échange</Button>
                  </form>
                </SectionCard>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
