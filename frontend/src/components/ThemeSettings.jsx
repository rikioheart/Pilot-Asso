import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Palette } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { SectionCard } from "@/components/Ui";
import { useTheme, THEMES, applyTheme } from "@/components/ThemeProvider";

export const ThemeSettings = () => {
  const { bureauKey, reload } = useTheme();
  const [sel, setSel] = useState("T1");
  useEffect(() => { setSel(bureauKey); }, [bureauKey]);

  const save = async (key) => {
    setSel(key);
    try {
      await api.put("/settings/theme", { theme_key: key });
      await reload();
      applyTheme(key);
      toast.success("Thème par défaut enregistré");
    } catch (e) { toast.error(apiError(e)); }
  };

  return (
    <SectionCard title="Thème par défaut de l'association" icon={Palette} testId="theme-settings-card"
      className="mb-6" subtitle="Le thème appliqué par défaut à toute la plateforme. Chaque membre peut choisir le sien depuis son espace.">
      <div className="grid gap-3 sm:grid-cols-3" data-testid="theme-choices">
        {Object.entries(THEMES).map(([key, t]) => (
          <button key={key} data-testid={`theme-choice-${key}`} onClick={() => save(key)}
            className={`rounded-xl border-2 p-4 text-left transition-all ${sel === key
              ? "border-[var(--bordeaux)]" : "border-transparent bg-muted/40 hover:border-[var(--bordeaux-a40)]"}`}>
            <div className="mb-2 flex gap-1">
              <span className="h-6 w-6 rounded-full" style={{ background: t.vars["--bordeaux"] }} />
              <span className="h-6 w-6 rounded-full" style={{ background: t.vars["--marine"] }} />
              <span className="h-6 w-6 rounded-full border" style={{ background: t.vars["--surface"] }} />
            </div>
            <p className="font-semibold text-[var(--marine)]">{t.label}</p>
            {sel === key && <p className="text-xs text-[var(--bordeaux)]">Thème par défaut</p>}
          </button>
        ))}
      </div>
    </SectionCard>
  );
};

export default ThemeSettings;
