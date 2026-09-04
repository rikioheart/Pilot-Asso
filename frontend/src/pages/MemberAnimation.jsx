import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { HeartHandshake, UserX, UserCog, BookOpen, Send } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, KpiCard, SectionCard, EmptyState, Chip, ProgressBar } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const SUGGESTIONS = [
  "Bonjour ! On pense à vous : votre place reste ouverte parmi nous. Une balade est prévue très bientôt.",
  "Un petit mot pour vous encourager à compléter votre profil : cela nous aide à mieux vous accompagner.",
  "Le guide de bienvenue vous attend : quelques minutes suffisent pour découvrir la plateforme.",
];

export default function MemberAnimation() {
  const [data, setData] = useState(null);
  const [target, setTarget] = useState(null);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const { data } = await api.get("/animation-review");
    setData(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const send = async () => {
    try {
      await api.post(`/members/${target.user_id}/nudge`, { message });
      toast.success("Message envoyé avec bienveillance");
      setTarget(null); setMessage("");
    } catch (e) { toast.error(apiError(e)); }
  };

  const openNudge = (member, suggestion) => {
    setTarget(member);
    setMessage(suggestion);
  };

  if (!data) return <p className="text-muted-foreground" data-testid="animation-loading">Chargement…</p>;

  const block = (title, icon, items, testId, suggestion, extra) => (
    <SectionCard title={title} icon={icon} testId={testId}>
      {items.length === 0 ? (
        <EmptyState testId={`${testId}-empty`} icon={HeartHandshake} title="Personne dans cette liste"
          description="Tout le monde est à jour, c'est une bonne nouvelle !" />
      ) : (
        <ul className="space-y-2">
          {items.map((member) => (
            <li key={member.user_id} data-testid={`${testId}-${member.user_id}`}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="font-semibold text-[var(--marine)]">{member.display_name}</span>
                <span className="block text-xs text-muted-foreground">{member.email}</span>
                {extra?.(member)}
              </span>
              <Button size="sm" variant="outline" className="rounded-full"
                data-testid={`nudge-${member.user_id}`} onClick={() => openNudge(member, suggestion)}>
                <Send className="mr-1.5 h-3.5 w-3.5" /> Envoyer un mot
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );

  return (
    <div data-testid="member-animation-page">
      <PageHeader breadcrumb="Administration" title="Animation des membres"
        subtitle="Repérer celles et ceux qui s'éloignent, et leur envoyer un mot bienveillant." />

      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <KpiCard testId="animation-kpi-inactive" label="Inactifs depuis 30 jours"
          value={data.totals.inactive} icon={UserX} tone="bordeaux" />
        <KpiCard testId="animation-kpi-incomplete" label="Profils incomplets"
          value={data.totals.incomplete} icon={UserCog} />
        <KpiCard testId="animation-kpi-guide" label="Guide non consulté"
          value={data.totals.guide_not_seen} icon={BookOpen} />
      </section>

      <div className="mt-6 space-y-6">
        {block("Membres inactifs depuis plus de 30 jours", UserX, data.inactive, "animation-inactive",
          SUGGESTIONS[0], (m) => (
            <span className="block text-xs text-muted-foreground">
              Dernière connexion : {m.last_login ? new Date(m.last_login).toLocaleDateString("fr-FR") : "jamais"}
            </span>
          ))}
        {block("Profils incomplets", UserCog, data.incomplete, "animation-incomplete", SUGGESTIONS[1],
          (m) => (
            <span className="mt-1.5 block max-w-xs">
              <ProgressBar value={m.percent} tone="marine" testId={`completion-${m.user_id}`} />
              <span className="mt-1 block text-xs text-muted-foreground">
                Manque : {m.missing.join(", ")}
              </span>
            </span>
          ))}
        {block("Guide de bienvenue non consulté", BookOpen, data.guide_not_seen, "animation-guide",
          SUGGESTIONS[2])}
      </div>

      <Dialog open={!!target} onOpenChange={() => setTarget(null)}>
        <DialogContent data-testid="nudge-dialog">
          <DialogHeader><DialogTitle>Un mot pour {target?.display_name}</DialogTitle></DialogHeader>
          <Textarea rows={4} value={message} data-testid="nudge-message-input"
            onChange={(e) => setMessage(e.target.value)} />
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((suggestion, index) => (
              <button key={index} type="button" onClick={() => setMessage(suggestion)}
                data-testid={`nudge-suggestion-${index}`}
                className="rounded-full bg-muted px-3 py-1 text-xs font-semibold text-[var(--marine)] hover:bg-muted/70">
                Modèle {index + 1}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={send} disabled={message.trim().length < 10} data-testid="nudge-send-button"
              className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]">Envoyer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Chip tone="muted" testId="animation-note">Aucun envoi automatique : chaque message est envoyé manuellement.</Chip>
    </div>
  );
}
