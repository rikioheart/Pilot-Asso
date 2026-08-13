import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, RotateCcw } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState } from "@/components/Ui";
import { DeadlineChip } from "@/components/Badges";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

export default function Validation() {
  const [items, setItems] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/tasks/pending-validation");
      setItems(data.items);
    } catch (e) {
      toast.error(apiError(e));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (task, decision) => {
    try {
      await api.post(`/tasks/${task.task_id}/validate`, { decision, comment: comment || null });
      toast.success(decision === "ACCEPT" ? "Tâche validée" : "Modification demandée");
      setDialog(null);
      setComment("");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div data-testid="validation-page">
      <PageHeader breadcrumb="Bureau" title="Actions en attente de validation"
        subtitle="Chaque action soumise conserve son auteur, sa preuve, sa date et son historique." />

      {items.length === 0 ? (
        <EmptyState testId="validation-empty" title="Rien à valider pour le moment"
          description="Les tâches terminées par les membres arriveront ici avec leur preuve." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2" data-testid="validation-list">
          {items.map((t) => (
            <div key={t.task_id} className="rounded-xl border bg-card p-5" data-testid={`validation-card-${t.task_id}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display font-bold text-[#002060]">{t.title}</p>
                  <Link to={`/projects/${t.project_id}`} data-testid={`validation-project-${t.task_id}`}
                    className="text-xs text-muted-foreground hover:text-[#800020]">{t.project_title}</Link>
                </div>
                <DeadlineChip deadline={t.deadline} />
              </div>
              <dl className="mt-4 space-y-1 text-sm">
                <div className="flex gap-2"><dt className="text-muted-foreground">Membre :</dt><dd>{t.submitted_by_name}</dd></div>
                <div className="flex gap-2"><dt className="text-muted-foreground">Soumis le :</dt>
                  <dd>{t.submitted_at ? new Date(t.submitted_at).toLocaleString("fr-FR") : "—"}</dd></div>
                <div className="flex gap-2"><dt className="text-muted-foreground">Preuve :</dt>
                  <dd data-testid={`validation-proof-${t.task_id}`}>{t.proof || "aucune"}</dd></div>
              </dl>
              {t.comments?.length > 0 && (
                <div className="mt-3 rounded-lg bg-muted/60 p-3 text-xs">
                  {t.comments.slice(-2).map((c) => (
                    <p key={c.comment_id}><b className="text-[#002060]">{c.user_name}</b> : {c.text}</p>
                  ))}
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                <Button className="rounded-full bg-[#002060] hover:bg-[#001740]" data-testid={`validation-accept-${t.task_id}`}
                  onClick={() => decide(t, "ACCEPT")}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Valider
                </Button>
                <Button variant="outline" className="rounded-full" data-testid={`validation-changes-${t.task_id}`}
                  onClick={() => setDialog(t)}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Demander une modification
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent data-testid="validation-changes-dialog">
          <DialogHeader><DialogTitle>Demander une modification</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Ce qui doit être ajusté *</Label>
            <Textarea rows={4} value={comment} data-testid="validation-changes-comment"
              onChange={(e) => setComment(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              Le membre reçoit une notification bienveillante ; la tâche repasse « en cours ».
            </p>
          </div>
          <DialogFooter>
            <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="validation-changes-confirm"
              onClick={() => decide(dialog, "CHANGES")}>Envoyer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
