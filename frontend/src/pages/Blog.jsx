import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Newspaper, Plus, Send, Eye, Pin, CheckCircle2, PenLine } from "lucide-react";
import { api, apiError, fileUrl } from "@/lib/api";
import { PageHeader, EmptyState, Chip, SectionCard } from "@/components/Ui";
import { FileUpload } from "@/components/FileUpload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/context/AuthContext";

const STATUS_LABELS = {
  DRAFT: ["Brouillon", "muted"], PENDING_REVIEW: ["À relire", "amber"],
  PUBLISHED: ["Publié", "green"], REJECTED: ["Refusé", "red"], ARCHIVED: ["Archivé", "muted"],
};
const CATEGORIES = ["CONSEIL", "TEMOIGNAGE", "ACTUALITE", "EDUCATION", "SANTE", "PREVENTION",
  "COULISSES", "PARTENAIRE", "AUTRE"];
const EMPTY = { title: "", excerpt: "", body: "", category: "CONSEIL", tags: "", cover_file_id: null };

export default function Blog() {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState("ALL");
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(null);

  const load = useCallback(async () => {
    const params = filter === "MINE" ? "?mine=true" : filter !== "ALL" ? `?status=${filter}` : "";
    const { data } = await api.get(`/articles${params}`);
    setData(data);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const submit = async (event) => {
    event.preventDefault();
    const payload = { ...form, tags: form.tags ? form.tags.split(",").map((t) => t.trim()).filter(Boolean) : [] };
    try {
      if (editing) await api.put(`/articles/${editing}`, payload);
      else await api.post("/articles", payload);
      toast.success(editing ? "Article mis à jour" : "Brouillon créé");
      setOpen(false); setForm(EMPTY); setEditing(null);
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const act = async (article, body, message) => {
    try {
      await api.put(`/articles/${article.article_id}`, body);
      toast.success(message);
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const review = async (article, decision) => {
    const comment = decision === "REQUEST_CHANGES"
      ? window.prompt("Que faut-il modifier ?") : null;
    if (decision === "REQUEST_CHANGES" && !comment) return;
    try {
      await api.post(`/articles/${article.article_id}/review`, { decision, comment });
      toast.success(decision === "PUBLISH" ? "Article publié" : "Retour envoyé à l'auteur");
      load();
    } catch (e) { toast.error(apiError(e)); }
  };

  const read = async (article) => {
    const { data } = await api.get(`/articles/${article.article_id}`);
    setReading(data);
  };

  const edit = (article) => {
    setEditing(article.article_id);
    setForm({
      title: article.title, excerpt: article.excerpt || "", body: article.body || "",
      category: article.category, tags: (article.tags || []).join(", "),
      cover_file_id: article.cover_file_id || null,
    });
    setOpen(true);
  };

  if (!data) return <p className="text-muted-foreground" data-testid="blog-loading">Chargement…</p>;

  return (
    <div data-testid="blog-page">
      <PageHeader breadcrumb="Communication" title="Blog & contenus"
        subtitle="Écrire, faire relire, publier. Chaque article passe par le Bureau avant la mise en ligne."
        actions={can("content.create") && (
          <Button className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]" data-testid="blog-create-button"
            onClick={() => { setEditing(null); setForm(EMPTY); setOpen(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Nouvel article
          </Button>
        )} />

      <div className="mb-6 flex flex-wrap gap-2" data-testid="blog-filters">
        {[["ALL", "Tous"], ["PUBLISHED", "Publiés"], ["PENDING_REVIEW", "À relire"],
          ["DRAFT", "Brouillons"], ["MINE", "Mes articles"]].map(([value, label]) => (
          <button key={value} onClick={() => setFilter(value)} data-testid={`blog-filter-${value}`}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
              filter === value ? "bg-[var(--marine)] text-white" : "bg-muted text-[var(--marine)] hover:bg-muted/70"}`}>
            {label}
          </button>
        ))}
      </div>

      {data.items.length === 0 ? (
        <EmptyState testId="blog-empty" icon={Newspaper} title="Aucun article ici"
          description="Les conseils, témoignages et coulisses de l'association apparaîtront dans cet espace." />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {data.items.map((article) => {
            const [label, tone] = STATUS_LABELS[article.status] || ["—", "muted"];
            return (
              <article key={article.article_id} data-testid={`blog-card-${article.article_id}`}
                className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-lg">
                <div className="relative h-36 overflow-hidden bg-[var(--marine-a8)]">
                  {article.cover_file_id ? (
                    <img src={fileUrl(article.cover_file_id)} alt="" className="h-full w-full object-cover
                      transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="grid h-full place-items-center"><Newspaper className="h-8 w-8 text-[var(--marine-a25)]" /></div>
                  )}
                  {article.is_pinned && (
                    <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--bordeaux)] px-2.5 py-1 text-[11px] font-bold text-white">
                      <Pin className="h-3 w-3" /> À la une
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Chip tone={tone} testId={`blog-status-${article.article_id}`}>{label}</Chip>
                    <Chip tone="marine">{article.category}</Chip>
                  </div>
                  <h3 className="mt-3 font-display text-base font-bold text-[var(--marine)]">{article.title}</h3>
                  <p className="mt-2 flex-1 text-sm text-muted-foreground line-clamp-3">{article.excerpt}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {article.author_name} · {article.views || 0} lecture(s)
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" className="rounded-full"
                      data-testid={`blog-read-${article.article_id}`} onClick={() => read(article)}>
                      <Eye className="mr-1.5 h-3.5 w-3.5" /> Lire
                    </Button>
                    {article.status === "DRAFT" && (
                      <>
                        <Button size="sm" variant="outline" className="rounded-full"
                          data-testid={`blog-edit-${article.article_id}`} onClick={() => edit(article)}>
                          <PenLine className="mr-1.5 h-3.5 w-3.5" /> Modifier
                        </Button>
                        <Button size="sm" className="rounded-full bg-[var(--marine)] hover:bg-[#001740]"
                          data-testid={`blog-submit-${article.article_id}`}
                          onClick={() => act(article, { status: "PENDING_REVIEW" }, "Article envoyé au Bureau")}>
                          <Send className="mr-1.5 h-3.5 w-3.5" /> Proposer
                        </Button>
                      </>
                    )}
                    {data.is_manager && article.status === "PENDING_REVIEW" && (
                      <>
                        <Button size="sm" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                          data-testid={`blog-publish-${article.article_id}`} onClick={() => review(article, "PUBLISH")}>
                          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Publier
                        </Button>
                        <Button size="sm" variant="outline" className="rounded-full"
                          data-testid={`blog-changes-${article.article_id}`}
                          onClick={() => review(article, "REQUEST_CHANGES")}>Demander une modification</Button>
                      </>
                    )}
                    {data.is_manager && article.status === "PUBLISHED" && (
                      <Button size="sm" variant="outline" className="rounded-full"
                        data-testid={`blog-pin-${article.article_id}`}
                        onClick={() => act(article, { is_pinned: !article.is_pinned },
                          article.is_pinned ? "Retiré de la une" : "Mis à la une")}>
                        <Pin className="mr-1.5 h-3.5 w-3.5" /> {article.is_pinned ? "Retirer de la une" : "Mettre à la une"}
                      </Button>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="blog-dialog">
          <DialogHeader><DialogTitle>{editing ? "Modifier l'article" : "Nouvel article"}</DialogTitle></DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label>Titre</Label>
              <Input value={form.title} required data-testid="blog-title-input"
                onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Accroche</Label>
              <Textarea rows={2} value={form.excerpt} data-testid="blog-excerpt-input"
                onChange={(e) => setForm({ ...form, excerpt: e.target.value })} />
            </div>
            <div>
              <Label>Contenu</Label>
              <Textarea rows={8} value={form.body} data-testid="blog-body-input"
                onChange={(e) => setForm({ ...form, body: e.target.value })} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Catégorie</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger data-testid="blog-category-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Mots-clés (séparés par des virgules)</Label>
                <Input value={form.tags} data-testid="blog-tags-input"
                  onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Visuel de couverture</Label>
              <FileUpload usage="ARTICLE" accept="image/*" preview testId="blog-cover-upload"
                value={form.cover_file_id} label="Choisir une image"
                onChange={(id) => setForm({ ...form, cover_file_id: id })} />
            </div>
            <DialogFooter>
              <Button type="submit" className="rounded-full bg-[var(--bordeaux)] hover:bg-[var(--bordeaux-dark)]"
                data-testid="blog-save-button">Enregistrer le brouillon</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reading} onOpenChange={() => setReading(null)}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="blog-reader">
          {reading && (
            <>
              <DialogHeader><DialogTitle>{reading.title}</DialogTitle></DialogHeader>
              {reading.cover_file_id && (
                <img src={fileUrl(reading.cover_file_id)} alt="" className="h-48 w-full rounded-lg object-cover" />
              )}
              <p className="text-sm font-semibold text-[var(--bordeaux)]">{reading.excerpt}</p>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{reading.body}</p>
              {reading.review_comment && (
                <SectionCard title="Retour du Bureau" testId="blog-review-comment">
                  <p className="text-sm text-muted-foreground">{reading.review_comment}</p>
                </SectionCard>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
