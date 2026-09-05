import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Accessibility, Eye, Type, Sparkles, LayoutGrid, Save , Bell} from "lucide-react";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { SectionCard, Chip } from "@/components/Ui";
import { useTheme, THEMES } from "@/components/ThemeProvider";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const FONTS = [["DEFAULT", "Atkinson Hyperlegible (lisibilité, par défaut)"], ["LEXEND", "Lexend (lecture fluide)"],
  ["DYSLEXIA", "OpenDyslexic (police dyslexie)"]];
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
  const { userKey, setUserTheme, textSize, setTextSize, animationsOff, setAnimationsOff } = useTheme();
  const [access, setAccess] = useState({ font: "DEFAULT", text_size: "NORMAL", spacing: "NORMAL",
    contrast: "NORMAL", focus_mode: false, reduce_motion: false });
  const [hidden, setHidden] = useState([]);
  const [recapEmail, setRecapEmail] = useState(true);
  const [notifTypes, setNotifTypes] = useState(null);
  const [notifPrefs, setNotifPrefs] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!profile) return;
    setAccess((a) => ({ ...a, ...(profile.accessibility || {}) }));
    setHidden(profile.preferences?.hidden_modules || []);
    setRecapEmail(profile.preferences?.monthly_recap_email !== false);
    setNotifPrefs(profile.preferences?.notification_prefs || {});
    if (profile.preferences?.theme) setUserTheme(profile.preferences.theme);
    if (profile.preferences?.text_size) setTextSize(profile.preferences.text_size);
    if (typeof profile.preferences?.animations_off === "boolean") setAnimationsOff(profile.preferences.animations_off);
  }, [profile]);
  useEffect(() => { api.get("/settings/notification-types").then((r) => setNotifTypes(r.data)).catch(() => {}); }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/profiles/me/accessibility", access);
      await api.put("/profiles/me/preferences", { hidden_modules: hidden,
        monthly_recap_email: recapEmail, notification_prefs: notifPrefs, theme: userKey || null,
        text_size: textSize, animations_off: animationsOff });
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
      <SectionCard title="Confort de lecture & animations" icon={Palette} testId="a11y-comfort-card"
        subtitle="Ajustez la taille du texte et les animations. Appliqué immédiatement, sur toute la plateforme.">
        <div className="space-y-4">
          <div>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="font-medium text-[var(--marine)]">Taille du texte</span>
              <span className="text-muted-foreground" data-testid="text-size-value">{textSize}px</span>
            </div>
            <input type="range" min="14" max="24" step="1" value={textSize} data-testid="text-size-slider"
              onChange={(e) => setTextSize(Number(e.target.value))} className="w-full accent-[var(--bordeaux)]" />
          </div>
          <label className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
            <span>Réduire les animations (transitions instantanées)</span>
            <input type="checkbox" checked={animationsOff} data-testid="animations-off-toggle"
              onChange={(e) => setAnimationsOff(e.target.checked)} className="h-5 w-5 accent-[var(--bordeaux)]" />
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Mon thème" icon={Palette} testId="user-theme-card"
        subtitle="Choisissez votre thème. Votre choix prime sur le thème par défaut de l'association.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="user-theme-choices">
          <button data-testid="user-theme-INHERIT" onClick={() => setUserTheme(null)}
            className={`rounded-xl border-2 p-3 text-left text-sm transition-all ${!userKey
              ? "border-[var(--bordeaux)]" : "border-transparent bg-muted/40 hover:border-[var(--bordeaux-a40)]"}`}>
            <p className="font-semibold text-[var(--marine)]">Choix du Bureau</p>
            <p className="text-xs text-muted-foreground">Suivre le thème par défaut</p>
          </button>
          {Object.entries(THEMES).map(([key, t]) => (
            <button key={key} data-testid={`user-theme-${key}`} onClick={() => setUserTheme(key)}
              className={`rounded-xl border-2 p-3 text-left transition-all ${userKey === key
                ? "border-[var(--bordeaux)]" : "border-transparent bg-muted/40 hover:border-[var(--bordeaux-a40)]"}`}>
              <div className="mb-1.5 flex gap-1">
                <span className="h-5 w-5 rounded-full" style={{ background: t.vars["--bordeaux"] }} />
                <span className="h-5 w-5 rounded-full" style={{ background: t.vars["--marine"] }} />
                <span className="h-5 w-5 rounded-full border" style={{ background: t.vars["--surface"] }} />
              </div>
              <p className="text-sm font-semibold text-[var(--marine)]">{t.label}</p>
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Appliqué immédiatement. « Enregistrer » le mémorise sur vos autres appareils.</p>
      </SectionCard>

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
          <div className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold text-[var(--marine)]">
                <Eye className="h-4 w-4 text-[var(--bordeaux)]" /> Mode focus
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Le mode focus s'active page par page grâce au bouton « Focus » de la barre du haut.
                Il masque les blocs secondaires, notifications et alertes, et se réinitialise à la déconnexion.
              </span>
            </span>
          </div>
          <label className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <span>
              <span className="flex items-center gap-2 text-sm font-semibold text-[var(--marine)]">
                <Sparkles className="h-4 w-4 text-[var(--bordeaux)]" /> Réduire les animations
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
                  : "bg-[var(--marine)] text-white"}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Les modules en grisé sont masqués. Vos droits d'accès ne changent pas : seul l'affichage est adapté.
        </p>
      </SectionCard>

      {notifTypes && !notifTypes.locked && (
        <SectionCard title="Mes notifications" icon={Bell} testId="notification-preferences-card"
          subtitle="Choisissez les notifications que vous souhaitez recevoir dans la plateforme.">
          <div className="space-y-2">
            {Object.entries(notifTypes.types).map(([key, label]) => (
              <label key={key} className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
                <span>{label}</span>
                <Switch checked={notifPrefs[key] !== false} data-testid={`notif-pref-${key}`}
                  onCheckedChange={(v) => setNotifPrefs({ ...notifPrefs, [key]: v })} />
              </label>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Récap mensuel d'engagement" testId="recap-preferences-card"
        subtitle="Chaque 1er du mois, un résumé de vos tampons et du palier suivant.">
        <label className="flex items-center gap-3 text-sm">
          <Switch checked={recapEmail} onCheckedChange={setRecapEmail}
            data-testid="recap-email-switch" />
          Recevoir aussi le récap par e-mail (la notification dans la plateforme reste active)
        </label>
      </SectionCard>

      <SectionCard title="Synchronisation d'agenda" testId="calendar-sync-card"        subtitle="Exportez vos éléments de la plateforme vers votre agenda Google (à venir).">
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
          className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]">
          <Save className="mr-2 h-4 w-4" /> {busy ? "Enregistrement…" : "Enregistrer mes préférences"}
        </Button>
        <Chip tone="muted"><Accessibility className="h-3 w-3" /> Accessibilité cognitive et sensorielle</Chip>
      </div>
    </div>
  );
};

export default DisplayPreferences;
