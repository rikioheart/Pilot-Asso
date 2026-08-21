import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Gift, Lock, Sparkles, Copy, ExternalLink, Unlock } from "lucide-react";
import { api, apiError } from "@/lib/api";
import { PageHeader, EmptyState, Chip, ProgressBar } from "@/components/Ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const KINDS = { MESSAGE: "Message", ASTUCE: "Astuce", CADEAU: "Cadeau", CODE_PROMO: "Code promo",
  LIEN: "Lien", MINI_JEU: "Mini-jeu" };

export default function Advent() {
  const [data, setData] = useState(null);
  const [opened, setOpened] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ title: "", content: "", kind: "MESSAGE", reward: "",
    promo_code: "", link: "", is_published: true });

  const load = useCallback(async () => {
    const { data } = await api.get("/advent");
    setData(data);
  }, []);
  useEffect(() => { load(); }, [load]);

  const openBox = async (box) => {
    try {
      const { data: full } = await api.post(`/advent/${data.calendar.calendar_id}/open/${box.day}`);
      setOpened(full);
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const createCalendar = async () => {
    try {
      await api.post("/advent", { year: new Date().getFullYear(),
        title: `Calendrier de l'Avent ${new Date().getFullYear()}` });
      toast.success("Calendrier créé");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const saveBox = async (event) => {
    event.preventDefault();
    try {
      await api.put(`/advent/${data.calendar.calendar_id}/boxes/${editing}`,
        { ...form, day: editing });
      toast.success(`Case ${editing} enregistrée`);
      setEditing(null); load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const toggleCalendar = async (patch) => {
    try {
      await api.put(`/advent/${data.calendar.calendar_id}`, patch);
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const editBox = (day) => {
    const box = data.boxes.find((b) => b.day === day);
    setForm({
      title: box?.title || "", content: box?.content || "", kind: box?.kind || "MESSAGE",
      reward: box?.reward || "", promo_code: box?.promo_code || "", link: box?.link || "",
      is_published: box?.is_published ?? true,
    });
    setEditing(day);
  };

  if (!data) return <p className="text-muted-foreground" data-testid="advent-loading">Chargement…</p>;

  if (!data.calendar) {
    return (
      <div data-testid="advent-page">
        <PageHeader breadcrumb="Animation" title="Calendrier de l'Avent" />
        <EmptyState testId="advent-empty" icon={Gift} title="Aucun calendrier préparé"
          description="Vingt-cinq cases à remplir d'astuces, de cadeaux et de codes promo pour les adhérents."
          action={data.is_manager && (
            <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="advent-create-button"
              onClick={createCalendar}>Créer le calendrier de cette année</Button>
          )} />
      </div>
    );
  }

  const boxes = Array.from({ length: 25 }, (_, i) => data.boxes.find((b) => b.day === i + 1) || { day: i + 1 });
  const progress = (data.calendar.opened_count || 0) / 25 * 100;

  return (
    <div data-testid="advent-page">
      <PageHeader breadcrumb="Animation" title={data.calendar.title}
        subtitle={data.calendar.description || "Une surprise par jour jusqu'à Noël."}
        actions={data.is_manager && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="rounded-full" data-testid="advent-preview-toggle"
              onClick={() => toggleCalendar({ preview_unlocked: !data.calendar.preview_unlocked })}>
              <Unlock className="mr-2 h-4 w-4" />
              {data.calendar.preview_unlocked ? "Reverrouiller les dates" : "Déverrouiller pour test"}
            </Button>
            <Button className="rounded-full bg-[#800020] hover:bg-[#63001a]" data-testid="advent-status-toggle"
              onClick={() => toggleCalendar({ status: data.calendar.status === "ACTIVE" ? "DRAFT" : "ACTIVE" })}>
              {data.calendar.status === "ACTIVE" ? "Mettre en brouillon" : "Activer"}
            </Button>
          </div>
        )} />

      <div className="mb-8 max-w-sm">
        <ProgressBar value={progress} label={`${data.calendar.opened_count || 0} case(s) ouverte(s) sur 25`}
          testId="advent-progress" />
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {boxes.map((box) => {
          const prepared = !!box.title;
          const unlocked = box.is_unlocked;
          return (
            <button key={box.day} type="button" data-testid={`advent-box-${box.day}`}
              onClick={() => (data.is_manager && !unlocked ? editBox(box.day) : unlocked ? openBox(box) : null)}
              className={`group relative aspect-square overflow-hidden rounded-xl border-2 p-3 text-left transition-all duration-300 ${
                unlocked
                  ? "border-[#800020]/30 bg-gradient-to-br from-[#800020] to-[#4d0013] text-white hover:-translate-y-1 hover:shadow-xl"
                  : prepared
                    ? "border-dashed border-[#002060]/25 bg-[#002060]/5 text-[#002060]"
                    : "border-dashed border-muted bg-muted/40 text-muted-foreground"}`}>
              <span className="font-display text-2xl font-extrabold">{box.day}</span>
              {unlocked
                ? <Sparkles className="absolute bottom-3 right-3 h-4 w-4 opacity-70 transition-transform group-hover:scale-125" />
                : <Lock className="absolute bottom-3 right-3 h-4 w-4 opacity-40" />}
              {box.is_opened && (
                <span className="absolute right-2 top-2 rounded-full bg-white/90 px-1.5 py-0.5 text-[10px] font-bold text-[#800020]">
                  ouverte
                </span>
              )}
              {unlocked && box.title && (
                <span className="absolute bottom-8 left-3 right-3 line-clamp-2 text-[11px] font-semibold opacity-90">
                  {box.title}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {data.is_manager && (
        <p className="mt-6 text-sm text-muted-foreground">
          Astuce Bureau : cliquez sur une case verrouillée pour préparer son contenu.
          Les adhérents ne voient rien avant la date correspondante en décembre.
        </p>
      )}

      <Dialog open={!!opened} onOpenChange={() => setOpened(null)}>
        <DialogContent data-testid="advent-open-dialog">
          <DialogHeader><DialogTitle>Case {opened?.day} — {opened?.title}</DialogTitle></DialogHeader>
          <Chip tone="bordeaux">{KINDS[opened?.kind] || opened?.kind}</Chip>
          <p className="whitespace-pre-line text-sm text-muted-foreground">{opened?.content}</p>
          {opened?.reward && (
            <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-700">
              À récupérer : {opened.reward}
            </p>
          )}
          {opened?.promo_code && (
            <Button variant="outline" className="rounded-full" data-testid="advent-copy-code"
              onClick={() => { navigator.clipboard.writeText(opened.promo_code); toast.success("Code copié"); }}>
              <Copy className="mr-2 h-4 w-4" /> Copier le code {opened.promo_code}
            </Button>
          )}
          {opened?.link && (
            <a href={opened.link} target="_blank" rel="noreferrer" data-testid="advent-open-link"
              className="inline-flex items-center gap-2 text-sm font-semibold text-[#800020] hover:underline">
              <ExternalLink className="h-4 w-4" /> Ouvrir le lien
            </a>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" data-testid="advent-edit-dialog">
          <DialogHeader><DialogTitle>Préparer la case {editing}</DialogTitle></DialogHeader>
          <form onSubmit={saveBox} className="space-y-4">
            <div><Label>Titre</Label>
              <Input value={form.title} required data-testid="advent-title-input"
                onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>Contenu</Label>
              <Textarea rows={4} value={form.content} data-testid="advent-content-input"
                onChange={(e) => setForm({ ...form, content: e.target.value })} /></div>
            <div><Label>Type de surprise</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger data-testid="advent-kind-select"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(KINDS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label>Lot / cadeau</Label>
                <Input value={form.reward} data-testid="advent-reward-input"
                  onChange={(e) => setForm({ ...form, reward: e.target.value })} /></div>
              <div><Label>Code promo</Label>
                <Input value={form.promo_code} data-testid="advent-code-input"
                  onChange={(e) => setForm({ ...form, promo_code: e.target.value })} /></div>
            </div>
            <div><Label>Lien</Label>
              <Input value={form.link} placeholder="https://" data-testid="advent-link-input"
                onChange={(e) => setForm({ ...form, link: e.target.value })} /></div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[#800020] hover:bg-[#63001a]"
                data-testid="advent-save-button">Enregistrer la case</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
