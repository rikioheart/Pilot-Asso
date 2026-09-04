import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, Eye, GraduationCap, Save } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { SectionCard, Chip } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";

const ROLE_LABELS = { PARTICULIER: "Particulier", PROFESSIONNEL: "Professionnel", ADMIN_BUREAU: "Bureau" };
const LEVELS = [["PRO_COORDINATEUR", "Pro coordinateur"], ["PRO_AVANCE", "Pro avancé"],
  ["REFERENT_BENEVOLE", "Particulier référent"], ["BENEVOLE_VALIDE", "Bénévole validé"]];

export const DelegationSettings = () => {
  const [s, setS] = useState(null);
  useEffect(() => { api.get("/settings/delegation").then((r) => setS(r.data)).catch(() => {}); }, []);
  if (!s) return null;
  const save = async () => {
    try { const { data } = await api.put("/settings/delegation", s); setS(data); toast.success("Critères de délégation enregistrés"); }
    catch (e) { toast.error(apiError(e)); }
  };
  const num = (label, key, testId) => (
    <div><Label className="text-xs">{label}</Label>
      <Input type="number" min={0} value={s[key] ?? ""} data-testid={testId}
        onChange={(e) => setS({ ...s, [key]: e.target.value === "" ? null : Number(e.target.value) })} /></div>
  );
  return (
    <SectionCard title="Délégation de publication" icon={ShieldCheck} testId="delegation-card" className="mb-6"
      subtitle="Les profils délégués publient directement une activité ou un événement qui respecte ces critères. Le Bureau est notifié et garde un droit de modération a posteriori."
      actions={<Button size="sm" onClick={save} data-testid="delegation-save"
        className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"><Save className="mr-1.5 h-3.5 w-3.5" /> Enregistrer</Button>}>
      <label className="flex items-center gap-3 text-sm font-semibold text-[var(--marine)]">
        <Switch checked={!!s.enabled} onCheckedChange={(v) => setS({ ...s, enabled: v })} data-testid="delegation-enabled" />
        Délégation active
      </label>
      <div className="mt-4 flex flex-wrap gap-3">
        {LEVELS.map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <Checkbox checked={(s.levels || []).includes(k)} data-testid={`delegation-level-${k}`}
              onCheckedChange={(c) => setS({ ...s, levels: c ? [...(s.levels || []), k] : (s.levels || []).filter((x) => x !== k) })} />
            {label}
          </label>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {num("Capacité maximale (places)", "max_capacity", "delegation-max-capacity")}
        {num("Tarif maximal (€, 0 = gratuit)", "max_price", "delegation-max-price")}
        {num("Délai minimal (jours avant la date)", "min_days_ahead", "delegation-min-days")}
        {num("Fenêtre de modération (heures)", "moderation_hours", "delegation-hours")}
      </div>
      <label className="mt-4 flex items-center gap-3 text-sm">
        <Switch checked={!!s.require_association_terrain} data-testid="delegation-terrain"
          onCheckedChange={(v) => setS({ ...s, require_association_terrain: v })} />
        Le lieu doit être un terrain de l'association
      </label>
    </SectionCard>
  );
};

export const OnboardingSettings = () => {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/settings/onboarding").then((r) => setData(r.data)).catch(() => {}); }, []);
  if (!data) return null;
  const toggle = (role, id) => {
    const cur = data.guides[role] || [];
    setData({ ...data, guides: { ...data.guides, [role]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] } });
  };
  const save = async () => {
    try { const { data: d } = await api.put("/settings/onboarding", { guides: data.guides }); setData({ ...data, guides: d.guides }); toast.success("Guides d'accueil enregistrés"); }
    catch (e) { toast.error(apiError(e)); }
  };
  return (
    <SectionCard title="Onboarding : guides envoyés à la validation" icon={GraduationCap} testId="onboarding-card" className="mb-6"
      subtitle="Dès qu'un membre est validé, il reçoit ces guides (publiés par l'association) en notification."
      actions={<Button size="sm" onClick={save} data-testid="onboarding-save"
        className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"><Save className="mr-1.5 h-3.5 w-3.5" /> Enregistrer</Button>}>
      {data.available.length === 0 && <p className="text-sm text-muted-foreground">Aucun guide publié pour l'instant.</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {["PARTICULIER", "PROFESSIONNEL"].map((role) => (
          <div key={role} className="rounded-lg border p-3" data-testid={`onboarding-${role}`}>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--bordeaux)]">{ROLE_LABELS[role]}</p>
            <div className="mt-2 space-y-1.5">
              {data.available.map((g) => (
                <label key={g.guide_id} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={(data.guides[role] || []).includes(g.guide_id)}
                    data-testid={`onboarding-${role}-${g.guide_id}`} onCheckedChange={() => toggle(role, g.guide_id)} />
                  <span>{g.title}</span> <Chip tone="muted">{g.module}</Chip>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
};

export const BlockVisibilitySettings = ({ onSaved }) => {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/settings/block-visibility").then((r) => setData(r.data)).catch(() => {}); }, []);
  if (!data) return null;
  const isVisible = (key, role) => !(data.hidden[key] || []).includes(role);
  const toggle = (key, role) => {
    const cur = data.hidden[key] || [];
    setData({ ...data, hidden: { ...data.hidden, [key]: isVisible(key, role) ? [...cur, role] : cur.filter((r) => r !== role) } });
  };
  const save = async () => {
    try { const { data: d } = await api.put("/settings/block-visibility", { hidden: data.hidden }); setData(d); onSaved?.(); toast.success("Visibilité des blocs enregistrée"); }
    catch (e) { toast.error(apiError(e)); }
  };
  return (
    <SectionCard title="Visibilité des blocs par profil" icon={Eye} testId="block-visibility-card" className="mb-6"
      subtitle="Décochez un bloc pour le retirer de l'interface d'un profil. Il disparaît sans espace vide ni message."
      actions={<Button size="sm" onClick={save} data-testid="block-visibility-save"
        className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"><Save className="mr-1.5 h-3.5 w-3.5" /> Enregistrer</Button>}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground">
            <th className="px-2 py-2">Bloc</th>{data.roles.map((r) => <th key={r} className="px-2 py-2 text-center">{ROLE_LABELS[r]}</th>)}</tr></thead>
          <tbody>
            {Object.entries(data.blocks).map(([key, label]) => (
              <tr key={key} className="border-b last:border-0" data-testid={`block-row-${key}`}>
                <td className="px-2 py-2 font-medium text-[var(--marine)]">{label}</td>
                {data.roles.map((r) => (
                  <td key={r} className="px-2 py-2 text-center">
                    <Checkbox checked={isVisible(key, r)} data-testid={`block-${key}-${r}`} onCheckedChange={() => toggle(key, r)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
};
