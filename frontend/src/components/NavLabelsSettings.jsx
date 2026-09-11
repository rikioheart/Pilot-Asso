import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Tags, Save, RotateCcw } from "lucide-react";
import { useNavLabels, saveNavLabels } from "@/lib/useNavLabels";
import { SectionCard } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// Libellés d'origine renommables (onglets & catégories principales, tous rôles confondus).
const DEFAULTS = [
  "Activités", "Tâches", "Validation", "Membres", "Finances", "Pilotage", "Vie de l'asso",
  "Communication", "Gestion", "Administration", "Mes tâches", "Participations", "Mon activité",
  "Contenus", "Réseau", "Mon chien", "Ma fidélité", "Participer", "Mes avantages", "Mon espace",
];

export function NavLabelsSettings() {
  const labels = useNavLabels();
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(labels || {}); }, [labels]);

  const save = async () => {
    setBusy(true);
    try {
      const clean = Object.fromEntries(Object.entries(draft).filter(([k, v]) => v && v !== k));
      await saveNavLabels(clean);
      toast.success("Libellés mis à jour — ils s'appliquent immédiatement.");
    } catch { toast.error("Impossible d'enregistrer les libellés pour le moment."); }
    finally { setBusy(false); }
  };

  return (
    <SectionCard title="Libellés de navigation" icon={Tags} testId="nav-labels-settings"
      subtitle="Renommez les onglets et catégories. Laissez vide pour conserver le libellé par défaut."
      actions={
        <Button size="sm" onClick={save} disabled={busy} data-testid="nav-labels-save"
          className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]">
          <Save className="mr-2 h-4 w-4" /> Enregistrer
        </Button>
      }>
      <div className="grid gap-3 sm:grid-cols-2">
        {DEFAULTS.map((key) => (
          <div key={key} className="flex items-center gap-2">
            <span className="w-36 shrink-0 truncate text-xs font-semibold text-muted-foreground" title={key}>{key}</span>
            <Input value={draft[key] ?? ""} placeholder={key} data-testid={`nav-label-${key}`}
              onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} className="h-8" />
            {draft[key] && draft[key] !== key && (
              <button type="button" title="Réinitialiser" data-testid={`nav-label-reset-${key}`}
                onClick={() => setDraft((d) => ({ ...d, [key]: "" }))}
                className="text-muted-foreground hover:text-[var(--bordeaux)]"><RotateCcw className="h-3.5 w-3.5" /></button>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

export default NavLabelsSettings;
