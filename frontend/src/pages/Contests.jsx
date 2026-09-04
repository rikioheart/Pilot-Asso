import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ConfirmDialog";
import { Trophy, Plus, Users, Sparkles, ScrollText } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState, Chip, SectionCard } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const STATUS = { DRAFT: ["Brouillon", "muted"], OPEN: ["Ouvert", "green"], CLOSED: ["Clos", "amber"],
  DRAWN: ["Tirage effectué", "marine"], ARCHIVED: ["Archivé", "muted"] };
const EMPTY = { title: "", description: "", rules: "", prize: "", start_date: "", end_date: "",
  draw_date: "", winners_count: 1, question: "" };

export default function Contests() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [participate, setParticipate] = useState(null);
  const [answer, setAnswer] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [rules, setRules] = useState(null);
  const [participants, setParticipants] = useState(null);

  const load = useCallback(async () => {
    const { data } = await api.get("/contests");
    setData(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    try {
      await api.post("/contests", { ...form, winners_count: Number(form.winners_count) || 1 });
      toast.success("Jeu-concours créé en brouillon");
      setOpen(false); setForm(EMPTY); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const setStatus = async (contest, status) => {
    try {
      await api.put(`/contests/${contest.contest_id}`, { status });
      toast.success("Statut mis à jour");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const draw = async (contest) => {
    if (!await confirmDialog("Lancer le tirage au sort ? Cette action est définitive.")) return;
    try {
      const { data } = await api.post(`/contests/${contest.contest_id}/draw`);
      toast.success(`Tirage effectué : ${(data.winners || []).map((w) => w.user_name).join(", ")}`);
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const send = async (event) => {
    event.preventDefault();
    try {
      await api.post(`/contests/${participate.contest_id}/participate`,
        { answer, accept_rules: accepted });
      toast.success("Participation enregistrée, bonne chance !");
      setParticipate(null); setAnswer(""); setAccepted(false); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const showParticipants = async (contest) => {
    const { data } = await api.get(`/contests/${contest.contest_id}/participants`);
    setParticipants({ contest, items: data.items });
  };

  if (!data) return <p className="text-muted-foreground" data-testid="contests-loading">Chargement…</p>;

  return (
    <div data-testid="contests-page">
      <PageHeader breadcrumb="Animation" title="Jeux-concours"
        subtitle="Des animations simples pour la communauté : règlement clair, participants tracés, tirage au sort transparent."
        actions={data.is_manager && (
          <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" data-testid="contest-create-button"
            onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Nouveau jeu-concours
          </Button>
        )} />

      {data.items.length === 0 ? (
        <EmptyState testId="contests-empty" icon={Trophy} title="Aucun jeu-concours en cours"
          description="Le Bureau publiera bientôt une nouvelle animation pour les adhérents." />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {data.items.map((contest) => {
            const [label, tone] = STATUS[contest.status] || ["—", "muted"];
            return (
              <div key={contest.contest_id} data-testid={`contest-card-${contest.contest_id}`}
                className="rounded-xl border bg-card p-5 transition-shadow hover:shadow-md">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip tone={tone}>{label}</Chip>
                  <Chip tone="bordeaux">{contest.participants_count} participant(s)</Chip>
                  {contest.is_participating && <Chip tone="green">Vous participez</Chip>}
                </div>
                <h3 className="mt-3 font-display text-base md:text-lg font-bold text-[var(--marine)]">{contest.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{contest.description}</p>
                <div className="mt-4 rounded-lg bg-muted/50 p-3 text-sm">
                  <p className="font-semibold text-[var(--bordeaux)]">À gagner : {contest.prize || "surprise"}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Jusqu'au {contest.end_date ? new Date(contest.end_date).toLocaleDateString("fr-FR") : "—"}
                    {contest.draw_date ? ` · tirage le ${new Date(contest.draw_date).toLocaleDateString("fr-FR")}` : ""}
                  </p>
                </div>
                {contest.winners?.length > 0 && (
                  <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-semibold text-emerald-700"
                    data-testid={`contest-winners-${contest.contest_id}`}>
                    <Sparkles className="h-4 w-4" /> Gagnant(s) : {contest.winners.map((w) => w.user_name).join(", ")}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="rounded-full"
                    data-testid={`contest-rules-${contest.contest_id}`} onClick={() => setRules(contest)}>
                    <ScrollText className="mr-1.5 h-3.5 w-3.5" /> Règlement
                  </Button>
                  {contest.status === "OPEN" && !contest.is_participating && (
                    <Button size="sm" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                      data-testid={`contest-participate-${contest.contest_id}`}
                      onClick={() => setParticipate(contest)}>Je participe</Button>
                  )}
                  {data.is_manager && (
                    <>
                      <Button size="sm" variant="outline" className="rounded-full"
                        data-testid={`contest-participants-${contest.contest_id}`}
                        onClick={() => showParticipants(contest)}>
                        <Users className="mr-1.5 h-3.5 w-3.5" /> Participants
                      </Button>
                      {contest.status === "DRAFT" && (
                        <Button size="sm" className="rounded-full bg-[var(--marine)] hover:bg-[#001740]"
                          data-testid={`contest-open-${contest.contest_id}`}
                          onClick={() => setStatus(contest, "OPEN")}>Ouvrir</Button>
                      )}
                      {contest.status === "OPEN" && (
                        <Button size="sm" variant="outline" className="rounded-full"
                          data-testid={`contest-close-${contest.contest_id}`}
                          onClick={() => setStatus(contest, "CLOSED")}>Clore</Button>
                      )}
                      {["OPEN", "CLOSED"].includes(contest.status) && (
                        <Button size="sm" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                          data-testid={`contest-draw-${contest.contest_id}`} onClick={() => draw(contest)}>
                          <Trophy className="mr-1.5 h-3.5 w-3.5" /> Tirer au sort
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto" data-testid="contest-dialog">
          <DialogHeader><DialogTitle>Nouveau jeu-concours</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div><Label>Titre</Label>
              <Input value={form.title} required data-testid="contest-title-input"
                onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Description</Label>
              <Textarea rows={3} value={form.description} data-testid="contest-description-input"
                onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Règlement (obligatoire avant ouverture)</Label>
              <Textarea rows={4} value={form.rules} data-testid="contest-rules-input"
                onChange={(e) => setForm({ ...form, rules: e.target.value })} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Lot à gagner</Label>
                <Input value={form.prize} data-testid="contest-prize-input"
                  onChange={(e) => setForm({ ...form, prize: e.target.value })} /></div>
              <div><Label>Nombre de gagnants</Label>
                <Input type="number" min="1" value={form.winners_count} data-testid="contest-winners-input"
                  onChange={(e) => setForm({ ...form, winners_count: e.target.value })} /></div>
              <div><Label>Début</Label>
                <Input type="date" value={form.start_date} data-testid="contest-start-input"
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
              <div><Label>Fin</Label>
                <Input type="date" value={form.end_date} data-testid="contest-end-input"
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
              <div><Label>Date du tirage</Label>
                <Input type="date" value={form.draw_date} data-testid="contest-draw-date-input"
                  onChange={(e) => setForm({ ...form, draw_date: e.target.value })} /></div>
            </div>
            <div><Label>Question posée aux participants (facultatif)</Label>
              <Input value={form.question} data-testid="contest-question-input"
                onChange={(e) => setForm({ ...form, question: e.target.value })} /></div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                data-testid="contest-save-button">Créer</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!participate} onOpenChange={() => setParticipate(null)}>
        <DialogContent data-testid="contest-participate-dialog">
          <DialogHeader><DialogTitle>Participer — {participate?.title}</DialogTitle></DialogHeader>
          <form onSubmit={send} className="space-y-4">
            {participate?.question && (
              <div><Label>{participate.question}</Label>
                <Textarea rows={3} value={answer} data-testid="contest-answer-input"
                  onChange={(e) => setAnswer(e.target.value)} /></div>
            )}
            <label className="flex items-start gap-3 text-sm">
              <Checkbox checked={accepted} onCheckedChange={(v) => setAccepted(!!v)}
                data-testid="contest-accept-rules" />
              <span className="text-muted-foreground">J'ai lu et j'accepte le règlement du jeu-concours.</span>
            </label>
            <DialogFooter>
              <Button type="submit" disabled={!accepted} className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                data-testid="contest-send-button">Valider ma participation</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rules} onOpenChange={() => setRules(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto" data-testid="contest-rules-dialog">
          <DialogHeader><DialogTitle>Règlement — {rules?.title}</DialogTitle></DialogHeader>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{rules?.rules || "Règlement à venir."}</p>
        </DialogContent>
      </Dialog>

      <Dialog open={!!participants} onOpenChange={() => setParticipants(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto" data-testid="contest-participants-dialog">
          <DialogHeader><DialogTitle>Participants — {participants?.contest.title}</DialogTitle></DialogHeader>
          {participants?.items.length === 0
            ? <p className="text-sm text-muted-foreground">Aucun participant pour l'instant.</p>
            : (
              <SectionCard title="Historique des participations" testId="contest-participants-list">
                <ul className="space-y-2">
                  {participants?.items.map((p) => (
                    <li key={p.participation_id} className="rounded-lg border px-3 py-2 text-sm">
                      <p className="font-semibold text-[var(--marine)]">
                        {p.user_name} {p.is_winner && <Chip tone="green">Gagnant</Chip>}
                      </p>
                      {p.answer && <p className="mt-1 text-xs text-muted-foreground">« {p.answer} »</p>}
                    </li>
                  ))}
                </ul>
              </SectionCard>
            )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
