import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Star, Gift, Power } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function LoyaltyRules() {
  const [rules, setRules] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activities, setActivities] = useState([]);
  const [history, setHistory] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    label: "", kind: "STAMP", activity_category: "", activity_id: "", points: 1, threshold: "", reward: "",
  });

  const load = useCallback(async () => {
    try {
      const [r, h] = await Promise.all([
        api.get("/loyalty/rules"),
        api.get("/loyalty/history", { params: { limit: 30 } }),
      ]);
      setRules(r.data.items);
      setHistory(h.data.items);
    } catch (e) {
      toast.error(apiError(e));
    }
  }, []);

  useEffect(() => {
    load();
    api.get("/activities/meta").then((r) => setCategories(r.data.categories)).catch(() => {});
    api.get("/activities", { params: { limit: 100 } }).then((r) => setActivities(r.data.items)).catch(() => {});
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    try {
      await api.post("/loyalty/rules", {
        label: form.label, kind: form.kind, points: Number(form.points) || 1,
        activity_category: form.kind === "STAMP" ? (form.activity_category || null) : null,
        activity_id: form.kind === "STAMP" ? (form.activity_id || null) : null,
        threshold: form.kind === "REWARD" ? Number(form.threshold) || null : null,
        reward: form.kind === "REWARD" ? form.reward || null : null,
      });
      toast.success("Règle enregistrée");
      setOpen(false);
      setForm({ label: "", kind: "STAMP", activity_category: "", activity_id: "", points: 1, threshold: "", reward: "" });
      load();
    } catch (err) {
      toast.error(apiError(err));
    }
  };

  const toggle = async (rule) => {
    try {
      await api.put(`/loyalty/rules/${rule.rule_id}`, { is_active: !rule.is_active });
      toast.success(rule.is_active ? "Règle désactivée" : "Règle activée");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const stampRules = rules.filter((r) => r.kind === "STAMP");
  const rewardRules = rules.filter((r) => r.kind === "REWARD");

  return (
    <div data-testid="loyalty-rules-page">
      <PageHeader breadcrumb="Bureau" title="Règles de fidélité"
        subtitle="Définissez quelles activités donnent un tampon, combien de points, et les récompenses — sans développement."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="rule-create-button">
                <Plus className="mr-2 h-4 w-4" /> Nouvelle règle
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="rule-create-dialog">
              <DialogHeader><DialogTitle>Nouvelle règle de fidélité</DialogTitle></DialogHeader>
              <form onSubmit={create} className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {[["STAMP", "Tampon (points)"], ["REWARD", "Récompense (seuil)"]].map(([value, label]) => (
                    <button key={value} type="button" onClick={() => setForm({ ...form, kind: value })}
                      data-testid={`rule-kind-${value}`}
                      className={`rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                        form.kind === value ? "border-[#800020] bg-[#800020]/5 font-semibold text-[#800020]" : "hover:border-[#002060]/40"
                      }`}>{label}</button>
                  ))}
                </div>
                <div className="space-y-2">
                  <Label>Libellé *</Label>
                  <Input required value={form.label} data-testid="rule-label-input"
                    placeholder={form.kind === "STAMP" ? "Balade collective = 1 point" : "5 points : balade offerte"}
                    onChange={(e) => setForm({ ...form, label: e.target.value })} />
                </div>
                {form.kind === "STAMP" ? (
                  <>
                    <div className="space-y-2">
                      <Label>Catégorie d'activité éligible</Label>
                      <Select value={form.activity_category || "NONE"}
                        onValueChange={(v) => setForm({ ...form, activity_category: v === "NONE" ? "" : v, activity_id: "" })}>
                        <SelectTrigger data-testid="rule-category-select"><SelectValue placeholder="Choisir" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">Aucune</SelectItem>
                          {categories.map((c) => (
                            <SelectItem key={c} value={c} data-testid={`rule-category-${c}`}>{c.replaceAll("_", " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>…ou une activité précise</Label>
                      <Select value={form.activity_id || "NONE"}
                        onValueChange={(v) => setForm({ ...form, activity_id: v === "NONE" ? "" : v, activity_category: "" })}>
                        <SelectTrigger data-testid="rule-activity-select"><SelectValue placeholder="Choisir" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NONE">Aucune</SelectItem>
                          {activities.map((a) => (
                            <SelectItem key={a.activity_id} value={a.activity_id} data-testid={`rule-activity-${a.activity_id}`}>
                              {a.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Points attribués</Label>
                      <Input type="number" min="1" value={form.points} data-testid="rule-points-input"
                        onChange={(e) => setForm({ ...form, points: e.target.value })} />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Label>Seuil de points *</Label>
                      <Input type="number" min="1" required value={form.threshold} data-testid="rule-threshold-input"
                        onChange={(e) => setForm({ ...form, threshold: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label>Récompense</Label>
                      <Input value={form.reward} data-testid="rule-reward-input" placeholder="Une balade offerte"
                        onChange={(e) => setForm({ ...form, reward: e.target.value })} />
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
        } />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="rounded-xl border bg-card p-5" data-testid="stamp-rules">
            <h2 className="inline-flex items-center gap-2 font-display text-base md:text-lg font-bold text-[#002060]">
              <Star className="h-4 w-4 text-[#800020]" /> Activités qui donnent un tampon
            </h2>
            <div className="mt-4 space-y-2">
              {stampRules.length === 0 && (
                <EmptyState testId="stamp-rules-empty" title="Aucune règle"
                  description="Sans règle, aucun point ne peut être ajouté par un professionnel." />
              )}
              {stampRules.map((r) => (
                <div key={r.rule_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3"
                  data-testid={`stamp-rule-${r.rule_id}`}>
                  <div>
                    <p className="text-sm font-semibold text-[#002060]">{r.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.activity_title || (r.activity_category || "").replaceAll("_", " ")} · +{r.points} point(s)
                      {!r.is_active && " · inactive"}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-full" data-testid={`rule-toggle-${r.rule_id}`}
                    onClick={() => toggle(r)}>
                    <Power className="mr-1 h-3.5 w-3.5" /> {r.is_active ? "Désactiver" : "Activer"}
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-5" data-testid="reward-rules">
            <h2 className="inline-flex items-center gap-2 font-display text-base md:text-lg font-bold text-[#002060]">
              <Gift className="h-4 w-4 text-[#800020]" /> Récompenses par seuil
            </h2>
            <div className="mt-4 space-y-2">
              {rewardRules.length === 0 && (
                <EmptyState testId="reward-rules-empty" title="Aucune récompense"
                  description="Ajoutez un seuil (ex. 5 points = une balade offerte)." />
              )}
              {rewardRules.map((r) => (
                <div key={r.rule_id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3"
                  data-testid={`reward-rule-${r.rule_id}`}>
                  <div>
                    <p className="text-sm font-semibold text-[#002060]">{r.reward || r.label}</p>
                    <p className="text-xs text-muted-foreground">{r.threshold} points{!r.is_active && " · inactive"}</p>
                  </div>
                  <Button size="sm" variant="outline" className="rounded-full" data-testid={`reward-toggle-${r.rule_id}`}
                    onClick={() => toggle(r)}>
                    <Power className="mr-1 h-3.5 w-3.5" /> {r.is_active ? "Désactiver" : "Activer"}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-xl border bg-card p-5" data-testid="loyalty-global-history">
          <h2 className="font-display text-base md:text-lg font-bold text-[#002060]">Historique complet des tampons</h2>
          <div className="mt-4 space-y-2">
            {history.length === 0 && (
              <EmptyState testId="loyalty-global-history-empty" title="Aucun tampon"
                description="Les validations des professionnels apparaîtront ici." />
            )}
            {history.map((s) => (
              <div key={s.stamp_id} className="flex items-center justify-between rounded-lg border px-4 py-3"
                data-testid={`loyalty-global-stamp-${s.stamp_id}`}>
                <div>
                  <p className="text-sm font-semibold text-[#002060]">{s.member_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {s.activity_title} · {new Date(s.created_at).toLocaleString("fr-FR")} · par {s.validated_by_name}
                  </p>
                </div>
                <span className="font-display text-lg font-extrabold text-[#800020]">+{s.points}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
