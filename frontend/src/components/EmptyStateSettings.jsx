import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageSquareText, Save } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { SectionCard } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const ROLE_LABELS = { PARTICULIER: "Particulier", PROFESSIONNEL: "Professionnel", ADMIN_BUREAU: "Bureau" };

/** Messages d'états vides rédigés par le Bureau, module par module et profil par profil. */
export const EmptyStateSettings = () => {
  const [data, setData] = useState(null);
  const [module, setModule] = useState("tasks");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get("/settings/empty-states").then((r) => setData(r.data)).catch(() => {}); }, []);
  if (!data) return null;

  const entry = (role) => data.messages?.[module]?.[role] || {};
  const update = (role, field, value) => setData({ ...data, messages: { ...data.messages,
    [module]: { ...(data.messages[module] || {}), [role]: { ...entry(role), [field]: value } } } });

  const save = async () => {
    setBusy(true);
    try {
      const { data: saved } = await api.put("/settings/empty-states", { messages: data.messages });
      setData(saved);
      toast.success("Messages d'états vides enregistrés");
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };

  return (
    <SectionCard title="États vides guidants" icon={MessageSquareText} testId="empty-states-card" className="mb-6"
      subtitle="Quand un module est vide, ce message et ce bouton s'affichent pour le profil concerné. Sans message, un texte neutre par défaut est utilisé."
      actions={<Button size="sm" disabled={busy} onClick={save} data-testid="empty-states-save"
        className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]">
        <Save className="mr-1.5 h-3.5 w-3.5" /> Enregistrer</Button>}>
      <div className="w-full sm:w-72">
        <Label className="text-xs">Module</Label>
        <Select value={module} onValueChange={setModule}>
          <SelectTrigger data-testid="empty-states-module"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(data.modules).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {data.roles.map((role) => (
          <div key={role} className="rounded-lg border p-3" data-testid={`empty-state-${role}`}>
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--bordeaux)]">{ROLE_LABELS[role]}</p>
            <Textarea rows={3} className="mt-2" placeholder="Message court et bienveillant…" value={entry(role).message || ""}
              data-testid={`empty-state-message-${role}`} onChange={(e) => update(role, "message", e.target.value)} />
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <Input placeholder="Libellé du bouton" value={entry(role).action_label || ""}
                data-testid={`empty-state-label-${role}`} onChange={(e) => update(role, "action_label", e.target.value)} />
              <Input placeholder="Lien (ex. /activities)" value={entry(role).action_link || ""}
                data-testid={`empty-state-link-${role}`} onChange={(e) => update(role, "action_link", e.target.value)} />
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
};
