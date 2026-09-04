import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Globe, ExternalLink, Copy } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { SectionCard } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";

const TOGGLES = [["enabled", "Page publique active"], ["show_events", "Afficher l'agenda public"],
  ["show_pros", "Afficher les professionnels (QR carte de visite)"], ["show_gallery", "Afficher la galerie d'activités"]];

export function PublicPageSettings() {
  const [cfg, setCfg] = useState(null);
  const url = `${window.location.origin}/public`;
  const load = () => api.get("/settings/public-page").then((r) => setCfg(r.data)).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!cfg) return null;

  const save = async (patch) => {
    try { const { data } = await api.put("/settings/public-page", { ...cfg, ...patch }); setCfg(data); toast.success("Page publique mise à jour"); }
    catch (e) { toast.error(apiError(e)); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast.success("Lien copié !"); } catch { toast.message(url); } };

  return (
    <SectionCard title="Page publique de l'association" icon={Globe} testId="public-page-card" className="mb-6"
      subtitle="Une page accessible sans connexion. Choisissez ce qui est visible et partagez le lien.">
      <div className="space-y-3" data-testid="public-toggles">
        {TOGGLES.map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-4 rounded-lg border p-3 text-sm">
            <span>{label}</span>
            <Switch checked={cfg[key] !== false} data-testid={`public-toggle-${key}`}
              onCheckedChange={(v) => save({ [key]: v })} />
          </label>
        ))}
      </div>
      <div className="mt-4 space-y-2">
        <Textarea rows={2} value={cfg.intro || ""} data-testid="public-intro-input"
          onChange={(e) => setCfg({ ...cfg, intro: e.target.value })} placeholder="Texte de présentation" />
        <Button size="sm" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
          data-testid="public-intro-save" onClick={() => save({ intro: cfg.intro })}>Enregistrer le texte</Button>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm" data-testid="public-link">
        <span className="truncate text-[var(--marine)]">{url}</span>
        <Button size="sm" variant="outline" className="ml-auto rounded-full" data-testid="public-copy" onClick={copy}><Copy className="mr-1 h-3.5 w-3.5" /> Copier</Button>
        <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-semibold text-[var(--marine)] hover:bg-muted" data-testid="public-open">
          <ExternalLink className="h-3.5 w-3.5" /> Ouvrir
        </a>
      </div>
    </SectionCard>
  );
}
