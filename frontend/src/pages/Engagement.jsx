import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Star, Gift, Power, Plus, Minus, RefreshCw, Trash2, QrCode, Search, BarChart3, Mail }
  from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState, SectionCard, Chip, ProgressBar } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ACTIVITY_CATEGORY_LABELS, label as tr } from "@/lib/labels";

const emptyRule = { label: "", kind: "STAMP", activity_category: "", activity_id: "", points: 1,
  threshold: "", reward: "" };

export default function Engagement() {
  const [rules, setRules] = useState([]);
  const [members, setMembers] = useState([]);
  const [history, setHistory] = useState({ items: [], source_labels: {} });
  const [activities, setActivities] = useState([]);
  const [categories, setCategories] = useState([]);
  const [filters, setFilters] = useState({ q: "", activity_id: "", source: "", date_from: "",
    date_to: "", sort: "date", user_id: "" });
  const [ruleOpen, setRuleOpen] = useState(false);
  const [rule, setRule] = useState(emptyRule);
  const [editingRule, setEditingRule] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailData, setDetailData] = useState(null);
  const [manual, setManual] = useState({ points: 1, reason: "", label: "" });
  const [stats, setStats] = useState(null);
  const [sending, setSending] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await api.get("/loyalty/history", {
        params: {
          q: filters.q || undefined, activity_id: filters.activity_id || undefined,
          source: filters.source || undefined, date_from: filters.date_from || undefined,
          date_to: filters.date_to || undefined, sort: filters.sort,
          user_id: filters.user_id || undefined, limit: 300,
        },
      });
      setHistory(data);
    } catch (e) { toast.error(apiError(e)); }
  }, [filters]);

  const loadBase = useCallback(async () => {
    try {
      const [r, m] = await Promise.all([api.get("/loyalty/rules"), api.get("/loyalty/members")]);
      setRules(r.data.items); setMembers(m.data.items);
    } catch (e) { toast.error(apiError(e)); }
  }, []);

  useEffect(() => { loadBase(); }, [loadBase]);
  useEffect(() => { loadHistory(); }, [loadHistory]);
  useEffect(() => {
    api.get("/activities/meta").then((r) => setCategories(r.data.categories)).catch(() => {});
    api.get("/activities", { params: { limit: 150 } })
      .then((r) => setActivities(r.data.items)).catch(() => {});
    api.get("/loyalty/stats", { params: { months: 12 } })
      .then((r) => setStats(r.data)).catch(() => {});
  }, []);

  const sendRecaps = async () => {
    if (!window.confirm("Envoyer maintenant le récap d'engagement à tous les adhérents ?")) return;
    setSending(true);
    try {
      const { data } = await api.post("/exports/member-recaps");
      toast.success(`${data.notified} notification(s), ${data.emails} e-mail(s), `
        + `${data.opted_out} désabonné(s)`);
    } catch (e) { toast.error(apiError(e)); } finally { setSending(false); }
  };

  const openMember = async (member) => {
    setDetail(member); setDetailData(null); setManual({ points: 1, reason: "", label: "" });
    try {
      const [card, hist] = await Promise.all([
        api.get("/loyalty/history", { params: { user_id: member.user_id, limit: 200 } }),
        api.get("/loyalty/members"),
      ]);
      const fresh = (hist.data.items || []).find((m) => m.user_id === member.user_id) || member;
      setDetailData({ stamps: card.data.items, member: fresh, source_labels: card.data.source_labels });
    } catch (e) { toast.error(apiError(e)); }
  };

  const refreshDetail = async (member) => {
    await loadBase(); await loadHistory();
    const { data } = await api.get("/loyalty/history", { params: { user_id: member.user_id, limit: 200 } });
    const fresh = await api.get("/loyalty/members");
    setDetail((fresh.data.items || []).find((m) => m.user_id === member.user_id) || member);
    setDetailData({ stamps: data.items, source_labels: data.source_labels });
  };

  const saveRule = async (event) => {
    event.preventDefault();
    const body = {
      label: rule.label, kind: rule.kind, points: Number(rule.points) || 1,
      activity_category: rule.kind === "STAMP" ? (rule.activity_category || null) : null,
      activity_id: rule.kind === "STAMP" ? (rule.activity_id || null) : null,
      threshold: rule.kind === "REWARD" ? Number(rule.threshold) || null : null,
      reward: rule.kind === "REWARD" ? rule.reward || null : null,
    };
    try {
      if (editingRule) await api.put(`/loyalty/rules/${editingRule}`, body);
      else await api.post("/loyalty/rules", body);
      toast.success(editingRule ? "Palier mis à jour" : "Règle enregistrée");
      setRuleOpen(false); setEditingRule(null); setRule(emptyRule); loadBase();
    } catch (e) { toast.error(apiError(e)); }
  };

  const toggleRule = async (item) => {
    try {
      await api.put(`/loyalty/rules/${item.rule_id}`, { is_active: !item.is_active });
      toast.success(item.is_active ? "Règle désactivée" : "Règle activée");
      loadBase();
    } catch (e) { toast.error(apiError(e)); }
  };

  const applyManual = async (sign) => {
    if (manual.reason.trim().length < 3) return toast.error("Le motif est obligatoire");
    try {
      const { data } = await api.post("/loyalty/manual", {
        user_id: detail.user_id, points: sign * (Number(manual.points) || 1),
        reason: manual.reason, label: manual.label || null });
      toast.success(`Total recalculé : ${data.total_points} tampon(s)`);
      setManual({ points: 1, reason: "", label: "" });
      refreshDetail(detail);
    } catch (e) { toast.error(apiError(e)); }
  };

  const cancelStamp = async (stamp) => {
    const reason = window.prompt(`Motif de l'annulation de « ${stamp.activity_title} » :`);
    if (!reason || reason.trim().length < 3) return;
    try {
      const { data } = await api.delete(`/loyalty/stamps/${stamp.stamp_id}`, { params: { reason } });
      toast.success(`Tampon annulé — total : ${data.total_points}`);
      refreshDetail(detail);
    } catch (e) { toast.error(apiError(e)); }
  };

  const regenerate = async () => {
    if (!window.confirm("Régénérer le QR Code ? L'ancien devient immédiatement invalide.")) return;
    try {
      const { data } = await api.post(`/loyalty/${detail.user_id}/regenerate`);
      toast.success("Nouveau QR Code généré, l'ancien est invalide");
      setDetail({ ...detail, qr_token: data.card.qr_token });
    } catch (e) { toast.error(apiError(e)); }
  };

  const stampRules = useMemo(() => rules.filter((r) => r.kind === "STAMP"), [rules]);
  const rewardRules = useMemo(() => rules.filter((r) => r.kind === "REWARD"), [rules]);

  return (
    <div data-testid="engagement-page">
      <PageHeader breadcrumb="Bureau" title="Engagement"
        subtitle="Cartes d'engagement, tampons cumulés, historique daté et paliers d'avantages."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" disabled={sending}
              data-testid="send-recaps-button" onClick={sendRecaps}>
              <Mail className="mr-2 h-4 w-4" /> {sending ? "Envoi…" : "Envoyer les récaps"}
            </Button>
            <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="rule-create-button"
              onClick={() => { setEditingRule(null); setRule(emptyRule); setRuleOpen(true); }}>
              <Plus className="mr-2 h-4 w-4" /> Nouvelle règle / palier
            </Button>
          </div>
        } />

      <Tabs defaultValue="members" className="space-y-5">
        <TabsList>
          <TabsTrigger value="members" data-testid="engagement-tab-members">Cartes des membres</TabsTrigger>
          <TabsTrigger value="history" data-testid="engagement-tab-history">Historique des tampons</TabsTrigger>
          <TabsTrigger value="rules" data-testid="engagement-tab-rules">Règles & paliers</TabsTrigger>
          <TabsTrigger value="stats" data-testid="engagement-tab-stats">Statistiques</TabsTrigger>
        </TabsList>

        <TabsContent value="members">
          {members.length === 0 ? (
            <EmptyState testId="engagement-members-empty" icon={Star} title="Aucun particulier actif"
              description="Les cartes d'engagement apparaîtront dès qu'un particulier sera actif." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="engagement-members">
              {members.map((m) => (
                <button key={m.user_id} onClick={() => openMember(m)}
                  data-testid={`engagement-member-${m.user_id}`}
                  className="rounded-xl border bg-card p-5 text-left transition-shadow hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-display font-bold text-[#002060]">{m.display_name}</p>
                    <Chip tone="bordeaux">{m.total_points} tampon(s)</Chip>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{m.stamps_count} ligne(s) d'historique</p>
                  <div className="mt-4">
                    <ProgressBar value={m.progress}
                      label={m.next_reward ? `Vers « ${m.next_reward.reward || m.next_reward.label} »`
                        : "Tous les paliers atteints"} />
                    {m.next_reward && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {m.total_points} / {m.next_reward.threshold} tampons
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="history">
          <SectionCard title="Historique complet" icon={Star} testId="engagement-history-card"
            subtitle={`${history.total || 0} tampon(s) · ${history.total_points || 0} point(s) cumulé(s)`}>
            <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <div>
                <Label className="text-xs">Membre ou activité</Label>
                <Input value={filters.q} placeholder="Nom, activité…" data-testid="history-search-input"
                  onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Activité</Label>
                <Select value={filters.activity_id || "ALL"}
                  onValueChange={(v) => setFilters({ ...filters, activity_id: v === "ALL" ? "" : v })}>
                  <SelectTrigger data-testid="history-activity-filter"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Toutes</SelectItem>
                    {activities.map((a) => (
                      <SelectItem key={a.activity_id} value={a.activity_id}>{a.title}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Mode d'obtention</Label>
                <Select value={filters.source || "ALL"}
                  onValueChange={(v) => setFilters({ ...filters, source: v === "ALL" ? "" : v })}>
                  <SelectTrigger data-testid="history-source-filter"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tous</SelectItem>
                    {Object.entries(history.source_labels || {}).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Du</Label>
                <Input type="date" value={filters.date_from} data-testid="history-from-input"
                  onChange={(e) => setFilters({ ...filters, date_from: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Au</Label>
                <Input type="date" value={filters.date_to} data-testid="history-to-input"
                  onChange={(e) => setFilters({ ...filters, date_to: e.target.value })} />
              </div>
            </div>
            <div className="mb-3 flex flex-wrap gap-2">
              {[["date", "Trier par date"], ["member", "Trier par membre"],
                ["activity", "Trier par activité"]].map(([value, text]) => (
                <Button key={value} size="sm" variant={filters.sort === value ? "default" : "outline"}
                  data-testid={`history-sort-${value}`}
                  className={`rounded-full ${filters.sort === value ? "bg-[#800020] hover:bg-[#63001a]" : ""}`}
                  onClick={() => setFilters({ ...filters, sort: value })}>{text}</Button>
              ))}
            </div>
            {history.items.length === 0 ? (
              <EmptyState testId="engagement-history-empty" icon={Search} title="Aucun tampon"
                description="Aucun résultat pour ces filtres." />
            ) : (
              <ul className="space-y-2">
                {history.items.map((s) => (
                  <li key={s.stamp_id} data-testid={`history-stamp-${s.stamp_id}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3">
                    <span>
                      <span className="font-semibold text-[#002060]">{s.member_name}</span>
                      <p className="text-xs text-muted-foreground">
                        {s.activity_title} · {new Date(s.created_at).toLocaleString("fr-FR")} ·
                        {" "}{s.validated_by_name}
                      </p>
                      {s.reason && <p className="text-xs text-[#800020]">Motif : {s.reason}</p>}
                    </span>
                    <span className="flex items-center gap-2">
                      <Chip tone={s.is_manual ? "amber" : "muted"}>{s.source_label}</Chip>
                      <span className={`font-display text-lg font-extrabold ${
                        s.points < 0 ? "text-red-700" : "text-[#800020]"}`}>
                        {s.points > 0 ? `+${s.points}` : s.points}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="rules">
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Éléments qui donnent un tampon" icon={Star} testId="stamp-rules">
              {stampRules.length === 0 ? (
                <EmptyState testId="stamp-rules-empty" title="Aucune règle"
                  description="Une activité ou un événement marqué éligible donne un tampon à la validation de présence." />
              ) : (
                <ul className="space-y-2">
                  {stampRules.map((r) => (
                    <li key={r.rule_id} data-testid={`stamp-rule-${r.rule_id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3">
                      <span>
                        <span className="text-sm font-semibold text-[#002060]">{r.label}</span>
                        <p className="text-xs text-muted-foreground">
                          {r.activity_title || tr(ACTIVITY_CATEGORY_LABELS, r.activity_category)} ·
                          {" "}+{r.points} tampon(s){!r.is_active && " · inactive"}
                        </p>
                      </span>
                      <Button size="sm" variant="outline" className="rounded-full"
                        data-testid={`rule-toggle-${r.rule_id}`} onClick={() => toggleRule(r)}>
                        <Power className="mr-1 h-3.5 w-3.5" /> {r.is_active ? "Désactiver" : "Activer"}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>

            <SectionCard title="Paliers d'avantages" icon={Gift} testId="reward-rules">
              {rewardRules.length === 0 ? (
                <EmptyState testId="reward-rules-empty" title="Aucun palier"
                  description="Ajoutez un palier (ex. 5 tampons = une balade offerte)." />
              ) : (
                <ul className="space-y-2">
                  {rewardRules.map((r) => (
                    <li key={r.rule_id} data-testid={`reward-rule-${r.rule_id}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3">
                      <span>
                        <span className="text-sm font-semibold text-[#002060]">{r.reward || r.label}</span>
                        <p className="text-xs text-muted-foreground">
                          {r.threshold} tampons{!r.is_active && " · inactif"}
                        </p>
                      </span>
                      <span className="flex gap-2">
                        <Button size="sm" variant="outline" className="rounded-full"
                          data-testid={`reward-edit-${r.rule_id}`}
                          onClick={() => {
                            setEditingRule(r.rule_id);
                            setRule({ ...emptyRule, kind: "REWARD", label: r.label,
                              threshold: r.threshold || "", reward: r.reward || "" });
                            setRuleOpen(true);
                          }}>Modifier</Button>
                        <Button size="sm" variant="outline" className="rounded-full"
                          data-testid={`reward-toggle-${r.rule_id}`} onClick={() => toggleRule(r)}>
                          <Power className="mr-1 h-3.5 w-3.5" /> {r.is_active ? "Désactiver" : "Activer"}
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </SectionCard>
          </div>
        </TabsContent>

        <TabsContent value="stats">
          {!stats ? <p className="text-muted-foreground">Chargement des statistiques…</p> : (
            <div className="space-y-6" data-testid="engagement-stats">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[["Tampons attribués", stats.totals.stamps],
                  ["Tampons cumulés", stats.totals.points],
                  ["Adhérents engagés", `${stats.totals.engaged_members} / ${stats.totals.active_members}`],
                  ["Taux de participation", `${stats.totals.participation_rate} %`]].map(([text, value]) => (
                  <div key={text} className="rounded-xl border bg-card p-5" data-testid={`stat-${text}`}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{text}</p>
                    <p className="mt-2 font-display text-3xl font-extrabold text-[#002060]">{value}</p>
                  </div>
                ))}
              </div>

              <div className="grid gap-6 lg:grid-cols-2">
                <SectionCard title="Les plus impliqués" icon={BarChart3} testId="stats-ranking">
                  {stats.ranking.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucun tampon enregistré.</p>
                  ) : (
                    <ol className="space-y-2">
                      {stats.ranking.map((r, index) => (
                        <li key={r.user_id} data-testid={`stats-rank-${r.user_id}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3">
                          <span className="flex items-center gap-3">
                            <span className="grid h-7 w-7 place-items-center rounded-full bg-[#002060] text-xs font-bold text-white">
                              {index + 1}
                            </span>
                            <span>
                              <span className="font-semibold text-[#002060]">{r.display_name}</span>
                              <p className="text-xs text-muted-foreground">
                                {r.stamps} tampon(s) · {r.levels_reached} palier(s) atteint(s)
                                {r.next_reward && ` · prochain : ${r.next_reward} (${r.next_threshold})`}
                              </p>
                            </span>
                          </span>
                          <Chip tone="bordeaux">{r.total_points}</Chip>
                        </li>
                      ))}
                    </ol>
                  )}
                </SectionCard>

                <SectionCard title="Modes d'obtention" icon={Star} testId="stats-sources">
                  {stats.by_source.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Aucune donnée.</p>
                  ) : (
                    <ul className="space-y-3">
                      {stats.by_source.map((s) => (
                        <li key={s.source} data-testid={`stats-source-${s.source}`}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-[#002060]">{s.label}</span>
                            <span className="font-semibold">{s.count}</span>
                          </div>
                          <ProgressBar value={stats.totals.stamps ? s.count / stats.totals.stamps * 100 : 0} />
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-5">
                    <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Éléments les plus tamponnés
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {stats.top_elements.map((e) => (
                        <Chip key={e.title} tone="muted">{e.title} · {e.count}</Chip>
                      ))}
                    </div>
                  </div>
                </SectionCard>
              </div>

              <SectionCard title="Paliers atteints par mois" icon={Gift} testId="stats-monthly">
                {stats.monthly.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun historique sur la période.</p>
                ) : (
                  <ul className="space-y-2">
                    {stats.monthly.map((m) => (
                      <li key={m.month} data-testid={`stats-month-${m.month}`}
                        className="rounded-lg border px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-[#002060]">{m.label}</span>
                          <span className="flex flex-wrap gap-2">
                            <Chip tone="muted">{m.stamps} tampon(s)</Chip>
                            <Chip tone="marine">{m.active_members} adhérent(s) actif(s)</Chip>
                            <Chip tone="bordeaux">{m.levels_reached} palier(s) atteint(s)</Chip>
                          </span>
                        </div>
                        {m.levels.length > 0 && (
                          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                            {m.levels.map((l, index) => (
                              <li key={index}>
                                {l.display_name} → « {l.reward} » ({l.threshold} tampons)
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </div>
          )}
        </TabsContent>

      </Tabs>

      <Dialog open={ruleOpen} onOpenChange={setRuleOpen}>        <DialogContent data-testid="rule-create-dialog">
          <DialogHeader>
            <DialogTitle>{editingRule ? "Modifier le palier" : "Nouvelle règle d'engagement"}</DialogTitle>
            <DialogDescription>
              Définissez les éléments qui donnent un tampon ou les paliers d'avantages.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveRule} className="space-y-4">
            {!editingRule && (
              <div className="grid grid-cols-2 gap-2">
                {[["STAMP", "Tampon"], ["REWARD", "Palier d'avantage"]].map(([value, text]) => (
                  <button key={value} type="button" onClick={() => setRule({ ...rule, kind: value })}
                    data-testid={`rule-kind-${value}`}
                    className={`rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                      rule.kind === value
                        ? "border-[#800020] bg-[#800020]/5 font-semibold text-[#800020]"
                        : "hover:border-[#002060]/40"}`}>{text}</button>
                ))}
              </div>
            )}
            <div className="space-y-2">
              <Label>Libellé *</Label>
              <Input required value={rule.label} data-testid="rule-label-input"
                onChange={(e) => setRule({ ...rule, label: e.target.value })} />
            </div>
            {rule.kind === "STAMP" ? (
              <>
                <div className="space-y-2">
                  <Label>Catégorie d'activité éligible</Label>
                  <Select value={rule.activity_category || "NONE"}
                    onValueChange={(v) => setRule({ ...rule, activity_category: v === "NONE" ? "" : v,
                      activity_id: "" })}>
                    <SelectTrigger data-testid="rule-category-select"><SelectValue placeholder="Choisir" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Aucune</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c} value={c}>{tr(ACTIVITY_CATEGORY_LABELS, c)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>…ou une activité précise</Label>
                  <Select value={rule.activity_id || "NONE"}
                    onValueChange={(v) => setRule({ ...rule, activity_id: v === "NONE" ? "" : v,
                      activity_category: "" })}>
                    <SelectTrigger data-testid="rule-activity-select"><SelectValue placeholder="Choisir" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Aucune</SelectItem>
                      {activities.map((a) => (
                        <SelectItem key={a.activity_id} value={a.activity_id}>{a.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tampons attribués</Label>
                  <Input type="number" min="1" value={rule.points} data-testid="rule-points-input"
                    onChange={(e) => setRule({ ...rule, points: e.target.value })} />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Nombre de tampons du palier *</Label>
                  <Input type="number" min="1" required value={rule.threshold}
                    data-testid="rule-threshold-input"
                    onChange={(e) => setRule({ ...rule, threshold: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Avantage accordé</Label>
                  <Input value={rule.reward} data-testid="rule-reward-input"
                    placeholder="Une balade offerte"
                    onChange={(e) => setRule({ ...rule, reward: e.target.value })} />
                </div>
              </>
            )}
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid="rule-save-button">Enregistrer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detail} onOpenChange={() => { setDetail(null); setDetailData(null); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="member-engagement-dialog">
          <DialogHeader>
            <DialogTitle>Carte d'engagement — {detail?.display_name}</DialogTitle>
            <DialogDescription>
              Total de tampons, progression vers le prochain palier, historique daté et ajout ou retrait
              manuel avec motif.
            </DialogDescription>
          </DialogHeader>
          {detail && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-3">
                <Chip tone="bordeaux" testId="member-total-points">{detail.total_points} tampon(s)</Chip>
                {detail.next_reward && (
                  <Chip tone="muted">
                    Prochain palier : {detail.next_reward.reward || detail.next_reward.label}
                    {" "}({detail.next_reward.threshold})
                  </Chip>
                )}
                <Button size="sm" variant="outline" className="rounded-full"
                  data-testid="member-regenerate-qr" onClick={regenerate}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Régénérer le QR Code
                </Button>
              </div>

              {detail.qr_token && (
                <div className="rounded-xl border bg-card p-4 text-center" data-testid="member-qr-preview">
                  <QRCodeSVG value={detail.qr_token} size={120} fgColor="#002060" />
                  <p className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <QrCode className="h-3 w-3" /> Nouveau QR Code actif
                  </p>
                </div>
              )}

              <div className="rounded-xl border bg-muted/40 p-4" data-testid="member-manual-panel">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Ajout ou retrait manuel (motif obligatoire)
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label className="text-xs">Nombre de tampons</Label>
                    <Input type="number" min="1" value={manual.points} data-testid="manual-points-input"
                      onChange={(e) => setManual({ ...manual, points: e.target.value })} />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs">Motif (rattrapage, erreur de saisie, exceptionnel…)</Label>
                    <Input value={manual.reason} data-testid="manual-reason-input"
                      onChange={(e) => setManual({ ...manual, reason: e.target.value })} />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                    data-testid="manual-add-button" onClick={() => applyManual(1)}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Ajouter
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-full"
                    data-testid="manual-remove-button" onClick={() => applyManual(-1)}>
                    <Minus className="mr-1.5 h-3.5 w-3.5" /> Retirer
                  </Button>
                </div>
              </div>

              <div data-testid="member-history">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Historique daté
                </p>
                {!detailData ? <p className="mt-2 text-sm text-muted-foreground">Chargement…</p>
                  : detailData.stamps.length === 0 ? (
                    <p className="mt-2 text-sm text-muted-foreground">Aucun tampon pour ce membre.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {detailData.stamps.map((s) => (
                        <li key={s.stamp_id} data-testid={`member-stamp-${s.stamp_id}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                          <span>
                            <span className="font-semibold text-[#002060]">{s.activity_title}</span>
                            <p className="text-xs text-muted-foreground">
                              {new Date(s.created_at).toLocaleString("fr-FR")} · {s.validated_by_name}
                            </p>
                            {s.reason && <p className="text-xs text-[#800020]">Motif : {s.reason}</p>}
                          </span>
                          <span className="flex items-center gap-2">
                            <Chip tone={s.is_manual ? "amber" : "muted"}>{s.source_label}</Chip>
                            <span className={`font-display font-extrabold ${
                              s.points < 0 ? "text-red-700" : "text-[#800020]"}`}>
                              {s.points > 0 ? `+${s.points}` : s.points}
                            </span>
                            <Button size="sm" variant="outline"
                              className="rounded-full text-red-700 hover:bg-red-50"
                              data-testid={`member-stamp-cancel-${s.stamp_id}`}
                              onClick={() => cancelStamp(s)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
