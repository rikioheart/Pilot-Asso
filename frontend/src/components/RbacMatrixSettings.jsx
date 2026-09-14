import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, RotateCcw, Save } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { SectionCard } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const LEVEL_LABELS = {
  PRO_STANDARD: "Professionnel — Standard", PRO_AVANCE: "Professionnel — Avancé",
  PRO_COORDINATEUR: "Professionnel — Coordinateur",
  PARTICULIER_STANDARD: "Particulier — Standard", PARTICULIER_IMPLIQUE: "Particulier — Impliqué",
  BENEVOLE_VALIDE: "Bénévole validé", REFERENT_BENEVOLE: "Référent bénévole",
};

const groupOf = (p) => p.split(".")[0];

/** Correctif Bureau — matrice des permissions par niveau, modifiable et persistée hors du code. */
export const RbacMatrixSettings = () => {
  const [data, setData] = useState(null);
  const [level, setLevel] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => api.get("/settings/rbac").then((r) => {
    setData(r.data);
    setLevel((prev) => prev || Object.keys(r.data.level_permissions)[0]);
  }).catch((e) => toast.error(apiError(e)));

  useEffect(() => { load(); }, []);
  if (!data) return null;

  const perms = data.level_permissions[level] || [];
  const has = (p) => perms.includes(p);
  const toggle = (p, on) => {
    const next = on ? [...new Set([...perms, p])] : perms.filter((x) => x !== p);
    setData({ ...data, level_permissions: { ...data.level_permissions, [level]: next } });
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/settings/rbac", { level_permissions: data.level_permissions });
      toast.success("Matrice des permissions enregistrée");
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const reset = async () => {
    setBusy(true);
    try {
      const { data: r } = await api.post("/settings/rbac/reset");
      setData((d) => ({ ...d, level_permissions: r.level_permissions }));
      toast.success("Matrice réinitialisée aux valeurs par défaut");
    } catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  const groups = [...new Set(data.permissions.map(groupOf))];

  return (
    <SectionCard title="Matrice des permissions" icon={ShieldCheck} testId="rbac-matrix-card"
      subtitle="Choisissez les permissions accordées à chaque niveau. Les modifications s'appliquent immédiatement.">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger className="w-72" data-testid="rbac-level-select"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.keys(data.level_permissions).map((l) => (
              <SelectItem key={l} value={l} data-testid={`rbac-level-option-${l}`}>
                {LEVEL_LABELS[l] || l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{perms.length} permission(s) active(s)</span>
      </div>

      <div className="max-h-[420px] space-y-4 overflow-y-auto pr-2">
        {groups.map((g) => (
          <div key={g}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--bordeaux)]">{g}</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {data.permissions.filter((p) => groupOf(p) === g).map((p) => (
                <label key={p} className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm"
                  data-testid={`rbac-perm-${p}`}>
                  <Checkbox checked={has(p)} data-testid={`rbac-perm-check-${p}`}
                    onCheckedChange={(v) => toggle(p, !!v)} />
                  <span className="font-mono text-xs">{p}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <Button onClick={save} disabled={busy} data-testid="rbac-save"
          className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]">
          <Save className="mr-2 h-4 w-4" /> Enregistrer
        </Button>
        <Button variant="outline" onClick={reset} disabled={busy} data-testid="rbac-reset" className="rounded-full">
          <RotateCcw className="mr-2 h-4 w-4" /> Réinitialiser
        </Button>
      </div>
    </SectionCard>
  );
};

export default RbacMatrixSettings;
