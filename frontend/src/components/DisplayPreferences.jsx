import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Accessibility, Eye, Type, Sparkles, LayoutGrid, Save } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { SectionCard, Chip } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FONTS = [["DEFAULT", "Police standard"], ["DYSLEXIA", "Police dyslexie (OpenDyslexic)"],
  ["SERIF", "Police à empattement"]];
const SIZES = [["SMALL", "Petite"], ["NORMAL", "Normale"], ["LARGE", "Grande"], ["XLARGE", "Très grande"]];
const SPACINGS = [["NORMAL", "Normal"], ["COMFORTABLE", "Confortable"], ["WIDE", "Très espacé"]];
const CONTRASTS = [["NORMAL", "Standard"], ["HIGH", "Contraste élevé"], ["SOFT", "Palette douce"]];
const MODULES = [["feed", "Fil d'actualité"], ["engagement", "Ma progression"], ["tasks", "Mes tâches"],
  ["activities", "Activités"], ["events", "Événements"], ["loyalty", "Fidélité"],
  ["advantages", "Avantages"], ["library", "Bibliothèque"], ["formations", "Formations"],
  ["blog", "Blog"], ["priorities", "File de priorité"], ["exports", "Exports"],
  ["statistics", "Statistiques"]];

export const DisplayPreferences = () => {
  const { profile, refresh } = useAuth();
  const [access, setAccess] = useState({ font: "DEFAULT", text_size: "NORMAL", spacing: "NORMAL",
    contrast: "NORMAL", focus_mode: false, reduce_motion: false });
  const [hidden, setHidden] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setAccess((a) => ({ ...a, ...(profile.accessibility || {}) }));
    setHidden(profile.preferences?.hidden_modules || []);
  }, [profile]);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/profiles/me/accessibility", access);
      await api.put("/profiles/me/preferences", { hidden_modules: hidden });
      await refresh?.();
      toast.success("Préférences enregistrées et appliquées");
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };

  const toggleModule = (key) => setHidden((h) =>
    h.includes(key) ? h.filter((m) => m !== key) : [...h, key]);

  const field = (label, value, options, onChange, testId) => (
    <div>
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger data-testid={testId}><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <div className="space-y-6" data-testid="display-preferences">
      <SectionCard title="Confort de lecture" icon={Type} testId="accessibility-card"
        subtitle="Ces réglages s'appliquent immédiatement sur tous les écrans, à chaque connexion.">
        <div className="grid gap-4 sm:grid-cols-2">
          {field("Police", access.font, FONTS, (v) => setAccess({ ...access, font: v }), "access-font-select")}
          {field("Taille du texte", access.text_size, SIZES,
            (v) => setAccess({ ...access, text_size: v }), "access-size-select")}
          {field("Espacement", access.spacing, SPACINGS,
            (v) => setAccess({ ...access, spacing: v }), "access-spacing-select")}
          {field("Contraste", access.contrast, CONTRASTS,
            (v) => setAccess({ ...access, contrast: v }), "access-contrast-select")}
        </div>
        <div className="mt-5 space-y-4">
          <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold text-[#002060]">
                <Eye className="h-4 w-4 text-[#800020]" /> Mode focus
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Masque les éléments secondaires pour ne garder que l'essentiel.
              </span>
            </span>
            <Switch checked={access.focus_mode} data-testid="access-focus-switch"
              onCheckedChange={(v) => setAccess({ ...access, focus_mode: v })} />
          </label>
          <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold text-[#002060]">
                <Sparkles className="h-4 w-4 text-[#800020]" /> Réduire les animations
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Recommandé en cas de trouble de l'attention ou de sensibilité au mouvement.
              </span>
            </span>
            <Switch checked={access.reduce_motion} data-testid="access-motion-switch"
              onCheckedChange={(v) => setAccess({ ...access, reduce_motion: v })} />
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Mon espace : que voulez-vous voir ?" icon={LayoutGrid} testId="modules-card"
        subtitle="Décochez les modules que vous ne souhaitez pas afficher dans votre espace.">
        <div className="flex flex-wrap gap-2">
          {MODULES.map(([key, label]) => (
            <button key={key} type="button" onClick={() => toggleModule(key)}
              data-testid={`module-toggle-${key}`}
              className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                hidden.includes(key)
                  ? "bg-muted text-muted-foreground line-through"
                  : "bg-[#002060] text-white"}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Les modules en grisé sont masqués. Vos droits d'accès ne changent pas : seul l'affichage est adapté.
        </p>
      </SectionCard>

      <SectionCard title="Synchronisation d'agenda" testId="calendar-sync-card"
        subtitle="Exportez vos éléments de la plateforme vers votre agenda Google (à venir).">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="outline" className="rounded-full" disabled
            data-testid="google-calendar-sync-button">
            Synchroniser avec Google Calendar
          </Button>
          <Chip tone="amber">Bientôt disponible</Chip>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          La synchronisation sera unidirectionnelle (plateforme → Google) et restera au choix de chacun.
        </p>
      </SectionCard>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={busy} data-testid="preferences-save-button"
          className="rounded-full bg-[#800020] hover:bg-[#63001a]">
          <Save className="mr-2 h-4 w-4" /> {busy ? "Enregistrement…" : "Enregistrer mes préférences"}
        </Button>
        <Chip tone="muted"><Accessibility className="h-3 w-3" /> Accessibilité cognitive et sensorielle</Chip>
      </div>
    </div>
  );
};

export default DisplayPreferences;
