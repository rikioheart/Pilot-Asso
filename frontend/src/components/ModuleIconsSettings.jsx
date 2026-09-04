import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Shapes, Save } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { SectionCard } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { ICON_LIBRARY, ICON_NAMES, ICONABLE_MODULES } from "@/lib/moduleIcons";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ModuleIconsSettings() {
  const [icons, setIcons] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/settings/module-icons").then((r) => setIcons(r.data.icons || {})).catch(() => {});
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/settings/module-icons", { icons });
      toast.success("Icônes des modules enregistrées");
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <SectionCard title="Icônes des modules" icon={Shapes} testId="module-icons-card" className="mb-6"
      subtitle="Choisissez une icône par module. Elle s'affiche à côté du nom (jamais à la place) dans la navigation et le tableau de bord.">
      <div className="grid gap-3 sm:grid-cols-2" data-testid="module-icons-list">
        {ICONABLE_MODULES.map(([key, label]) => {
          const Current = ICON_LIBRARY[icons[key]];
          return (
            <div key={key} className="flex items-center gap-2 rounded-lg border p-2" data-testid={`module-icon-row-${key}`}>
              {Current ? <Current className="h-5 w-5 text-[var(--bordeaux)]" /> : <span className="h-5 w-5" />}
              <span className="flex-1 text-sm font-medium text-[var(--marine)]">{label}</span>
              <Select value={icons[key] || "DEFAULT"} onValueChange={(v) =>
                setIcons({ ...icons, [key]: v === "DEFAULT" ? "" : v })}>
                <SelectTrigger className="w-36" data-testid={`module-icon-select-${key}`}><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  <SelectItem value="DEFAULT">Par défaut</SelectItem>
                  {ICON_NAMES.map((name) => (
                    <SelectItem key={name} value={name} data-testid={`module-icon-opt-${name}`}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        })}
      </div>
      <Button onClick={save} disabled={busy} data-testid="module-icons-save"
        className="mt-4 rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]">
        <Save className="mr-2 h-4 w-4" /> {busy ? "Enregistrement…" : "Enregistrer les icônes"}
      </Button>
    </SectionCard>
  );
}
