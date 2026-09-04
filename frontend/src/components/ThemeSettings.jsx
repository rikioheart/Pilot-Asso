import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Palette, RotateCcw, Save } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { SectionCard } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme, applyTheme, DEFAULT_THEME } from "@/components/ThemeProvider";
import { confirmDialog } from "@/components/ConfirmDialog";

const MAIN = [["primary", "Bordeaux — actions principales"], ["primary_dark", "Bordeaux foncé — survol"],
  ["dark", "Bleu Nuit — navigation et fonds sombres"], ["surface", "Blanc — zones de contenu"],
  ["surface_alt", "Gris très clair — fonds secondaires"]];
const STATUS = [["status_ok", "Vert — actif / validé"], ["status_warn", "Orange — en attente"],
  ["status_error", "Rouge — inactif / erreur"]];

export const ThemeSettings = () => {
  const { theme, reload } = useTheme();
  const [form, setForm] = useState(theme);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setForm(theme); }, [theme]);

  const update = (k, v) => {
    const next = { ...form, [k]: v };
    setForm(next);
    if (/^#[0-9a-fA-F]{6}$/.test(v)) applyTheme(next);
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/settings/theme", form);
      await reload();
      toast.success("Charte graphique appliquée à toute la plateforme");
    } catch (e) { toast.error(apiError(e)); applyTheme(theme); }
    finally { setBusy(false); }
  };

  const reset = async () => {
    if (!(await confirmDialog("Revenir aux couleurs d'origine de La Voix du Chien ?"))) return;
    try {
      await api.post("/settings/theme/reset");
      await reload();
      toast.success("Couleurs réinitialisées");
    } catch (e) { toast.error(apiError(e)); }
  };

  const field = ([k, label]) => (
    <div key={k} className="flex items-center gap-3 rounded-lg border p-3">
      <input type="color" value={form[k] || DEFAULT_THEME[k]} data-testid={`theme-color-${k}`}
        onChange={(e) => update(k, e.target.value)} aria-label={label}
        className="h-10 w-10 shrink-0 cursor-pointer rounded-md border-0 bg-transparent" />
      <div className="min-w-0 flex-1">
        <Label className="text-xs">{label}</Label>
        <Input value={form[k] || ""} data-testid={`theme-input-${k}`} className="mt-1 h-8 font-mono text-xs"
          onChange={(e) => update(k, e.target.value)} />
      </div>
    </div>
  );

  return (
    <SectionCard title="Charte graphique" icon={Palette} testId="theme-settings-card" className="mb-6"
      subtitle="Couleurs principales et couleurs de statut appliquées à l'ensemble de la plateforme, pour tous les profils."
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="rounded-full" onClick={reset} data-testid="theme-reset-button">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Réinitialiser
          </Button>
          <Button size="sm" disabled={busy} onClick={save} data-testid="theme-save-button"
            className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]">
            <Save className="mr-1.5 h-3.5 w-3.5" /> {busy ? "Enregistrement…" : "Appliquer"}
          </Button>
        </div>
      }>
      <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Couleurs principales</p>
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{MAIN.map(field)}</div>
      <p className="mt-5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
        Couleurs de statut (réservées aux états fonctionnels)
      </p>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">{STATUS.map(field)}</div>
    </SectionCard>
  );
};
