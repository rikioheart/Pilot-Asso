import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LayoutDashboard, Save } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { SectionCard } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

const ROLE_LABELS = {
  PARTICULIER: "Adhérent (particulier)", PROFESSIONNEL: "Professionnel",
  PRO_COORDINATEUR: "Professionnel coordinateur", ADMIN_BUREAU: "Bureau / Admin",
};

/** Bureau — visibilité par défaut des informations secondaires du tableau de bord, par rôle. */
export const DashboardBlocksSettings = () => {
  const [roles, setRoles] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get("/settings/dashboard").then((r) => setRoles(r.data.roles)).catch(() => {}); }, []);
  if (!roles) return null;

  const save = async () => {
    setBusy(true);
    try { await api.put("/settings/dashboard", { roles }); toast.success("Préférences du tableau de bord enregistrées"); }
    catch (e) { toast.error(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <SectionCard title="Tableau de bord — blocs par défaut" icon={LayoutDashboard} testId="dashboard-blocks-card"
      subtitle="Choisissez si les informations secondaires sont dépliées par défaut pour chaque rôle. Chaque membre peut ensuite les masquer ou les afficher.">
      <div className="space-y-list">
        {Object.keys(roles).map((r) => (
          <label key={r} className="flex items-center justify-between rounded-lg border p-card" data-testid={`dashboard-role-${r}`}>
            <span className="font-semibold text-[var(--marine)]">{ROLE_LABELS[r] || r}</span>
            <Switch checked={roles[r]} data-testid={`dashboard-role-switch-${r}`}
              onCheckedChange={(v) => setRoles({ ...roles, [r]: v })} />
          </label>
        ))}
      </div>
      <Button onClick={save} disabled={busy} data-testid="dashboard-blocks-save"
        className="mt-4 rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]">
        <Save className="mr-2 h-4 w-4" /> Enregistrer
      </Button>
    </SectionCard>
  );
};

export default DashboardBlocksSettings;
