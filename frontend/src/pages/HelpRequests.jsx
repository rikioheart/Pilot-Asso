import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api, apiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader, EmptyState } from "@/components/Ui";
import { StatusBadge } from "@/components/Badges";
import { HelpButton } from "@/components/HelpButton";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function HelpRequests() {
  const { user } = useAuth();
  const isAdmin = user?.role === "ADMIN_BUREAU";
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("OPEN");
  const [dialog, setDialog] = useState(null);
  const [response, setResponse] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/help-requests", { params: { status: filter || undefined } });
      setItems(data.items);
    } catch (e) {
      toast.error(apiError(e));
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const update = async (help, status) => {
    try {
      await api.put(`/help-requests/${help.help_id}`, { status, response: response || null });
      toast.success("Demande mise à jour");
      setDialog(null);
      setResponse("");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div data-testid="help-page">
      <PageHeader breadcrumb={isAdmin ? "Bureau" : "Mon espace"}
        title={isAdmin ? "Aide et propositions" : "Mes demandes d'aide"}
        subtitle="Signaler un blocage n'est jamais un échec : c'est ce qui permet d'avancer ensemble."
        actions={<HelpButton />} />

      <div className="mb-5 flex flex-wrap gap-2">
        {[["OPEN", "Ouvertes"], ["HANDLED", "Prises en charge"], ["RESOLVED", "Résolues"], ["", "Toutes"]].map(([value, label]) => (
          <Button key={label} size="sm" variant={filter === value ? "default" : "outline"}
            data-testid={`help-filter-${label.toLowerCase()}`}
            className={`rounded-full ${filter === value ? "bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" : ""}`}
            onClick={() => setFilter(value)}>{label}</Button>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState testId="help-empty" title="Aucune demande"
          description="Utilisez le bouton « J'ai besoin d'aide » pour signaler un blocage ou proposer un coup de main." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2" data-testid="help-list">
          {items.map((h) => (
            <div key={h.help_id} className="rounded-xl border bg-card p-5" data-testid={`help-card-${h.help_id}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display font-bold text-[var(--marine)]">{h.user_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {h.type === "NEEDS_HELP" ? "Besoin d'aide" : "Propose son aide"} ·{" "}
                    {new Date(h.created_at).toLocaleString("fr-FR")}
                  </p>
                </div>
                <StatusBadge status={h.status} testId={`help-status-${h.help_id}`} />
              </div>
              <p className="mt-3 text-sm">{h.message}</p>
              {h.skills?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {h.skills.map((s) => <span key={s} className="rounded-full bg-muted px-2.5 py-0.5 text-xs">{s}</span>)}
                </div>
              )}
              {h.response && <p className="mt-3 rounded-lg bg-muted/60 p-3 text-xs">Réponse du Bureau : {h.response}</p>}
              {isAdmin && h.status !== "RESOLVED" && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="rounded-full" data-testid={`help-handle-${h.help_id}`}
                    onClick={() => setDialog({ help: h, status: "HANDLED" })}>Répondre</Button>
                  <Button size="sm" className="rounded-full bg-[var(--marine)] hover:bg-[#001740]"
                    data-testid={`help-resolve-${h.help_id}`}
                    onClick={() => setDialog({ help: h, status: "RESOLVED" })}>Marquer résolue</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent data-testid="help-response-dialog">
          <DialogHeader><DialogTitle>Répondre au membre</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Message envoyé au membre</Label>
            <Textarea rows={4} value={response} data-testid="help-response-input"
              onChange={(e) => setResponse(e.target.value)} />
          </div>
          <DialogFooter>
            <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" data-testid="help-response-confirm"
              onClick={() => update(dialog.help, dialog.status)}>Envoyer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
