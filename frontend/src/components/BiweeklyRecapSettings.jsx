import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { SectionCard } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

export function BiweeklyRecapSettings() {
  const [cfg, setCfg] = useState(null);
  const [sending, setSending] = useState(false);
  const load = () => api.get("/settings/biweekly-recap").then((r) => setCfg(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!cfg) return null;

  const save = async (patch) => {
    try {
      const { data } = await api.put("/settings/biweekly-recap", { ...cfg, ...patch });
      setCfg(data); toast.success("Récap enregistré");
    } catch (e) { toast.error(apiError(e)); }
  };
  const trigger = async () => {
    setSending(true);
    try { const { data } = await api.post("/exports/biweekly-recaps"); toast.success(`Envoyé : ${data.sent ?? 0} membre(s)`); }
    catch (e) { toast.error(apiError(e)); }
    finally { setSending(false); }
  };

  return (
    <SectionCard title="Récapitulatif bihebdomadaire" icon={CalendarClock} testId="biweekly-settings-card" className="mb-6"
      subtitle="Un résumé personnalisé (séances, activités à venir, nouveautés) envoyé toutes les 2 semaines. Chaque membre peut se désabonner depuis son espace.">
      <label className="flex items-center gap-2 text-sm" data-testid="biweekly-enabled-row">
        <Checkbox checked={cfg.enabled} data-testid="biweekly-enabled"
          onCheckedChange={(v) => save({ enabled: !!v })} />
        Activer l'envoi bihebdomadaire
      </label>
      <div className="mt-3 space-y-2">
        <Textarea rows={2} value={cfg.intro || ""} data-testid="biweekly-intro-input"
          onChange={(e) => setCfg({ ...cfg, intro: e.target.value })} placeholder="Message d'introduction" />
        <div className="flex gap-2">
          <Button size="sm" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
            data-testid="biweekly-save" onClick={() => save({ intro: cfg.intro })}>Enregistrer le texte</Button>
          <Button size="sm" variant="outline" className="rounded-full" data-testid="biweekly-test" onClick={trigger} disabled={sending}>
            {sending ? "Envoi…" : "Envoyer maintenant (test)"}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
